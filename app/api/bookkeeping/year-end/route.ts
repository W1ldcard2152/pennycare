import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { generateProfitAndLoss, createYearEndClosingEntry } from '@/lib/bookkeeping';
import { logAudit } from '@/lib/audit';
import { parseBusinessDate } from '@/lib/date-utils';

// GET /api/bookkeeping/year-end
// Returns list of closed periods and available years to close
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    // Get all closed periods
    const closedPeriods = await prisma.closedPeriod.findMany({
      where: { companyId: companyId! },
      orderBy: { fiscalYear: 'desc' },
      include: {
        closingEntry: {
          select: {
            id: true,
            entryNumber: true,
            date: true,
            status: true,
          },
        },
      },
    });

    // Find years that actually have posted journal entries — enumerating every
    // year between the earliest entry and now would surface fiscal years with
    // no activity (e.g. a gap year, or a backdated opening-balance entry that
    // pulls the earliest date back a decade).
    const entryDates = await prisma.journalEntry.findMany({
      where: { companyId: companyId!, status: 'posted' },
      select: { date: true },
    });

    const currentYear = new Date().getUTCFullYear();
    const closedYears = new Set(closedPeriods.map((p) => p.fiscalYear));
    const yearsWithActivity = new Set(entryDates.map((e) => e.date.getUTCFullYear()));

    const availableYears = Array.from(yearsWithActivity)
      .filter((year) => year < currentYear && !closedYears.has(year))
      .sort((a, b) => b - a);

    return NextResponse.json({
      closedPeriods,
      availableYears,
      currentYear,
    });
  } catch (err) {
    console.error('Error fetching year-end data:', err);
    return NextResponse.json({ error: 'Failed to fetch year-end data' }, { status: 500 });
  }
}

// POST /api/bookkeeping/year-end
// Close a fiscal year
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json();
    const { fiscalYear, preview } = body;

    if (!fiscalYear || typeof fiscalYear !== 'number') {
      return NextResponse.json({ error: 'fiscalYear is required and must be a number' }, { status: 400 });
    }

    // Can't close current year or future years
    const currentYear = new Date().getUTCFullYear();
    if (fiscalYear >= currentYear) {
      return NextResponse.json({ error: 'Cannot close current or future fiscal years' }, { status: 400 });
    }

    // Check if already closed
    const existing = await prisma.closedPeriod.findUnique({
      where: { companyId_fiscalYear: { companyId: companyId!, fiscalYear } },
    });

    if (existing && !existing.isOpen) {
      return NextResponse.json({ error: `Fiscal year ${fiscalYear} is already closed` }, { status: 400 });
    }

    // Generate P&L to show preview
    const startDate = `${fiscalYear}-01-01`;
    const endDate = `${fiscalYear}-12-31`;
    const pnl = await generateProfitAndLoss(companyId!, startDate, endDate);

    // If preview mode, just return the P&L data
    if (preview) {
      return NextResponse.json({
        preview: true,
        fiscalYear,
        summary: {
          totalRevenue: pnl.totalRevenue,
          totalExpenses: pnl.totalExpenses,
          netIncome: pnl.netIncome,
          revenueAccounts: pnl.revenue.filter((r) => r.balance !== 0).length,
          expenseAccounts: pnl.expenses.filter((e) => e.balance !== 0).length,
        },
        revenue: pnl.revenue.filter((r) => r.balance !== 0),
        expenses: pnl.expenses.filter((e) => e.balance !== 0),
      });
    }

    // Create the closing entry
    const periodEnd = parseBusinessDate(endDate);
    const { entry, summary } = await createYearEndClosingEntry(companyId!, fiscalYear, periodEnd);

    // Create or update the closed period record
    let closedPeriod;
    if (existing) {
      // Reclosing after a reopen
      closedPeriod = await prisma.closedPeriod.update({
        where: { id: existing.id },
        data: {
          isOpen: false,
          closingEntryId: entry.id,
          reclosedAt: new Date(),
          reclosedBy: session!.userId,
        },
      });
    } else {
      closedPeriod = await prisma.closedPeriod.create({
        data: {
          companyId: companyId!,
          fiscalYear,
          periodEnd,
          closedAt: new Date(),
          closedBy: session!.userId,
          closingEntryId: entry.id,
          isOpen: false,
        },
      });
    }

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: existing ? 'year_end.reclose' : 'year_end.close',
      entityType: 'ClosedPeriod',
      entityId: closedPeriod.id,
      metadata: {
        fiscalYear,
        netIncome: summary.netIncome,
        closingEntryNumber: entry.entryNumber,
        revenueAccountsClosed: summary.revenueAccountsClosed,
        expenseAccountsClosed: summary.expenseAccountsClosed,
      },
    });

    return NextResponse.json({
      success: true,
      closedPeriod,
      closingEntry: {
        id: entry.id,
        entryNumber: entry.entryNumber,
      },
      summary,
    }, { status: 201 });
  } catch (err) {
    console.error('Error closing fiscal year:', err);
    const message = err instanceof Error ? err.message : 'Failed to close fiscal year';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
