import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/bookkeeping/reconciliation/accounts
// Returns accounts eligible for reconciliation (bank_checking, bank_savings, credit_card)
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    // Get reconcilable accounts
    const accounts = await prisma.account.findMany({
      where: {
        companyId: companyId!,
        isActive: true,
        OR: [
          { type: 'asset', accountGroup: 'Cash' },
          { type: 'credit_card' },
        ],
      },
      orderBy: { code: 'asc' },
    });

    // For each account, get the last reconciliation info
    const accountsWithReconciliation = await Promise.all(
      accounts.map(async (account) => {
        // Get last completed reconciliation
        const lastCompleted = await prisma.reconciliation.findFirst({
          where: {
            companyId: companyId!,
            accountId: account.id,
            status: 'completed',
          },
          orderBy: { statementEndDate: 'desc' },
          select: {
            id: true,
            statementEndDate: true,
            reconciledBalance: true,
            completedAt: true,
          },
        });

        // Get any in-progress reconciliation
        const inProgress = await prisma.reconciliation.findFirst({
          where: {
            companyId: companyId!,
            accountId: account.id,
            status: 'in_progress',
          },
          select: {
            id: true,
            statementStartDate: true,
            statementEndDate: true,
            createdAt: true,
          },
        });

        // Get current book balance (all posted transactions)
        const lines = await prisma.journalEntryLine.findMany({
          where: {
            accountId: account.id,
            journalEntry: {
              companyId: companyId!,
              status: 'posted',
            },
          },
          select: {
            debit: true,
            credit: true,
          },
        });

        const isDebitNormal = account.type === 'asset';
        const totalDebits = lines.reduce((sum, l) => sum + l.debit, 0);
        const totalCredits = lines.reduce((sum, l) => sum + l.credit, 0);
        const bookBalance = isDebitNormal
          ? Math.round((totalDebits - totalCredits) * 100) / 100
          : Math.round((totalCredits - totalDebits) * 100) / 100;

        return {
          id: account.id,
          code: account.code,
          name: account.name,
          type: account.type,
          accountGroup: account.accountGroup,
          bookBalance,
          lastReconciled: lastCompleted
            ? {
                date: lastCompleted.statementEndDate,
                balance: lastCompleted.reconciledBalance,
                completedAt: lastCompleted.completedAt,
              }
            : null,
          inProgress: inProgress
            ? {
                id: inProgress.id,
                statementStartDate: inProgress.statementStartDate,
                statementEndDate: inProgress.statementEndDate,
                createdAt: inProgress.createdAt,
              }
            : null,
        };
      })
    );

    return NextResponse.json(accountsWithReconciliation);
  } catch (err) {
    console.error('Error fetching reconcilable accounts:', err);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}
