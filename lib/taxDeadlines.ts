// Pure deadline computation logic - no database access
// All functions take inputs and return computed results

export interface TaxDeadline {
  id: string;
  type: 'filing' | 'deposit';
  formType: string;
  label: string;
  description: string;
  deadline: string; // ISO date "YYYY-MM-DD"
  urgency: 'overdue' | 'imminent' | 'this_week' | 'upcoming';
  daysUntil: number;
  isFiled: boolean;
  href?: string; // Link to relevant page
}

export interface FiledRecord {
  formType: string;
  year: number;
  quarter: number | null;
  status: string;
}

// Quarterly filing due dates: Q1->Apr 30, Q2->Jul 31, Q3->Oct 31, Q4->Jan 31 (next year)
const QUARTERLY_DUE_DATES: Array<{ month: number; day: number; nextYear: boolean }> = [
  { month: 3, day: 30, nextYear: false },  // Q1 - April 30
  { month: 6, day: 31, nextYear: false },  // Q2 - July 31
  { month: 9, day: 31, nextYear: false },  // Q3 - October 31
  { month: 0, day: 31, nextYear: true },   // Q4 - January 31 next year
];

function toISODate(date: Date): string {
  return date.toISOString().split('T')[0];
}

function diffDays(deadline: Date, today: Date): number {
  const deadlineStart = new Date(deadline.getFullYear(), deadline.getMonth(), deadline.getDate());
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.floor((deadlineStart.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
}

export function classifyUrgency(deadline: Date, today: Date): 'overdue' | 'imminent' | 'this_week' | 'upcoming' {
  const days = diffDays(deadline, today);
  if (days < 0) return 'overdue';
  if (days <= 3) return 'imminent';
  if (days <= 7) return 'this_week';
  return 'upcoming';
}

function isFiledForPeriod(filedRecords: FiledRecord[], formType: string, year: number, quarter: number | null): boolean {
  return filedRecords.some(
    r => r.formType === formType && r.year === year && r.quarter === quarter && r.status === 'filed'
  );
}

// Get the quarterly filing deadline date for a given year and quarter (1-4)
export function getQuarterlyDueDate(year: number, quarter: number): Date {
  const config = QUARTERLY_DUE_DATES[quarter - 1];
  const dueYear = config.nextYear ? year + 1 : year;
  return new Date(dueYear, config.month, config.day);
}

// Get annual filing deadline (Jan 31 of following year)
export function getAnnualDueDate(year: number): Date {
  return new Date(year + 1, 0, 31);
}

export function computeFilingDeadlines(today: Date, filedRecords: FiledRecord[]): TaxDeadline[] {
  const deadlines: TaxDeadline[] = [];
  const lookbackMs = 90 * 24 * 60 * 60 * 1000;
  const lookaheadMs = 180 * 24 * 60 * 60 * 1000;
  const currentYear = today.getFullYear();

  // Generate quarterly deadlines for current year and previous year
  const quarterlyForms = [
    { formType: '941', label: 'Form 941', description: 'Quarterly Federal Tax Return', href: '/tax-forms/941' },
    { formType: 'nys45', label: 'NYS-45', description: 'NY Combined Withholding & UI Return', href: '/tax-forms/nys-45' },
  ];

  for (const form of quarterlyForms) {
    for (const year of [currentYear - 1, currentYear, currentYear + 1]) {
      for (let quarter = 1; quarter <= 4; quarter++) {
        const dueDate = getQuarterlyDueDate(year, quarter);
        const daysUntil = diffDays(dueDate, today);

        // Only include deadlines within window
        if (dueDate.getTime() < today.getTime() - lookbackMs) continue;
        if (dueDate.getTime() > today.getTime() + lookaheadMs) continue;

        const isFiled = isFiledForPeriod(filedRecords, form.formType, year, quarter);

        deadlines.push({
          id: `${form.formType}-${year}-Q${quarter}`,
          type: 'filing',
          formType: form.formType,
          label: `${form.label} Q${quarter} ${year}`,
          description: form.description,
          deadline: toISODate(dueDate),
          urgency: classifyUrgency(dueDate, today),
          daysUntil,
          isFiled,
          href: `${form.href}?year=${year}&quarter=${quarter}`,
        });
      }
    }
  }

  // Generate annual deadlines
  const annualForms = [
    { formType: '940', label: 'Form 940', description: 'Annual FUTA Tax Return', href: '/tax-forms' },
    { formType: 'w2', label: 'Form W-2', description: 'Wage and Tax Statements', href: '/tax-forms' },
  ];

  for (const form of annualForms) {
    for (const year of [currentYear - 1, currentYear]) {
      const dueDate = getAnnualDueDate(year);
      const daysUntil = diffDays(dueDate, today);

      if (dueDate.getTime() < today.getTime() - lookbackMs) continue;
      if (dueDate.getTime() > today.getTime() + lookaheadMs) continue;

      const isFiled = isFiledForPeriod(filedRecords, form.formType, year, null);

      deadlines.push({
        id: `${form.formType}-${year}`,
        type: 'filing',
        formType: form.formType,
        label: `${form.label} ${year}`,
        description: form.description,
        deadline: toISODate(dueDate),
        urgency: classifyUrgency(dueDate, today),
        daysUntil,
        isFiled,
        href: `${form.href}?year=${year}`,
      });
    }
  }

  return deadlines;
}

export function computeDepositDeadlines(
  today: Date,
  payDates: Date[],
  depositSchedule: 'monthly' | 'semiweekly'
): TaxDeadline[] {
  const deadlines: TaxDeadline[] = [];

  if (depositSchedule === 'monthly') {
    // Group pay dates by month, deposit due by 15th of following month
    const monthsWithPayroll = new Set<string>();
    for (const payDate of payDates) {
      const key = `${payDate.getFullYear()}-${String(payDate.getMonth()).padStart(2, '0')}`;
      monthsWithPayroll.add(key);
    }

    for (const monthKey of monthsWithPayroll) {
      const [year, month] = monthKey.split('-').map(Number);
      // Deposit due 15th of following month
      const depositMonth = month + 1;
      const depositYear = depositMonth > 11 ? year + 1 : year;
      const depositMonthNorm = depositMonth > 11 ? 0 : depositMonth;
      const dueDate = new Date(depositYear, depositMonthNorm, 15);

      const daysUntil = diffDays(dueDate, today);
      // Only show deposits within a reasonable window (-30 to +60 days)
      if (daysUntil < -30 || daysUntil > 60) continue;

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      deadlines.push({
        id: `deposit-monthly-${year}-${String(month).padStart(2, '0')}`,
        type: 'deposit',
        formType: 'federal_deposit',
        label: `Federal Tax Deposit`,
        description: `For ${monthNames[month]} ${year} payroll`,
        deadline: toISODate(dueDate),
        urgency: classifyUrgency(dueDate, today),
        daysUntil,
        isFiled: false, // Deposits don't have filing status
        href: '/payroll/tax-liability',
      });
    }
  } else {
    // Semi-weekly: deposit due Wed (for Sat-Tue paydays) or Fri (for Wed-Fri paydays)
    for (const payDate of payDates) {
      const dayOfWeek = payDate.getDay(); // 0=Sun, 1=Mon, ...6=Sat
      const dueDate = new Date(payDate);

      if (dayOfWeek === 0 || dayOfWeek === 1 || dayOfWeek === 2 || dayOfWeek === 6) {
        // Sat/Sun/Mon/Tue payday -> deposit by following Wednesday
        const daysToWed = dayOfWeek <= 2 ? (3 - dayOfWeek) : (10 - dayOfWeek);
        dueDate.setDate(dueDate.getDate() + daysToWed);
      } else {
        // Wed/Thu/Fri payday -> deposit by following Friday
        const daysToFri = 5 - dayOfWeek;
        dueDate.setDate(dueDate.getDate() + (daysToFri <= 0 ? 7 + daysToFri : daysToFri));
      }

      const daysUntil = diffDays(dueDate, today);
      if (daysUntil < -14 || daysUntil > 30) continue;

      const payDateStr = payDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

      deadlines.push({
        id: `deposit-sw-${toISODate(payDate)}`,
        type: 'deposit',
        formType: 'federal_deposit',
        label: `Federal Tax Deposit`,
        description: `For ${payDateStr} payroll`,
        deadline: toISODate(dueDate),
        urgency: classifyUrgency(dueDate, today),
        daysUntil,
        isFiled: false,
        href: '/payroll/tax-liability',
      });
    }
  }

  return deadlines;
}

// Re-export helpers for use in tax-liability route
export function getForm941DueDate(periodEnd: Date): string {
  const quarter = Math.floor(periodEnd.getMonth() / 3) + 1;
  const year = periodEnd.getFullYear();
  return toISODate(getQuarterlyDueDate(year, quarter));
}

export function getNYS45DueDate(periodEnd: Date): string {
  return getForm941DueDate(periodEnd); // Same due dates
}

export function getNextDepositDate(isSemiWeekly: boolean): string {
  const now = new Date();
  if (isSemiWeekly) {
    const dayOfWeek = now.getDay();
    let daysUntilDeposit: number;
    if (dayOfWeek <= 2) {
      daysUntilDeposit = 3 - dayOfWeek;
    } else if (dayOfWeek <= 4) {
      daysUntilDeposit = 5 - dayOfWeek;
    } else {
      daysUntilDeposit = 10 - dayOfWeek;
    }
    const depositDate = new Date(now);
    depositDate.setDate(depositDate.getDate() + daysUntilDeposit);
    return toISODate(depositDate);
  } else {
    const depositDate = new Date(now.getFullYear(), now.getMonth() + 1, 15);
    return toISODate(depositDate);
  }
}
