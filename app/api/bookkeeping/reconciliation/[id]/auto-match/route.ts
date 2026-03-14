import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { startOfDay, endOfDay, formatDate } from '@/lib/date-utils';

// POST /api/bookkeeping/reconciliation/[id]/auto-match
// Auto-matches booked statement imports for the account/period
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    // Get the reconciliation
    const reconciliation = await prisma.reconciliation.findFirst({
      where: { id, companyId: companyId! },
      include: {
        clearedItems: true,
      },
    });

    if (!reconciliation) {
      return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 });
    }

    if (reconciliation.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Cannot modify a completed reconciliation' },
        { status: 400 }
      );
    }

    const startDateStr = formatDate(reconciliation.statementStartDate);
    const endDateStr = formatDate(reconciliation.statementEndDate);

    // Find booked statement imports for this account within the statement period
    const bookedImports = await prisma.statementImport.findMany({
      where: {
        companyId: companyId!,
        sourceAccountId: reconciliation.accountId,
        status: 'booked',
        postDate: {
          gte: startOfDay(startDateStr),
          lte: endOfDay(endDateStr),
        },
        journalEntryId: { not: null },
      },
      select: {
        journalEntryId: true,
      },
    });

    if (bookedImports.length === 0) {
      return NextResponse.json({ matched: 0, message: 'No booked imports found in this period' });
    }

    // Get journal entry line IDs for these imports
    const journalEntryIds = bookedImports.map((i) => i.journalEntryId).filter(Boolean) as string[];

    const lines = await prisma.journalEntryLine.findMany({
      where: {
        accountId: reconciliation.accountId,
        journalEntryId: { in: journalEntryIds },
        isReconciled: false,
      },
      select: {
        id: true,
        debit: true,
        credit: true,
      },
    });

    // Get already cleared line IDs
    const alreadyClearedIds = new Set(reconciliation.clearedItems.map((item) => item.journalEntryLineId));

    // Add new cleared items
    const newItems = lines
      .filter((line) => !alreadyClearedIds.has(line.id))
      .map((line) => ({
        reconciliationId: id,
        journalEntryLineId: line.id,
        amount: line.debit > 0 ? line.debit : line.credit,
        isDebit: line.debit > 0,
      }));

    if (newItems.length > 0) {
      // Note: duplicates already filtered out above via alreadyClearedIds
      await prisma.reconciledItem.createMany({
        data: newItems,
      });
    }

    return NextResponse.json({
      matched: newItems.length,
      message: `Auto-matched ${newItems.length} transaction${newItems.length !== 1 ? 's' : ''} from statement imports`,
    });
  } catch (err) {
    console.error('Error auto-matching:', err);
    return NextResponse.json({ error: 'Failed to auto-match' }, { status: 500 });
  }
}
