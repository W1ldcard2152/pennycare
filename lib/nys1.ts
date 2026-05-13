import { prisma } from '@/lib/db';
import { addBusinessDays, formatDate, startOfDay, endOfDay } from '@/lib/date-utils';

// File NYS-1 within 5 business days of any payroll once quarterly NY income
// tax withheld reaches $700. (3 business days for federal semi-weekly depositors;
// monthly depositors get 5.)
const NYS1_THRESHOLD = 700;
const NYS1_BUSINESS_DAYS = 5;

// Small employers may also file monthly even below the threshold for predictability.
// We trigger the monthly cadence reminder when the EARLIEST unfiled payroll has been
// sitting unfiled for ~4 weeks. Anchoring on the oldest unfiled payroll means new
// employers don't get nagged before they've even run anything to file.
const MONTHLY_CADENCE_DAYS = 28;

export type Nys1AlertReason = 'threshold_reached' | 'monthly_cadence';

export interface Nys1Alert {
  shouldFile: boolean;
  reason: Nys1AlertReason | null;
  threshold: number;
  /** Sum of NY state + local tax on payrolls processed since the last filing
   *  (or since quarter start if there are no prior filings this quarter). */
  unfiledWithholding: number;
  /** Earliest payDate among unfiled payrolls — drives monthly cadence anchor. */
  earliestUnfiledPayDate: string | null;
  /** Most recent payDate among unfiled payrolls. */
  latestUnfiledPayDate: string | null;
  /** Hard legal deadline = latestUnfiledPayDate + 5 business days. Only meaningful
   *  once threshold is reached, but we compute it whenever an unfiled payroll exists. */
  legalDeadline: string | null;
  lastFiledDate: string | null;
  daysSinceLastFiling: number | null;
  /** How many days the oldest unfiled payroll has been unfiled. */
  daysSinceEarliestUnfiledPayroll: number | null;
}

function quarterRange(now: Date): { start: Date; end: Date } {
  const month = now.getUTCMonth();
  const quarter = Math.floor(month / 3);
  const startMonth = quarter * 3 + 1;
  const endMonth = quarter * 3 + 3;
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), endMonth, 0)).getUTCDate();
  const startStr = `${now.getUTCFullYear()}-${String(startMonth).padStart(2, '0')}-01`;
  const endStr = `${now.getUTCFullYear()}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start: startOfDay(startStr), end: endOfDay(endStr) };
}

/**
 * Compute the NYS-1 filing alert for a given company.
 *
 * Alert fires when ANY of:
 *   1. Unfiled NY state+local tax this quarter ≥ $700 (legal threshold)
 *   2. The OLDEST unfiled payroll has been sitting unfiled for ≥ 28 days
 *      (monthly cadence — works for both first-time and ongoing filers)
 *
 * Quiet when there's no unfiled withholding (just-filed or no payroll since).
 * A brand-new company that just started running payroll won't be nagged
 * until either they cross $700 or 28 days elapse from their first run.
 */
export async function computeNys1Alert(companyId: string, now: Date = new Date()): Promise<Nys1Alert> {
  const { start: qStart, end: qEnd } = quarterRange(now);

  // Most recent filing for this company (if any). The cutoff for "unfiled
  // withholding" is the later of (last filing's periodEndDate) and (quarter start).
  const lastFiling = await prisma.nys1Filing.findFirst({
    where: { companyId },
    orderBy: { filedDate: 'desc' },
    select: { filedDate: true, periodEndDate: true },
  });

  let cutoff = qStart;
  if (lastFiling && lastFiling.periodEndDate > cutoff) {
    cutoff = lastFiling.periodEndDate;
  }

  // Payroll runs after the cutoff but within this quarter
  const unfiledRecords = await prisma.payrollRecord.findMany({
    where: {
      companyId,
      status: 'active',
      payDate: { gt: cutoff, lte: qEnd },
    },
    orderBy: { payDate: 'asc' },
    select: { payDate: true, stateTax: true, localTax: true },
  });

  const unfiledWithholding = unfiledRecords.reduce(
    (sum, r) => sum + r.stateTax + (r.localTax || 0),
    0
  );
  const earliestUnfiledPayDate = unfiledRecords.length > 0 ? unfiledRecords[0].payDate : null;
  const latestUnfiledPayDate = unfiledRecords.length > 0 ? unfiledRecords[unfiledRecords.length - 1].payDate : null;

  const daysSinceLastFiling = lastFiling
    ? Math.floor((now.getTime() - lastFiling.filedDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const daysSinceEarliestUnfiledPayroll = earliestUnfiledPayDate
    ? Math.floor((now.getTime() - earliestUnfiledPayDate.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  // Decide whether to alert and why
  let reason: Nys1AlertReason | null = null;
  if (unfiledWithholding >= NYS1_THRESHOLD) {
    reason = 'threshold_reached';
  } else if (
    unfiledWithholding > 0 &&
    daysSinceEarliestUnfiledPayroll !== null &&
    daysSinceEarliestUnfiledPayroll >= MONTHLY_CADENCE_DAYS
  ) {
    reason = 'monthly_cadence';
  }

  return {
    shouldFile: reason !== null,
    reason,
    threshold: NYS1_THRESHOLD,
    unfiledWithholding: Math.round(unfiledWithholding * 100) / 100,
    earliestUnfiledPayDate: earliestUnfiledPayDate ? formatDate(earliestUnfiledPayDate) : null,
    latestUnfiledPayDate: latestUnfiledPayDate ? formatDate(latestUnfiledPayDate) : null,
    legalDeadline: latestUnfiledPayDate
      ? formatDate(addBusinessDays(latestUnfiledPayDate, NYS1_BUSINESS_DAYS))
      : null,
    lastFiledDate: lastFiling ? formatDate(lastFiling.filedDate) : null,
    daysSinceLastFiling,
    daysSinceEarliestUnfiledPayroll,
  };
}
