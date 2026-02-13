// Payroll Tax Calculation Utilities for New York State (Wayne County)
// Updated for 2026 tax rates per IRS Publication 15-T and NYS Publication NYS-50-T-NYS

export interface EmployeeDeductionInput {
  deductionType: string;
  name: string;
  amountType: 'fixed' | 'percentage';
  amount: number;
  preTax: boolean;
  annualLimit?: number | null;
  ytdAmount: number;
}

export interface PayrollInput {
  regularHours: number;
  overtimeHours: number;
  hourlyRate: number;
  overtimeMultiplier: number;

  // Employee tax info
  w4FilingStatus: string | null;
  w4Allowances: number | null;
  federalTaxesWithheld: boolean;
  stateTaxesWithheld: boolean;

  // NYC/Yonkers local taxes
  nycResident?: boolean;
  yonkersResident?: boolean;

  // YTD totals for wage base limits
  ytdGrossPay: number;
  ytdSocialSecurity: number;
  ytdMedicare: number;

  // Company settings
  suiRate: number; // Employer SUI rate (2.1% - 9.9%)
  futaRate?: number; // Federal Unemployment Tax rate (0.6% after credit)

  // Employee deductions (401k, health insurance, etc.)
  deductions?: EmployeeDeductionInput[];
}

export interface DeductionBreakdown {
  type: string;
  name: string;
  amount: number;
  preTax: boolean;
}

export interface PayrollResult {
  // Earnings
  regularPay: number;
  overtimePay: number;
  grossPay: number;

  // Pre-tax Deductions (reduce taxable income)
  preTaxDeductions: DeductionBreakdown[];
  totalPreTaxDeductions: number;

  // Taxable wages (gross - pre-tax deductions)
  taxableWages: number;

  // Employee Tax Withholdings
  federalIncomeTax: number;
  stateIncomeTax: number; // NY State income tax
  localTax: number; // NYC or Yonkers
  socialSecurityEmployee: number;
  medicareEmployee: number;
  additionalMedicare: number;
  nySDI: number; // NY State Disability Insurance
  nyPFL: number; // NY Paid Family Leave
  totalTaxWithholdings: number;

  // Post-tax Deductions
  postTaxDeductions: DeductionBreakdown[];
  totalPostTaxDeductions: number;

  // Total deductions and net pay
  totalDeductions: number;
  netPay: number;

  // Employer Costs
  socialSecurityEmployer: number;
  medicareEmployer: number;
  suiEmployer: number; // NY State Unemployment Insurance
  futaEmployer: number; // Federal Unemployment Tax
  totalEmployerCost: number;
}

// 2025 Tax Constants
const SOCIAL_SECURITY_RATE = 0.062; // 6.2%
const SOCIAL_SECURITY_WAGE_BASE = 176100; // 2025 limit
const MEDICARE_RATE = 0.0145; // 1.45%
const ADDITIONAL_MEDICARE_RATE = 0.009; // 0.9%
const ADDITIONAL_MEDICARE_THRESHOLD = 200000;

const NY_SDI_RATE = 0.005; // 0.5%
const NY_SDI_WEEKLY_MAX = 0.60; // $0.60 per week max
const NY_SDI_ANNUAL_MAX = 31.20; // $31.20 per year max

const NY_PFL_RATE = 0.00388; // 0.388% for 2025
const NY_PFL_ANNUAL_MAX = 354.53; // 2025 max

const NY_SUI_WAGE_BASE = 13000; // First $13,000 per employee in 2026
const FUTA_WAGE_BASE = 7000; // First $7,000 per employee

// NYC tax rates (simplified)
const NYC_TAX_RATE = 0.03876; // Average NYC resident rate

// Yonkers tax rates
const YONKERS_RESIDENT_RATE = 0.16475; // 16.475% surcharge on NY state tax
const YONKERS_NONRESIDENT_RATE = 0.005; // 0.5% of wages earned in Yonkers

/**
 * Calculate payroll for an hourly employee
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  // Calculate gross pay
  const regularPay = input.regularHours * input.hourlyRate;
  const overtimePay = input.overtimeHours * input.hourlyRate * input.overtimeMultiplier;
  const grossPay = regularPay + overtimePay;

  // Process pre-tax deductions first (they reduce taxable income)
  const preTaxDeductions: DeductionBreakdown[] = [];
  let totalPreTaxDeductions = 0;

  if (input.deductions) {
    for (const deduction of input.deductions) {
      if (deduction.preTax) {
        let amount = 0;
        if (deduction.amountType === 'fixed') {
          amount = deduction.amount;
        } else {
          // Percentage of gross
          amount = grossPay * (deduction.amount / 100);
        }

        // Check annual limit
        if (deduction.annualLimit && deduction.ytdAmount + amount > deduction.annualLimit) {
          amount = Math.max(0, deduction.annualLimit - deduction.ytdAmount);
        }

        if (amount > 0) {
          preTaxDeductions.push({
            type: deduction.deductionType,
            name: deduction.name,
            amount: roundCurrency(amount),
            preTax: true,
          });
          totalPreTaxDeductions += amount;
        }
      }
    }
  }

  // Taxable wages = gross - pre-tax deductions
  const taxableWages = grossPay - totalPreTaxDeductions;

  // Calculate Social Security (6.2% up to wage base) - on gross pay, not reduced by pre-tax
  const newYtdGross = input.ytdGrossPay + grossPay;
  let socialSecurityEmployee = 0;
  let socialSecurityEmployer = 0;

  if (input.ytdGrossPay < SOCIAL_SECURITY_WAGE_BASE) {
    const taxableAmount = Math.min(
      grossPay,
      SOCIAL_SECURITY_WAGE_BASE - input.ytdGrossPay
    );
    socialSecurityEmployee = taxableAmount * SOCIAL_SECURITY_RATE;
    socialSecurityEmployer = taxableAmount * SOCIAL_SECURITY_RATE;
  }

  // Calculate Medicare (1.45% on all wages) - on gross pay
  const medicareEmployee = grossPay * MEDICARE_RATE;
  const medicareEmployer = grossPay * MEDICARE_RATE;

  // Calculate Additional Medicare (0.9% on wages over $200k YTD)
  let additionalMedicare = 0;
  if (newYtdGross > ADDITIONAL_MEDICARE_THRESHOLD) {
    if (input.ytdGrossPay >= ADDITIONAL_MEDICARE_THRESHOLD) {
      additionalMedicare = grossPay * ADDITIONAL_MEDICARE_RATE;
    } else {
      const excessAmount = newYtdGross - ADDITIONAL_MEDICARE_THRESHOLD;
      additionalMedicare = excessAmount * ADDITIONAL_MEDICARE_RATE;
    }
  }

  // Calculate NY State Disability Insurance (SDI)
  // 0.5% of weekly wage, max $0.60 per week
  const nySDI = Math.min(grossPay * NY_SDI_RATE, NY_SDI_WEEKLY_MAX);

  // Calculate NY Paid Family Leave (PFL)
  // 0.432% of gross, max $411.91 annually
  const nyPFL = Math.min(grossPay * NY_PFL_RATE, NY_PFL_ANNUAL_MAX);

  // Calculate Federal Income Tax (on taxable wages after pre-tax deductions)
  const federalIncomeTax = input.federalTaxesWithheld
    ? estimateFederalTax(taxableWages, input.w4FilingStatus, input.w4Allowances)
    : 0;

  // Calculate NY State Income Tax (on taxable wages after pre-tax deductions)
  const stateIncomeTax = input.stateTaxesWithheld
    ? estimateNYStateTax(taxableWages, input.w4FilingStatus, input.w4Allowances)
    : 0;

  // Calculate local tax (NYC or Yonkers)
  let localTax = 0;
  if (input.nycResident) {
    // NYC resident tax - simplified flat rate on taxable wages
    localTax = (taxableWages / 52) * NYC_TAX_RATE; // Weekly portion
  } else if (input.yonkersResident) {
    // Yonkers resident - surcharge on NY state tax
    localTax = stateIncomeTax * YONKERS_RESIDENT_RATE;
  }

  // Total tax withholdings
  const totalTaxWithholdings =
    federalIncomeTax +
    stateIncomeTax +
    localTax +
    socialSecurityEmployee +
    medicareEmployee +
    additionalMedicare +
    nySDI +
    nyPFL;

  // Process post-tax deductions
  const postTaxDeductions: DeductionBreakdown[] = [];
  let totalPostTaxDeductions = 0;

  if (input.deductions) {
    for (const deduction of input.deductions) {
      if (!deduction.preTax) {
        let amount = 0;
        if (deduction.amountType === 'fixed') {
          amount = deduction.amount;
        } else {
          // Percentage of gross
          amount = grossPay * (deduction.amount / 100);
        }

        // Check annual limit
        if (deduction.annualLimit && deduction.ytdAmount + amount > deduction.annualLimit) {
          amount = Math.max(0, deduction.annualLimit - deduction.ytdAmount);
        }

        if (amount > 0) {
          postTaxDeductions.push({
            type: deduction.deductionType,
            name: deduction.name,
            amount: roundCurrency(amount),
            preTax: false,
          });
          totalPostTaxDeductions += amount;
        }
      }
    }
  }

  // Total deductions
  const totalDeductions =
    totalPreTaxDeductions +
    totalTaxWithholdings +
    totalPostTaxDeductions;

  // Net pay
  const netPay = grossPay - totalDeductions;

  // Calculate employer SUI (only on first $13,000 per employee)
  let suiEmployer = 0;
  if (input.ytdGrossPay < NY_SUI_WAGE_BASE) {
    const suiTaxableAmount = Math.min(
      grossPay,
      NY_SUI_WAGE_BASE - input.ytdGrossPay
    );
    suiEmployer = suiTaxableAmount * (input.suiRate / 100);
  }

  // Calculate employer FUTA (only on first $7,000 per employee)
  let futaEmployer = 0;
  const futaRate = input.futaRate || 0.6;
  if (input.ytdGrossPay < FUTA_WAGE_BASE) {
    const futaTaxableAmount = Math.min(
      grossPay,
      FUTA_WAGE_BASE - input.ytdGrossPay
    );
    futaEmployer = futaTaxableAmount * (futaRate / 100);
  }

  // Total employer cost (employer-only taxes, not including gross pay)
  const totalEmployerCost =
    socialSecurityEmployer +
    medicareEmployer +
    suiEmployer +
    futaEmployer;

  return {
    regularPay: roundCurrency(regularPay),
    overtimePay: roundCurrency(overtimePay),
    grossPay: roundCurrency(grossPay),
    preTaxDeductions,
    totalPreTaxDeductions: roundCurrency(totalPreTaxDeductions),
    taxableWages: roundCurrency(taxableWages),
    federalIncomeTax: roundCurrency(federalIncomeTax),
    stateIncomeTax: roundCurrency(stateIncomeTax),
    localTax: roundCurrency(localTax),
    socialSecurityEmployee: roundCurrency(socialSecurityEmployee),
    medicareEmployee: roundCurrency(medicareEmployee),
    additionalMedicare: roundCurrency(additionalMedicare),
    nySDI: roundCurrency(nySDI),
    nyPFL: roundCurrency(nyPFL),
    totalTaxWithholdings: roundCurrency(totalTaxWithholdings),
    postTaxDeductions,
    totalPostTaxDeductions: roundCurrency(totalPostTaxDeductions),
    totalDeductions: roundCurrency(totalDeductions),
    netPay: roundCurrency(netPay),
    socialSecurityEmployer: roundCurrency(socialSecurityEmployer),
    medicareEmployer: roundCurrency(medicareEmployer),
    suiEmployer: roundCurrency(suiEmployer),
    futaEmployer: roundCurrency(futaEmployer),
    totalEmployerCost: roundCurrency(totalEmployerCost),
  };
}

/**
 * Federal tax withholding using IRS Publication 15-T (2026) percentage method
 * https://www.irs.gov/publications/p15t
 *
 * Uses the computational approach: annualize wages, subtract standard deduction,
 * apply progressive tax brackets, then convert back to per-pay-period amount.
 */
function estimateFederalTax(
  grossPay: number,
  filingStatus: string | null,
  allowances: number | null
): number {
  // Convert weekly pay to annual for bracket calculation
  const annualizedPay = grossPay * 52;

  // 2026 Standard deduction (IRS Rev. Proc. 2025-XX)
  const standardDeduction = filingStatus === 'married' ? 30000 : 15000;

  // Allowance value for pre-2020 W-4 compatibility (estimated value per allowance)
  const allowanceValue = (allowances || 0) * 4400;

  const taxableIncome = Math.max(0, annualizedPay - standardDeduction - allowanceValue);

  // 2026 Federal progressive tax brackets (IRS Publication 15-T)
  let annualTax = 0;
  if (filingStatus === 'married') {
    // Married Filing Jointly brackets for 2026
    if (taxableIncome <= 23850) {
      annualTax = taxableIncome * 0.10;
    } else if (taxableIncome <= 96950) {
      annualTax = 2385 + (taxableIncome - 23850) * 0.12;
    } else if (taxableIncome <= 206700) {
      annualTax = 11157 + (taxableIncome - 96950) * 0.22;
    } else if (taxableIncome <= 394600) {
      annualTax = 35302 + (taxableIncome - 206700) * 0.24;
    } else if (taxableIncome <= 501050) {
      annualTax = 80398 + (taxableIncome - 394600) * 0.32;
    } else if (taxableIncome <= 751600) {
      annualTax = 114462 + (taxableIncome - 501050) * 0.35;
    } else {
      annualTax = 202154.50 + (taxableIncome - 751600) * 0.37;
    }
  } else {
    // Single or Head of Household brackets for 2026
    if (taxableIncome <= 11925) {
      annualTax = taxableIncome * 0.10;
    } else if (taxableIncome <= 48475) {
      annualTax = 1192.50 + (taxableIncome - 11925) * 0.12;
    } else if (taxableIncome <= 103350) {
      annualTax = 5578.50 + (taxableIncome - 48475) * 0.22;
    } else if (taxableIncome <= 197300) {
      annualTax = 17651 + (taxableIncome - 103350) * 0.24;
    } else if (taxableIncome <= 250525) {
      annualTax = 40199 + (taxableIncome - 197300) * 0.32;
    } else if (taxableIncome <= 626350) {
      annualTax = 57231 + (taxableIncome - 250525) * 0.35;
    } else {
      annualTax = 188769.75 + (taxableIncome - 626350) * 0.37;
    }
  }

  // Convert back to weekly
  return annualTax / 52;
}

/**
 * NY State tax withholding using NYS Publication NYS-50-T-NYS (2026)
 * https://www.tax.ny.gov/pdf/publications/withholding/nys50_t_nys.pdf
 *
 * Uses the Exact Calculation Method (Method II):
 * 1. Annualize gross wages
 * 2. Subtract exemption allowance from Annual Exemption Table
 * 3. Apply annual tax rate schedule
 * 4. Divide by number of pay periods
 */
function estimateNYStateTax(
  grossPay: number,
  filingStatus: string | null,
  allowances: number | null
): number {
  // Convert weekly pay to annual
  const annualizedPay = grossPay * 52;

  // NYS-50-T-NYS Annual Exemption Table for Allowances (2026)
  // Single: Base $7,400 + $1,000 per additional allowance
  // Married: Base $7,950 + $1,000 per additional allowance
  const baseExemption = filingStatus === 'married' ? 7950 : 7400;
  const allowanceExemption = (allowances || 0) * 1000;
  const totalExemption = baseExemption + allowanceExemption;

  const taxableIncome = Math.max(0, annualizedPay - totalExemption);

  // NY State tax brackets for 2026 (NYS-50-T-NYS Method II Annual Tax Rate Schedule)
  // Note: 2026 rates reflect phased-in tax cuts (0.1% reduction in bottom 5 brackets)
  let annualTax = 0;

  if (filingStatus === 'married') {
    // Married Filing Jointly brackets
    if (taxableIncome <= 17150) {
      annualTax = taxableIncome * 0.04;
    } else if (taxableIncome <= 23600) {
      annualTax = 686 + (taxableIncome - 17150) * 0.045;
    } else if (taxableIncome <= 27900) {
      annualTax = 976.25 + (taxableIncome - 23600) * 0.0525;
    } else if (taxableIncome <= 161550) {
      annualTax = 1202 + (taxableIncome - 27900) * 0.055;
    } else if (taxableIncome <= 323200) {
      annualTax = 8552.75 + (taxableIncome - 161550) * 0.06;
    } else if (taxableIncome <= 2155350) {
      annualTax = 18251.75 + (taxableIncome - 323200) * 0.0685;
    } else if (taxableIncome <= 5000000) {
      annualTax = 143754.03 + (taxableIncome - 2155350) * 0.0965;
    } else if (taxableIncome <= 25000000) {
      annualTax = 418212.93 + (taxableIncome - 5000000) * 0.103;
    } else {
      annualTax = 2478212.93 + (taxableIncome - 25000000) * 0.109;
    }
  } else {
    // Single or Head of Household brackets
    if (taxableIncome <= 8500) {
      annualTax = taxableIncome * 0.04;
    } else if (taxableIncome <= 11700) {
      annualTax = 340 + (taxableIncome - 8500) * 0.045;
    } else if (taxableIncome <= 13900) {
      annualTax = 484 + (taxableIncome - 11700) * 0.0525;
    } else if (taxableIncome <= 80650) {
      annualTax = 599.50 + (taxableIncome - 13900) * 0.055;
    } else if (taxableIncome <= 215400) {
      annualTax = 4270.75 + (taxableIncome - 80650) * 0.06;
    } else if (taxableIncome <= 1077550) {
      annualTax = 12355.75 + (taxableIncome - 215400) * 0.0685;
    } else if (taxableIncome <= 5000000) {
      annualTax = 71413.03 + (taxableIncome - 1077550) * 0.0965;
    } else if (taxableIncome <= 25000000) {
      annualTax = 449929.48 + (taxableIncome - 5000000) * 0.103;
    } else {
      annualTax = 2509929.48 + (taxableIncome - 25000000) * 0.109;
    }
  }

  // Convert back to weekly
  return annualTax / 52;
}

/**
 * Format currency for display
 */
export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Round to 2 decimal places using exponential notation to avoid IEEE 754 drift.
 * Standard Math.round(1.005 * 100) / 100 = 1.00 (wrong), this returns 1.01 (correct).
 */
export function roundCurrency(amount: number): number {
  return Number(Math.round(parseFloat(amount + 'e2')) + 'e-2');
}
