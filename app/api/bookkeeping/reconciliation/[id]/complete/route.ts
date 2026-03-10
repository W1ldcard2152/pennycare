import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { validateRequest, completeReconciliationSchema } from '@/lib/validation';
import { isDebitNormal, createJournalEntry } from '@/lib/bookkeeping';
import { logAudit } from '@/lib/audit';
import { formatDate } from '@/lib/date-utils';

// POST /api/bookkeeping/reconciliation/[id]/complete
// Completes the reconciliation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const validation = validateRequest(completeReconciliationSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { createAdjustment, adjustmentAccountId } = validation.data;

    // Get the reconciliation with cleared items
    const reconciliation = await prisma.reconciliation.findFirst({
      where: { id, companyId: companyId! },
      include: {
        account: { select: { id: true, code: true, name: true, type: true } },
        clearedItems: {
          include: {
            journalEntryLine: true,
          },
        },
      },
    });

    if (!reconciliation) {
      return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 });
    }

    if (reconciliation.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'Reconciliation is already completed' },
        { status: 400 }
      );
    }

    // Calculate current balance
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
    let clearedBalance = accountIsDebitNormal
      ? Math.round((beginningBalance + clearedDebits - clearedCredits) * 100) / 100
      : Math.round((beginningBalance + clearedCredits - clearedDebits) * 100) / 100;

    // Compare directly - no sign conversion needed
    // CC book balance sign convention matches CC statement convention
    let difference = Math.round((reconciliation.statementBalance - clearedBalance) * 100) / 100;
    let adjustingEntryId: string | null = null;

    // If there's a difference, handle it
    if (Math.abs(difference) > 0.01) {
      if (!createAdjustment) {
        return NextResponse.json(
          {
            error: 'Reconciliation does not balance',
            difference,
            message: 'Set createAdjustment=true to create an adjusting entry',
          },
          { status: 400 }
        );
      }

      // Find or use the provided adjustment account
      let adjustmentAccount;
      if (adjustmentAccountId) {
        adjustmentAccount = await prisma.account.findFirst({
          where: { id: adjustmentAccountId, companyId: companyId! },
        });
      } else {
        // Use default Reconciliation Discrepancies account (6800)
        adjustmentAccount = await prisma.account.findFirst({
          where: { companyId: companyId!, code: '6800' },
        });

        // If not found, create it
        if (!adjustmentAccount) {
          adjustmentAccount = await prisma.account.create({
            data: {
              companyId: companyId!,
              code: '6800',
              name: 'Reconciliation Discrepancies',
              type: 'expense',
              subtype: 'expense',
              description: 'Adjustments for reconciliation differences',
              isActive: true,
            },
          });
        }
      }

      if (!adjustmentAccount) {
        return NextResponse.json(
          { error: 'Adjustment account not found' },
          { status: 400 }
        );
      }

      // Create adjusting journal entry
      // difference = statementBalance - clearedBalance
      const absAmount = Math.abs(difference);

      // For a debit-normal account (bank):
      // - Positive difference = statement shows more money than books = we need to debit the account
      // - Negative difference = statement shows less money = we need to credit the account
      // For a credit-normal account (credit card):
      // - Positive difference = statement shows we owe MORE than books = we need to credit the CC (increase liability)
      // - Negative difference = statement shows we owe LESS than books = we need to debit the CC (decrease liability)

      let lines;
      if (accountIsDebitNormal) {
        if (difference > 0) {
          // Need to increase bank balance: debit bank, credit expense (income)
          lines = [
            { accountId: reconciliation.accountId, description: 'Reconciliation adjustment', debit: absAmount, credit: 0 },
            { accountId: adjustmentAccount.id, description: 'Reconciliation adjustment', debit: 0, credit: absAmount },
          ];
        } else {
          // Need to decrease bank balance: credit bank, debit expense
          lines = [
            { accountId: reconciliation.accountId, description: 'Reconciliation adjustment', debit: 0, credit: absAmount },
            { accountId: adjustmentAccount.id, description: 'Reconciliation adjustment', debit: absAmount, credit: 0 },
          ];
        }
      } else {
        // Credit-normal (credit card)
        // CC balance: positive = you owe, negative = credit balance
        // To increase balance (owe more), we CREDIT the CC account
        // To decrease balance (owe less), we DEBIT the CC account
        if (difference > 0) {
          // Statement shows we owe more: credit CC (increase balance), debit expense
          lines = [
            { accountId: reconciliation.accountId, description: 'Reconciliation adjustment', debit: 0, credit: absAmount },
            { accountId: adjustmentAccount.id, description: 'Reconciliation adjustment', debit: absAmount, credit: 0 },
          ];
        } else {
          // Statement shows we owe less: debit CC (decrease balance), credit expense
          lines = [
            { accountId: reconciliation.accountId, description: 'Reconciliation adjustment', debit: absAmount, credit: 0 },
            { accountId: adjustmentAccount.id, description: 'Reconciliation adjustment', debit: 0, credit: absAmount },
          ];
        }
      }

      const adjustingEntry = await createJournalEntry({
        companyId: companyId!,
        date: reconciliation.statementEndDate,
        memo: `Reconciliation adjustment for ${reconciliation.account.name}`,
        source: 'reconciliation',
        sourceId: id,
        lines,
      });

      adjustingEntryId = adjustingEntry.id;

      // Add the adjusting entry's line for our account to cleared items
      const adjustingLine = adjustingEntry.lines.find(
        (l) => l.accountId === reconciliation.accountId
      );
      if (adjustingLine) {
        await prisma.reconciledItem.create({
          data: {
            reconciliationId: id,
            journalEntryLineId: adjustingLine.id,
            amount: absAmount,
            isDebit: adjustingLine.debit > 0,
          },
        });

        // Mark this line as reconciled
        await prisma.journalEntryLine.update({
          where: { id: adjustingLine.id },
          data: { isReconciled: true },
        });
      }

      // Update cleared balance with adjustment
      // For debit-normal: positive diff means we added a debit (increased balance)
      // For credit-normal: positive diff means we added a credit (made balance more negative)
      if (accountIsDebitNormal) {
        clearedBalance = difference > 0
          ? clearedBalance + absAmount
          : clearedBalance - absAmount;
      } else {
        // For credit-normal, adding a credit makes balance more negative
        // adding a debit makes it less negative
        clearedBalance = difference > 0
          ? clearedBalance - absAmount  // credit added, balance becomes more negative
          : clearedBalance + absAmount; // debit added, balance becomes less negative
      }
      difference = 0;
    }

    // Mark all cleared items' journal entry lines as reconciled
    const lineIds = reconciliation.clearedItems.map((item) => item.journalEntryLineId);
    if (lineIds.length > 0) {
      await prisma.journalEntryLine.updateMany({
        where: { id: { in: lineIds } },
        data: { isReconciled: true },
      });
    }

    // Update the reconciliation as completed
    const updated = await prisma.reconciliation.update({
      where: { id },
      data: {
        status: 'completed',
        reconciledBalance: clearedBalance,
        difference: 0,
        completedAt: new Date(),
        completedBy: session!.userId,
        adjustingEntryId,
      },
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'reconciliation.complete',
      entityType: 'Reconciliation',
      entityId: id,
      metadata: {
        accountCode: reconciliation.account.code,
        accountName: reconciliation.account.name,
        statementEndDate: formatDate(reconciliation.statementEndDate),
        statementBalance: reconciliation.statementBalance,
        reconciledBalance: clearedBalance,
        clearedItemCount: reconciliation.clearedItems.length + (adjustingEntryId ? 1 : 0),
        adjustingEntryCreated: !!adjustingEntryId,
      },
    });

    return NextResponse.json({
      success: true,
      id: updated.id,
      status: updated.status,
      reconciledBalance: clearedBalance,
      clearedCount: reconciliation.clearedItems.length + (adjustingEntryId ? 1 : 0),
      adjustingEntryId,
    });
  } catch (err) {
    console.error('Error completing reconciliation:', err);
    return NextResponse.json({ error: 'Failed to complete reconciliation' }, { status: 500 });
  }
}
