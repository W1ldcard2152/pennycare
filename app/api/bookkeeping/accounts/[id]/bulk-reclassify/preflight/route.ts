import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { bulkReclassifyPreflightSchema, validateRequest } from '@/lib/validation';
import { checkClosedPeriod } from '@/lib/bookkeeping';

interface LineDetail {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
  description: string | null;
  isReconciled: boolean;
}

interface EntryDetail {
  entryId: string;
  entryNumber: number | null;
  date: string | null;
  memo: string | null;
  source: string | null;
  status: string | null;
  isVoided: boolean;
  isClosedPeriod: boolean;
  closedFiscalYear: number | null;
  lines: LineDetail[];
  notFound?: true;
}

// POST /api/bookkeeping/accounts/[id]/bulk-reclassify/preflight
// Return the full line structure of each selected entry so the modal can
// (a) display every line of every entry, (b) populate the From-account
// dropdown with accounts actually present on the selected set, and (c) flag
// reconciled lines so the rule builder can warn before save.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id: sourceAccountId } = await params;

    const body = await request.json();
    const validation = validateRequest(bulkReclassifyPreflightSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }
    const { entryIds } = validation.data;

    const sourceAccount = await prisma.account.findFirst({
      where: { id: sourceAccountId, companyId: companyId! },
      select: { id: true, code: true, name: true },
    });
    if (!sourceAccount) {
      return NextResponse.json({ error: 'Source account not found' }, { status: 404 });
    }

    const entries = await prisma.journalEntry.findMany({
      where: { id: { in: entryIds }, companyId: companyId! },
      include: {
        lines: {
          orderBy: { id: 'asc' },
          include: {
            account: { select: { id: true, code: true, name: true, type: true } },
          },
        },
      },
    });

    const entriesById = new Map(entries.map((e) => [e.id, e]));
    const out: EntryDetail[] = [];
    const accountsInUse = new Map<string, { id: string; code: string; name: string; type: string }>();

    for (const entryId of entryIds) {
      const entry = entriesById.get(entryId);
      if (!entry) {
        out.push({
          entryId,
          entryNumber: null,
          date: null,
          memo: null,
          source: null,
          status: null,
          isVoided: false,
          isClosedPeriod: false,
          closedFiscalYear: null,
          lines: [],
          notFound: true,
        });
        continue;
      }

      const { isClosed, closedPeriod } = await checkClosedPeriod(companyId!, entry.date);

      const lines: LineDetail[] = entry.lines.map((l) => {
        accountsInUse.set(l.account.id, {
          id: l.account.id,
          code: l.account.code,
          name: l.account.name,
          type: l.account.type,
        });
        return {
          id: l.id,
          accountId: l.account.id,
          accountCode: l.account.code,
          accountName: l.account.name,
          accountType: l.account.type,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
          isReconciled: l.isReconciled,
        };
      });

      out.push({
        entryId: entry.id,
        entryNumber: entry.entryNumber,
        date: entry.date.toISOString(),
        memo: entry.memo,
        source: entry.source,
        status: entry.status,
        isVoided: entry.status === 'voided',
        isClosedPeriod: isClosed,
        closedFiscalYear: isClosed ? closedPeriod!.fiscalYear : null,
        lines,
      });
    }

    return NextResponse.json({
      sourceAccount,
      entries: out,
      accountsInUse: Array.from(accountsInUse.values()).sort((a, b) => a.code.localeCompare(b.code)),
    });
  } catch (err) {
    console.error('Error during bulk reclassify preflight:', err);
    return NextResponse.json({ error: 'Preflight failed' }, { status: 500 });
  }
}
