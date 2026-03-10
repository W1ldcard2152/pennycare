import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { endOfDay, formatDate } from '@/lib/date-utils';
import { isDebitNormal } from '@/lib/bookkeeping';

// GET /api/bookkeeping/reconciliation/[id]
// Returns the reconciliation with all its data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;
    const { id } = await params;

    const reconciliation = await prisma.reconciliation.findFirst({
      where: { id, companyId: companyId! },
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true, subtype: true },
        },
        clearedItems: {
          include: {
            journalEntryLine: {
              include: {
                journalEntry: {
                  select: {
                    id: true,
                    entryNumber: true,
                    date: true,
                    memo: true,
                    source: true,
                    referenceNumber: true,
                  },
                },
              },
            },
          },
        },
        adjustingEntry: {
          select: { id: true, entryNumber: true, memo: true },
        },
      },
    });

    if (!reconciliation) {
      return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 });
    }

    // Get beginning balance from last completed reconciliation before this one
    const lastCompleted = await prisma.reconciliation.findFirst({
      where: {
        companyId: companyId!,
        accountId: reconciliation.accountId,
        status: 'completed',
        statementEndDate: { lt: reconciliation.statementStartDate },
      },
      orderBy: { statementEndDate: 'desc' },
      select: { reconciledBalance: true },
    });

    const beginningBalance = lastCompleted?.reconciledBalance ?? 0;

    // Get uncleared transactions for this account
    const clearedLineIds = new Set(reconciliation.clearedItems.map((item) => item.journalEntryLineId));

    const unclearedLines = await prisma.journalEntryLine.findMany({
      where: {
        accountId: reconciliation.accountId,
        isReconciled: false,
        journalEntry: {
          companyId: companyId!,
          status: 'posted',
          date: { lte: endOfDay(formatDate(reconciliation.statementEndDate)) },
        },
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNumber: true,
            date: true,
            memo: true,
            source: true,
            referenceNumber: true,
          },
        },
      },
      orderBy: {
        journalEntry: { date: 'asc' },
      },
    });

    // Combine uncleared lines with cleared items, marking which are cleared
    const allTransactions = unclearedLines.map((line) => ({
      lineId: line.id,
      entryId: line.journalEntry.id,
      entryNumber: line.journalEntry.entryNumber,
      date: formatDate(line.journalEntry.date),
      memo: line.journalEntry.memo,
      description: line.description,
      source: line.journalEntry.source,
      referenceNumber: line.journalEntry.referenceNumber,
      debit: line.debit,
      credit: line.credit,
      isCleared: clearedLineIds.has(line.id),
    }));

    // Calculate totals
    const accountIsDebitNormal = isDebitNormal(reconciliation.account.type);
    const clearedDebits = reconciliation.clearedItems.reduce(
      (sum, item) => sum + (item.isDebit ? item.amount : 0),
      0
    );
    const clearedCredits = reconciliation.clearedItems.reduce(
      (sum, item) => sum + (!item.isDebit ? item.amount : 0),
      0
    );

    // Calculate cleared balance based on account type
    // For debit-normal (banks): balance = debits - credits (positive = money in bank)
    // For credit-normal (credit cards): balance = credits - debits
    //   - Positive = you owe money (more charges than payments)
    //   - Negative = credit balance (more payments than charges)
    // This matches how CC statements display: positive = amount due, negative = credit
    const clearedBalance = accountIsDebitNormal
      ? Math.round((beginningBalance + clearedDebits - clearedCredits) * 100) / 100
      : Math.round((beginningBalance + clearedCredits - clearedDebits) * 100) / 100;

    // Compare directly - no sign conversion needed
    // CC book balance sign convention matches CC statement convention
    const difference = Math.round((reconciliation.statementBalance - clearedBalance) * 100) / 100;

    return NextResponse.json({
      id: reconciliation.id,
      account: reconciliation.account,
      statementStartDate: formatDate(reconciliation.statementStartDate),
      statementEndDate: formatDate(reconciliation.statementEndDate),
      statementBalance: reconciliation.statementBalance,
      beginningBalance,
      clearedDebits: Math.round(clearedDebits * 100) / 100,
      clearedCredits: Math.round(clearedCredits * 100) / 100,
      clearedBalance,
      difference,
      transactions: allTransactions,
      clearedCount: reconciliation.clearedItems.length,
      totalCount: allTransactions.length,
      status: reconciliation.status,
      completedAt: reconciliation.completedAt,
      completedBy: reconciliation.completedBy,
      reopenedAt: reconciliation.reopenedAt,
      reopenReason: reconciliation.reopenReason,
      adjustingEntry: reconciliation.adjustingEntry,
    });
  } catch (err) {
    console.error('Error fetching reconciliation:', err);
    return NextResponse.json({ error: 'Failed to fetch reconciliation' }, { status: 500 });
  }
}

// DELETE /api/bookkeeping/reconciliation/[id]
// Cancels/deletes an in-progress reconciliation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const reconciliation = await prisma.reconciliation.findFirst({
      where: { id, companyId: companyId! },
    });

    if (!reconciliation) {
      return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 });
    }

    if (reconciliation.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Only in-progress reconciliations can be cancelled' },
        { status: 400 }
      );
    }

    // Delete the reconciliation and its cleared items (cascade)
    await prisma.reconciliation.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting reconciliation:', err);
    return NextResponse.json({ error: 'Failed to delete reconciliation' }, { status: 500 });
  }
}
