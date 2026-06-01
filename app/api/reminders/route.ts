import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { computeFilingDeadlines, computeDepositDeadlines } from '@/lib/taxDeadlines';

export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const includeFiled = request.nextUrl.searchParams.get('includeFiled') === 'true';

    // Fetch company settings
    const company = await prisma.company.findUnique({
      where: { id: companyId! },
      select: {
        federalDepositSchedule: true,
        reminderLeadDays: true,
      },
    });

    // Fetch all TaxFiling records
    const taxFilings = await prisma.taxFiling.findMany({
      where: { companyId: companyId! },
      select: { formType: true, year: true, quarter: true, status: true },
    });

    const now = new Date();

    // Two pay-date windows:
    //  - Deposit deadlines need pay dates within the deposit lookback/ahead
    //    window (-60 to +60 days). The deposit logic does its own filtering
    //    internally.
    //  - Filing deadlines need pay dates from earlier periods (Q1 941 due
    //    Apr 30 still appears in the 90-day lookback through late July).
    //    Fetching everything in the prior calendar year forward is more
    //    than enough to cover any quarterly/annual deadline in window.
    const lookbackDate = new Date(now);
    lookbackDate.setDate(lookbackDate.getDate() - 60);
    const lookaheadDate = new Date(now);
    lookaheadDate.setDate(lookaheadDate.getDate() + 60);

    const depositPayrollRecords = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payDate: { gte: lookbackDate, lte: lookaheadDate },
      },
      select: { payDate: true },
      distinct: ['payDate'],
    });
    const depositPayDates = depositPayrollRecords.map(r => r.payDate);

    // Recorded federal-941 deposits in the same window. Used to mark deposit
    // deadlines as paid (isFiled=true) so the banner stops nagging once the
    // user logs the deposit. Only 'recorded' status counts — voided deposits
    // don't satisfy anything.
    const recordedFederalDeposits = await prisma.taxDeposit.findMany({
      where: {
        companyId: companyId!,
        taxAuthority: 'federal_941',
        status: 'recorded',
        depositDate: { gte: lookbackDate, lte: lookaheadDate },
      },
      select: { depositDate: true },
    });
    const recordedDepositDates = recordedFederalDeposits.map(d => d.depositDate);

    // Broader window for filing-deadline gating. Covers every quarter
    // whose deadline could still be in the 90-day lookback window
    // (the annual 940/W-2 for last year has its deadline on Jan 31 of
    // this year, so previous-year payroll matters).
    const filingLookbackYearStart = new Date(now.getFullYear() - 1, 0, 1);
    const filingPayrollRecords = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payDate: { gte: filingLookbackYearStart },
      },
      select: { payDate: true },
      distinct: ['payDate'],
    });
    const filingPayDates = filingPayrollRecords.map(r => r.payDate);

    // Compute deadlines
    const filingDeadlines = computeFilingDeadlines(now, taxFilings, filingPayDates);
    const depositDeadlines = computeDepositDeadlines(
      now,
      depositPayDates,
      (company?.federalDepositSchedule || 'monthly') as 'monthly' | 'semiweekly',
      recordedDepositDates,
    );

    let allDeadlines = [...filingDeadlines, ...depositDeadlines];

    // Filter out filed items unless requested
    if (!includeFiled) {
      allDeadlines = allDeadlines.filter(d => !d.isFiled);
    }

    // Sort by deadline date ascending
    allDeadlines.sort((a, b) => a.deadline.localeCompare(b.deadline));

    // Banner deadlines (within lead days and not filed)
    const leadDays = company?.reminderLeadDays ?? 7;
    const bannerDeadlines = allDeadlines.filter(
      d => !d.isFiled && d.daysUntil <= leadDays
    );

    // Summary counts (unfiled only)
    const unfiled = allDeadlines.filter(d => !d.isFiled);
    const summary = {
      overdueCount: unfiled.filter(d => d.urgency === 'overdue').length,
      imminentCount: unfiled.filter(d => d.urgency === 'imminent').length,
      thisWeekCount: unfiled.filter(d => d.urgency === 'this_week').length,
      upcomingCount: unfiled.filter(d => d.urgency === 'upcoming').length,
    };

    return NextResponse.json({ deadlines: allDeadlines, bannerDeadlines, summary });
  } catch (error) {
    console.error('Error fetching reminders:', error);
    return NextResponse.json(
      { error: 'Failed to fetch reminders' },
      { status: 500 }
    );
  }
}
