// Payroll Tax Calculation Utilities for New York State (Wayne County)
// Updated for 2026 tax rates per IRS Publication 15-T and NYS Publication NYS-50-T-NYS

export interface EmployeeDeductionInput {
  // EmployeeDeduction.id — carried through to the breakdown so the caller
  // updates YTD on the exact deduction, not the first one of the same type.
  id?: string;
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
  // 2020+ W-4 only (ignored for "2019_prior"). Step 3 and 4(a)/4(b) are annual
  // amounts, exactly as written on the form.
  w4Step2Checked?: boolean;       // Step 2(c) multiple-jobs checkbox
  w4DependentsCredit?: number;    // Step 3 total
  w4OtherIncome?: number;         // Step 4(a)
  w4Deductions?: number;          // Step 4(b)

  // NY IT-2104. Null status means the IT-2104 was never entered; the
  // calculator then falls back to the federal W-4 values and warns.
  stateFilingStatus?: string | null;
  stateAllowances?: number | null;

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
  // Calendar year the YTD totals belong to — the year of the PAY DATE (wages
  // are taxed when paid). Selects the Social Security and NY SUI wage bases,
  // so it must be the same year the caller windowed YTD on.
  taxYear: number;
  ytdGrossPay: number;
  // YTD Social Security / Medicare wages (gross less Section 125 deductions).
  // Defaults to ytdGrossPay when omitted.
  ytdFicaWages?: number;
  ytdSocialSecurity: number;
  ytdMedicare: number;
  ytdPFL?: number; // NY PFL withheld so far this year — the annual cap is YTD

  // Company settings
  suiRate: number; // Employer SUI rate (2.1% - 9.9%)
  futaRate?: number; // Federal Unemployment Tax rate (0.6% after credit)

  // Employee deductions (401k, health insurance, etc.)
  deductions?: EmployeeDeductionInput[];
}

export interface DeductionBreakdown {
  id?: string;
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
  // Social Security / Medicare wages (gross - Section 125 deductions only)
  ficaWages: number;

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
  nyRSFEmployer: number; // NY Re-employment Service Fund (0.075% on SUI-eligible wages)
  futaEmployer: number; // Federal Unemployment Tax
  totalEmployerCost: number;

  // YTD wage tracking — used by the UI to show wage-base cap ratios against
  // the caps this calculation actually applied (per input.taxYear).
  ytdGrossPayBefore: number;
  ytdGrossPayAfter: number;
  ssWageBase: number;
  suiWageBase: number;
  futaWageBase: number;

  // Setup problems worth showing on the preview (e.g. no IT-2104 on file).
  warnings: string[];
}

/**
 * Social Security wage base by calendar year. Shared with the Form 941
 * builder (re-exported from lib/form941.ts) so payroll withholds against the
 * same cap the return reports on line 5a.
 *
 * VERIFY EACH YEAR against the SSA's annual announcement and add the new year
 * before the first payroll of January. Unknown years fall back to the nearest
 * known year (`exact: false`), which the 941 surfaces as a warning.
 */
export const SOCIAL_SECURITY_WAGE_BASE_BY_YEAR: Record<number, number> = {
  2023: 160200,
  2024: 168600,
  2025: 176100,
  2026: 184500,
};

/**
 * NY UI (SUI) wage base by calendar year. Shared with the NYS-45 builder
 * (re-exported from lib/nys45.ts), where it splits Part A line 1 into lines
 * 2 and 3.
 *
 * 2026 onward the base is indexed to 18% of the state average annual wage
 * under the 2025 budget bill (which is why it jumps from 12,800 to 17,600).
 * Add each new year here as NY publishes it.
 */
export const NY_SUI_WAGE_BASE_BY_YEAR: Record<number, number> = {
  2023: 12300,
  2024: 12500,
  2025: 12800,
  2026: 17600,
};

function lookupByYear(table: Record<number, number>, year: number): { base: number; exact: boolean } {
  if (Object.prototype.hasOwnProperty.call(table, year)) {
    return { base: table[year], exact: true };
  }
  const known = Object.keys(table).map(Number).sort((a, b) => a - b);
  const nearest = year < known[0] ? known[0] : known[known.length - 1];
  return { base: table[nearest], exact: false };
}

export function getSocialSecurityWageBase(year: number): { base: number; exact: boolean } {
  return lookupByYear(SOCIAL_SECURITY_WAGE_BASE_BY_YEAR, year);
}

export function getNySuiWageBase(year: number): { base: number; exact: boolean } {
  return lookupByYear(NY_SUI_WAGE_BASE_BY_YEAR, year);
}

/**
 * Whether an employee's YTD seeds (wages a prior payroll service paid before
 * this app took over) count toward `year`. Seeds describe ONE calendar year —
 * the year of ytdSeedAsOfDate — so a 2025 seed must not consume the 2026 wage
 * bases. A seed with no as-of date is legacy data whose year is unknown; it
 * keeps applying (the pre-fix behavior) and the payroll preview warns.
 *
 * Shared by payroll (lib/payroll-input.ts) and the 941 / NYS-45 builders so
 * the wage-base ladder agrees everywhere.
 */
export function seedAppliesToYear(seedAsOf: Date | null | undefined, year: number): boolean {
  return !seedAsOf || seedAsOf.getUTCFullYear() === year;
}

const SOCIAL_SECURITY_RATE = 0.062; // 6.2%
const MEDICARE_RATE = 0.0145; // 1.45%
const ADDITIONAL_MEDICARE_RATE = 0.009; // 0.9%
const ADDITIONAL_MEDICARE_THRESHOLD = 200000;

const NY_SDI_RATE = 0.005; // 0.5%
const NY_SDI_WEEKLY_MAX = 0.60; // $0.60 per week max

const NY_PFL_RATE = 0.00432; // 0.432% for 2026 (NY DFS rate decision)
const NY_PFL_ANNUAL_MAX = 411.91; // 2026 max

// Exported so the NYS-45 builder reports the same rate on Part A line 5 that
// payroll actually accrued (see lib/nys45.ts).
export const NY_RSF_RATE = 0.00075; // NY Re-employment Service Fund — 0.075% of SUI-eligible wages
const FUTA_WAGE_BASE = 7000; // First $7,000 per employee

// NYC tax rates (simplified)
const NYC_TAX_RATE = 0.03876; // Top NYC resident rate (flat approximation — NYC brackets not modeled)

// Yonkers tax rates
const YONKERS_RESIDENT_RATE = 0.1675; // 16.75% surcharge on NY state tax (NYS-50-T-Y 1/26)
const YONKERS_NONRESIDENT_RATE = 0.005; // 0.5% of wages earned in Yonkers

// Pay periods per year. Payroll runs weekly only (Run Payroll picks a week);
// the annualize/de-annualize steps below all use this.
const PAY_PERIODS = 52;

/**
 * Pre-tax deduction types offered through a Section 125 cafeteria plan.
 * They are excluded from Social Security and Medicare wages, while 401(k)
 * deferrals (and unknown "other" pre-tax types) remain FICA-taxable.
 *
 * SUI and FUTA still use gross pay. Section 125 is also excluded from FUTA
 * wages, and NY UI treatment needs confirming — tracked as a follow-up rather
 * than guessed at here.
 */
export const SECTION_125_DEDUCTION_TYPES = ['health_insurance', 'dental', 'vision', 'hsa', 'fsa'];

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
  const warnings: string[] = [];

  // Calculate gross pay
  const regularPay = input.regularHours * input.hourlyRate;
  const overtimePay = input.overtimeHours * input.hourlyRate * input.overtimeMultiplier;
  const grossPay = regularPay + overtimePay;

  // Process pre-tax deductions first (they reduce taxable income)
  const preTaxDeductions: DeductionBreakdown[] = [];
  let totalPreTaxDeductions = 0;
  let section125Deductions = 0;

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
            id: deduction.id,
            type: deduction.deductionType,
            name: deduction.name,
            amount: roundCurrency(amount),
            preTax: true,
          });
          totalPreTaxDeductions += amount;
          if (SECTION_125_DEDUCTION_TYPES.includes(deduction.deductionType)) {
            section125Deductions += amount;
          }
        }
      }
    }
  }

  // Taxable wages = gross - pre-tax deductions
  const taxableWages = grossPay - totalPreTaxDeductions;

  // FICA wages = gross - Section 125 deductions (401k stays FICA-taxable)
  const ficaWages = grossPay - section125Deductions;
  const ytdFicaWages = input.ytdFicaWages ?? input.ytdGrossPay;
  const newYtdFicaWages = ytdFicaWages + ficaWages;

  // Calculate Social Security (6.2% up to wage base)
  const newYtdGross = input.ytdGrossPay + grossPay;
  const ssWageBase = getSocialSecurityWageBase(input.taxYear).base;
  let socialSecurityEmployee = 0;
  let socialSecurityEmployer = 0;

  if (isTaxable(input.socialSecurityTaxability) && ytdFicaWages < ssWageBase) {
    const taxableAmount = Math.min(
      ficaWages,
      ssWageBase - ytdFicaWages
    );
    socialSecurityEmployee = taxableAmount * SOCIAL_SECURITY_RATE;
    socialSecurityEmployer = taxableAmount * SOCIAL_SECURITY_RATE;
  }

  // Calculate Medicare (1.45% on all FICA wages)
  const medicareTaxable = isTaxable(input.medicareTaxability);
  const medicareEmployee = medicareTaxable ? ficaWages * MEDICARE_RATE : 0;
  const medicareEmployer = medicareTaxable ? ficaWages * MEDICARE_RATE : 0;

  // Calculate Additional Medicare (0.9% on Medicare wages over $200k YTD)
  let additionalMedicare = 0;
  if (medicareTaxable && newYtdFicaWages > ADDITIONAL_MEDICARE_THRESHOLD) {
    if (ytdFicaWages >= ADDITIONAL_MEDICARE_THRESHOLD) {
      additionalMedicare = ficaWages * ADDITIONAL_MEDICARE_RATE;
    } else {
      const excessAmount = newYtdFicaWages - ADDITIONAL_MEDICARE_THRESHOLD;
      additionalMedicare = excessAmount * ADDITIONAL_MEDICARE_RATE;
    }
  }

  // Calculate NY State Disability Insurance (SDI)
  // 0.5% of weekly wage, max $0.60 per week
  const nySDI = isTaxable(input.disabilityTaxability)
    ? Math.min(grossPay * NY_SDI_RATE, NY_SDI_WEEKLY_MAX)
    : 0;

  // Calculate NY Paid Family Leave (PFL) — 2026: 0.432% of gross, capped at
  // $411.91 for the YEAR, so a check only takes what's left under the cap.
  const pflRemaining = Math.max(0, NY_PFL_ANNUAL_MAX - (input.ytdPFL || 0));
  const nyPFL = isTaxable(input.paidFamilyLeaveTaxability)
    ? Math.min(grossPay * NY_PFL_RATE, pflRemaining)
    : 0;

  // Calculate Federal Income Tax (on taxable wages after pre-tax deductions)
  const federalIncomeTax = isTaxable(input.federalTaxability)
    ? estimateFederalTax(taxableWages, {
        filingStatus: input.w4FilingStatus,
        allowances: input.w4Allowances,
        w4FormType: input.w4FormType,
        additionalWithholding: input.additionalWithholding,
        step2Checked: input.w4Step2Checked,
        dependentsCredit: input.w4DependentsCredit,
        otherIncome: input.w4OtherIncome,
        deductions: input.w4Deductions,
      })
    : 0;

  // Calculate NY State Income Tax (on taxable wages after pre-tax deductions).
  // NY withholding comes from the IT-2104, not the federal W-4. Employees set
  // up before the IT-2104 fields were used fall back to the W-4 values.
  let nyFilingStatus = input.stateFilingStatus;
  let nyAllowances = input.stateAllowances;
  if (!nyFilingStatus) {
    nyFilingStatus = input.w4FilingStatus;
    nyAllowances = input.w4Allowances;
    if (isTaxable(input.stateTaxability)) {
      warnings.push('No NY IT-2104 on file — NY withholding is using the federal W-4 filing status and allowances.');
    }
  }
  const stateIncomeTax = isTaxable(input.stateTaxability)
    ? estimateNYStateTax(taxableWages, nyFilingStatus, nyAllowances)
    : 0;

  // Calculate local tax (NYC or Yonkers)
  let localTax = 0;
  if (input.nycResident) {
    // NYC resident tax — flat-rate approximation on this period's taxable wages
    localTax = taxableWages * NYC_TAX_RATE;
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
            id: deduction.id,
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

  // Calculate employer SUI (only up to the year's NY UI wage base per employee).
  // The same eligible-wages calculation drives the NY Re-employment Service Fund (RSF).
  // Unemployment taxability gates SUI, RSF, and FUTA.
  const unemploymentTaxable = isTaxable(input.unemploymentTaxability);
  const suiWageBase = getNySuiWageBase(input.taxYear).base;
  let suiEmployer = 0;
  let nyRSFEmployer = 0;
  if (unemploymentTaxable && input.ytdGrossPay < suiWageBase) {
    const suiTaxableAmount = Math.min(
      grossPay,
      suiWageBase - input.ytdGrossPay
    );
    suiEmployer = suiTaxableAmount * (input.suiRate / 100);
    nyRSFEmployer = suiTaxableAmount * NY_RSF_RATE;
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
    nyRSFEmployer +
    futaEmployer;

  return {
    regularPay: roundCurrency(regularPay),
    overtimePay: roundCurrency(overtimePay),
    grossPay: roundCurrency(grossPay),
    preTaxDeductions,
    totalPreTaxDeductions: roundCurrency(totalPreTaxDeductions),
    taxableWages: roundCurrency(taxableWages),
    ficaWages: roundCurrency(ficaWages),
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
    nyRSFEmployer: roundCurrency(nyRSFEmployer),
    futaEmployer: roundCurrency(futaEmployer),
    totalEmployerCost: roundCurrency(totalEmployerCost),
    ytdGrossPayBefore: roundCurrency(input.ytdGrossPay),
    ytdGrossPayAfter: roundCurrency(newYtdGross),
    ssWageBase,
    suiWageBase,
    futaWageBase: FUTA_WAGE_BASE,
    warnings,
  };
}

/**
 * IRS Publication 15-T (2026) Annual Payroll Period withholding rate schedules.
 *
 * Each row is the bracket the Adjusted Annual Wage Amount falls into:
 * tax = base + rate × (adjustedWage - lower).
 */
type Bracket = { lower: number; upper: number; base: number; rate: number };
type FederalStatus = 'married' | 'single' | 'head_of_household';

// STANDARD schedules — 2020+ W-4 with Step 2 NOT checked, and all pre-2020 W-4s.
const FEDERAL_BRACKETS_2026: Record<FederalStatus, Bracket[]> = {
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

// "Form W-4, Step 2, Checkbox" schedules — 2020+ W-4 with Step 2 checked.
// Verbatim from Pub 15-T (2026), Section 1, Annual Payroll Period.
const FEDERAL_BRACKETS_2026_STEP2: Record<FederalStatus, Bracket[]> = {
  married: [
    { lower: 0,       upper: 16100,    base: 0,           rate: 0    },
    { lower: 16100,   upper: 28500,    base: 0,           rate: 0.10 },
    { lower: 28500,   upper: 66500,    base: 1240,        rate: 0.12 },
    { lower: 66500,   upper: 121800,   base: 5800,        rate: 0.22 },
    { lower: 121800,  upper: 217875,   base: 17966,       rate: 0.24 },
    { lower: 217875,  upper: 272325,   base: 41024,       rate: 0.32 },
    { lower: 272325,  upper: 400450,   base: 58448,       rate: 0.35 },
    { lower: 400450,  upper: Infinity, base: 103291.75,   rate: 0.37 },
  ],
  single: [
    { lower: 0,       upper: 8050,     base: 0,           rate: 0    },
    { lower: 8050,    upper: 14250,    base: 0,           rate: 0.10 },
    { lower: 14250,   upper: 33250,    base: 620,         rate: 0.12 },
    { lower: 33250,   upper: 60900,    base: 2900,        rate: 0.22 },
    { lower: 60900,   upper: 108938,   base: 8983,        rate: 0.24 },
    { lower: 108938,  upper: 136163,   base: 20512,       rate: 0.32 },
    { lower: 136163,  upper: 328350,   base: 29224,       rate: 0.35 },
    { lower: 328350,  upper: Infinity, base: 96489.63,    rate: 0.37 },
  ],
  head_of_household: [
    { lower: 0,       upper: 12075,    base: 0,           rate: 0    },
    { lower: 12075,   upper: 20925,    base: 0,           rate: 0.10 },
    { lower: 20925,   upper: 45800,    base: 885,         rate: 0.12 },
    { lower: 45800,   upper: 64925,    base: 3870,        rate: 0.22 },
    { lower: 64925,   upper: 112950,   base: 8077.50,     rate: 0.24 },
    { lower: 112950,  upper: 140175,   base: 19603.50,    rate: 0.32 },
    { lower: 140175,  upper: 332375,   base: 28315.50,    rate: 0.35 },
    { lower: 332375,  upper: Infinity, base: 95585.50,    rate: 0.37 },
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

interface FederalWithholdingOptions {
  filingStatus: string | null;
  allowances: number | null;
  w4FormType: string | null | undefined;
  additionalWithholding: number | null | undefined;
  step2Checked?: boolean;
  dependentsCredit?: number;
  otherIncome?: number;
  deductions?: number;
}

/**
 * Federal income tax withholding per IRS Publication 15-T (2026), Worksheet 1A
 * (percentage method, automated payroll), Annual Payroll Period.
 *
 * - Pre-2020 W-4 (w4FormType = "2019_prior"): subtract allowances × $4,300
 *   (line 1k) from annual wages, then apply the STANDARD rate schedule. Steps
 *   2–4 don't exist on that form and are ignored.
 *
 * - 2020+ W-4 (default): adjusted annual wage = annual wages + Step 4(a)
 *   − Step 4(b) − line 1g ($12,900 MFJ / $8,600 otherwise, or $0 when Step 2
 *   is checked). Step 2 checked selects the Step 2 Checkbox schedule. The
 *   Step 3 credit is spread across pay periods and can't push withholding
 *   below zero (line 3c).
 *
 * Additional withholding (W-4 4(c)) is added on top, per pay period.
 */
function estimateFederalTax(wages: number, opts: FederalWithholdingOptions): number {
  const annualizedPay = wages * PAY_PERIODS;

  const status: FederalStatus =
    opts.filingStatus === 'married' ? 'married'
    : opts.filingStatus === 'head_of_household' ? 'head_of_household'
    : 'single';

  let adjustedAnnualWage: number;
  let schedule = FEDERAL_BRACKETS_2026[status];
  let dependentsCredit = 0;

  if (opts.w4FormType === '2019_prior') {
    adjustedAnnualWage = Math.max(0, annualizedPay - (opts.allowances || 0) * PUB15T_2026_PER_ALLOWANCE);
  } else {
    const line1g = opts.step2Checked
      ? 0
      : status === 'married' ? PUB15T_2026_STEP2_UNCHECKED_MFJ : PUB15T_2026_STEP2_UNCHECKED_OTHER;
    adjustedAnnualWage = Math.max(
      0,
      annualizedPay + (opts.otherIncome || 0) - (opts.deductions || 0) - line1g,
    );
    if (opts.step2Checked) schedule = FEDERAL_BRACKETS_2026_STEP2[status];
    dependentsCredit = opts.dependentsCredit || 0;
  }

  const tentativePerPeriod = lookupBracketTax(adjustedAnnualWage, schedule) / PAY_PERIODS;
  const afterCredit = Math.max(0, tentativePerPeriod - dependentsCredit / PAY_PERIODS);

  return afterCredit + (opts.additionalWithholding || 0);
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
  filingStatus: string | null | undefined,
  allowances: number | null | undefined,
): number {
  const annualizedPay = grossPay * PAY_PERIODS;

  const status: 'single' | 'married' = filingStatus === 'married' ? 'married' : 'single';
  const baseExemption = status === 'married' ? 7950 : 7400;
  const totalExemption = baseExemption + (allowances || 0) * 1000;

  const netWages = Math.max(0, annualizedPay - totalExemption);
  const annualTax = lookupBracketTax(netWages, NY_STATE_BRACKETS_2026[status]);

  return annualTax / PAY_PERIODS;
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
