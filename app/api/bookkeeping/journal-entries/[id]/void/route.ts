import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { checkClosedPeriod } from '@/lib/bookkeeping';

// POST /api/bookkeeping/journal-entries/[id]/void
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const reason = body.reason;
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'A reason is required to void a journal entry' }, { status: 400 });
    }

    const entry = await prisma.journalEntry.findFirst({
      where: { id, companyId: companyId! },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    if (entry.status === 'voided') {
      return NextResponse.json({ error: 'This journal entry is already voided' }, { status: 409 });
    }

    // Check if the entry is in a closed period
    const { isClosed, closedPeriod } = await checkClosedPeriod(companyId!, entry.date);
    if (isClosed) {
      return NextResponse.json({
        error: `Cannot void: Fiscal year ${closedPeriod!.fiscalYear} is closed. Reopen the period to make changes.`,
        closedPeriod: closedPeriod,
      }, { status: 409 });
    }

    // Check if any lines are reconciled
    const reconciledLines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntryId: id,
        isReconciled: true,
      },
      select: {
        id: true,
        account: { select: { name: true } },
      },
    });

    if (reconciledLines.length > 0) {
      const accountNames = [...new Set(reconciledLines.map(l => l.account.name))].join(', ');
      return NextResponse.json(
        {
          error: 'Cannot void: this entry contains reconciled transactions. Un-reconcile first.',
          accounts: accountNames,
          reconciledLineCount: reconciledLines.length,
        },
        { status: 409 }
      );
    }

    // Remove any reconciliation cleared items for these lines (in-progress reconciliations
    // mark lines as cleared without setting isReconciled=true, so they escape the check above)
    const entryLines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: id },
      select: { id: true },
    });
    const lineIds = entryLines.map((l) => l.id);
    if (lineIds.length > 0) {
      await prisma.reconciledItem.deleteMany({
        where: { journalEntryLineId: { in: lineIds } },
      });
    }

    const updated = await prisma.journalEntry.update({
      where: { id },
      data: {
        status: 'voided',
        voidedAt: new Date(),
        voidedBy: session!.userId,
        voidReason: reason.trim(),
      },
      include: {
        lines: { include: { account: true } },
      },
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'journal_entry.void',
      entityType: 'JournalEntry',
      entityId: id,
      metadata: { reason: reason.trim(), entryNumber: entry.entryNumber },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error voiding journal entry:', err);
    return NextResponse.json({ error: 'Failed to void journal entry' }, { status: 500 });
  }
}
