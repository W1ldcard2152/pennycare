import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { validateRequest, toggleClearedSchema } from '@/lib/validation';
import { isDebitNormal } from '@/lib/bookkeeping';

// PATCH /api/bookkeeping/reconciliation/[id]/toggle
// Toggles a transaction's cleared status within the reconciliation
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const validation = validateRequest(toggleClearedSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { journalEntryLineId, cleared } = validation.data;

    // Verify reconciliation exists and is in progress
    const reconciliation = await prisma.reconciliation.findFirst({
      where: { id, companyId: companyId! },
      include: {
        account: { select: { type: true } },
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

    // Verify the journal entry line exists and belongs to the right account
    const line = await prisma.journalEntryLine.findFirst({
      where: {
        id: journalEntryLineId,
        accountId: reconciliation.accountId,
        journalEntry: {
          companyId: companyId!,
          status: 'posted',
        },
      },
    });

    if (!line) {
      return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    const existingItem = reconciliation.clearedItems.find(
      (item) => item.journalEntryLineId === journalEntryLineId
    );

    if (cleared && !existingItem) {
      // Add to cleared items
      await prisma.reconciledItem.create({
        data: {
          reconciliationId: id,
          journalEntryLineId,
          amount: line.debit > 0 ? line.debit : line.credit,
          isDebit: line.debit > 0,
        },
      });
    } else if (!cleared && existingItem) {
      // Remove from cleared items
      await prisma.reconciledItem.delete({
        where: { id: existingItem.id },
      });
    }

    // Get updated totals
    const updatedItems = await prisma.reconciledItem.findMany({
      where: {
        reconciliationId: id,
        journalEntryLine: {
          journalEntry: { status: 'posted' },
        },
      },
    });

    // Calculate beginning balance
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

    const accountIsDebitNormal = isDebitNormal(reconciliation.account.type);
    const clearedDebits = updatedItems.reduce(
      (sum, item) => sum + (item.isDebit ? item.amount : 0),
      0
    );
    const clearedCredits = updatedItems.reduce(
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
      clearedCount: updatedItems.length,
      clearedDebits: Math.round(clearedDebits * 100) / 100,
      clearedCredits: Math.round(clearedCredits * 100) / 100,
      clearedBalance,
      difference,
    });
  } catch (err) {
    console.error('Error toggling cleared status:', err);
    return NextResponse.json({ error: 'Failed to toggle cleared status' }, { status: 500 });
  }
}
