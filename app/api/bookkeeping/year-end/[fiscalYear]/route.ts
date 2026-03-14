import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { generateProfitAndLoss } from '@/lib/bookkeeping';

// GET /api/bookkeeping/year-end/[fiscalYear]
// Get details for a specific fiscal year (closed or unclosed)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fiscalYear: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { fiscalYear: fiscalYearStr } = await params;
    const fiscalYear = parseInt(fiscalYearStr, 10);

    if (isNaN(fiscalYear)) {
      return NextResponse.json({ error: 'Invalid fiscal year' }, { status: 400 });
    }

    // Get the closed period if it exists
    const closedPeriod = await prisma.closedPeriod.findUnique({
      where: { companyId_fiscalYear: { companyId: companyId!, fiscalYear } },
      include: {
        closingEntry: {
          select: {
            id: true,
            entryNumber: true,
            date: true,
            status: true,
            lines: {
              include: {
                account: {
                  select: { code: true, name: true, type: true },
                },
              },
            },
          },
        },
      },
    });

    // Generate P&L for this year
    const startDate = `${fiscalYear}-01-01`;
    const endDate = `${fiscalYear}-12-31`;
    const pnl = await generateProfitAndLoss(companyId!, startDate, endDate);

    return NextResponse.json({
      fiscalYear,
      closedPeriod,
      pnl: {
        totalRevenue: pnl.totalRevenue,
        totalExpenses: pnl.totalExpenses,
        netIncome: pnl.netIncome,
        revenue: pnl.revenue.filter((r) => r.balance !== 0),
        expenses: pnl.expenses.filter((e) => e.balance !== 0),
      },
    });
  } catch (err) {
    console.error('Error fetching fiscal year details:', err);
    return NextResponse.json({ error: 'Failed to fetch fiscal year details' }, { status: 500 });
  }
}
