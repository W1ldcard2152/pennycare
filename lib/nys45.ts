/**
 * NYS-45 (rev. 1/26) — Quarterly Combined Withholding, Wage Reporting,
 * and Unemployment Insurance Return.
 *
 * Pure computation for the three parts of the return. The route layer fetches
 * Prisma rows and hands plain objects in here so the arithmetic stays testable.
 *
 * Form structure this module targets (matches the bundled
 * public/document-templates/state/NYS-45.pdf, rev. 1/26):
 *
 *   Part A — Unemployment insurance (UI) information
 *     Number of employees a/b/c (week containing the 12th of each month)
 *     1. Total remuneration paid this quarter
 *     2. Remuneration paid this quarter in excess of the UI wage base since January 1
 *     3. Wages subject to contribution (line 1 - line 2)
 *     4. UI contributions due (line 3 x UI rate on line 4a)
 *     5. Re-employment service fund (line 3 x 0.075%)
 *     6. Subtotal (line 4 + line 5)
 *
 *   Part B — Withholding tax (WT) information
 *     13. Total tax withheld
 *     15. Form NYS-1 payments made for quarter
 *     17. Total payments
 *     20/21. Total WT amount due / overpaid
 *     22. Total payment due (line 10 + line 20)
 *     24. Total of all NYS, NYC, and Yonkers tax withheld
 *
 *   Part C — Quarterly employee/payee wage reporting and withholding information
 *     a SSN | b Last name | c First name | d MI | e Wage type R/O
 *     f Total UI remuneration paid this quarter
 *     g Gross federal wages or distribution
 *     h Total NYS tax withheld | i Total NYC tax withheld | j Total Yonkers tax withheld
 *
 * NOTE: NYS SDI and NY PFL are deliberately absent. They are premiums paid to a
 * carrier, not New York State withholding, and do not appear anywhere on the
 * NYS-45. Including them in line 13 would overstate reported withholding.
 */

/**
 * NY UI wage base by calendar year — defined in lib/payrollCalculations.ts so
 * payroll accrues SUI against the same base this return reports. The base is
 * what splits line 1 into lines 2 and 3, so a wrong value there produces a
 * wrong return. Unknown years fall back to the nearest year present, and the
 * caller surfaces that as a warning.
 */
import { NY_RSF_RATE, NY_SUI_WAGE_BASE_BY_YEAR, getNySuiWageBase } from './payrollCalculations';

export { NY_RSF_RATE, NY_SUI_WAGE_BASE_BY_YEAR, getNySuiWageBase };

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

export interface Nys45RecordInput {
  employeeId: string;
  payDate: Date;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  grossPay: number;
  /** grossPay - pre-tax deductions; null on pre-1.1 rows. */
  taxableWages: number | null;
  stateTax: number;
  /** Combined NYC-or-Yonkers withholding; split by employee residency flags. */
  localTax: number;
  employerSUI: number;
}

export interface Nys45EmployeeInput {
  id: string;
  firstName: string;
  lastName: string;
  middleName: string | null;
  /** Decrypted SSN, or null when unavailable/undecryptable. */
  ssn: string | null;
  unemploymentTaxability: string | null;
  /** Employment span — drives the Part A headcount for the week of the 12th. */
  hireDate: Date;
  terminationDate: Date | null;
  nycResident: boolean;
  yonkersResident: boolean;
  yonkersNonResident: boolean;
  ytdGrossPaySeed: number;
  ytdSeedAsOfDate: Date | null;
}

export interface Nys45Input {
  year: number;
  quarter: number;
  /** Company SUI rate as a percentage, e.g. 1.625 for 1.625%. Form line 4a. */
  uiRate: number;
  employees: Nys45EmployeeInput[];
  /**
   * Every ACTIVE payroll record for the calendar year up to the end of the
   * target quarter — not just the quarter. The wage-base split on line 2 is
   * "since January 1", so earlier quarters must be walked to know how much of
   * each employee's base was already consumed.
   */
  yearRecords: Nys45RecordInput[];
  /**
   * NYS-1 withholding payments already remitted for this quarter (line 15),
   * from recorded ny_withholding tax deposits.
   */
  nys1Payments?: number;
}

// ---------------------------------------------------------------------------
// Outputs
// ---------------------------------------------------------------------------

/** One row of Part C. Column letters match the printed form. */
export interface Nys45EmployeeRow {
  employeeId: string;
  /** a */ ssn: string | null;
  /** b */ lastName: string;
  /** c */ firstName: string;
  /** d */ middleInitial: string;
  /** e */ wageType: 'R' | 'O';
  /** f */ uiRemuneration: number;
  /** g */ grossFederalWages: number;
  /** h */ nysTaxWithheld: number;
  /** i */ nycTaxWithheld: number;
  /** j */ yonkersTaxWithheld: number;
  /** Not on the form; feeds line 2. */ uiExcess: number;
  /** Not on the form; feeds line 3. */ uiSubject: number;
  /** Not on the form; what payroll actually accrued, for the tie-out check. */
  bookedSUI: number;
  uiCovered: boolean;
}

export interface Nys45PartA {
  /** a/b/c — covered employees in the week containing the 12th of each month. */
  employeeCounts: [number, number, number];
  line1TotalRemuneration: number;
  line2ExcessRemuneration: number;
  line3WagesSubjectToContribution: number;
  line4aUiRate: number;
  line4UiContributionsDue: number;
  line5ReemploymentServiceFund: number;
  line6Subtotal: number;
}

export interface Nys45PartB {
  line13TotalTaxWithheld: number;
  line15Nys1Payments: number;
  line17TotalPayments: number;
  line20TotalWtDue: number;
  line21TotalWtOverpaid: number;
  line24TotalAllTaxWithheld: number;
  /** Component breakdown behind lines 13/24. */
  nysTaxWithheld: number;
  nycTaxWithheld: number;
  yonkersTaxWithheld: number;
}

export type Nys45WarningCode =
  | 'wage_base_estimated'
  | 'sui_mismatch'
  | 'local_tax_unattributed'
  | 'missing_ssn'
  | 'no_ui_rate'
  | 'zero_employee_count'
  | 'part_c_overflow';

export interface Nys45Warning {
  code: Nys45WarningCode;
  message: string;
}

export interface Nys45Result {
  wageBase: number;
  wageBaseIsExact: boolean;
  rsfRate: number;
  partA: Nys45PartA;
  partB: Nys45PartB;
  partC: Nys45EmployeeRow[];
  /** Sum of employerSUI actually booked in payroll for the quarter. */
  bookedSUI: number;
  warnings: Nys45Warning[];
}

// ---------------------------------------------------------------------------
// Quarter / week helpers (UTC-safe — see lib/date-utils.ts rationale)
// ---------------------------------------------------------------------------

export function quarterBounds(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3;
  return {
    start: new Date(Date.UTC(year, startMonth, 1, 0, 0, 0, 0)),
    // Day 0 of the following month is the last day of this quarter.
    end: new Date(Date.UTC(year, startMonth + 3, 0, 23, 59, 59, 999)),
  };
}

/**
 * Sunday-through-Saturday week containing the 12th of the given month —
 * the reference week NY uses for the Part A employee counts.
 */
export function weekOfTwelfth(year: number, monthIndex: number): { start: Date; end: Date } {
  const twelfth = new Date(Date.UTC(year, monthIndex, 12));
  const sunday = new Date(twelfth);
  sunday.setUTCDate(twelfth.getUTCDate() - twelfth.getUTCDay());
  sunday.setUTCHours(0, 0, 0, 0);
  const saturday = new Date(sunday);
  saturday.setUTCDate(sunday.getUTCDate() + 6);
  saturday.setUTCHours(23, 59, 59, 999);
  return { start: sunday, end: saturday };
}

function isUiCovered(taxability: string | null): boolean {
  return taxability !== 'exempt';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export function buildNys45(input: Nys45Input): Nys45Result {
  const { year, quarter, uiRate, employees, yearRecords } = input;
  const { base: wageBase, exact: wageBaseIsExact } = getNySuiWageBase(year);
  const { start: qStart, end: qEnd } = quarterBounds(year, quarter);
  const warnings: Nys45Warning[] = [];

  const employeeById = new Map(employees.map((e) => [e.id, e]));

  // Deterministic chronological order — the wage-base ladder depends on it.
  const ordered = [...yearRecords].sort((a, b) => {
    const d = a.payDate.getTime() - b.payDate.getTime();
    if (d !== 0) return d;
    return a.payPeriodEnd.getTime() - b.payPeriodEnd.getTime();
  });

  const rows = new Map<string, Nys45EmployeeRow>();
  const ytdGross = new Map<string, number>();
  let unattributedLocalTax = 0;

  // Records at or before the seed cutoff are already represented inside
  // ytdGrossPaySeed; counting them again would double-consume the wage base.
  // Mirrors the cutoff logic in app/api/payroll/process/route.ts.
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const seedCutoff = new Map<string, Date>();
  for (const e of employees) {
    const asOf = e.ytdSeedAsOfDate;
    seedCutoff.set(e.id, asOf && asOf > yearStart ? asOf : yearStart);
  }

  for (const record of ordered) {
    const employee = employeeById.get(record.employeeId);
    if (!employee) continue;

    // Seed the ladder with wages a prior payroll service already reported this
    // year. The seed always applies; ytdSeedAsOfDate only decides which of our
    // own records are additive on top of it.
    if (!ytdGross.has(employee.id)) {
      ytdGross.set(employee.id, employee.ytdGrossPaySeed || 0);
    }

    const covered = isUiCovered(employee.unemploymentTaxability);
    const ytdBefore = ytdGross.get(employee.id)!;
    const alreadyInSeed = record.payPeriodEnd <= seedCutoff.get(employee.id)!;
    const remainingBase = Math.max(0, wageBase - ytdBefore);
    const subject = covered ? Math.min(record.grossPay, remainingBase) : 0;
    const excess = record.grossPay - subject;
    if (!alreadyInSeed) {
      ytdGross.set(employee.id, ytdBefore + record.grossPay);
    }

    // Records from earlier quarters only exist to advance the ladder.
    const inQuarter =
      record.payDate.getTime() >= qStart.getTime() && record.payDate.getTime() <= qEnd.getTime();
    if (!inQuarter) continue;

    let row = rows.get(employee.id);
    if (!row) {
      row = {
        employeeId: employee.id,
        ssn: employee.ssn,
        lastName: employee.lastName,
        firstName: employee.firstName,
        middleInitial: employee.middleName ? employee.middleName.charAt(0).toUpperCase() : '',
        // The app only produces regular employee wages; 'O' is for annuitant
        // and other non-wage distributions it does not generate.
        wageType: 'R',
        uiRemuneration: 0,
        grossFederalWages: 0,
        nysTaxWithheld: 0,
        nycTaxWithheld: 0,
        yonkersTaxWithheld: 0,
        uiExcess: 0,
        uiSubject: 0,
        bookedSUI: 0,
        uiCovered: covered,
      };
      rows.set(employee.id, row);
    }

    // Column f is total remuneration paid, not the taxable slice — but only for
    // employees whose wages are covered by UI at all.
    if (covered) {
      row.uiRemuneration += record.grossPay;
      row.uiSubject += subject;
      row.uiExcess += excess;
    }
    row.bookedSUI += record.employerSUI || 0;

    // Column g — federal wages, i.e. gross less pre-tax deductions.
    row.grossFederalWages += record.taxableWages ?? record.grossPay;
    row.nysTaxWithheld += record.stateTax;

    // localTax is one column in the DB; residency flags say which city it was.
    const local = record.localTax || 0;
    if (local !== 0) {
      if (employee.nycResident) {
        row.nycTaxWithheld += local;
      } else if (employee.yonkersResident || employee.yonkersNonResident) {
        row.yonkersTaxWithheld += local;
      } else {
        unattributedLocalTax += local;
      }
    }
  }

  const partC = [...rows.values()]
    .map((r) => ({
      ...r,
      uiRemuneration: round2(r.uiRemuneration),
      grossFederalWages: round2(r.grossFederalWages),
      nysTaxWithheld: round2(r.nysTaxWithheld),
      nycTaxWithheld: round2(r.nycTaxWithheld),
      yonkersTaxWithheld: round2(r.yonkersTaxWithheld),
      uiExcess: round2(r.uiExcess),
      uiSubject: round2(r.uiSubject),
      bookedSUI: round2(r.bookedSUI),
    }))
    .sort((a, b) =>
      a.lastName.localeCompare(b.lastName) || a.firstName.localeCompare(b.firstName)
    );

  const sum = (pick: (r: Nys45EmployeeRow) => number) =>
    round2(partC.reduce((acc, r) => acc + pick(r), 0));

  // ---- Part A -------------------------------------------------------------
  const line1 = sum((r) => r.uiRemuneration);
  const line3 = sum((r) => r.uiSubject);
  const line2 = round2(line1 - line3);
  const line4 = round2(line3 * (uiRate / 100));
  const line5 = round2(line3 * NY_RSF_RATE);

  // Employees with at least one reported pay run this quarter — the pool the
  // headcount can draw from. Somebody on the roster who was never paid this
  // quarter is not a covered employee for these boxes.
  const paidThisQuarter = new Set(partC.map((r) => r.employeeId));

  const employeeCounts = [0, 1, 2].map((offset) => {
    const monthIndex = (quarter - 1) * 3 + offset;
    const { start, end } = weekOfTwelfth(year, monthIndex);
    const worked = new Set<string>();

    // Primary signal: employment. NY asks who *worked during or received pay
    // for* the reference week, which is a question about employment — not about
    // whether a pay period happens to land on it. Deriving it from pay periods
    // alone reports 0 whenever the reference week falls between pay runs.
    for (const employee of employees) {
      if (!isUiCovered(employee.unemploymentTaxability)) continue;
      if (!paidThisQuarter.has(employee.id)) continue;
      const employedDuringWeek =
        employee.hireDate.getTime() <= end.getTime() &&
        (employee.terminationDate === null ||
          employee.terminationDate.getTime() >= start.getTime());
      if (employedDuringWeek) worked.add(employee.id);
    }

    // Secondary signal: payroll activity in the week itself, in case the
    // employment dates on a record are missing or wrong.
    for (const record of yearRecords) {
      const employee = employeeById.get(record.employeeId);
      if (!employee || !isUiCovered(employee.unemploymentTaxability)) continue;
      const overlaps =
        record.payPeriodStart.getTime() <= end.getTime() &&
        record.payPeriodEnd.getTime() >= start.getTime();
      const paidInWeek =
        record.payDate.getTime() >= start.getTime() && record.payDate.getTime() <= end.getTime();
      if (overlaps || paidInWeek) worked.add(record.employeeId);
    }

    return worked.size;
  }) as [number, number, number];

  const partA: Nys45PartA = {
    employeeCounts,
    line1TotalRemuneration: line1,
    line2ExcessRemuneration: line2,
    line3WagesSubjectToContribution: line3,
    line4aUiRate: uiRate,
    line4UiContributionsDue: line4,
    line5ReemploymentServiceFund: line5,
    line6Subtotal: round2(line4 + line5),
  };

  // ---- Part B -------------------------------------------------------------
  const nys = sum((r) => r.nysTaxWithheld);
  const nyc = sum((r) => r.nycTaxWithheld);
  const yonkers = sum((r) => r.yonkersTaxWithheld);
  const line13 = round2(nys + nyc + yonkers);
  const line15 = round2(input.nys1Payments ?? 0);
  const line17 = line15;

  const partB: Nys45PartB = {
    line13TotalTaxWithheld: line13,
    line15Nys1Payments: line15,
    line17TotalPayments: line17,
    line20TotalWtDue: round2(Math.max(0, line13 - line17)),
    line21TotalWtOverpaid: round2(Math.max(0, line17 - line13)),
    line24TotalAllTaxWithheld: line13,
    nysTaxWithheld: nys,
    nycTaxWithheld: nyc,
    yonkersTaxWithheld: yonkers,
  };

  // ---- Warnings -----------------------------------------------------------
  const bookedSUI = sum((r) => r.bookedSUI);

  if (!wageBaseIsExact) {
    warnings.push({
      code: 'wage_base_estimated',
      message:
        `No published NY UI wage base is on file for ${year}; lines 2 and 3 were computed ` +
        `using $${wageBase.toLocaleString()}. Confirm the correct base before filing.`,
    });
  }

  if (uiRate <= 0) {
    warnings.push({
      code: 'no_ui_rate',
      message:
        'No UI rate is set for this company, so line 4 (UI contributions due) computes as $0. ' +
        'Set the SUI rate in company settings — it is required on line 4a.',
    });
  } else {
    // Line 4 is derived from the wage base; bookedSUI is what payroll actually
    // accrued and journalled. A gap means the return and the books disagree.
    const tolerance = Math.max(0.05, partC.length * 0.02);
    if (Math.abs(line4 - bookedSUI) > tolerance) {
      warnings.push({
        code: 'sui_mismatch',
        message:
          `Line 4 computed from the $${wageBase.toLocaleString()} wage base is ` +
          `$${line4.toFixed(2)}, but payroll booked $${bookedSUI.toFixed(2)} of SUI this quarter. ` +
          'Usually this means the SUI rate or wage base changed after payroll ran. ' +
          'Reconcile before filing.',
      });
    }
  }

  // A month can legitimately show zero, but if wages were paid this quarter and
  // a month still reads zero it usually means no pay period happened to cover
  // the reference week — a figure the filer has to confirm by hand.
  if (line1 > 0 && employeeCounts.some((c) => c === 0)) {
    const months = employeeCounts
      .map((c, i) => (c === 0 ? ['first', 'second', 'third'][i] : null))
      .filter(Boolean)
      .join(', ');
    warnings.push({
      code: 'zero_employee_count',
      message:
        `The Part A employee count is 0 for the ${months} month of the quarter even though wages ` +
        'were paid. The count comes from employment dates plus payroll activity in the week ' +
        'containing the 12th — check that hire and termination dates are set correctly on your ' +
        'employees.',
    });
  }

  if (unattributedLocalTax !== 0) {
    warnings.push({
      code: 'local_tax_unattributed',
      message:
        `$${round2(unattributedLocalTax).toFixed(2)} of local tax was withheld from employees ` +
        'with no NYC or Yonkers residency flag set, so it could not be placed in column i or j. ' +
        'Fix the affected employee records.',
    });
  }

  const missingSsn = partC.filter((r) => !r.ssn).length;
  if (missingSsn > 0) {
    warnings.push({
      code: 'missing_ssn',
      message:
        `${missingSsn} employee${missingSsn === 1 ? ' has' : 's have'} no readable SSN. ` +
        'Column a is required for every Part C row.',
    });
  }

  if (partC.length > 5) {
    warnings.push({
      code: 'part_c_overflow',
      message:
        `Part C holds 5 employees per printed page and this quarter has ${partC.length}. ` +
        'The PDF fills the first 5 only — file electronically, or attach continuation pages.',
    });
  }

  return {
    wageBase,
    wageBaseIsExact,
    rsfRate: NY_RSF_RATE,
    partA,
    partB,
    partC,
    bookedSUI,
    warnings,
  };
}
