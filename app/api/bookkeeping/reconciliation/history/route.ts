import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { formatDate } from '@/lib/date-utils';

// GET /api/bookkeeping/reconciliation/history
// Returns past reconciliations for an account
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const accountId = searchParams.get('accountId');

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    // Verify account belongs to company
    const account = await prisma.account.findFirst({
      where: { id: accountId, companyId: companyId! },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const reconciliations = await prisma.reconciliation.findMany({
      where: {
        companyId: companyId!,
        accountId,
      },
      orderBy: { statementEndDate: 'desc' },
      include: {
        _count: {
          select: { clearedItems: true },
        },
        adjustingEntry: {
          select: { id: true, entryNumber: true },
        },
      },
    });

    const history = reconciliations.map((r) => ({
      id: r.id,
      statementStartDate: formatDate(r.statementStartDate),
      statementEndDate: formatDate(r.statementEndDate),
      statementBalance: r.statementBalance,
      reconciledBalance: r.reconciledBalance,
      difference: r.difference,
      status: r.status,
      clearedCount: r._count.clearedItems,
      completedAt: r.completedAt,
      reopenedAt: r.reopenedAt,
      reopenReason: r.reopenReason,
      adjustingEntry: r.adjustingEntry,
      createdAt: r.createdAt,
    }));

    return NextResponse.json(history);
  } catch (err) {
    console.error('Error fetching reconciliation history:', err);
    return NextResponse.json({ error: 'Failed to fetch history' }, { status: 500 });
  }
}
