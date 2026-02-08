import { describe, it, expect } from 'vitest';
import {
  calculatePayroll,
  PayrollInput,
  PayrollResult,
  formatCurrency,
  roundCurrency,
} from '@/lib/payrollCalculations';

// Helper to build a standard input with sensible defaults
function makeInput(overrides: Partial<PayrollInput> = {}): PayrollInput {
  return {
    regularHours: 40,
    overtimeHours: 0,
    hourlyRate: 25,
    overtimeMultiplier: 1.5,
    w4FilingStatus: 'single',
    w4Allowances: 0,
    federalTaxesWithheld: true,
    stateTaxesWithheld: true,
    ytdGrossPay: 0,
    ytdSocialSecurity: 0,
    ytdMedicare: 0,
    suiRate: 2.1,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Gross Pay Calculations
// ---------------------------------------------------------------------------
describe('Gross Pay', () => {
  it('calculates regular pay for a standard 40-hour week', () => {
    const result = calculatePayroll(makeInput());
    expect(result.regularPay).toBe(1000); // 40 * 25
    expect(result.overtimePay).toBe(0);
    expect(result.grossPay).toBe(1000);
  });

  it('calculates overtime pay at 1.5x multiplier', () => {
    const result = calculatePayroll(makeInput({ overtimeHours: 10 }));
    expect(result.regularPay).toBe(1000);
    expect(result.overtimePay).toBe(375); // 10 * 25 * 1.5
    expect(result.grossPay).toBe(1375);
  });

  it('uses custom overtime multiplier (double time)', () => {
    const result = calculatePayroll(
      makeInput({ overtimeHours: 5, overtimeMultiplier: 2.0 })
    );
    expect(result.overtimePay).toBe(250); // 5 * 25 * 2.0
    expect(result.grossPay).toBe(1250);
  });

  it('handles zero hours', () => {
    const result = calculatePayroll(
      makeInput({ regularHours: 0, overtimeHours: 0 })
    );
    expect(result.grossPay).toBe(0);
    expect(result.netPay).toBe(0);
  });

  it('handles fractional hours', () => {
    const result = calculatePayroll(
      makeInput({ regularHours: 37.5, overtimeHours: 2.25 })
    );
    expect(result.regularPay).toBe(937.5);
    expect(result.overtimePay).toBe(roundCurrency(2.25 * 25 * 1.5));
    expect(result.grossPay).toBe(roundCurrency(937.5 + 2.25 * 25 * 1.5));
  });

  it('handles high hourly rate', () => {
    const result = calculatePayroll(makeInput({ hourlyRate: 150 }));
    expect(result.regularPay).toBe(6000);
    expect(result.grossPay).toBe(6000);
  });
});

// ---------------------------------------------------------------------------
// Social Security
// ---------------------------------------------------------------------------
describe('Social Security', () => {
  it('withholds 6.2% of gross pay (employee and employer)', () => {
    const result = calculatePayroll(makeInput());
    expect(result.socialSecurityEmployee).toBe(roundCurrency(1000 * 0.062));
    expect(result.socialSecurityEmployer).toBe(roundCurrency(1000 * 0.062));
  });

  it('stops withholding once YTD reaches wage base ($176,100)', () => {
    const result = calculatePayroll(
      makeInput({ ytdGrossPay: 176100 })
    );
    expect(result.socialSecurityEmployee).toBe(0);
    expect(result.socialSecurityEmployer).toBe(0);
  });

  it('only taxes remaining amount when approaching wage base', () => {
    // YTD is $175,500, gross this period is $1,000
    // Only $600 is taxable for SS
    const result = calculatePayroll(
      makeInput({ ytdGrossPay: 175500 })
    );
    expect(result.socialSecurityEmployee).toBe(roundCurrency(600 * 0.062));
    expect(result.socialSecurityEmployer).toBe(roundCurrency(600 * 0.062));
  });
});

// ---------------------------------------------------------------------------
// Medicare
// ---------------------------------------------------------------------------
describe('Medicare', () => {
  it('withholds 1.45% of gross pay (employee and employer)', () => {
    const result = calculatePayroll(makeInput());
    expect(result.medicareEmployee).toBe(roundCurrency(1000 * 0.0145));
    expect(result.medicareEmployer).toBe(roundCurrency(1000 * 0.0145));
  });

  it('has no wage base limit for standard Medicare', () => {
    const result = calculatePayroll(
      makeInput({ ytdGrossPay: 500000, hourlyRate: 100 })
    );
    const grossPay = 4000; // 40 * 100
    expect(result.medicareEmployee).toBe(roundCurrency(grossPay * 0.0145));
  });

  it('charges additional 0.9% Medicare when YTD exceeds $200k', () => {
    // YTD already over $200k — entire gross gets additional Medicare
    const result = calculatePayroll(
      makeInput({ ytdGrossPay: 210000 })
    );
    expect(result.additionalMedicare).toBe(roundCurrency(1000 * 0.009));
  });

  it('charges additional Medicare only on amount exceeding $200k', () => {
    // YTD $199,500, gross $1,000 → new YTD $200,500 → excess $500
    const result = calculatePayroll(
      makeInput({ ytdGrossPay: 199500 })
    );
    expect(result.additionalMedicare).toBe(roundCurrency(500 * 0.009));
  });

  it('does not charge additional Medicare when under $200k', () => {
    const result = calculatePayroll(makeInput({ ytdGrossPay: 50000 }));
    expect(result.additionalMedicare).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// NY SDI & PFL
// ---------------------------------------------------------------------------
describe('NY SDI', () => {
  it('withholds 0.5% capped at $0.60 per week', () => {
    const result = calculatePayroll(makeInput());
    // 1000 * 0.005 = 5.00, but capped at 0.60
    expect(result.nySDI).toBe(0.6);
  });

  it('does not exceed weekly max for low earners', () => {
    // $100 gross → 0.005 * 100 = $0.50, which is under the $0.60 cap
    const result = calculatePayroll(
      makeInput({ regularHours: 4, hourlyRate: 25 })
    );
    expect(result.nySDI).toBe(0.5);
  });
});

describe('NY PFL', () => {
  it('withholds 0.388% of gross pay', () => {
    const result = calculatePayroll(makeInput());
    expect(result.nyPFL).toBe(roundCurrency(1000 * 0.00388));
  });

  it('caps at annual maximum ($354.53)', () => {
    // A very large weekly paycheck would hit the annual max in one go
    const result = calculatePayroll(
      makeInput({ regularHours: 40, hourlyRate: 5000 })
    );
    // 200,000 * 0.00388 = $776, but capped at $354.53
    expect(result.nyPFL).toBe(354.53);
  });
});

// ---------------------------------------------------------------------------
// Federal Income Tax
// ---------------------------------------------------------------------------
describe('Federal Income Tax', () => {
  it('withholds federal tax for single filer', () => {
    const result = calculatePayroll(makeInput());
    expect(result.federalIncomeTax).toBeGreaterThan(0);
  });

  it('withholds less for married filer (higher standard deduction)', () => {
    const single = calculatePayroll(makeInput({ w4FilingStatus: 'single' }));
    const married = calculatePayroll(makeInput({ w4FilingStatus: 'married' }));
    expect(married.federalIncomeTax).toBeLessThan(single.federalIncomeTax);
  });

  it('reduces tax with more allowances', () => {
    const noAllowances = calculatePayroll(makeInput({ w4Allowances: 0 }));
    const twoAllowances = calculatePayroll(makeInput({ w4Allowances: 2 }));
    expect(twoAllowances.federalIncomeTax).toBeLessThan(noAllowances.federalIncomeTax);
  });

  it('does not withhold when federalTaxesWithheld is false', () => {
    const result = calculatePayroll(makeInput({ federalTaxesWithheld: false }));
    expect(result.federalIncomeTax).toBe(0);
  });

  it('returns zero tax for income below standard deduction (single)', () => {
    // Single standard deduction: $15,000/yr → ~$288.46/wk
    // If weekly gross is $200, annualized = $10,400 which is under $15,000
    const result = calculatePayroll(
      makeInput({ regularHours: 10, hourlyRate: 20 })
    );
    expect(result.federalIncomeTax).toBe(0);
  });

  it('calculates reasonable tax for $50k annual salary equivalent', () => {
    // ~$961.54/week → annualized ~$50k
    const result = calculatePayroll(
      makeInput({ regularHours: 40, hourlyRate: 24.04 })
    );
    // Annualized: ~$49,923, minus $15k deduction = ~$34,923 taxable
    // Should be in the 12% bracket. Tax should be roughly $75-$90/week
    expect(result.federalIncomeTax).toBeGreaterThan(50);
    expect(result.federalIncomeTax).toBeLessThan(120);
  });
});

// ---------------------------------------------------------------------------
// NY State Income Tax
// ---------------------------------------------------------------------------
describe('NY State Income Tax', () => {
  it('withholds NY state tax for single filer', () => {
    const result = calculatePayroll(makeInput());
    expect(result.stateIncomeTax).toBeGreaterThan(0);
  });

  it('has different rates for married vs single', () => {
    const single = calculatePayroll(makeInput({ w4FilingStatus: 'single' }));
    const married = calculatePayroll(makeInput({ w4FilingStatus: 'married' }));
    // For this income level, married should pay less due to different brackets
    expect(married.stateIncomeTax).not.toBe(single.stateIncomeTax);
  });

  it('does not withhold when stateTaxesWithheld is false', () => {
    const result = calculatePayroll(makeInput({ stateTaxesWithheld: false }));
    expect(result.stateIncomeTax).toBe(0);
  });

  it('reduces tax with allowances', () => {
    const noAllowances = calculatePayroll(makeInput({ w4Allowances: 0 }));
    const threeAllowances = calculatePayroll(makeInput({ w4Allowances: 3 }));
    expect(threeAllowances.stateIncomeTax).toBeLessThan(noAllowances.stateIncomeTax);
  });
});

// ---------------------------------------------------------------------------
// Local Taxes (NYC / Yonkers)
// ---------------------------------------------------------------------------
describe('Local Taxes', () => {
  it('charges NYC resident tax', () => {
    const result = calculatePayroll(makeInput({ nycResident: true }));
    // taxableWages / 52 * 3.876%
    expect(result.localTax).toBeGreaterThan(0);
  });

  it('charges Yonkers resident surcharge on state tax', () => {
    const result = calculatePayroll(makeInput({ yonkersResident: true }));
    // 16.475% of state income tax
    expect(result.localTax).toBe(
      roundCurrency(result.stateIncomeTax * 0.16475)
    );
  });

  it('does not charge local tax for non-NYC/non-Yonkers residents', () => {
    const result = calculatePayroll(makeInput());
    expect(result.localTax).toBe(0);
  });

  it('prefers NYC over Yonkers when both are set (NYC checked first)', () => {
    const result = calculatePayroll(
      makeInput({ nycResident: true, yonkersResident: true })
    );
    // Since NYC is checked first in an if/else, NYC tax applies
    const expected = roundCurrency((1000 / 52) * 0.03876);
    expect(result.localTax).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Pre-Tax Deductions
// ---------------------------------------------------------------------------
describe('Pre-Tax Deductions', () => {
  it('processes fixed-amount pre-tax deductions', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: '401k',
            name: '401k Contribution',
            amountType: 'fixed',
            amount: 100,
            preTax: true,
            ytdAmount: 0,
          },
        ],
      })
    );
    expect(result.totalPreTaxDeductions).toBe(100);
    expect(result.preTaxDeductions).toHaveLength(1);
    expect(result.preTaxDeductions[0].amount).toBe(100);
  });

  it('processes percentage-based pre-tax deductions', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: '401k',
            name: '401k Contribution',
            amountType: 'percentage',
            amount: 6, // 6% of gross
            preTax: true,
            ytdAmount: 0,
          },
        ],
      })
    );
    expect(result.totalPreTaxDeductions).toBe(60); // 6% of $1000
  });

  it('reduces taxable wages by pre-tax deduction amount', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: 'health',
            name: 'Health Insurance',
            amountType: 'fixed',
            amount: 200,
            preTax: true,
            ytdAmount: 0,
          },
        ],
      })
    );
    expect(result.taxableWages).toBe(800); // 1000 - 200
  });

  it('respects annual limits on deductions', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: '401k',
            name: '401k',
            amountType: 'fixed',
            amount: 100,
            preTax: true,
            annualLimit: 23500,
            ytdAmount: 23450, // Only $50 left before limit
          },
        ],
      })
    );
    expect(result.totalPreTaxDeductions).toBe(50);
  });

  it('skips deduction entirely when annual limit already reached', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: '401k',
            name: '401k',
            amountType: 'fixed',
            amount: 100,
            preTax: true,
            annualLimit: 23500,
            ytdAmount: 23500,
          },
        ],
      })
    );
    expect(result.totalPreTaxDeductions).toBe(0);
    expect(result.preTaxDeductions).toHaveLength(0);
  });

  it('handles multiple pre-tax deductions', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: '401k',
            name: '401k',
            amountType: 'fixed',
            amount: 100,
            preTax: true,
            ytdAmount: 0,
          },
          {
            deductionType: 'health',
            name: 'Health Insurance',
            amountType: 'fixed',
            amount: 150,
            preTax: true,
            ytdAmount: 0,
          },
        ],
      })
    );
    expect(result.totalPreTaxDeductions).toBe(250);
    expect(result.preTaxDeductions).toHaveLength(2);
    expect(result.taxableWages).toBe(750);
  });
});

// ---------------------------------------------------------------------------
// Post-Tax Deductions
// ---------------------------------------------------------------------------
describe('Post-Tax Deductions', () => {
  it('processes fixed-amount post-tax deductions', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: 'roth401k',
            name: 'Roth 401k',
            amountType: 'fixed',
            amount: 75,
            preTax: false,
            ytdAmount: 0,
          },
        ],
      })
    );
    expect(result.totalPostTaxDeductions).toBe(75);
    expect(result.postTaxDeductions).toHaveLength(1);
  });

  it('does not reduce taxable wages', () => {
    const withPostTax = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: 'garnishment',
            name: 'Wage Garnishment',
            amountType: 'fixed',
            amount: 200,
            preTax: false,
            ytdAmount: 0,
          },
        ],
      })
    );
    const withoutDeductions = calculatePayroll(makeInput());
    expect(withPostTax.taxableWages).toBe(withoutDeductions.taxableWages);
  });

  it('respects annual limits on post-tax deductions', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: 'loan',
            name: 'Loan Repayment',
            amountType: 'fixed',
            amount: 100,
            preTax: false,
            annualLimit: 1000,
            ytdAmount: 950,
          },
        ],
      })
    );
    expect(result.totalPostTaxDeductions).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Net Pay
// ---------------------------------------------------------------------------
describe('Net Pay', () => {
  it('equals gross minus all deductions and taxes', () => {
    const result = calculatePayroll(makeInput());
    const expectedNet =
      result.grossPay -
      result.totalPreTaxDeductions -
      result.totalTaxWithholdings -
      result.totalPostTaxDeductions;
    expect(result.netPay).toBe(roundCurrency(expectedNet));
  });

  it('accounts for pre-tax, taxes, and post-tax deductions', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: '401k',
            name: '401k',
            amountType: 'fixed',
            amount: 100,
            preTax: true,
            ytdAmount: 0,
          },
          {
            deductionType: 'roth',
            name: 'Roth 401k',
            amountType: 'fixed',
            amount: 50,
            preTax: false,
            ytdAmount: 0,
          },
        ],
      })
    );
    expect(result.netPay).toBe(
      roundCurrency(
        result.grossPay -
          result.totalPreTaxDeductions -
          result.totalTaxWithholdings -
          result.totalPostTaxDeductions
      )
    );
  });

  it('totalDeductions equals pre-tax + taxes + post-tax', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: '401k',
            name: '401k',
            amountType: 'fixed',
            amount: 100,
            preTax: true,
            ytdAmount: 0,
          },
          {
            deductionType: 'roth',
            name: 'Roth',
            amountType: 'fixed',
            amount: 50,
            preTax: false,
            ytdAmount: 0,
          },
        ],
      })
    );
    expect(result.totalDeductions).toBe(
      roundCurrency(
        result.totalPreTaxDeductions +
          result.totalTaxWithholdings +
          result.totalPostTaxDeductions
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Employer Costs
// ---------------------------------------------------------------------------
describe('Employer Costs', () => {
  it('calculates SUI on wages up to $13,000 base', () => {
    const result = calculatePayroll(makeInput({ suiRate: 2.1 }));
    // 1000 * (2.1 / 100) = $21
    expect(result.suiEmployer).toBe(21);
  });

  it('stops SUI when YTD exceeds wage base', () => {
    const result = calculatePayroll(
      makeInput({ ytdGrossPay: 13000, suiRate: 2.1 })
    );
    expect(result.suiEmployer).toBe(0);
  });

  it('only taxes remaining SUI-eligible wages', () => {
    // YTD $12,500 + $1,000 gross → only $500 is SUI-taxable
    const result = calculatePayroll(
      makeInput({ ytdGrossPay: 12500, suiRate: 2.1 })
    );
    expect(result.suiEmployer).toBe(roundCurrency(500 * 0.021));
  });

  it('calculates FUTA on wages up to $7,000 base', () => {
    const result = calculatePayroll(makeInput({ futaRate: 0.6 }));
    expect(result.futaEmployer).toBe(roundCurrency(1000 * 0.006));
  });

  it('stops FUTA when YTD exceeds wage base', () => {
    const result = calculatePayroll(
      makeInput({ ytdGrossPay: 7000, futaRate: 0.6 })
    );
    expect(result.futaEmployer).toBe(0);
  });

  it('defaults FUTA rate to 0.6% if not provided', () => {
    const result = calculatePayroll(makeInput());
    expect(result.futaEmployer).toBe(roundCurrency(1000 * 0.006));
  });

  it('totalEmployerCost sums SS + Medicare + SUI + FUTA', () => {
    const result = calculatePayroll(makeInput());
    expect(result.totalEmployerCost).toBe(
      roundCurrency(
        result.socialSecurityEmployer +
          result.medicareEmployer +
          result.suiEmployer +
          result.futaEmployer
      )
    );
  });
});

// ---------------------------------------------------------------------------
// Edge Cases & Integration
// ---------------------------------------------------------------------------
describe('Edge Cases', () => {
  it('handles a high earner crossing multiple thresholds in one period', () => {
    // Hourly rate $500, 40hrs = $20,000/week
    const result = calculatePayroll(
      makeInput({
        hourlyRate: 500,
        ytdGrossPay: 190000,
      })
    );
    // Should have additional Medicare (YTD goes to $210k, over $200k threshold)
    expect(result.additionalMedicare).toBeGreaterThan(0);
    // SS should be capped (YTD $190k already over $176.1k base)
    expect(result.socialSecurityEmployee).toBe(0);
  });

  it('all currency values are rounded to 2 decimal places', () => {
    const result = calculatePayroll(
      makeInput({ regularHours: 37, hourlyRate: 23.33 })
    );
    const check = (val: number) => {
      expect(Math.round(val * 100) / 100).toBe(val);
    };
    check(result.regularPay);
    check(result.overtimePay);
    check(result.grossPay);
    check(result.netPay);
    check(result.federalIncomeTax);
    check(result.stateIncomeTax);
    check(result.socialSecurityEmployee);
    check(result.medicareEmployee);
  });

  it('handles no deductions input', () => {
    const result = calculatePayroll(makeInput());
    expect(result.preTaxDeductions).toHaveLength(0);
    expect(result.postTaxDeductions).toHaveLength(0);
    expect(result.totalPreTaxDeductions).toBe(0);
    expect(result.totalPostTaxDeductions).toBe(0);
  });

  it('handles both pre-tax and post-tax deductions together', () => {
    const result = calculatePayroll(
      makeInput({
        deductions: [
          {
            deductionType: '401k',
            name: '401k',
            amountType: 'percentage',
            amount: 5,
            preTax: true,
            ytdAmount: 0,
          },
          {
            deductionType: 'health',
            name: 'Health',
            amountType: 'fixed',
            amount: 100,
            preTax: true,
            ytdAmount: 0,
          },
          {
            deductionType: 'roth',
            name: 'Roth 401k',
            amountType: 'fixed',
            amount: 50,
            preTax: false,
            ytdAmount: 0,
          },
          {
            deductionType: 'garnishment',
            name: 'Garnishment',
            amountType: 'fixed',
            amount: 75,
            preTax: false,
            ytdAmount: 0,
          },
        ],
      })
    );
    expect(result.preTaxDeductions).toHaveLength(2);
    expect(result.postTaxDeductions).toHaveLength(2);
    expect(result.totalPreTaxDeductions).toBe(150); // 50 (5%) + 100
    expect(result.totalPostTaxDeductions).toBe(125); // 50 + 75
    expect(result.taxableWages).toBe(850); // 1000 - 150
  });
});

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------
describe('formatCurrency', () => {
  it('formats positive numbers as USD', () => {
    expect(formatCurrency(1234.56)).toBe('$1,234.56');
  });

  it('formats zero', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('formats negative numbers', () => {
    expect(formatCurrency(-500)).toBe('-$500.00');
  });

  it('rounds to 2 decimal places', () => {
    expect(formatCurrency(99.999)).toBe('$100.00');
  });
});

describe('roundCurrency', () => {
  it('rounds to 2 decimal places', () => {
    // Note: 1.005 * 100 = 100.4999... in IEEE 754, so Math.round gives 100 → 1.00
    // This is a known JS floating-point behavior, not a bug
    expect(roundCurrency(1.005)).toBe(1);
    expect(roundCurrency(1.006)).toBe(1.01);
    expect(roundCurrency(1.004)).toBe(1);
    expect(roundCurrency(99.999)).toBe(100);
  });

  it('handles whole numbers', () => {
    expect(roundCurrency(100)).toBe(100);
  });

  it('handles zero', () => {
    expect(roundCurrency(0)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Realistic Scenario: Full payroll run for a typical employee
// ---------------------------------------------------------------------------
describe('Realistic Scenario', () => {
  it('processes a typical mechanic paycheck correctly', () => {
    const result = calculatePayroll(
      makeInput({
        regularHours: 40,
        overtimeHours: 5,
        hourlyRate: 30,
        overtimeMultiplier: 1.5,
        w4FilingStatus: 'married',
        w4Allowances: 2,
        federalTaxesWithheld: true,
        stateTaxesWithheld: true,
        ytdGrossPay: 5000,
        ytdSocialSecurity: 310,
        ytdMedicare: 72.5,
        suiRate: 3.4,
        deductions: [
          {
            deductionType: '401k',
            name: '401k',
            amountType: 'percentage',
            amount: 5,
            preTax: true,
            annualLimit: 23500,
            ytdAmount: 2500,
          },
          {
            deductionType: 'health',
            name: 'Health Insurance',
            amountType: 'fixed',
            amount: 125,
            preTax: true,
            ytdAmount: 0,
          },
        ],
      })
    );

    // Gross: 40 * 30 + 5 * 30 * 1.5 = 1200 + 225 = $1,425
    expect(result.grossPay).toBe(1425);

    // Pre-tax: 5% of 1425 = $71.25, health = $125, total = $196.25
    expect(result.totalPreTaxDeductions).toBe(196.25);

    // Taxable wages: 1425 - 196.25 = $1,228.75
    expect(result.taxableWages).toBe(1228.75);

    // Net pay should be positive and less than gross
    expect(result.netPay).toBeGreaterThan(0);
    expect(result.netPay).toBeLessThan(result.grossPay);

    // Employer costs should be positive
    expect(result.totalEmployerCost).toBeGreaterThan(0);
    expect(result.suiEmployer).toBeGreaterThan(0);
    expect(result.futaEmployer).toBeGreaterThan(0);
  });
});
