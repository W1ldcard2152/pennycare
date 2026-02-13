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

    // Fetch recent payroll pay dates (past 60 days through next 60 days)
    const now = new Date();
    const lookbackDate = new Date(now);
    lookbackDate.setDate(lookbackDate.getDate() - 60);
    const lookaheadDate = new Date(now);
    lookaheadDate.setDate(lookaheadDate.getDate() + 60);

    const payrollRecords = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payDate: { gte: lookbackDate, lte: lookaheadDate },
      },
      select: { payDate: true },
      distinct: ['payDate'],
    });

    const payDates = payrollRecords.map(r => r.payDate);

    // Compute deadlines
    const filingDeadlines = computeFilingDeadlines(now, taxFilings);
    const depositDeadlines = computeDepositDeadlines(
      now,
      payDates,
      (company?.federalDepositSchedule || 'monthly') as 'monthly' | 'semiweekly'
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
