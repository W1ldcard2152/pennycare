// Shared payroll input builder — the one place that turns an employee's stored
// setup + payroll history into a PayrollInput. Used by the preview, process and
// correct routes so all three compute identical numbers for the same week.
//
// YTD is windowed by the PAY DATE's calendar year (wages are taxed when paid):
// a Dec 28 – Jan 3 week paid Jan 9 is a new-year check with fresh wage bases.

import type { Employee, EmployeeDeduction, PayrollRecord, Prisma } from '@prisma/client';
import {
  type EmployeeDeductionInput,
  type PayrollInput,
  type PayrollResult,
  SECTION_125_DEDUCTION_TYPES,
  roundCurrency,
  seedAppliesToYear,
  splitWorkweekHours,
} from './payrollCalculations';

type DeductionForPayroll = Pick<
  EmployeeDeduction,
  'id' | 'deductionType' | 'name' | 'amountType' | 'amount' | 'preTax' | 'annualLimit' | 'ytdAmount' | 'ytdYear'
>;

type RecordForYtd = Pick<
  PayrollRecord,
  | 'status' | 'payDate' | 'payPeriodEnd' | 'grossPay' | 'netPay'
  | 'federalTax' | 'stateTax' | 'socialSecurity' | 'medicare' | 'nyPFL'
  | 'preTaxHealthIns' | 'preTaxDental' | 'preTaxVision' | 'preTaxHSA' | 'preTaxFSA'
>;

export type PayrollEmployee = Pick<
  Employee,
  | 'payType' | 'hourlyRate' | 'annualSalary'
  | 'w4FormType' | 'w4FilingStatus' | 'w4Allowances' | 'additionalWithholding'
  | 'w4Step2Checked' | 'w4DependentsCredit' | 'w4OtherIncome' | 'w4Deductions'
  | 'stateFilingStatus' | 'stateAllowances'
  | 'federalTaxability' | 'stateTaxability' | 'socialSecurityTaxability' | 'medicareTaxability'
  | 'unemploymentTaxability' | 'disabilityTaxability' | 'paidFamilyLeaveTaxability'
  | 'nycResident' | 'yonkersResident'
  | 'ytdSeedAsOfDate' | 'ytdGrossPaySeed' | 'ytdSocialSecuritySeed' | 'ytdMedicareSeed'
  | 'ytdFederalIncomeTaxSeed' | 'ytdStateIncomeTaxSeed' | 'ytdPaidFamilyLeaveSeed'
> & {
  timeEntries: { hoursWorked: number; overtimeHours: number }[];
  payrollRecords: RecordForYtd[];
  deductions: DeductionForPayroll[];
};

export type PayrollCompany = { overtimeMultiplier: number; suiRate: number | null; futaRate: number | null };

/**
 * Prisma `include` for loading an employee ready for buildPayrollInput:
 * time entries in the period, earlier active payroll records, active deductions.
 */
export function payrollEmployeeInclude(range: { from: Date; to: Date; periodStart: Date }) {
  return {
    timeEntries: { where: { date: { gte: range.from, lte: range.to } } },
    payrollRecords: {
      where: { payPeriodEnd: { lt: range.periodStart }, status: 'active' },
      orderBy: { payPeriodEnd: 'desc' as const },
    },
    deductions: { where: { isActive: true } },
    paymentInfo: true,
  } satisfies Prisma.EmployeeInclude;
}

export interface PayrollYtd {
  grossPay: number;
  federalTax: number;
  stateTax: number;
  socialSecurity: number;
  medicare: number;
  netPay: number;
}

export interface BuiltPayrollInput {
  /** Hourly employee with no hours in the period — nothing to pay. */
  skip: boolean;
  regularHours: number;
  overtimeHours: number;
  input: PayrollInput;
  /** YTD before this check (seeds included), for the record's ytd* columns. */
  ytd: PayrollYtd;
  /** Setup problems found while building the input (merge with result.warnings). */
  warnings: string[];
}

function deductionYtdForYear(d: Pick<EmployeeDeduction, 'ytdAmount' | 'ytdYear'>, taxYear: number): number {
  // Null ytdYear is legacy data: treat it as this year's (the pre-fix
  // behavior). The first run stamps a year, so it starts over next January.
  return d.ytdYear == null || d.ytdYear === taxYear ? d.ytdAmount : 0;
}

export function buildPayrollInput(
  employee: PayrollEmployee,
  company: PayrollCompany,
  payDate: Date,
): BuiltPayrollInput {
  const warnings: string[] = [];
  const isSalaried = employee.payType === 'salary';

  let regularHours = 0;
  let overtimeHours = 0;
  let hourlyRate = employee.hourlyRate || 0;
  if (isSalaried) {
    // Weekly payroll: a salaried check is annual / 52, expressed as 40 hours.
    const weeklyPay = (employee.annualSalary || 0) / 52;
    regularHours = 40;
    hourlyRate = weeklyPay / 40;
  } else {
    // Overtime is decided by the week's TOTAL, never by how the days were
    // entered: older time entries split each day at 8 hours, which paid
    // overtime on long days in short weeks. Re-split the whole week at 40.
    const totalHours = employee.timeEntries.reduce((sum, e) => sum + e.hoursWorked + e.overtimeHours, 0);
    ({ regularHours, overtimeHours } = splitWorkweekHours(totalHours));
  }
  const skip = !isSalaried && regularHours === 0 && overtimeHours === 0;

  // YTD window = the pay date's calendar year. Seeds (prior payroll service)
  // count only for the year they describe; our own records after the seed's
  // as-of date are additive on top.
  const taxYear = payDate.getUTCFullYear();
  const seedAsOf = employee.ytdSeedAsOfDate;
  const seedApplies = seedAppliesToYear(seedAsOf, taxYear);
  const seed = (v: number | null | undefined) => (seedApplies ? v || 0 : 0);
  if (!seedAsOf && (employee.ytdGrossPaySeed || 0) > 0) {
    warnings.push(
      `YTD seed ($${employee.ytdGrossPaySeed.toFixed(2)}) has no "as of" date, so it is being counted toward ${taxYear}. Set the seed date in Tax Settings.`,
    );
  }

  const ytdRecords = employee.payrollRecords.filter(
    (r) =>
      r.status === 'active' &&
      r.payDate.getUTCFullYear() === taxYear &&
      (!seedApplies || !seedAsOf || r.payPeriodEnd > seedAsOf),
  );
  const sum = (pick: (r: RecordForYtd) => number) => ytdRecords.reduce((s, r) => s + pick(r), 0);

  const ytdGrossPay = seed(employee.ytdGrossPaySeed) + sum((r) => r.grossPay);
  // Seeds carry no Section 125 breakdown, so seeded gross stands in for FICA wages.
  const ytdFicaWages =
    seed(employee.ytdGrossPaySeed) +
    sum((r) => r.grossPay - r.preTaxHealthIns - r.preTaxDental - r.preTaxVision - r.preTaxHSA - r.preTaxFSA);
  const ytd: PayrollYtd = {
    grossPay: ytdGrossPay,
    federalTax: seed(employee.ytdFederalIncomeTaxSeed) + sum((r) => r.federalTax),
    stateTax: seed(employee.ytdStateIncomeTaxSeed) + sum((r) => r.stateTax),
    socialSecurity: seed(employee.ytdSocialSecuritySeed) + sum((r) => r.socialSecurity),
    medicare: seed(employee.ytdMedicareSeed) + sum((r) => r.medicare),
    netPay: sum((r) => r.netPay),
  };
  const ytdPFL = seed(employee.ytdPaidFamilyLeaveSeed) + sum((r) => r.nyPFL);

  const deductions: EmployeeDeductionInput[] = employee.deductions.map((d) => ({
    id: d.id,
    deductionType: d.deductionType,
    name: d.name,
    amountType: d.amountType as 'fixed' | 'percentage',
    amount: d.amount,
    preTax: d.preTax,
    annualLimit: d.annualLimit,
    ytdAmount: deductionYtdForYear(d, taxYear),
  }));

  const input: PayrollInput = {
    regularHours,
    overtimeHours,
    hourlyRate,
    overtimeMultiplier: company.overtimeMultiplier,
    w4FormType: employee.w4FormType,
    w4FilingStatus: employee.w4FilingStatus,
    w4Allowances: employee.w4Allowances,
    additionalWithholding: employee.additionalWithholding,
    w4Step2Checked: employee.w4Step2Checked,
    w4DependentsCredit: employee.w4DependentsCredit,
    w4OtherIncome: employee.w4OtherIncome,
    w4Deductions: employee.w4Deductions,
    stateFilingStatus: employee.stateFilingStatus,
    stateAllowances: employee.stateAllowances,
    federalTaxability: employee.federalTaxability,
    stateTaxability: employee.stateTaxability,
    socialSecurityTaxability: employee.socialSecurityTaxability,
    medicareTaxability: employee.medicareTaxability,
    unemploymentTaxability: employee.unemploymentTaxability,
    disabilityTaxability: employee.disabilityTaxability,
    paidFamilyLeaveTaxability: employee.paidFamilyLeaveTaxability,
    nycResident: employee.nycResident || false,
    yonkersResident: employee.yonkersResident || false,
    taxYear,
    ytdGrossPay,
    ytdFicaWages,
    ytdSocialSecurity: ytd.socialSecurity,
    ytdMedicare: ytd.medicare,
    ytdPFL,
    suiRate: company.suiRate || 0,
    futaRate: company.futaRate || 0.6,
    deductions,
  };

  return { skip, regularHours, overtimeHours, input, ytd, warnings };
}

const PRE_TAX_COLUMNS: Record<string, 'preTax401k' | 'preTaxHealthIns' | 'preTaxDental' | 'preTaxVision' | 'preTaxHSA' | 'preTaxFSA'> = {
  '401k': 'preTax401k',
  health_insurance: 'preTaxHealthIns',
  dental: 'preTaxDental',
  vision: 'preTaxVision',
  hsa: 'preTaxHSA',
  fsa: 'preTaxFSA',
};
const POST_TAX_COLUMNS: Record<string, 'postTaxRoth401k' | 'garnishments' | 'childSupport' | 'loanRepayments'> = {
  '401k_roth': 'postTaxRoth401k',
  garnishment: 'garnishments',
  child_support: 'childSupport',
  loan_repayment: 'loanRepayments',
};

/** Per-type deduction columns for a PayrollRecord, summed from a calculation result. */
export function deductionColumns(result: PayrollResult) {
  const cols = {
    preTax401k: 0, preTaxHealthIns: 0, preTaxDental: 0, preTaxVision: 0, preTaxHSA: 0, preTaxFSA: 0, preTaxOther: 0,
    postTaxRoth401k: 0, garnishments: 0, childSupport: 0, loanRepayments: 0, postTaxOther: 0,
  };
  for (const d of result.preTaxDeductions) cols[PRE_TAX_COLUMNS[d.type] ?? 'preTaxOther'] += d.amount;
  for (const d of result.postTaxDeductions) cols[POST_TAX_COLUMNS[d.type] ?? 'postTaxOther'] += d.amount;
  for (const k of Object.keys(cols) as (keyof typeof cols)[]) cols[k] = roundCurrency(cols[k]);
  return cols;
}

/**
 * New ytdAmount/ytdYear for each deduction this check took, matched by
 * deduction id. A deduction last stamped with an earlier year starts over.
 */
export function deductionYtdUpdates(
  deductions: Pick<EmployeeDeduction, 'id' | 'ytdAmount' | 'ytdYear'>[],
  result: PayrollResult,
  taxYear: number,
): Array<{ id: string; ytdAmount: number; ytdYear: number }> {
  const taken = [...result.preTaxDeductions, ...result.postTaxDeductions];
  const updates: Array<{ id: string; ytdAmount: number; ytdYear: number }> = [];
  for (const d of deductions) {
    const amount = taken.filter((t) => t.id === d.id).reduce((s, t) => s + t.amount, 0);
    if (amount > 0) {
      updates.push({ id: d.id, ytdAmount: roundCurrency(deductionYtdForYear(d, taxYear) + amount), ytdYear: taxYear });
    }
  }
  return updates;
}

type RecordDeductionAmounts = Pick<PayrollRecord, 'payDate'> &
  Pick<PayrollRecord, 'preTax401k' | 'preTaxHealthIns' | 'preTaxDental' | 'preTaxVision' | 'preTaxHSA' | 'preTaxFSA'
    | 'postTaxRoth401k' | 'garnishments' | 'childSupport' | 'loanRepayments'>;

/**
 * How much of a record's deductions to take back off each deduction's YTD.
 * Records store deductions per type, not per deduction, so each type's amount
 * is taken back across that type's deductions, in the order given, until it
 * is used up (previously the full amount came off EVERY deduction of the
 * type). Only deductions whose YTD belongs to the record's pay-date year are
 * touched. Pass active deductions oldest-first.
 */
export function planDeductionReversal(
  deductions: Pick<EmployeeDeduction, 'id' | 'deductionType' | 'ytdAmount' | 'ytdYear'>[],
  record: RecordDeductionAmounts,
): Map<string, number> {
  const taxYear = record.payDate.getUTCFullYear();
  const remaining = new Map<string, number>([
    ...Object.entries(PRE_TAX_COLUMNS).map(([type, col]) => [type, record[col]] as [string, number]),
    ...Object.entries(POST_TAX_COLUMNS).map(([type, col]) => [type, record[col]] as [string, number]),
  ]);
  const takeById = new Map<string, number>();
  for (const ded of deductions) {
    if (ded.ytdYear != null && ded.ytdYear !== taxYear) continue;
    const left = remaining.get(ded.deductionType) || 0;
    const take = roundCurrency(Math.min(left, ded.ytdAmount));
    if (take <= 0) continue;
    takeById.set(ded.id, take);
    remaining.set(ded.deductionType, roundCurrency(left - take));
  }
  return takeById;
}

/** Undo a voided/corrected record's contribution to deduction YTD (see planDeductionReversal). */
export async function reverseDeductionYtd(
  tx: Prisma.TransactionClient,
  record: RecordDeductionAmounts & Pick<PayrollRecord, 'employeeId'>,
): Promise<void> {
  const deductions = await tx.employeeDeduction.findMany({
    where: { employeeId: record.employeeId, isActive: true },
    orderBy: { createdAt: 'asc' },
  });
  const takeById = planDeductionReversal(deductions, record);
  for (const ded of deductions) {
    const take = takeById.get(ded.id);
    if (!take) continue;
    await tx.employeeDeduction.update({
      where: { id: ded.id },
      data: { ytdAmount: roundCurrency(ded.ytdAmount - take) },
    });
  }
}
