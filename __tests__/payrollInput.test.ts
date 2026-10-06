import { describe, it, expect } from 'vitest';
import {
  buildPayrollInput,
  deductionYtdUpdates,
  planDeductionReversal,
  type PayrollEmployee,
} from '@/lib/payroll-input';
import { calculatePayroll } from '@/lib/payrollCalculations';

const utc = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

function record(payDate: string, overrides: Partial<PayrollEmployee['payrollRecords'][number]> = {}) {
  return {
    status: 'active',
    payDate: utc(payDate),
    payPeriodEnd: utc(payDate),
    grossPay: 1000,
    netPay: 750,
    federalTax: 80,
    stateTax: 40,
    socialSecurity: 62,
    medicare: 14.5,
    nyPFL: 4.32,
    preTaxHealthIns: 0,
    preTaxDental: 0,
    preTaxVision: 0,
    preTaxHSA: 0,
    preTaxFSA: 0,
    ...overrides,
  };
}

function employee(overrides: Partial<PayrollEmployee> = {}): PayrollEmployee {
  return {
    payType: 'hourly',
    hourlyRate: 25,
    annualSalary: null,
    w4FormType: '2020_later',
    w4FilingStatus: 'single',
    w4Allowances: 0,
    additionalWithholding: null,
    w4Step2Checked: false,
    w4DependentsCredit: 0,
    w4OtherIncome: 0,
    w4Deductions: 0,
    stateFilingStatus: 'single',
    stateAllowances: 0,
    federalTaxability: null,
    stateTaxability: null,
    socialSecurityTaxability: null,
    medicareTaxability: null,
    unemploymentTaxability: null,
    disabilityTaxability: null,
    paidFamilyLeaveTaxability: null,
    nycResident: false,
    yonkersResident: false,
    ytdSeedAsOfDate: null,
    ytdGrossPaySeed: 0,
    ytdSocialSecuritySeed: 0,
    ytdMedicareSeed: 0,
    ytdFederalIncomeTaxSeed: 0,
    ytdStateIncomeTaxSeed: 0,
    ytdPaidFamilyLeaveSeed: 0,
    timeEntries: [{ hoursWorked: 40, overtimeHours: 0 }],
    payrollRecords: [],
    deductions: [],
    ...overrides,
  };
}

const company = { overtimeMultiplier: 1.5, suiRate: 2.1, futaRate: 0.6 };

describe('buildPayrollInput — hours', () => {
  it('skips an hourly employee with no hours', () => {
    const built = buildPayrollInput(employee({ timeEntries: [] }), company, utc('2026-05-08'));
    expect(built.skip).toBe(true);
  });

  it('pays a salaried employee annual / 52 as 40 hours', () => {
    const built = buildPayrollInput(
      employee({ payType: 'salary', annualSalary: 52000, timeEntries: [] }),
      company,
      utc('2026-05-08'),
    );
    expect(built.skip).toBe(false);
    expect(calculatePayroll(built.input).grossPay).toBe(1000);
  });
});

describe('buildPayrollInput — YTD window is the pay-date year', () => {
  it('starts fresh for a late-December week paid in January', () => {
    const built = buildPayrollInput(
      employee({ payrollRecords: [record('2025-12-26'), record('2025-12-19')] }),
      company,
      utc('2026-01-02'),
    );
    expect(built.input.taxYear).toBe(2026);
    expect(built.input.ytdGrossPay).toBe(0);
    expect(built.input.ytdPFL).toBe(0);
  });

  it('counts a check paid in January even if its period started in December', () => {
    const built = buildPayrollInput(
      employee({ payrollRecords: [{ ...record('2026-01-02'), payPeriodEnd: utc('2025-12-31') }] }),
      company,
      utc('2026-01-09'),
    );
    expect(built.input.ytdGrossPay).toBe(1000);
  });

  it('ignores voided records', () => {
    const built = buildPayrollInput(
      employee({ payrollRecords: [record('2026-05-01'), record('2026-04-24', { status: 'voided' })] }),
      company,
      utc('2026-05-08'),
    );
    expect(built.input.ytdGrossPay).toBe(1000);
  });

  it('builds YTD FICA wages net of Section 125 deductions', () => {
    const built = buildPayrollInput(
      employee({ payrollRecords: [record('2026-05-01', { preTaxHealthIns: 100, preTaxDental: 20 })] }),
      company,
      utc('2026-05-08'),
    );
    expect(built.input.ytdGrossPay).toBe(1000);
    expect(built.input.ytdFicaWages).toBe(880);
  });
});

describe('buildPayrollInput — YTD seeds', () => {
  it('applies a same-year seed and only adds records after its as-of date', () => {
    const built = buildPayrollInput(
      employee({
        ytdSeedAsOfDate: utc('2026-04-12'),
        ytdGrossPaySeed: 15000,
        ytdPaidFamilyLeaveSeed: 64.8,
        payrollRecords: [record('2026-05-01'), record('2026-04-10')],
      }),
      company,
      utc('2026-05-08'),
    );
    expect(built.input.ytdGrossPay).toBe(16000);
    expect(built.input.ytdPFL).toBeCloseTo(69.12, 2);
    expect(built.warnings).toEqual([]);
  });

  it('does not carry a prior-year seed into the new year', () => {
    const built = buildPayrollInput(
      employee({ ytdSeedAsOfDate: utc('2025-11-30'), ytdGrossPaySeed: 40000 }),
      company,
      utc('2026-01-09'),
    );
    expect(built.input.ytdGrossPay).toBe(0);
  });

  it('keeps applying an undated seed but warns', () => {
    const built = buildPayrollInput(
      employee({ ytdGrossPaySeed: 17307.75 }),
      company,
      utc('2026-05-08'),
    );
    expect(built.input.ytdGrossPay).toBe(17307.75);
    expect(built.warnings.some((w) => w.includes('as of'))).toBe(true);
  });
});

describe('deduction YTD by year and by id', () => {
  const k1 = { id: 'k1', deductionType: '401k', name: '401(k)', amountType: 'fixed', amount: 100, preTax: true, annualLimit: 24500, ytdAmount: 24500, ytdYear: 2025 };

  it('resets a deduction whose YTD belongs to an earlier year', () => {
    const built = buildPayrollInput(employee({ deductions: [k1] }), company, utc('2026-01-09'));
    expect(built.input.deductions![0].ytdAmount).toBe(0);
    const result = calculatePayroll(built.input);
    expect(result.preTaxDeductions[0].amount).toBe(100); // not blocked by last year's limit
    expect(deductionYtdUpdates([k1], result, 2026)).toEqual([{ id: 'k1', ytdAmount: 100, ytdYear: 2026 }]);
  });

  it('keeps accumulating within the same year', () => {
    const d = { ...k1, ytdAmount: 300, ytdYear: 2026 };
    const result = calculatePayroll(buildPayrollInput(employee({ deductions: [d] }), company, utc('2026-05-08')).input);
    expect(deductionYtdUpdates([d], result, 2026)).toEqual([{ id: 'k1', ytdAmount: 400, ytdYear: 2026 }]);
  });

  it('treats a legacy null ytdYear as the current year', () => {
    const d = { ...k1, ytdAmount: 300, ytdYear: null };
    const result = calculatePayroll(buildPayrollInput(employee({ deductions: [d] }), company, utc('2026-05-08')).input);
    expect(deductionYtdUpdates([d], result, 2026)).toEqual([{ id: 'k1', ytdAmount: 400, ytdYear: 2026 }]);
  });

  it('updates two same-type deductions independently', () => {
    const a = { ...k1, id: 'a', deductionType: 'other', preTax: false, annualLimit: null, amount: 25, ytdAmount: 0, ytdYear: 2026 };
    const b = { ...a, id: 'b', amount: 40 };
    const result = calculatePayroll(buildPayrollInput(employee({ deductions: [a, b] }), company, utc('2026-05-08')).input);
    expect(deductionYtdUpdates([a, b], result, 2026)).toEqual([
      { id: 'a', ytdAmount: 25, ytdYear: 2026 },
      { id: 'b', ytdAmount: 40, ytdYear: 2026 },
    ]);
  });
});

describe('planDeductionReversal', () => {
  const amounts = {
    payDate: utc('2026-05-08'),
    preTax401k: 150, preTaxHealthIns: 0, preTaxDental: 0, preTaxVision: 0, preTaxHSA: 0, preTaxFSA: 0,
    postTaxRoth401k: 0, garnishments: 0, childSupport: 0, loanRepayments: 0,
  };

  it('takes a type amount back across same-type deductions once, not from each', () => {
    const plan = planDeductionReversal(
      [
        { id: 'a', deductionType: '401k', ytdAmount: 100, ytdYear: 2026 },
        { id: 'b', deductionType: '401k', ytdAmount: 100, ytdYear: 2026 },
      ],
      amounts,
    );
    expect(Object.fromEntries(plan)).toEqual({ a: 100, b: 50 });
  });

  it('leaves deductions whose YTD is from a different year alone', () => {
    const plan = planDeductionReversal(
      [{ id: 'a', deductionType: '401k', ytdAmount: 500, ytdYear: 2027 }],
      amounts,
    );
    expect(plan.size).toBe(0);
  });
});

describe('buildPayrollInput — overtime is the week past 40', () => {
  it('re-splits old entries that put each day past 8 hours into overtime', () => {
    // 10, 10, 10, 6 = 36 hours, stored the old way (8 regular + 2 OT per long day)
    const built = buildPayrollInput(
      employee({
        timeEntries: [
          { hoursWorked: 8, overtimeHours: 2 },
          { hoursWorked: 8, overtimeHours: 2 },
          { hoursWorked: 8, overtimeHours: 2 },
          { hoursWorked: 6, overtimeHours: 0 },
        ],
      }),
      company,
      utc('2026-05-08'),
    );
    expect(built.regularHours).toBe(36);
    expect(built.overtimeHours).toBe(0);
  });

  it('pays the hours past 40 as overtime however the days were entered', () => {
    const built = buildPayrollInput(
      employee({ timeEntries: Array.from({ length: 5 }, () => ({ hoursWorked: 9, overtimeHours: 0 })) }),
      company,
      utc('2026-05-08'),
    );
    expect(built.regularHours).toBe(40);
    expect(built.overtimeHours).toBe(5);
  });
});
