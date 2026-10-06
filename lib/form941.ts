/**
 * Form 941 — Employer's QUARTERLY Federal Tax Return.
 *
 * Pure computation for Part 1 (lines 1-15) and the Part 2 monthly liability
 * breakdown. The route fetches Prisma rows and passes plain objects so the
 * arithmetic stays testable.
 *
 * Two things this module exists to get right, both of which the previous
 * inline implementation got wrong:
 *
 *  - Line 1 is NOT "employees paid this quarter". It is the number of employees
 *    who received wages for the pay period including the 12th day of the
 *    quarter's THIRD month (Mar 12 / Jun 12 / Sep 12 / Dec 12).
 *  - Lines 2, 5a and 5c are not gross pay. Line 2 is federal taxable wages
 *    (gross less pre-tax deductions), line 5a is capped at the Social Security
 *    wage base, and line 5d applies only above the additional-Medicare
 *    threshold.
 */

import { SOCIAL_SECURITY_WAGE_BASE_BY_YEAR, getSocialSecurityWageBase, seedAppliesToYear } from './payrollCalculations';

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Social Security wage base by calendar year — defined in
 * lib/payrollCalculations.ts so payroll withholds against the same cap this
 * return reports. A wrong value there silently misstates line 5a; unknown
 * years fall back to the nearest entry and raise a `wage_base_estimated`
 * warning. The `ss_mismatch` warning still catches records withheld before
 * payroll became year-aware.
 */
export { SOCIAL_SECURITY_WAGE_BASE_BY_YEAR, getSocialSecurityWageBase };

export const ADDITIONAL_MEDICARE_THRESHOLD = 200000;

/** Combined employee + employer rates, as the form's own multipliers. */
export const SS_RATE_COMBINED = 0.124;
export const MEDICARE_RATE_COMBINED = 0.029;
export const ADDITIONAL_MEDICARE_RATE = 0.009;

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface Form941RecordInput {
  employeeId: string;
  payDate: Date;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  grossPay: number;
  /** grossPay less pre-tax deductions; null on pre-1.1 rows. */
  taxableWages: number | null;
  /**
   * Section 125 (cafeteria plan) deductions on this record — the only pre-tax
   * deductions excluded from Social Security / Medicare wages. 401(k)
   * deferrals stay in FICA wages. Omitted → 0 (FICA wages = gross).
   */
  section125Deductions?: number;
  federalTax: number;
  socialSecurity: number;
  employerSocialSecurity: number;
  medicare: number;
  employerMedicare: number;
  additionalMedicare: number;
}

export interface Form941EmployeeInput {
  id: string;
  socialSecurityTaxability: string | null;
  medicareTaxability: string | null;
  /** Employment span — drives the line 1 headcount. */
  hireDate: Date;
  terminationDate: Date | null;
  ytdGrossPaySeed: number;
  ytdSeedAsOfDate: Date | null;
}

export interface Form941Input {
  year: number;
  quarter: number;
  employees: Form941EmployeeInput[];
  /**
   * Every ACTIVE record from Jan 1 through the end of the quarter. The Social
   * Security cap and the additional-Medicare threshold are year-to-date, so
   * earlier quarters must be walked even though they are not reported.
   */
  yearRecords: Form941RecordInput[];
  /** Line 13 — deposits already made for the quarter. */
  totalDeposits?: number;
  /**
   * Company.federalDepositSchedule. Drives which line 16 box is marked and
   * whether the monthly liability boxes or Schedule B carry the detail.
   */
  depositSchedule?: DepositSchedule | null;
}

export type DepositSchedule = 'monthly' | 'semiweekly';

/** Which box to mark on Part 2 line 16. */
export type Line16Selection = 'monthly' | 'semiweekly' | 'unknown';

export interface Form941Line16 {
  schedule: DepositSchedule | null;
  selection: Line16Selection;
  /** Semiweekly depositors attach Schedule B instead of the monthly boxes. */
  requiresScheduleB: boolean;
  /** Only monthly depositors report the three monthly amounts on line 16. */
  reportMonthlyLiabilities: boolean;
  /**
   * True when line 12 is under $2,500 and no single day hit the $100,000
   * next-day deposit threshold. Informational only — whether the first line 16
   * box actually applies also depends on the prior quarter's return, which is
   * outside this app.
   */
  under2500Eligible: boolean;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

export interface Form941Lines {
  line1EmployeeCount: number;
  line2Wages: number;
  line3FederalTaxWithheld: number;
  line5aSocialSecurityWages: number;
  line5aTax: number;
  line5bTipsWages: number;
  line5bTax: number;
  line5cMedicareWages: number;
  line5cTax: number;
  line5dAdditionalMedicareWages: number;
  line5dTax: number;
  line5eTotal: number;
  line5fSection3121q: number;
  line6TotalBeforeAdjustments: number;
  line7FractionsOfCents: number;
  line8SickPay: number;
  line9TipsAndGroupLife: number;
  line10TotalAfterAdjustments: number;
  line11NonrefundableCredits: number;
  line12TotalAfterCredits: number;
  line13TotalDeposits: number;
  line14BalanceDue: number;
  line15Overpayment: number;
}

export interface Form941MonthlyLiability {
  /** 1-indexed month within the quarter. */
  month: number;
  monthName: string;
  liability: number;
}

export type Form941WarningCode =
  | 'wage_base_estimated'
  | 'ss_mismatch'
  | 'medicare_mismatch'
  | 'large_fractions_adjustment'
  | 'deposit_schedule_unset'
  | 'schedule_b_required'
  | 'under_2500_option'
  | 'zero_employee_count';

export interface Form941Warning {
  code: Form941WarningCode;
  message: string;
}

export interface Form941Result {
  socialSecurityWageBase: number;
  wageBaseIsExact: boolean;
  lines: Form941Lines;
  /** Part 2 line 16 — how the deposit schedule shapes the return. */
  line16: Form941Line16;
  /** Part 2 line 16 — tax liability for each month of the quarter. */
  monthlyLiabilities: Form941MonthlyLiability[];
  monthlyTotal: number;
  /** Schedule B daily liabilities, for semiweekly depositors. */
  dailyLiabilities: Array<{ payDate: string; liability: number }>;
  /** What payroll actually withheld + matched, for the tie-out checks. */
  booked: { socialSecurity: number; medicare: number; additionalMedicare: number; total: number };
  warnings: Form941Warning[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export function quarterBounds(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0)),
    end: new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999)),
  };
}

/** The 12th of the quarter's third month — the line 1 reference date. */
export function line1ReferenceDate(year: number, quarter: number): Date {
  return new Date(Date.UTC(year, (quarter - 1) * 3 + 2, 12, 12, 0, 0, 0));
}

function isTaxable(taxability: string | null): boolean {
  return taxability !== 'exempt';
}

function utcDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function buildForm941(input: Form941Input): Form941Result {
  const { year, quarter, employees, yearRecords } = input;
  const { base: ssWageBase, exact: wageBaseIsExact } = getSocialSecurityWageBase(year);
  const { start: qStart, end: qEnd } = quarterBounds(year, quarter);
  const warnings: Form941Warning[] = [];

  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const yearStart = new Date(Date.UTC(year, 0, 1));

  const ordered = [...yearRecords].sort((a, b) => {
    const d = a.payDate.getTime() - b.payDate.getTime();
    return d !== 0 ? d : a.payPeriodEnd.getTime() - b.payPeriodEnd.getTime();
  });

  // Records at or before an employee's seed cutoff are already inside
  // ytdGrossPaySeed — counting them again double-consumes the wage base.
  const seedCutoff = new Map<string, Date>();
  for (const e of employees) {
    const asOf = e.ytdSeedAsOfDate;
    seedCutoff.set(e.id, asOf && asOf > yearStart ? asOf : yearStart);
  }

  const ytdWages = new Map<string, number>();
  let line2 = 0;
  let line3 = 0;
  let ssWages = 0;
  let medicareWages = 0;
  let addlMedicareWages = 0;
  const booked = { socialSecurity: 0, medicare: 0, additionalMedicare: 0, total: 0 };
  const byMonth = new Map<number, number>();
  const byDay = new Map<string, number>();

  for (const record of ordered) {
    const employee = employeeById.get(record.employeeId);
    if (!employee) continue;

    // A seed describes the year of its as-of date only (seedAppliesToYear) —
    // same rule payroll used when it withheld against the wage base.
    if (!ytdWages.has(employee.id)) {
      const seedApplies = seedAppliesToYear(employee.ytdSeedAsOfDate, year);
      ytdWages.set(employee.id, seedApplies ? employee.ytdGrossPaySeed || 0 : 0);
    }

    // Federal taxable wages (gross less all pre-tax deductions) — line 2.
    const wages = record.taxableWages ?? record.grossPay;
    // Social Security / Medicare wages (gross less Section 125 only; 401(k)
    // deferrals are FICA wages) — lines 5a, 5c, 5d and the YTD ladder. Same
    // basis payroll withholds on (lib/payrollCalculations.ts ficaWages).
    const ficaWages = record.grossPay - (record.section125Deductions || 0);
    const ytdBefore = ytdWages.get(employee.id)!;
    const alreadyInSeed = record.payPeriodEnd <= seedCutoff.get(employee.id)!;
    if (!alreadyInSeed) {
      ytdWages.set(employee.id, ytdBefore + ficaWages);
    }

    const inQuarter =
      record.payDate.getTime() >= qStart.getTime() && record.payDate.getTime() <= qEnd.getTime();
    if (!inQuarter) continue;

    line2 += wages;
    line3 += record.federalTax;

    // Line 5a — capped at the Social Security wage base, year to date.
    if (isTaxable(employee.socialSecurityTaxability)) {
      ssWages += Math.min(ficaWages, Math.max(0, ssWageBase - ytdBefore));
    }

    // Line 5c — Medicare has no wage cap.
    if (isTaxable(employee.medicareTaxability)) {
      medicareWages += ficaWages;

      // Line 5d — only the portion above the threshold, year to date.
      const overAfter = Math.max(0, ytdBefore + ficaWages - ADDITIONAL_MEDICARE_THRESHOLD);
      const overBefore = Math.max(0, ytdBefore - ADDITIONAL_MEDICARE_THRESHOLD);
      addlMedicareWages += overAfter - overBefore;
    }

    booked.socialSecurity += record.socialSecurity + (record.employerSocialSecurity || 0);
    booked.medicare += record.medicare + (record.employerMedicare || 0);
    booked.additionalMedicare += record.additionalMedicare || 0;

    const liability =
      record.federalTax +
      record.socialSecurity +
      (record.employerSocialSecurity || 0) +
      record.medicare +
      (record.employerMedicare || 0) +
      (record.additionalMedicare || 0);

    const monthInQuarter = record.payDate.getUTCMonth() - (quarter - 1) * 3 + 1;
    byMonth.set(monthInQuarter, (byMonth.get(monthInQuarter) || 0) + liability);
    const day = utcDateString(record.payDate);
    byDay.set(day, (byDay.get(day) || 0) + liability);
  }

  booked.total = round2(
    line3 + booked.socialSecurity + booked.medicare + booked.additionalMedicare
  );

  // Line 1 — employees who received wages for the pay period including the 12th
  // of the third month. Derived from employment first: keying only off recorded
  // pay periods reports 0 whenever the reference date falls between pay runs,
  // which is a gap in the data rather than a quarter with no employees.
  const refDate = line1ReferenceDate(year, quarter).getTime();
  const paidThisQuarter = new Set<string>();
  for (const record of ordered) {
    if (
      record.payDate.getTime() >= qStart.getTime() &&
      record.payDate.getTime() <= qEnd.getTime()
    ) {
      paidThisQuarter.add(record.employeeId);
    }
  }

  const line1Employees = new Set<string>();
  for (const employee of employees) {
    if (!paidThisQuarter.has(employee.id)) continue;
    const employedOnRefDate =
      employee.hireDate.getTime() <= refDate &&
      (employee.terminationDate === null || employee.terminationDate.getTime() >= refDate);
    if (employedOnRefDate) line1Employees.add(employee.id);
  }
  // Secondary signal, for records whose employment dates are missing or wrong.
  for (const record of yearRecords) {
    if (
      record.payPeriodStart.getTime() <= refDate &&
      record.payPeriodEnd.getTime() >= refDate
    ) {
      line1Employees.add(record.employeeId);
    }
  }

  line2 = round2(line2);
  line3 = round2(line3);
  ssWages = round2(ssWages);
  medicareWages = round2(medicareWages);
  addlMedicareWages = round2(addlMedicareWages);

  // The form computes column 2 as column 1 times the printed rate.
  const line5aTax = round2(ssWages * SS_RATE_COMBINED);
  const line5cTax = round2(medicareWages * MEDICARE_RATE_COMBINED);
  const line5dTax = round2(addlMedicareWages * ADDITIONAL_MEDICARE_RATE);
  const line5eTotal = round2(line5aTax + line5cTax + line5dTax);
  const line6 = round2(line3 + line5eTotal);

  // Line 7 is the fractions-of-cents adjustment: the gap between the form's
  // rate-times-wages arithmetic and the per-paycheck amounts actually withheld.
  const line7 = round2(booked.total - line6);
  const line10 = round2(line6 + line7);
  const line12 = line10;
  const line13 = round2(input.totalDeposits ?? 0);
  const balance = round2(line12 - line13);

  const lines: Form941Lines = {
    line1EmployeeCount: line1Employees.size,
    line2Wages: line2,
    line3FederalTaxWithheld: line3,
    line5aSocialSecurityWages: ssWages,
    line5aTax,
    line5bTipsWages: 0,
    line5bTax: 0,
    line5cMedicareWages: medicareWages,
    line5cTax,
    line5dAdditionalMedicareWages: addlMedicareWages,
    line5dTax,
    line5eTotal,
    line5fSection3121q: 0,
    line6TotalBeforeAdjustments: line6,
    line7FractionsOfCents: line7,
    line8SickPay: 0,
    line9TipsAndGroupLife: 0,
    line10TotalAfterAdjustments: line10,
    line11NonrefundableCredits: 0,
    line12TotalAfterCredits: line12,
    line13TotalDeposits: line13,
    line14BalanceDue: balance > 0 ? balance : 0,
    line15Overpayment: balance < 0 ? round2(-balance) : 0,
  };

  const monthlyLiabilities: Form941MonthlyLiability[] = [1, 2, 3].map((m) => ({
    month: m,
    monthName: MONTH_NAMES[(quarter - 1) * 3 + m - 1],
    liability: round2(byMonth.get(m) || 0),
  }));
  const monthlyTotal = round2(monthlyLiabilities.reduce((s, m) => s + m.liability, 0));

  const dailyLiabilities = [...byDay.entries()]
    .map(([payDate, liability]) => ({ payDate, liability: round2(liability) }))
    .sort((a, b) => a.payDate.localeCompare(b.payDate));

  // ---- Warnings -----------------------------------------------------------
  if (!wageBaseIsExact) {
    warnings.push({
      code: 'wage_base_estimated',
      message:
        `No Social Security wage base is on file for ${year}; line 5a was capped at ` +
        `$${ssWageBase.toLocaleString()}. Confirm the published base before filing.`,
    });
  }

  const ssTolerance = Math.max(0.05, dailyLiabilities.length * 0.02);
  if (Math.abs(line5aTax - booked.socialSecurity) > ssTolerance) {
    warnings.push({
      code: 'ss_mismatch',
      message:
        `Line 5a computes $${line5aTax.toFixed(2)} of Social Security tax, but payroll booked ` +
        `$${round2(booked.socialSecurity).toFixed(2)}. This usually means the wage base used at ` +
        'payroll time differs from the one used here. Reconcile before filing.',
    });
  }
  if (Math.abs(line5cTax - booked.medicare) > ssTolerance) {
    warnings.push({
      code: 'medicare_mismatch',
      message:
        `Line 5c computes $${line5cTax.toFixed(2)} of Medicare tax, but payroll booked ` +
        `$${round2(booked.medicare).toFixed(2)}. Reconcile before filing.`,
    });
  }

  // Fractions of cents should be pennies. Anything larger is a real difference
  // wearing the adjustment's clothes.
  const fractionsCeiling = Math.max(0.5, dailyLiabilities.length * 0.05);
  if (Math.abs(line7) > fractionsCeiling) {
    warnings.push({
      code: 'large_fractions_adjustment',
      message:
        `Line 7 (fractions of cents) came to $${line7.toFixed(2)}, which is too large to be ` +
        'rounding. Line 7 is only meant to absorb sub-penny differences — investigate the gap ' +
        'between computed and withheld tax rather than filing it as an adjustment.',
    });
  }

  if (lines.line1EmployeeCount === 0 && line2 > 0) {
    const ref = line1ReferenceDate(year, quarter);
    warnings.push({
      code: 'zero_employee_count',
      message:
        `Line 1 is 0 for ${MONTH_NAMES[ref.getUTCMonth()]} 12, ${year} even though wages were paid ` +
        'this quarter. The count comes from employment dates plus payroll activity covering that ' +
        'date — check that hire and termination dates are set correctly on your employees.',
    });
  }

  // ---- Part 2 line 16 -----------------------------------------------------
  const schedule = input.depositSchedule ?? null;
  const maxDailyLiability = dailyLiabilities.reduce((m, d) => Math.max(m, d.liability), 0);
  const line16: Form941Line16 = {
    schedule,
    selection: schedule ?? 'unknown',
    requiresScheduleB: schedule === 'semiweekly',
    reportMonthlyLiabilities: schedule === 'monthly',
    under2500Eligible: lines.line12TotalAfterCredits < 2500 && maxDailyLiability < 100000,
  };

  if (schedule === null) {
    warnings.push({
      code: 'deposit_schedule_unset',
      message:
        'No federal deposit schedule is set for this company, so Part 2 line 16 is left blank. ' +
        'Set it in Settings → Tax Deposits so the return marks the right box.',
    });
  } else if (schedule === 'semiweekly') {
    warnings.push({
      code: 'schedule_b_required',
      message:
        'As a semiweekly depositor you must attach Schedule B (Form 941) reporting liability by ' +
        'day. The monthly boxes on line 16 are left blank, as the IRS requires. CV Books does not ' +
        'bundle a Schedule B template — use the daily liabilities below to complete it.',
    });
  }

  if (line16.under2500Eligible && lines.line12TotalAfterCredits > 0) {
    warnings.push({
      code: 'under_2500_option',
      message:
        `Line 12 is $${lines.line12TotalAfterCredits.toFixed(2)}, under the $2,500 threshold. You ` +
        'may be able to mark the first line 16 box and skip the liability detail entirely — that ' +
        "also depends on the prior quarter's line 12, which CV Books cannot see. The return is " +
        `filled for your configured ${schedule ?? 'unset'} schedule instead.`,
    });
  }

  return {
    socialSecurityWageBase: ssWageBase,
    wageBaseIsExact,
    lines,
    line16,
    monthlyLiabilities,
    monthlyTotal,
    dailyLiabilities,
    booked,
    warnings,
  };
}
