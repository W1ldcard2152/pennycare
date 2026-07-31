import { describe, it, expect } from 'vitest';
import {
  buildNys45,
  getNySuiWageBase,
  quarterBounds,
  weekOfTwelfth,
  type Nys45EmployeeInput,
  type Nys45RecordInput,
} from '@/lib/nys45';

function employee(overrides: Partial<Nys45EmployeeInput> = {}): Nys45EmployeeInput {
  return {
    id: 'emp1',
    firstName: 'Pat',
    lastName: 'Kelly',
    middleName: 'Quinn',
    ssn: '123456789',
    unemploymentTaxability: 'taxable',
    hireDate: new Date('2020-01-01T12:00:00.000Z'),
    terminationDate: null,
    nycResident: false,
    yonkersResident: false,
    yonkersNonResident: false,
    ytdGrossPaySeed: 0,
    ytdSeedAsOfDate: null,
    ...overrides,
  };
}

function record(
  isoPayDate: string,
  overrides: Partial<Nys45RecordInput> = {}
): Nys45RecordInput {
  const payDate = new Date(`${isoPayDate}T12:00:00.000Z`);
  return {
    employeeId: 'emp1',
    payDate,
    payPeriodStart: payDate,
    payPeriodEnd: payDate,
    grossPay: 1000,
    taxableWages: 1000,
    stateTax: 40,
    localTax: 0,
    employerSUI: 0,
    ...overrides,
  };
}

const BASE_INPUT = { year: 2026, quarter: 2, uiRate: 1.625 };

describe('getNySuiWageBase', () => {
  it('returns the published base for a known year', () => {
    expect(getNySuiWageBase(2026)).toEqual({ base: 17600, exact: true });
    expect(getNySuiWageBase(2025)).toEqual({ base: 12800, exact: true });
  });

  it('falls back to the newest known year and flags it as inexact', () => {
    const result = getNySuiWageBase(2030);
    expect(result.base).toBe(17600);
    expect(result.exact).toBe(false);
  });
});

describe('quarterBounds', () => {
  it('covers the full quarter in UTC', () => {
    const q2 = quarterBounds(2026, 2);
    expect(q2.start.toISOString()).toBe('2026-04-01T00:00:00.000Z');
    expect(q2.end.toISOString()).toBe('2026-06-30T23:59:59.999Z');
  });

  it('ends Q4 on December 31', () => {
    expect(quarterBounds(2026, 4).end.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });
});

describe('weekOfTwelfth', () => {
  it('returns the Sunday-Saturday week containing the 12th', () => {
    // May 12 2026 is a Tuesday; its week runs Sun May 10 - Sat May 16.
    const week = weekOfTwelfth(2026, 4);
    expect(week.start.toISOString().slice(0, 10)).toBe('2026-05-10');
    expect(week.end.toISOString().slice(0, 10)).toBe('2026-05-16');
  });
});

describe('buildNys45 Part A', () => {
  it('reports full remuneration on line 1 and splits the wage base across lines 2 and 3', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee()],
      yearRecords: [
        // Q1 consumes 17,000 of the 17,600 base.
        record('2026-02-15', { grossPay: 17000, taxableWages: 17000 }),
        record('2026-05-15', { grossPay: 2000, taxableWages: 2000 }),
      ],
    });

    // Only the Q2 record is reported.
    expect(result.partA.line1TotalRemuneration).toBe(2000);
    // 600 of base remained, so 1,400 is excess.
    expect(result.partA.line3WagesSubjectToContribution).toBe(600);
    expect(result.partA.line2ExcessRemuneration).toBe(1400);
    expect(result.partA.line1TotalRemuneration).toBe(
      result.partA.line2ExcessRemuneration + result.partA.line3WagesSubjectToContribution
    );
  });

  it('reports zero subject wages once the base is fully consumed', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee()],
      yearRecords: [
        record('2026-02-15', { grossPay: 20000, taxableWages: 20000 }),
        record('2026-05-15', { grossPay: 2000, taxableWages: 2000 }),
      ],
    });

    expect(result.partA.line1TotalRemuneration).toBe(2000);
    expect(result.partA.line2ExcessRemuneration).toBe(2000);
    expect(result.partA.line3WagesSubjectToContribution).toBe(0);
    expect(result.partA.line4UiContributionsDue).toBe(0);
  });

  it('computes lines 4, 5 and 6 from wages subject to contribution', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee()],
      yearRecords: [record('2026-05-15', { grossPay: 10000, taxableWages: 10000 })],
    });

    expect(result.partA.line3WagesSubjectToContribution).toBe(10000);
    expect(result.partA.line4UiContributionsDue).toBe(162.5); // 10,000 x 1.625%
    expect(result.partA.line5ReemploymentServiceFund).toBe(7.5); // 10,000 x 0.075%
    expect(result.partA.line6Subtotal).toBe(170);
  });

  it('honours the prior-service YTD seed when consuming the wage base', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [
        employee({
          ytdGrossPaySeed: 17000,
          ytdSeedAsOfDate: new Date('2026-03-31T12:00:00.000Z'),
        }),
      ],
      yearRecords: [record('2026-05-15', { grossPay: 2000, taxableWages: 2000 })],
    });

    expect(result.partA.line3WagesSubjectToContribution).toBe(600);
    expect(result.partA.line2ExcessRemuneration).toBe(1400);
  });

  it('applies the YTD seed even when no seed date is recorded', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee({ ytdGrossPaySeed: 17307.75, ytdSeedAsOfDate: null })],
      yearRecords: [record('2026-05-15', { grossPay: 1153.85, taxableWages: 1153.85 })],
    });

    // Only 292.25 of the 17,600 base is left.
    expect(result.partA.line3WagesSubjectToContribution).toBe(292.25);
    expect(result.partA.line2ExcessRemuneration).toBe(861.6);
  });

  it('does not double-count records already covered by the seed cutoff', () => {
    const seedAsOf = new Date('2026-04-12T00:00:00.000Z');
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee({ ytdGrossPaySeed: 15000, ytdSeedAsOfDate: seedAsOf })],
      yearRecords: [
        // Ends before the cutoff — its wages are already inside the seed.
        {
          ...record('2026-04-05', { grossPay: 5000, taxableWages: 5000 }),
          payPeriodStart: new Date('2026-03-30T12:00:00.000Z'),
          payPeriodEnd: new Date('2026-04-05T12:00:00.000Z'),
        },
        {
          ...record('2026-05-02', { grossPay: 1000, taxableWages: 1000 }),
          payPeriodStart: new Date('2026-04-26T12:00:00.000Z'),
          payPeriodEnd: new Date('2026-05-02T12:00:00.000Z'),
        },
        {
          ...record('2026-05-09', { grossPay: 1000, taxableWages: 1000 }),
          payPeriodStart: new Date('2026-05-03T12:00:00.000Z'),
          payPeriodEnd: new Date('2026-05-09T12:00:00.000Z'),
        },
      ],
    });

    // All three runs were paid in Q2, so all three are remuneration on line 1.
    expect(result.partA.line1TotalRemuneration).toBe(7000);
    // The pre-cutoff run is already inside the seed, so it must not advance the
    // ladder past 15,000: it consumes the last 2,600 of base, and each May run
    // then still sees 2,600 remaining — matching what payroll itself accrued.
    expect(result.partA.line3WagesSubjectToContribution).toBe(4600);
    expect(result.partA.line2ExcessRemuneration).toBe(2400);
  });

  it('excludes UI-exempt employees from lines 1 through 3 but keeps them in Part C', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [
        employee({ id: 'emp1' }),
        employee({ id: 'emp2', lastName: 'Zane', unemploymentTaxability: 'exempt' }),
      ],
      yearRecords: [
        record('2026-05-15', { employeeId: 'emp1', grossPay: 1000, taxableWages: 1000 }),
        record('2026-05-15', { employeeId: 'emp2', grossPay: 5000, taxableWages: 5000 }),
      ],
    });

    expect(result.partA.line1TotalRemuneration).toBe(1000);
    expect(result.partC).toHaveLength(2);
    const exempt = result.partC.find((r) => r.employeeId === 'emp2')!;
    expect(exempt.uiRemuneration).toBe(0);
    expect(exempt.grossFederalWages).toBe(5000);
  });

  it('counts an employee employed all quarter even when pay runs miss the reference weeks', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee()],
      // Neither period touches Apr 12-18, May 10-16 or Jun 7-13.
      yearRecords: [
        {
          ...record('2026-05-02'),
          payPeriodStart: new Date('2026-04-26T12:00:00.000Z'),
          payPeriodEnd: new Date('2026-05-02T12:00:00.000Z'),
        },
        {
          ...record('2026-05-09'),
          payPeriodStart: new Date('2026-05-03T12:00:00.000Z'),
          payPeriodEnd: new Date('2026-05-09T12:00:00.000Z'),
        },
      ],
    });

    expect(result.partA.employeeCounts).toEqual([1, 1, 1]);
  });

  it('excludes months before hire and after termination', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [
        employee({
          // Hired after April's reference week, gone before June's.
          hireDate: new Date('2026-05-01T12:00:00.000Z'),
          terminationDate: new Date('2026-05-29T12:00:00.000Z'),
        }),
      ],
      yearRecords: [record('2026-05-15')],
    });

    expect(result.partA.employeeCounts).toEqual([0, 1, 0]);
  });

  it('does not count an employee with no pay run in the quarter', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee({ id: 'paid' }), employee({ id: 'idle', lastName: 'Idle' })],
      yearRecords: [record('2026-05-15', { employeeId: 'paid' })],
    });

    expect(result.partA.employeeCounts).toEqual([1, 1, 1]);
  });

  it('falls back to payroll activity when employment dates say otherwise', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      // hireDate is wrong/missing-ish, but a real pay period covers May 10-16.
      employees: [employee({ hireDate: new Date('2027-01-01T12:00:00.000Z') })],
      yearRecords: [
        {
          ...record('2026-05-22'),
          payPeriodStart: new Date('2026-05-11T12:00:00.000Z'),
          payPeriodEnd: new Date('2026-05-17T12:00:00.000Z'),
        },
      ],
    });

    expect(result.partA.employeeCounts).toEqual([0, 1, 0]);
  });

  it('excludes UI-exempt employees from the headcount', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee({ unemploymentTaxability: 'exempt' })],
      yearRecords: [record('2026-05-15')],
    });

    expect(result.partA.employeeCounts).toEqual([0, 0, 0]);
  });
});

describe('buildNys45 Part B and C', () => {
  it('splits local tax into NYC and Yonkers by residency flag', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [
        employee({ id: 'nyc', lastName: 'Adams', nycResident: true }),
        employee({ id: 'yonk', lastName: 'Bell', yonkersResident: true }),
      ],
      yearRecords: [
        record('2026-05-15', { employeeId: 'nyc', stateTax: 40, localTax: 25 }),
        record('2026-05-15', { employeeId: 'yonk', stateTax: 40, localTax: 7 }),
      ],
    });

    expect(result.partB.nysTaxWithheld).toBe(80);
    expect(result.partB.nycTaxWithheld).toBe(25);
    expect(result.partB.yonkersTaxWithheld).toBe(7);
    expect(result.partB.line13TotalTaxWithheld).toBe(112);
    expect(result.partB.line24TotalAllTaxWithheld).toBe(112);
  });

  it('warns when local tax cannot be attributed to a locality', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee()],
      yearRecords: [record('2026-05-15', { localTax: 12 })],
    });

    expect(result.warnings.map((w) => w.code)).toContain('local_tax_unattributed');
    expect(result.partB.nycTaxWithheld).toBe(0);
    expect(result.partB.yonkersTaxWithheld).toBe(0);
  });

  it('derives line 20 from withheld tax less NYS-1 payments', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee()],
      yearRecords: [record('2026-05-15', { stateTax: 500 })],
      nys1Payments: 300,
    });

    expect(result.partB.line13TotalTaxWithheld).toBe(500);
    expect(result.partB.line17TotalPayments).toBe(300);
    expect(result.partB.line20TotalWtDue).toBe(200);
    expect(result.partB.line21TotalWtOverpaid).toBe(0);
  });

  it('uses taxable wages for column g and falls back to gross when absent', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee()],
      yearRecords: [
        record('2026-05-15', { grossPay: 1000, taxableWages: 900 }),
        record('2026-05-22', { grossPay: 1000, taxableWages: null }),
      ],
    });

    expect(result.partC[0].uiRemuneration).toBe(2000);
    expect(result.partC[0].grossFederalWages).toBe(1900);
  });

  it("flags a gap between the derived contribution and what payroll booked", () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee()],
      // Payroll booked SUI at a different rate than the company rate on file.
      yearRecords: [record('2026-05-15', { grossPay: 10000, employerSUI: 50 })],
    });

    expect(result.partA.line4UiContributionsDue).toBe(162.5);
    expect(result.bookedSUI).toBe(50);
    expect(result.warnings.map((w) => w.code)).toContain('sui_mismatch');
  });

  it('does not flag a mismatch when the books agree with the derived contribution', () => {
    const result = buildNys45({
      ...BASE_INPUT,
      employees: [employee()],
      yearRecords: [record('2026-05-15', { grossPay: 10000, employerSUI: 162.5 })],
    });

    expect(result.warnings.map((w) => w.code)).not.toContain('sui_mismatch');
  });

  it('warns when Part C exceeds one printed page', () => {
    const employees = Array.from({ length: 6 }, (_, i) =>
      employee({ id: `emp${i}`, lastName: `Name${i}` })
    );
    const result = buildNys45({
      ...BASE_INPUT,
      employees,
      yearRecords: employees.map((e) => record('2026-05-15', { employeeId: e.id })),
    });

    expect(result.partC).toHaveLength(6);
    expect(result.warnings.map((w) => w.code)).toContain('part_c_overflow');
  });
});
