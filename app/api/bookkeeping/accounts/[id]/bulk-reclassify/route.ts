import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { bulkReclassifyApplySchema, validateRequest } from '@/lib/validation';
import { checkClosedPeriod } from '@/lib/bookkeeping';
import { logAudit } from '@/lib/audit';

type SkipReason =
  | 'voided'
  | 'closed_period'
  | 'reconciled_line_blocked'
  | 'not_found';

// POST /api/bookkeeping/accounts/[id]/bulk-reclassify
// Apply a set of find-and-replace rules across the selected entries. For each
// entry, every line whose accountId matches a rule's sourceAccountId is
// updated to the rule's targetAccountId. Debit/credit/amount are preserved.
//
// An entry is skipped only if voided, in a closed period, or a rule would
// touch a reconciled line on it. The source account in the URL is the page
// context the user is on — it isn't used to filter rules.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
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

    interface PlannedUpdate {
      entryId: string;
      entryNumber: number;
      lineUpdates: {
        lineId: string;
        fromAccount: { id: string; code: string; name: string };
        toAccountId: string;
      }[];
    }

    const skipped: { entryId: string; entryNumber: number | null; reason: SkipReason }[] = [];
    const planned: PlannedUpdate[] = [];
    let unchanged = 0;

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

      // Find lines on this entry whose accountId matches any rule source.
      const matchingLines = entry.lines.filter((l) => sourceIdSet.has(l.accountId));

      // If any matched line is reconciled, the entry is fully skipped — we
      // can't partially apply rules because the user expects all-or-nothing
      // remapping per entry.
      const reconciledMatch = matchingLines.find((l) => l.isReconciled);
      if (reconciledMatch) {
        skipped.push({ entryId, entryNumber: entry.entryNumber, reason: 'reconciled_line_blocked' });
        continue;
      }

      if (matchingLines.length === 0) {
        // Entry is eligible but no rules touch it. Don't count as skipped —
        // count separately so the UI can report "unchanged".
        unchanged += 1;
        continue;
      }

      planned.push({
        entryId: entry.id,
        entryNumber: entry.entryNumber,
        lineUpdates: matchingLines.map((l) => ({
          lineId: l.id,
          fromAccount: { id: l.account.id, code: l.account.code, name: l.account.name },
          toAccountId: ruleByrSource.get(l.accountId)!,
        })),
      });
    }

    // Apply all line updates in a single transaction.
    let totalLinesChanged = 0;
    if (planned.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const p of planned) {
          for (const u of p.lineUpdates) {
            await tx.journalEntryLine.update({
              where: { id: u.lineId },
              data: { accountId: u.toAccountId },
            });
            totalLinesChanged += 1;
          }
        }
      });
    }

    // Audit each modified entry. Matches the regular edit-entry pattern so the
    // entry's audit log surfaces this change alongside any prior manual edits.
    for (const p of planned) {
      await logAudit({
        companyId: companyId!,
        userId: session!.userId,
        action: 'journal_entry.bulk_reclassify',
        entityType: 'JournalEntry',
        entityId: p.entryId,
        metadata: {
          entryNumber: p.entryNumber,
          lineRemaps: p.lineUpdates.map((u) => {
            const tgt = accountById.get(u.toAccountId)!;
            return {
              lineId: u.lineId,
              from: u.fromAccount,
              to: { id: tgt.id, code: tgt.code, name: tgt.name },
            };
          }),
        },
      });
    }

    return NextResponse.json({
      updated: planned.length,
      unchanged,
      skipped,
      totalLinesChanged,
    });
  } catch (err) {
    console.error('Error applying bulk reclassify:', err);
    const message = err instanceof Error ? err.message : 'Bulk reclassify failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
