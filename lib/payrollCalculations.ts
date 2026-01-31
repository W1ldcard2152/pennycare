// Payroll Tax Calculation Utilities for New York State (Wayne County)
// Updated for 2026 tax rates

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

  // YTD totals for wage base limits
  ytdGrossPay: number;
  ytdSocialSecurity: number;
  ytdMedicare: number;

  // Company settings
  suiRate: number; // Employer SUI rate (2.1% - 9.9%)
}

export interface PayrollResult {
  // Earnings
  regularPay: number;
  overtimePay: number;
  grossPay: number;

  // Employee Deductions
  federalIncomeTax: number;
  stateIncomeTax: number;
  socialSecurityEmployee: number;
  medicareEmployee: number;
  additionalMedicare: number;
  nySDI: number; // NY State Disability Insurance
  nyPFL: number; // NY Paid Family Leave
  totalDeductions: number;

  // Net Pay
  netPay: number;

  // Employer Costs
  socialSecurityEmployer: number;
  medicareEmployer: number;
  suiEmployer: number; // NY State Unemployment Insurance
  totalEmployerCost: number;
}

// 2026 Tax Constants
const SOCIAL_SECURITY_RATE = 0.062; // 6.2%
const SOCIAL_SECURITY_WAGE_BASE = 184500; // 2026 limit
const MEDICARE_RATE = 0.0145; // 1.45%
const ADDITIONAL_MEDICARE_RATE = 0.009; // 0.9%
const ADDITIONAL_MEDICARE_THRESHOLD = 200000;

const NY_SDI_RATE = 0.005; // 0.5%
const NY_SDI_WEEKLY_MAX = 0.60; // $0.60 per week max
const NY_SDI_ANNUAL_MAX = 31.20; // $31.20 per year max

const NY_PFL_RATE = 0.00432; // 0.432% for 2026
const NY_PFL_ANNUAL_MAX = 411.91; // 2026 max

const NY_SUI_WAGE_BASE = 13000; // First $13,000 per employee in 2026

/**
 * Calculate payroll for an hourly employee
 */
export function calculatePayroll(input: PayrollInput): PayrollResult {
  // Calculate gross pay
  const regularPay = input.regularHours * input.hourlyRate;
  const overtimePay = input.overtimeHours * input.hourlyRate * input.overtimeMultiplier;
  const grossPay = regularPay + overtimePay;

  // Calculate Social Security (6.2% up to wage base)
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

  // Calculate Medicare (1.45% on all wages)
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

  // Calculate Federal Income Tax (simplified estimation)
  const federalIncomeTax = input.federalTaxesWithheld
    ? estimateFederalTax(grossPay, input.w4FilingStatus, input.w4Allowances)
    : 0;

  // Calculate NY State Income Tax (simplified estimation)
  const stateIncomeTax = input.stateTaxesWithheld
    ? estimateNYStateTax(grossPay, input.w4FilingStatus, input.w4Allowances)
    : 0;

  // Total deductions
  const totalDeductions =
    federalIncomeTax +
    stateIncomeTax +
    socialSecurityEmployee +
    medicareEmployee +
    additionalMedicare +
    nySDI +
    nyPFL;

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

  // Total employer cost
  const totalEmployerCost =
    grossPay +
    socialSecurityEmployer +
    medicareEmployer +
    suiEmployer;

  return {
    regularPay,
    overtimePay,
    grossPay,
    federalIncomeTax,
    stateIncomeTax,
    socialSecurityEmployee,
    medicareEmployee,
    additionalMedicare,
    nySDI,
    nyPFL,
    totalDeductions,
    netPay,
    socialSecurityEmployer,
    medicareEmployer,
    suiEmployer,
    totalEmployerCost,
  };
}

/**
 * Simplified federal tax estimation using percentage method
 * This is a rough approximation - real calculation requires full W-4 form data
 */
function estimateFederalTax(
  grossPay: number,
  filingStatus: string | null,
  allowances: number | null
): number {
  // Convert weekly pay to annual for bracket calculation
  const annualizedPay = grossPay * 52;

  // Standard deduction for 2026 (estimated)
  const standardDeduction = filingStatus === 'married' ? 30000 : 15000;

  // Allowance value (simplified)
  const allowanceValue = (allowances || 0) * 5000;

  const taxableIncome = Math.max(0, annualizedPay - standardDeduction - allowanceValue);

  // Simplified progressive tax brackets for 2026 (estimated)
  let annualTax = 0;
  if (filingStatus === 'married') {
    if (taxableIncome <= 23200) {
      annualTax = taxableIncome * 0.10;
    } else if (taxableIncome <= 94300) {
      annualTax = 2320 + (taxableIncome - 23200) * 0.12;
    } else if (taxableIncome <= 201050) {
      annualTax = 10852 + (taxableIncome - 94300) * 0.22;
    } else {
      annualTax = 34337 + (taxableIncome - 201050) * 0.24;
    }
  } else {
    if (taxableIncome <= 11600) {
      annualTax = taxableIncome * 0.10;
    } else if (taxableIncome <= 47150) {
      annualTax = 1160 + (taxableIncome - 11600) * 0.12;
    } else if (taxableIncome <= 100525) {
      annualTax = 5426 + (taxableIncome - 47150) * 0.22;
    } else {
      annualTax = 17168.50 + (taxableIncome - 100525) * 0.24;
    }
  }

  // Convert back to weekly
  return annualTax / 52;
}

/**
 * Simplified NY State tax estimation
 * This is a rough approximation
 */
function estimateNYStateTax(
  grossPay: number,
  filingStatus: string | null,
  allowances: number | null
): number {
  // Convert weekly pay to annual
  const annualizedPay = grossPay * 52;

  // NY standard deduction (estimated for 2026)
  const standardDeduction = filingStatus === 'married' ? 17050 : 8500;

  // Exemption allowance
  const exemption = filingStatus === 'married' ? 7950 : 7400;
  const allowanceValue = (allowances || 0) * 1000;

  const taxableIncome = Math.max(
    0,
    annualizedPay - standardDeduction - exemption - allowanceValue
  );

  // Simplified NY tax brackets for 2026
  let annualTax = 0;
  if (taxableIncome <= 17150) {
    annualTax = taxableIncome * 0.04;
  } else if (taxableIncome <= 23600) {
    annualTax = 686 + (taxableIncome - 17150) * 0.045;
  } else if (taxableIncome <= 27900) {
    annualTax = 976.25 + (taxableIncome - 23600) * 0.0525;
  } else if (taxableIncome <= 161550) {
    annualTax = 1202 + (taxableIncome - 27900) * 0.055;
  } else {
    annualTax = 8552.75 + (taxableIncome - 161550) * 0.06;
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
 * Round to 2 decimal places
 */
export function roundCurrency(amount: number): number {
  return Math.round(amount * 100) / 100;
}
