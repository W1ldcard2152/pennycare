import { describe, it, expect } from 'vitest';
import { buildNys45, type Nys45EmployeeInput, type Nys45RecordInput } from '@/lib/nys45';
import { buildForm941, type Form941EmployeeInput, type Form941RecordInput } from '@/lib/form941';
import {
  FORM941_LINE_DEFS,
  changedKeys,
  computeFilingAdjustment,
  currentReturn,
  filingTotals,
  form941ComputedValues,
  materialAdjustments,
  nys45ComputedValues,
  nys45LineDefs,
  nys45PartCKey,
  resolveReturn,
  sanitizeOverrides,
  suggestedPayment,
} from '@/lib/tax-return-values';

// ---------------------------------------------------------------------------
// Fixtures — one employee, three biweekly-ish pay runs in Q2 2026.
// ---------------------------------------------------------------------------

const payDates = ['2026-04-10', '2026-05-08', '2026-06-12'];

function nysEmployee(overrides: Partial<Nys45EmployeeInput> = {}): Nys45EmployeeInput {
  return {
    id: 'emp1',
    firstName: 'Pat',
    lastName: 'Kelly',
    middleName: null,
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

function nysRecord(iso: string): Nys45RecordInput {
  const d = new Date(`${iso}T12:00:00.000Z`);
  return {
    employeeId: 'emp1',
    payDate: d,
    payPeriodStart: d,
    payPeriodEnd: d,
    grossPay: 1000,
    taxableWages: 1000,
    stateTax: 40,
    localTax: 0,
    employerSUI: 16.25,
  };
}

function nys45() {
  const result = buildNys45({
    year: 2026,
    quarter: 2,
    uiRate: 1.625,
    employees: [nysEmployee()],
    yearRecords: payDates.map(nysRecord),
    nys1Payments: 100,
  });
  const defs = nys45LineDefs(result.partC.map((r) => r.employeeId));
  return { result, defs, computed: nys45ComputedValues(result) };
}

function fedEmployee(): Form941EmployeeInput {
  return {
    id: 'emp1',
    socialSecurityTaxability: 'taxable',
    medicareTaxability: 'taxable',
    hireDate: new Date('2020-01-01T12:00:00.000Z'),
    terminationDate: null,
    ytdGrossPaySeed: 0,
    ytdSeedAsOfDate: null,
  };
}

function fedRecord(iso: string, overrides: Partial<Form941RecordInput> = {}): Form941RecordInput {
  const d = new Date(`${iso}T12:00:00.000Z`);
  return {
    employeeId: 'emp1',
    payDate: d,
    payPeriodStart: d,
    payPeriodEnd: d,
    grossPay: 1000.33,
    taxableWages: 1000.33,
    federalTax: 100,
    // Per-paycheck rounding: 1000.33 × 6.2% = 62.02046 → 62.02, so the form's
    // rate arithmetic on the quarter total differs by fractions of cents.
    socialSecurity: 62.02,
    employerSocialSecurity: 62.02,
    medicare: 14.5,
    employerMedicare: 14.5,
    additionalMedicare: 0,
    ...overrides,
  };
}

function form941() {
  const result = buildForm941({
    year: 2026,
    quarter: 2,
    employees: [fedEmployee()],
    yearRecords: payDates.map((d) => fedRecord(d)),
    totalDeposits: 500,
    depositSchedule: 'monthly',
  });
  return { result, computed: form941ComputedValues(result) };
}

// ---------------------------------------------------------------------------

describe('resolveReturn', () => {
  it('reproduces the computed NYS-45 exactly when nothing is overridden', () => {
    const { defs, computed } = nys45();
    expect(resolveReturn(defs, computed, {})).toEqual(computed);
  });

  it('reproduces the computed 941 exactly when nothing is overridden', () => {
    const { computed } = form941();
    expect(resolveReturn(FORM941_LINE_DEFS, computed, {})).toEqual(computed);
  });

  it('recomputes the NYS-45 UI chain when the rate is changed', () => {
    const { defs, computed } = nys45();
    const v = resolveReturn(defs, computed, { line4aRate: 2 });
    expect(v.line3).toBe(3000);
    expect(v.line4).toBe(60); // 3000 × 2%
    expect(v.line5).toBe(2.25); // 3000 × 0.075%
    expect(v.line6).toBe(62.25);
    expect(v.line10).toBe(62.25);
    expect(v.line22).toBe(v.line10 + v.line20);
  });

  it('keeps an overridden derived line pinned while its inputs change', () => {
    const { defs, computed } = nys45();
    // The filer typed NY's calculator result into line 4 directly.
    const v = resolveReturn(defs, computed, { line4: 50, line4aRate: 3 });
    expect(v.line4).toBe(50);
    expect(v.line6).toBe(52.25);
  });

  it('flows a Part C edit into Part A line 1 and Part B lines 24, 13 and 20', () => {
    const { defs, computed } = nys45();
    const v = resolveReturn(defs, computed, {
      [nys45PartCKey('emp1', 'f')]: 3100,
      [nys45PartCKey('emp1', 'h')]: 130,
    });
    expect(v.line1).toBe(3100);
    expect(v.line3).toBe(3100 - v.line2);
    expect(v.line24).toBe(130);
    expect(v.line13).toBe(130);
    // 130 withheld less 100 of NYS-1 payments.
    expect(v.line20).toBe(30);
  });

  it('splits the NYS-45 withholding balance into due vs overpaid', () => {
    const { defs, computed } = nys45();
    const v = resolveReturn(defs, computed, { line15: 150 });
    expect(v.line20).toBe(0);
    expect(v.line21).toBe(30);
  });

  it('recomputes 941 lines 5a → 15 from an edited wage figure', () => {
    const { computed } = form941();
    const v = resolveReturn(FORM941_LINE_DEFS, computed, { line5aWages: 3100 });
    expect(v.line5aTax).toBe(384.4);
    expect(v.line5e).toBe(Math.round((384.4 + computed.line5cTax + computed.line5dTax) * 100) / 100);
    expect(v.line12).toBe(Math.round((v.line6 + v.line7) * 100) / 100);
    expect(v.line14).toBe(Math.round((v.line12 - 500) * 100) / 100);
    expect(v.line15).toBe(0);
  });
});

describe('sanitizeOverrides', () => {
  it('accepts known lines', () => {
    expect(sanitizeOverrides(FORM941_LINE_DEFS, { line3: 12.5 })).toEqual({
      ok: true,
      overrides: { line3: 12.5 },
    });
  });

  it('rejects unknown lines, non-numbers and fractional headcounts', () => {
    expect(sanitizeOverrides(FORM941_LINE_DEFS, { line99: 1 }).ok).toBe(false);
    expect(sanitizeOverrides(FORM941_LINE_DEFS, { line3: '12' }).ok).toBe(false);
    expect(sanitizeOverrides(FORM941_LINE_DEFS, { line3: Number.NaN }).ok).toBe(false);
    expect(sanitizeOverrides(FORM941_LINE_DEFS, { line1: 2.5 }).ok).toBe(false);
    expect(sanitizeOverrides(FORM941_LINE_DEFS, [1]).ok).toBe(false);
  });

  it('treats a missing map as no overrides', () => {
    expect(sanitizeOverrides(FORM941_LINE_DEFS, undefined)).toEqual({ ok: true, overrides: {} });
  });
});

describe('currentReturn', () => {
  it('freezes a filed return at its saved values even if payroll changed', () => {
    const { defs, computed } = nys45();
    const filedValues = { ...computed, line6: 99 };
    const json = JSON.stringify({ version: 1, overrides: { line6: 99 }, values: filedValues, computed });
    const moved = { ...computed, line1: 9999 };
    const current = currentReturn(defs, moved, { status: 'filed', formDataJson: json });
    expect(current.frozen).toBe(true);
    expect(current.values).toEqual(filedValues);
    expect(changedKeys(moved, current.savedComputed!)).toEqual(['line1']);
  });

  it('re-applies draft overrides to fresh figures and drops lines that no longer exist', () => {
    const { defs, computed } = nys45();
    const json = JSON.stringify({
      version: 1,
      overrides: { line4: 50, [nys45PartCKey('gone', 'f')]: 10 },
      values: {},
      computed: {},
    });
    const current = currentReturn(defs, computed, { status: 'pending', formDataJson: json });
    expect(current.frozen).toBe(false);
    expect(current.overrides).toEqual({ line4: 50 });
    expect(current.values.line4).toBe(50);
  });

  it('ignores corrupt saved JSON', () => {
    const { defs, computed } = nys45();
    expect(currentReturn(defs, computed, { status: 'filed', formDataJson: '{nope' }).values).toEqual(
      computed
    );
  });
});

describe('computeFilingAdjustment — NYS-45', () => {
  it('trues 2160 up to filed line 8 − line 9 and 2120 to line 13', () => {
    const { defs, computed } = nys45();
    // NY's calculator came back $1.10 higher on UI than CV Books.
    const values = resolveReturn(defs, computed, { line6: computed.line6 + 1.1 });
    const accruals = { '2160': 48.75, '2120': 120 }; // what payroll booked
    const lines = computeFilingAdjustment('nys45', values, computed, accruals);
    const sui = lines.find((l) => l.code === '2160')!;
    expect(sui.filed).toBe(values.line8);
    expect(sui.amount).toBe(Math.round((values.line8 - 48.75) * 100) / 100);
    const wt = lines.find((l) => l.code === '2120')!;
    expect(wt.amount).toBe(0);
    expect(materialAdjustments(lines).map((l) => l.code)).toEqual(['2160']);
  });

  it('nets prior-period UI overpayments out of the 2160 target', () => {
    const { defs, computed } = nys45();
    const values = resolveReturn(defs, computed, { line9: 10 });
    const lines = computeFilingAdjustment('nys45', values, computed, { '2160': 0, '2120': 0 });
    expect(lines.find((l) => l.code === '2160')!.filed).toBe(
      Math.round((values.line8 - 10) * 100) / 100
    );
  });
});

describe('computeFilingAdjustment — 941', () => {
  /** Accruals exactly as the payroll JEs would have booked the fixture. */
  function bookedAccruals(result: ReturnType<typeof form941>['result']) {
    return {
      '2110': result.lines.line3FederalTaxWithheld,
      '2130': Math.round(result.booked.socialSecurity * 100) / 100,
      '2140': Math.round((result.booked.medicare + result.booked.additionalMedicare) * 100) / 100,
    };
  }

  it('posts nothing for an unedited return, despite fractions-of-cents rounding', () => {
    const { result, computed } = form941();
    expect(computed.line7).not.toBe(0);
    const values = resolveReturn(FORM941_LINE_DEFS, computed, {});
    const lines = computeFilingAdjustment('941', values, computed, bookedAccruals(result));
    expect(materialAdjustments(lines)).toEqual([]);
  });

  it('puts a Social Security edit on 2130', () => {
    const { result, computed } = form941();
    const values = resolveReturn(FORM941_LINE_DEFS, computed, {
      line5aTax: computed.line5aTax + 2,
    });
    const lines = materialAdjustments(
      computeFilingAdjustment('941', values, computed, bookedAccruals(result))
    );
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ code: '2130', amount: 2 });
  });

  it('puts other pool changes (line 7, credits) on 2140 and withholding on 2110', () => {
    const { result, computed } = form941();
    const values = resolveReturn(FORM941_LINE_DEFS, computed, {
      line7: computed.line7 + 0.5,
      line3: computed.line3 - 1,
    });
    const lines = materialAdjustments(
      computeFilingAdjustment('941', values, computed, bookedAccruals(result))
    );
    expect(lines.map((l) => [l.code, l.amount])).toEqual([
      ['2110', -1],
      ['2140', 0.5],
    ]);
  });
});

describe('suggestedPayment', () => {
  it('pays NYS-45 line 10 as UI and line 20 as withholding', () => {
    const { defs, computed } = nys45();
    const values = resolveReturn(defs, computed, {});
    const p = suggestedPayment('nys45', values, [], { federalIncomeTax: 0, socialSecurity: 0, medicare: 0 });
    expect(p.components.stateUnemploymentTax).toBe(values.line10);
    expect(p.components.stateIncomeTaxWithheld).toBe(values.line20);
    expect(p.total).toBe(values.line22);
  });

  it('splits the 941 balance by what each account still owes', () => {
    const { result, computed } = form941();
    const values = resolveReturn(FORM941_LINE_DEFS, computed, {});
    const accruals = {
      '2110': 300,
      '2130': Math.round(result.booked.socialSecurity * 100) / 100,
      '2140': Math.round(result.booked.medicare * 100) / 100,
    };
    const adjustments = computeFilingAdjustment('941', values, computed, accruals);
    const p = suggestedPayment('941', values, adjustments, {
      federalIncomeTax: 300,
      socialSecurity: 200,
      medicare: 0,
    });
    expect(p.components.federalIncomeTaxWithheld).toBe(0);
    expect(p.components.socialSecurityTax).toBe(Math.round((accruals['2130'] - 200) * 100) / 100);
    expect(p.components.medicareTax).toBe(accruals['2140']);
  });
});

describe('filingTotals', () => {
  it('reports a 941 overpayment as a negative balance due', () => {
    const { computed } = form941();
    const values = resolveReturn(FORM941_LINE_DEFS, computed, { line13: computed.line12 + 25 });
    expect(filingTotals('941', values).balanceDue).toBe(-25);
  });
});
