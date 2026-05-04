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
  w4FormType?: string | null; // "2019_prior" or "2020_later"
  w4FilingStatus: string | null;
  w4Allowances: number | null;
  additionalWithholding?: number | null; // W-4 line 4(c) per pay period

  // Taxability — "taxable" (default) means the tax applies; "exempt" skips it.
  // Null/undefined is treated as "taxable" so legacy records keep withholding.
  federalTaxability?: string | null;
  stateTaxability?: string | null;
  socialSecurityTaxability?: string | null;
  medicareTaxability?: string | null;
  unemploymentTaxability?: string | null;
  disabilityTaxability?: string | null;
  paidFamilyLeaveTaxability?: string | null;

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

const NY_PFL_RATE = 0.00432; // 0.432% for 2026 (NY DFS rate decision)
const NY_PFL_ANNUAL_MAX = 411.91; // 2026 max

const NY_SUI_WAGE_BASE = 13000; // First $13,000 per employee in 2026
const FUTA_WAGE_BASE = 7000; // First $7,000 per employee

// NYC tax rates (simplified)
const NYC_TAX_RATE = 0.03876; // Average NYC resident rate

// Yonkers tax rates
const YONKERS_RESIDENT_RATE = 0.16475; // 16.475% surcharge on NY state tax
const YONKERS_NONRESIDENT_RATE = 0.005; // 0.5% of wages earned in Yonkers

/**
 * "exempt" skips the tax; anything else (including null) applies it.
 */
function isTaxable(taxability?: string | null): boolean {
  return taxability !== 'exempt';
}

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

  if (isTaxable(input.socialSecurityTaxability) && input.ytdGrossPay < SOCIAL_SECURITY_WAGE_BASE) {
    const taxableAmount = Math.min(
      grossPay,
      SOCIAL_SECURITY_WAGE_BASE - input.ytdGrossPay
    );
    socialSecurityEmployee = taxableAmount * SOCIAL_SECURITY_RATE;
    socialSecurityEmployer = taxableAmount * SOCIAL_SECURITY_RATE;
  }

  // Calculate Medicare (1.45% on all wages) - on gross pay
  const medicareTaxable = isTaxable(input.medicareTaxability);
  const medicareEmployee = medicareTaxable ? grossPay * MEDICARE_RATE : 0;
  const medicareEmployer = medicareTaxable ? grossPay * MEDICARE_RATE : 0;

  // Calculate Additional Medicare (0.9% on wages over $200k YTD)
  let additionalMedicare = 0;
  if (medicareTaxable && newYtdGross > ADDITIONAL_MEDICARE_THRESHOLD) {
    if (input.ytdGrossPay >= ADDITIONAL_MEDICARE_THRESHOLD) {
      additionalMedicare = grossPay * ADDITIONAL_MEDICARE_RATE;
    } else {
      const excessAmount = newYtdGross - ADDITIONAL_MEDICARE_THRESHOLD;
      additionalMedicare = excessAmount * ADDITIONAL_MEDICARE_RATE;
    }
  }

  // Calculate NY State Disability Insurance (SDI)
  // 0.5% of weekly wage, max $0.60 per week
  const nySDI = isTaxable(input.disabilityTaxability)
    ? Math.min(grossPay * NY_SDI_RATE, NY_SDI_WEEKLY_MAX)
    : 0;

  // Calculate NY Paid Family Leave (PFL) — 2026: 0.432% of gross, max $411.91 annually
  const nyPFL = isTaxable(input.paidFamilyLeaveTaxability)
    ? Math.min(grossPay * NY_PFL_RATE, NY_PFL_ANNUAL_MAX)
    : 0;

  // Calculate Federal Income Tax (on taxable wages after pre-tax deductions)
  const federalIncomeTax = isTaxable(input.federalTaxability)
    ? estimateFederalTax(
        taxableWages,
        input.w4FilingStatus,
        input.w4Allowances,
        input.w4FormType,
        input.additionalWithholding,
      )
    : 0;

  // Calculate NY State Income Tax (on taxable wages after pre-tax deductions)
  const stateIncomeTax = isTaxable(input.stateTaxability)
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
  // Unemployment taxability gates both SUI (state) and FUTA (federal)
  const unemploymentTaxable = isTaxable(input.unemploymentTaxability);
  let suiEmployer = 0;
  if (unemploymentTaxable && input.ytdGrossPay < NY_SUI_WAGE_BASE) {
    const suiTaxableAmount = Math.min(
      grossPay,
      NY_SUI_WAGE_BASE - input.ytdGrossPay
    );
    suiEmployer = suiTaxableAmount * (input.suiRate / 100);
  }

  // Calculate employer FUTA (only on first $7,000 per employee)
  let futaEmployer = 0;
  const futaRate = input.futaRate || 0.6;
  if (unemploymentTaxable && input.ytdGrossPay < FUTA_WAGE_BASE) {
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
 * IRS Publication 15-T (2026) Annual Payroll Period STANDARD Withholding Rate Schedules
 * (W-4 from 2020 or later, Step 2 NOT checked).
 *
 * Each row is the bracket the Adjusted Annual Wage Amount falls into:
 * tax = base + rate × (adjustedWage - lower).
 */
type Bracket = { lower: number; upper: number; base: number; rate: number };

const FEDERAL_BRACKETS_2026: Record<'married' | 'single' | 'head_of_household', Bracket[]> = {
  married: [
    { lower: 0,       upper: 19300,    base: 0,           rate: 0    },
    { lower: 19300,   upper: 44100,    base: 0,           rate: 0.10 },
    { lower: 44100,   upper: 120100,   base: 2480,        rate: 0.12 },
    { lower: 120100,  upper: 230700,   base: 11600,       rate: 0.22 },
    { lower: 230700,  upper: 422850,   base: 35932,       rate: 0.24 },
    { lower: 422850,  upper: 531750,   base: 82048,       rate: 0.32 },
    { lower: 531750,  upper: 788000,   base: 116896,      rate: 0.35 },
    { lower: 788000,  upper: Infinity, base: 206583.50,   rate: 0.37 },
  ],
  single: [
    { lower: 0,       upper: 7500,     base: 0,           rate: 0    },
    { lower: 7500,    upper: 19900,    base: 0,           rate: 0.10 },
    { lower: 19900,   upper: 57900,    base: 1240,        rate: 0.12 },
    { lower: 57900,   upper: 113200,   base: 5800,        rate: 0.22 },
    { lower: 113200,  upper: 209275,   base: 17966,       rate: 0.24 },
    { lower: 209275,  upper: 263725,   base: 41024,       rate: 0.32 },
    { lower: 263725,  upper: 648100,   base: 58448,       rate: 0.35 },
    { lower: 648100,  upper: Infinity, base: 192979.25,   rate: 0.37 },
  ],
  head_of_household: [
    { lower: 0,       upper: 15550,    base: 0,           rate: 0    },
    { lower: 15550,   upper: 33250,    base: 0,           rate: 0.10 },
    { lower: 33250,   upper: 83000,    base: 1770,        rate: 0.12 },
    { lower: 83000,   upper: 121250,   base: 7740,        rate: 0.22 },
    { lower: 121250,  upper: 217300,   base: 16155,       rate: 0.24 },
    { lower: 217300,  upper: 271750,   base: 39207,       rate: 0.32 },
    { lower: 271750,  upper: 656150,   base: 56631,       rate: 0.35 },
    { lower: 656150,  upper: Infinity, base: 191171,      rate: 0.37 },
  ],
};

function lookupBracketTax(amount: number, brackets: Bracket[]): number {
  for (const b of brackets) {
    if (amount <= b.upper) {
      return b.base + b.rate * Math.max(0, amount - b.lower);
    }
  }
  return 0;
}

const PUB15T_2026_PER_ALLOWANCE = 4300;
const PUB15T_2026_STEP2_UNCHECKED_MFJ = 12900;
const PUB15T_2026_STEP2_UNCHECKED_OTHER = 8600;

/**
 * Federal income tax withholding per IRS Publication 15-T (2026), Annual Payroll Period.
 *
 * - Pre-2020 W-4 (w4FormType = "2019_prior"): Worksheet 1B — subtract allowances × $4,300
 *   from annual wages, then apply the STANDARD rate schedule for the filing status.
 *   The pre-2020 brackets historically baked in the standard deduction, so no further
 *   adjustment is applied.
 *
 * - 2020+ W-4 (default): Worksheet 1A — subtract the Step 2 unchecked adjustment
 *   ($12,900 MFJ; $8,600 single/HoH/MFS), then apply the STANDARD rate schedule.
 *   The current calculator has no W-4 4(b) deductions or 4(a) other-income inputs,
 *   so those are treated as $0. Step 2 checked is not currently modeled.
 *
 * Additional withholding (W-4 4(c)) is added on top, per pay period.
 */
function estimateFederalTax(
  grossPay: number,
  filingStatus: string | null,
  allowances: number | null,
  w4FormType: string | null | undefined,
  additionalWithholding: number | null | undefined,
): number {
  const annualizedPay = grossPay * 52;

  const status: 'married' | 'single' | 'head_of_household' =
    filingStatus === 'married' ? 'married'
    : filingStatus === 'head_of_household' ? 'head_of_household'
    : 'single';

  let adjustedAnnualWage: number;
  if (w4FormType === '2019_prior') {
    // Worksheet 1B (pre-2020 W-4): allowances only.
    adjustedAnnualWage = Math.max(0, annualizedPay - (allowances || 0) * PUB15T_2026_PER_ALLOWANCE);
  } else {
    // Worksheet 1A (2020+ W-4, Step 2 unchecked): standard-deduction adjustment.
    const adj = status === 'married' ? PUB15T_2026_STEP2_UNCHECKED_MFJ : PUB15T_2026_STEP2_UNCHECKED_OTHER;
    adjustedAnnualWage = Math.max(0, annualizedPay - adj);
  }

  const annualTax = lookupBracketTax(adjustedAnnualWage, FEDERAL_BRACKETS_2026[status]);
  const weeklyTax = annualTax / 52;

  return weeklyTax + (additionalWithholding || 0);
}

/**
 * NYS-50-T-NYS (1/26) Method II Annual Tax Rate Schedules.
 * Single and Married schedules are identical through line 5 ($96,800), then diverge.
 * NY treats Head of Household as Single for withholding purposes.
 */
const NY_STATE_BRACKETS_2026: Record<'single' | 'married', Bracket[]> = {
  single: [
    { lower: 0,        upper: 8500,    base: 0,         rate: 0.0390 },
    { lower: 8500,     upper: 11700,   base: 332,       rate: 0.0440 },
    { lower: 11700,    upper: 13900,   base: 472,       rate: 0.0515 },
    { lower: 13900,    upper: 80650,   base: 586,       rate: 0.0540 },
    { lower: 80650,    upper: 96800,   base: 4190,      rate: 0.0590 },
    { lower: 96800,    upper: 107650,  base: 5143,      rate: 0.0703 },
    { lower: 107650,   upper: 157650,  base: 5906,      rate: 0.0753 },
    { lower: 157650,   upper: 215400,  base: 9673,      rate: 0.0640 },
    { lower: 215400,   upper: 265400,  base: 13369,     rate: 0.1144 },
    { lower: 265400,   upper: Infinity, base: 19091,    rate: 0.0735 },
  ],
  married: [
    { lower: 0,        upper: 8500,    base: 0,         rate: 0.0390 },
    { lower: 8500,     upper: 11700,   base: 332,       rate: 0.0440 },
    { lower: 11700,    upper: 13900,   base: 472,       rate: 0.0515 },
    { lower: 13900,    upper: 80650,   base: 586,       rate: 0.0540 },
    { lower: 80650,    upper: 96800,   base: 4190,      rate: 0.0590 },
    { lower: 96800,    upper: 107650,  base: 5143,      rate: 0.0657 },
    { lower: 107650,   upper: 157650,  base: 5855,      rate: 0.0707 },
    { lower: 157650,   upper: 211550,  base: 9388,      rate: 0.0801 },
    { lower: 211550,   upper: 323200,  base: 13708,     rate: 0.0640 },
    { lower: 323200,   upper: 373200,  base: 20854,     rate: 0.1349 },
    { lower: 373200,   upper: 1077550, base: 27600,     rate: 0.0735 },
    { lower: 1077550,  upper: Infinity, base: 79369,    rate: 0.0765 },
  ],
};

/**
 * NY State income tax withholding per NYS Publication NYS-50-T-NYS (1/26),
 * Method II (Exact Calculation Method).
 *
 * Annual exemption per Table A: base $7,950 (married) / $7,400 (single) + $1,000 per
 * additional allowance.
 */
function estimateNYStateTax(
  grossPay: number,
  filingStatus: string | null,
  allowances: number | null,
): number {
  const annualizedPay = grossPay * 52;

  const status: 'single' | 'married' = filingStatus === 'married' ? 'married' : 'single';
  const baseExemption = status === 'married' ? 7950 : 7400;
  const totalExemption = baseExemption + (allowances || 0) * 1000;

  const netWages = Math.max(0, annualizedPay - totalExemption);
  const annualTax = lookupBracketTax(netWages, NY_STATE_BRACKETS_2026[status]);

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
