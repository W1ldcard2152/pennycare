import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { bulkReclassifyApplySchema, validateRequest } from '@/lib/validation';
import { checkClosedPeriod } from '@/lib/bookkeeping';
import { createEntry } from '@/lib/journal-entry-service';
import { logAudit } from '@/lib/audit';

type SkipReason =
  | 'voided'
  | 'closed_period'
  | 'reconciled_line_blocked'
  | 'not_found';

// POST /api/bookkeeping/accounts/[id]/bulk-reclassify
// Reclassify amounts between accounts WITHOUT editing the original entries
// (1.2: booked entries are immutable). For each rule (source → target), we sum
// the net amount the matched lines posted to the source account, then generate
// a reclassification journal entry that moves that net to the target — one JE
// per affected fiscal year so each lands in the same period as the original
// activity and period reports stay correct. Original lines are untouched.
//
// An entry is skipped if voided, in a closed period, or a rule would touch a
// reconciled line on it. The source account in the URL is page context only.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('APPROVER');
    if (error) return error;
    const { id: pageAccountId } = await params;

    const body = await request.json();
    const validation = validateRequest(bulkReclassifyApplySchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }
    const { entryIds, rules } = validation.data;

    // Confirm page account exists for this company (sanity, not used in logic)
    const pageAccount = await prisma.account.findFirst({
      where: { id: pageAccountId, companyId: companyId! },
      select: { id: true },
    });
    if (!pageAccount) {
      return NextResponse.json({ error: 'Source page account not found' }, { status: 404 });
    }

    // Fetch every account referenced by any rule (source or target). Every
    // target must exist + belong to this company + be active.
    const referencedAccountIds = Array.from(
      new Set(rules.flatMap((r) => [r.sourceAccountId, r.targetAccountId]))
    );
    const referencedAccounts = await prisma.account.findMany({
      where: { id: { in: referencedAccountIds }, companyId: companyId! },
      select: { id: true, code: true, name: true, isActive: true },
    });
    const accountById = new Map(referencedAccounts.map((a) => [a.id, a]));

    for (const rule of rules) {
      const src = accountById.get(rule.sourceAccountId);
      const tgt = accountById.get(rule.targetAccountId);
      if (!src) {
        return NextResponse.json({ error: `From account not found: ${rule.sourceAccountId}` }, { status: 404 });
      }
      if (!tgt) {
        return NextResponse.json({ error: `To account not found: ${rule.targetAccountId}` }, { status: 404 });
      }
      if (!tgt.isActive) {
        return NextResponse.json({ error: `Cannot remap to inactive account: ${tgt.code} — ${tgt.name}` }, { status: 400 });
      }
    }

    const sourceIdSet = new Set(rules.map((r) => r.sourceAccountId));
    const ruleByrSource = new Map(rules.map((r) => [r.sourceAccountId, r.targetAccountId]));

    const entries = await prisma.journalEntry.findMany({
      where: { id: { in: entryIds }, companyId: companyId! },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    const entriesById = new Map(entries.map((e) => [e.id, e]));

    const skipped: { entryId: string; entryNumber: number | null; reason: SkipReason }[] = [];
    let unchanged = 0;
    let entriesAffected = 0;

    // Accumulate net amounts (integer cents) per fiscal year, per rule source.
    // netCents = sum(debit − credit) the matched lines posted to the source.
    // We also remember the latest matched entry date in each year to date the
    // reclassification JE within that period.
    type YearGroup = {
      year: number;
      latestDate: Date;
      netCentsBySource: Map<string, number>;
    };
    const yearGroups = new Map<number, YearGroup>();

    for (const entryId of entryIds) {
      const entry = entriesById.get(entryId);
      if (!entry) {
        skipped.push({ entryId, entryNumber: null, reason: 'not_found' });
        continue;
      }
      if (entry.status === 'voided') {
        skipped.push({ entryId, entryNumber: entry.entryNumber, reason: 'voided' });
        continue;
      }
      const { isClosed } = await checkClosedPeriod(companyId!, entry.date);
      if (isClosed) {
        skipped.push({ entryId, entryNumber: entry.entryNumber, reason: 'closed_period' });
        continue;
      }

      const matchingLines = entry.lines.filter((l) => sourceIdSet.has(l.accountId));

      // If any matched line is reconciled, skip the whole entry — reclassifying
      // an amount that's been reconciled would change the source account's
      // cleared balance against a completed reconciliation.
      const reconciledMatch = matchingLines.find((l) => l.isReconciled);
      if (reconciledMatch) {
        skipped.push({ entryId, entryNumber: entry.entryNumber, reason: 'reconciled_line_blocked' });
        continue;
      }

      if (matchingLines.length === 0) {
        unchanged += 1;
        continue;
      }

      const year = entry.date.getUTCFullYear();
      let group = yearGroups.get(year);
      if (!group) {
        group = { year, latestDate: entry.date, netCentsBySource: new Map() };
        yearGroups.set(year, group);
      }
      if (entry.date > group.latestDate) group.latestDate = entry.date;

      for (const line of matchingLines) {
        const deltaCents = Math.round(line.debit * 100) - Math.round(line.credit * 100);
        group.netCentsBySource.set(
          line.accountId,
          (group.netCentsBySource.get(line.accountId) ?? 0) + deltaCents
        );
      }
      entriesAffected += 1;
    }

    // Generate one reclassification JE per affected fiscal year. For each rule
    // source with a non-zero net, move that net from source to target:
    //   net debit  → DEBIT target, CREDIT source
    //   net credit → CREDIT target, DEBIT source
    const actor = { userId: session!.userId, role: role! };
    const generatedEntries: Array<{ year: number; entryNumber: number; id: string }> = [];

    for (const group of Array.from(yearGroups.values()).sort((a, b) => a.year - b.year)) {
      const lines: Array<{ accountId: string; description: string; debit: number; credit: number }> = [];
      const remaps: Array<{ from: string; to: string; amount: number }> = [];

      for (const [sourceId, netCents] of group.netCentsBySource) {
        if (netCents === 0) continue;
        const targetId = ruleByrSource.get(sourceId)!;
        const src = accountById.get(sourceId)!;
        const tgt = accountById.get(targetId)!;
        const amount = Math.abs(netCents) / 100;
        const desc = `Reclassify ${src.code} → ${tgt.code}`;
        if (netCents > 0) {
          lines.push({ accountId: targetId, description: desc, debit: amount, credit: 0 });
          lines.push({ accountId: sourceId, description: desc, debit: 0, credit: amount });
        } else {
          lines.push({ accountId: targetId, description: desc, debit: 0, credit: amount });
          lines.push({ accountId: sourceId, description: desc, debit: amount, credit: 0 });
        }
        remaps.push({ from: src.code, to: tgt.code, amount });
      }

      if (lines.length === 0) continue;

      const entry = await createEntry(actor, {
        companyId: companyId!,
        date: group.latestDate,
        memo: `Reclassification (${group.year})`,
        source: 'reclassification',
        notes: `Bulk reclassification of ${entriesAffected} entr${entriesAffected === 1 ? 'y' : 'ies'}: ` +
          remaps.map((r) => `${r.from}→${r.to} $${r.amount.toFixed(2)}`).join(', '),
        lines,
      });
      generatedEntries.push({ year: group.year, entryNumber: entry.entryNumber, id: entry.id });

      await logAudit({
        companyId: companyId!,
        userId: session!.userId,
        action: 'journal_entry.reclassify',
        entityType: 'JournalEntry',
        entityId: entry.id,
        metadata: { year: group.year, entryNumber: entry.entryNumber, remaps },
      });
    }

    return NextResponse.json({
      entriesAffected,
      unchanged,
      skipped,
      generatedEntries,
    });
  } catch (err) {
    console.error('Error applying bulk reclassify:', err);
    const message = err instanceof Error ? err.message : 'Bulk reclassify failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
