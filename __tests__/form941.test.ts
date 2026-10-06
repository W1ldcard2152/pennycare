import { describe, it, expect } from 'vitest';
import {
  buildForm941,
  getSocialSecurityWageBase,
  line1ReferenceDate,
  quarterBounds,
  type Form941EmployeeInput,
  type Form941RecordInput,
} from '@/lib/form941';

function employee(overrides: Partial<Form941EmployeeInput> = {}): Form941EmployeeInput {
  return {
    id: 'emp1',
    socialSecurityTaxability: 'taxable',
    medicareTaxability: 'taxable',
    hireDate: new Date('2020-01-01T12:00:00.000Z'),
    terminationDate: null,
    ytdGrossPaySeed: 0,
    ytdSeedAsOfDate: null,
    ...overrides,
  };
}

function record(
  isoPayDate: string,
  overrides: Partial<Form941RecordInput> = {}
): Form941RecordInput {
  const payDate = new Date(`${isoPayDate}T12:00:00.000Z`);
  return {
    employeeId: 'emp1',
    payDate,
    payPeriodStart: payDate,
    payPeriodEnd: payDate,
    grossPay: 1000,
    taxableWages: 1000,
    federalTax: 100,
    socialSecurity: 62,
    employerSocialSecurity: 62,
    medicare: 14.5,
    employerMedicare: 14.5,
    additionalMedicare: 0,
    ...overrides,
  };
}

const BASE = { year: 2026, quarter: 2 };

describe('wage base and reference dates', () => {
  it('returns the published Social Security base for known years', () => {
    expect(getSocialSecurityWageBase(2025)).toEqual({ base: 176100, exact: true });
    expect(getSocialSecurityWageBase(2024)).toEqual({ base: 168600, exact: true });
  });

  it('flags an unknown year as inexact', () => {
    expect(getSocialSecurityWageBase(2031).exact).toBe(false);
  });

  it('puts the line 1 reference date on the 12th of the quarter third month', () => {
    expect(line1ReferenceDate(2026, 1).toISOString().slice(0, 10)).toBe('2026-03-12');
    expect(line1ReferenceDate(2026, 2).toISOString().slice(0, 10)).toBe('2026-06-12');
    expect(line1ReferenceDate(2026, 3).toISOString().slice(0, 10)).toBe('2026-09-12');
    expect(line1ReferenceDate(2026, 4).toISOString().slice(0, 10)).toBe('2026-12-12');
  });

  it('bounds the quarter in UTC', () => {
    expect(quarterBounds(2026, 2).start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(quarterBounds(2026, 2).end.toISOString()).toBe('2026-06-30T23:59:59.999Z');
  });
});

describe('line 1 employee count', () => {
  it('counts employees employed on the reference date even when pay runs miss it', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee({ id: 'a' }), employee({ id: 'b' })],
      // Both paid in May only; neither period covers June 12.
      yearRecords: [
        record('2026-05-08', { employeeId: 'a' }),
        record('2026-05-08', { employeeId: 'b' }),
      ],
    });

    expect(result.lines.line1EmployeeCount).toBe(2);
    expect(result.warnings.map((w) => w.code)).not.toContain('zero_employee_count');
  });

  it('excludes employees hired after or terminated before the reference date', () => {
    const result = buildForm941({
      ...BASE,
      employees: [
        employee({ id: 'late', hireDate: new Date('2026-06-20T12:00:00.000Z') }),
        employee({ id: 'gone', terminationDate: new Date('2026-05-31T12:00:00.000Z') }),
        employee({ id: 'here' }),
      ],
      yearRecords: [
        record('2026-06-26', { employeeId: 'late' }),
        record('2026-05-08', { employeeId: 'gone' }),
        record('2026-05-08', { employeeId: 'here' }),
      ],
    });

    expect(result.lines.line1EmployeeCount).toBe(1);
  });

  it('does not count an employee with no pay run in the quarter', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee({ id: 'paid' }), employee({ id: 'idle' })],
      yearRecords: [record('2026-05-08', { employeeId: 'paid' })],
    });

    expect(result.lines.line1EmployeeCount).toBe(1);
  });

  it('falls back to a pay period covering the reference date', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee({ hireDate: new Date('2027-01-01T12:00:00.000Z') })],
      yearRecords: [
        {
          ...record('2026-06-19'),
          payPeriodStart: new Date('2026-06-08T12:00:00.000Z'),
          payPeriodEnd: new Date('2026-06-14T12:00:00.000Z'),
        },
      ],
    });

    expect(result.lines.line1EmployeeCount).toBe(1);
  });

  it('warns when the count lands on zero despite wages being paid', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee({ terminationDate: new Date('2026-05-31T12:00:00.000Z') })],
      yearRecords: [record('2026-05-08')],
    });

    expect(result.lines.line1EmployeeCount).toBe(0);
    expect(result.warnings.map((w) => w.code)).toContain('zero_employee_count');
  });
});

describe('Part 1 wage lines', () => {
  it('uses federal taxable wages for line 2, not gross pay', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-05-08', { grossPay: 1000, taxableWages: 780 })],
    });

    expect(result.lines.line2Wages).toBe(780);
  });

  it('keeps 401(k) deferrals in FICA wages and takes out only Section 125', () => {
    // $1,000 gross, $120 401(k) + $100 health insurance pre-tax.
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-05-08', { grossPay: 1000, taxableWages: 780, section125Deductions: 100 })],
    });

    expect(result.lines.line2Wages).toBe(780);
    expect(result.lines.line5aSocialSecurityWages).toBe(900);
    expect(result.lines.line5cMedicareWages).toBe(900);
  });

  it('starts a new year without a prior-year YTD seed', () => {
    // Seed as of Dec 2025 — must not consume the 2026 Social Security base.
    const result = buildForm941({
      ...BASE,
      employees: [employee({ ytdGrossPaySeed: 184000, ytdSeedAsOfDate: new Date('2025-12-20T12:00:00.000Z') })],
      yearRecords: [record('2026-05-08', { grossPay: 1000, taxableWages: 1000 })],
    });

    expect(result.lines.line5aSocialSecurityWages).toBe(1000);
  });

  it('falls back to gross pay when taxable wages are absent', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-05-08', { grossPay: 1000, taxableWages: null })],
    });

    expect(result.lines.line2Wages).toBe(1000);
  });

  it('caps line 5a at the Social Security wage base', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [
        // 2026 base is 184,500. Q1 uses 180,000 of it.
        record('2026-02-13', { grossPay: 180000, taxableWages: 180000 }),
        record('2026-05-08', { grossPay: 10000, taxableWages: 10000 }),
      ],
    });

    // Only 4,500 of base remained when the Q2 run happened.
    expect(result.lines.line5aSocialSecurityWages).toBe(4500);
    // Medicare has no cap.
    expect(result.lines.line5cMedicareWages).toBe(10000);
  });

  it('applies additional Medicare only above the 200k threshold', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [
        record('2026-02-13', { grossPay: 195000, taxableWages: 195000 }),
        record('2026-05-08', { grossPay: 10000, taxableWages: 10000 }),
      ],
    });

    // 195,000 -> 205,000 crosses 200,000, so 5,000 is over the threshold.
    expect(result.lines.line5dAdditionalMedicareWages).toBe(5000);
    expect(result.lines.line5dTax).toBe(45); // 5,000 x 0.9%
  });

  it('excludes exempt employees from the wage lines they are exempt from', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee({ socialSecurityTaxability: 'exempt' })],
      yearRecords: [record('2026-05-08', { grossPay: 1000, taxableWages: 1000 })],
    });

    expect(result.lines.line5aSocialSecurityWages).toBe(0);
    expect(result.lines.line5cMedicareWages).toBe(1000);
    // Line 2 still reports the wages.
    expect(result.lines.line2Wages).toBe(1000);
  });

  it('computes columns 2 at the form printed rates', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-05-08', { grossPay: 10000, taxableWages: 10000 })],
    });

    expect(result.lines.line5aTax).toBe(1240); // 10,000 x 12.4%
    expect(result.lines.line5cTax).toBe(290); // 10,000 x 2.9%
    expect(result.lines.line5eTotal).toBe(1530);
  });
});

describe('totals, adjustments and deposits', () => {
  it('rolls line 6 through to line 12 and derives the balance due', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [
        record('2026-05-08', {
          grossPay: 1000, taxableWages: 1000, federalTax: 100,
          socialSecurity: 62, employerSocialSecurity: 62,
          medicare: 14.5, employerMedicare: 14.5,
        }),
      ],
      totalDeposits: 100,
    });

    // 5a tax 124.00 + 5c tax 29.00 = 153.00; + line 3 100 = 253.00
    expect(result.lines.line6TotalBeforeAdjustments).toBe(253);
    // Booked matches exactly, so no fractions-of-cents adjustment.
    expect(result.lines.line7FractionsOfCents).toBe(0);
    expect(result.lines.line12TotalAfterCredits).toBe(253);
    expect(result.lines.line13TotalDeposits).toBe(100);
    expect(result.lines.line14BalanceDue).toBe(153);
    expect(result.lines.line15Overpayment).toBe(0);
  });

  it('reports an overpayment when deposits exceed the liability', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-05-08')],
      totalDeposits: 1000,
    });

    expect(result.lines.line14BalanceDue).toBe(0);
    expect(result.lines.line15Overpayment).toBeGreaterThan(0);
  });

  it('absorbs sub-penny rounding into line 7', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      // Booked SS is a cent off what 12.4% of wages produces.
      yearRecords: [
        record('2026-05-08', {
          grossPay: 1000, taxableWages: 1000, federalTax: 100,
          socialSecurity: 62, employerSocialSecurity: 62.01,
          medicare: 14.5, employerMedicare: 14.5,
        }),
      ],
    });

    expect(result.lines.line7FractionsOfCents).toBe(0.01);
    expect(result.lines.line10TotalAfterAdjustments).toBe(
      result.lines.line6TotalBeforeAdjustments + 0.01
    );
    expect(result.warnings.map((w) => w.code)).not.toContain('large_fractions_adjustment');
  });

  it('warns when the fractions-of-cents adjustment is too large to be rounding', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [
        record('2026-05-08', {
          grossPay: 1000, taxableWages: 1000, federalTax: 100,
          socialSecurity: 62, employerSocialSecurity: 200,
          medicare: 14.5, employerMedicare: 14.5,
        }),
      ],
    });

    expect(result.warnings.map((w) => w.code)).toContain('large_fractions_adjustment');
    expect(result.warnings.map((w) => w.code)).toContain('ss_mismatch');
  });

  it('excludes voided-equivalent gaps by only receiving active records', () => {
    // The route filters status; the builder simply reports what it is given.
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [],
    });

    expect(result.lines.line2Wages).toBe(0);
    expect(result.lines.line12TotalAfterCredits).toBe(0);
  });
});

describe('Part 2 monthly liability', () => {
  it('buckets liability into the three months of the quarter', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [
        record('2026-04-10'),
        record('2026-05-08'),
        record('2026-05-22'),
        record('2026-06-19'),
      ],
    });

    const [m1, m2, m3] = result.monthlyLiabilities;
    expect(m1.monthName).toBe('April');
    expect(m2.monthName).toBe('May');
    expect(m3.monthName).toBe('June');
    // Each record books 100 + 124 + 29 = 253.
    expect(m1.liability).toBe(253);
    expect(m2.liability).toBe(506);
    expect(m3.liability).toBe(253);
    expect(result.monthlyTotal).toBe(1012);
  });

  it('ties the monthly total to line 12', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-04-10'), record('2026-06-19')],
    });

    expect(result.monthlyTotal).toBeCloseTo(result.lines.line12TotalAfterCredits, 2);
  });

  it('warns and leaves line 16 unselected when no schedule is configured', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-05-08')],
    });

    expect(result.line16.schedule).toBeNull();
    expect(result.line16.selection).toBe('unknown');
    expect(result.line16.reportMonthlyLiabilities).toBe(false);
    expect(result.line16.requiresScheduleB).toBe(false);
    expect(result.warnings.map((w) => w.code)).toContain('deposit_schedule_unset');
  });

  it('reports the monthly amounts for a monthly depositor', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-05-08')],
      depositSchedule: 'monthly',
    });

    expect(result.line16.selection).toBe('monthly');
    expect(result.line16.reportMonthlyLiabilities).toBe(true);
    expect(result.line16.requiresScheduleB).toBe(false);
    const codes = result.warnings.map((w) => w.code);
    expect(codes).not.toContain('deposit_schedule_unset');
    expect(codes).not.toContain('schedule_b_required');
  });

  it('requires Schedule B and suppresses the monthly amounts for a semiweekly depositor', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-05-08'), record('2026-06-19')],
      depositSchedule: 'semiweekly',
    });

    expect(result.line16.selection).toBe('semiweekly');
    expect(result.line16.requiresScheduleB).toBe(true);
    expect(result.line16.reportMonthlyLiabilities).toBe(false);
    expect(result.warnings.map((w) => w.code)).toContain('schedule_b_required');
    // The daily detail is still produced — Schedule B is built from it.
    expect(result.dailyLiabilities).toHaveLength(2);
  });

  it('flags the under-2500 option without overriding the configured schedule', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-05-08')],
      depositSchedule: 'semiweekly',
    });

    expect(result.lines.line12TotalAfterCredits).toBeLessThan(2500);
    expect(result.line16.under2500Eligible).toBe(true);
    expect(result.warnings.map((w) => w.code)).toContain('under_2500_option');
    // Still filled for the configured schedule, not silently switched.
    expect(result.line16.selection).toBe('semiweekly');
  });

  it('does not offer the under-2500 option once liability passes the threshold', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: Array.from({ length: 12 }, () => record('2026-05-08')),
      depositSchedule: 'monthly',
    });

    expect(result.lines.line12TotalAfterCredits).toBeGreaterThan(2500);
    expect(result.line16.under2500Eligible).toBe(false);
    expect(result.warnings.map((w) => w.code)).not.toContain('under_2500_option');
  });

  it('reports daily liabilities for Schedule B', () => {
    const result = buildForm941({
      ...BASE,
      employees: [employee()],
      yearRecords: [record('2026-05-08'), record('2026-05-08'), record('2026-06-19')],
    });

    expect(result.dailyLiabilities).toEqual([
      { payDate: '2026-05-08', liability: 506 },
      { payDate: '2026-06-19', liability: 253 },
    ]);
  });
});
