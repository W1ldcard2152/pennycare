/**
 * Editable quarterly returns (Form 941, NYS-45).
 *
 * The builders in lib/form941.ts and lib/nys45.ts compute a return from
 * payroll. What gets *filed* can differ — NY's online calculator, the IRS
 * e-file software, or the filer's own judgement may produce slightly different
 * figures — and the filed return is what was actually paid, so it is the
 * source of truth for the books.
 *
 * This module is the pure, client-safe half of that feature:
 *
 *  - Each form is described as an ordered list of line definitions over a flat
 *    `ReturnValues` map (line key → number). Lines with a `derive` formula are
 *    recalculated from the lines above them unless the filer overrode them.
 *  - `resolveReturn(defs, computed, overrides)` produces the return as filed:
 *    computed values, with overrides applied, and dependent lines recomputed.
 *    Only overrides are persisted for drafts, so a draft picks up payroll
 *    changes made after it was saved; a filed return freezes the full map.
 *  - `computeFilingAdjustment` turns filed values plus what the books accrued
 *    into the per-account true-up the filing service posts.
 *
 * Keys are stable identifiers stored in TaxFiling.formDataJson — don't rename
 * them without migrating saved returns.
 */

import { NY_RSF_RATE } from './payrollCalculations';
import {
  SS_RATE_COMBINED,
  MEDICARE_RATE_COMBINED,
  ADDITIONAL_MEDICARE_RATE,
  type Form941Result,
} from './form941';
import type { Nys45Result } from './nys45';

export type ReturnFormType = '941' | 'nys45';
export type LineKind = 'money' | 'count' | 'rate';
export type ReturnValues = Record<string, number>;
export type ReturnOverrides = Record<string, number>;

export interface ReturnLineDef {
  key: string;
  kind: LineKind;
  /** Recalculated from earlier lines unless this line itself is overridden. */
  derive?: (v: ReturnValues) => number;
}

/** Shape persisted in TaxFiling.formDataJson. */
export interface SavedReturn {
  version: 1;
  overrides: ReturnOverrides;
  /** The full return as saved (filed returns are frozen at these values). */
  values: ReturnValues;
  /** What CV Books computed from payroll at the time of saving. */
  computed: ReturnValues;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function normalize(kind: LineKind, n: number): number {
  if (kind === 'count') return Math.max(0, Math.round(n));
  if (kind === 'rate') return Math.round(n * 1000) / 1000;
  return round2(n);
}

/**
 * Computed values, with the filer's overrides applied, and every derived line
 * that was not itself overridden recalculated in definition order.
 */
export function resolveReturn(
  defs: ReturnLineDef[],
  computed: ReturnValues,
  overrides: ReturnOverrides
): ReturnValues {
  const values: ReturnValues = { ...computed };
  for (const def of defs) {
    if (def.key in overrides) {
      values[def.key] = normalize(def.kind, overrides[def.key]);
    } else if (def.derive) {
      values[def.key] = normalize(def.kind, def.derive(values));
    }
  }
  return values;
}

/**
 * Validate an overrides map from the client: known keys only, finite numbers,
 * counts whole and non-negative, rates non-negative. Overrides equal to the
 * computed value are kept — the filer may want to pin a derived line.
 */
export function sanitizeOverrides(
  defs: ReturnLineDef[],
  raw: unknown
): { ok: true; overrides: ReturnOverrides } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, overrides: {} };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'overrides must be an object of line → amount' };
  }
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const overrides: ReturnOverrides = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const def = byKey.get(key);
    if (!def) return { ok: false, error: `Unknown line "${key}"` };
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      return { ok: false, error: `Line "${key}" must be a number` };
    }
    if (def.kind === 'count' && (value < 0 || !Number.isInteger(value))) {
      return { ok: false, error: `Line "${key}" must be a whole number of employees` };
    }
    if (def.kind === 'rate' && value < 0) {
      return { ok: false, error: `Line "${key}" cannot be negative` };
    }
    if (Math.abs(value) >= 1e10) return { ok: false, error: `Line "${key}" is out of range` };
    overrides[key] = value;
  }
  return { ok: true, overrides };
}

/** Keys whose resolved value differs from the computed one. */
export function changedKeys(values: ReturnValues, computed: ReturnValues): string[] {
  return Object.keys(values).filter((k) => Math.abs((values[k] ?? 0) - (computed[k] ?? 0)) >= 0.005);
}

export function parseSavedReturn(json: string | null | undefined): SavedReturn | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    if (parsed && parsed.version === 1 && parsed.overrides && parsed.values) return parsed as SavedReturn;
  } catch {
    // Corrupt JSON is treated as no saved return rather than breaking the page.
  }
  return null;
}

/**
 * The return as it currently stands for a quarter. A filed return is frozen at
 * the values it was filed with; a draft re-applies its overrides to freshly
 * computed values, so payroll run after the draft was saved still flows in.
 * Overrides for lines that no longer exist (an employee who dropped out of
 * Part C) are discarded.
 */
export function currentReturn(
  defs: ReturnLineDef[],
  computed: ReturnValues,
  filing: { status: string; formDataJson: string | null } | null
): { values: ReturnValues; overrides: ReturnOverrides; frozen: boolean; savedComputed: ReturnValues | null } {
  const saved = parseSavedReturn(filing?.formDataJson);
  if (filing?.status === 'filed' && saved) {
    return { values: saved.values, overrides: saved.overrides, frozen: true, savedComputed: saved.computed };
  }
  const known = new Set(defs.map((d) => d.key));
  const overrides: ReturnOverrides = {};
  for (const [k, v] of Object.entries(saved?.overrides ?? {})) {
    if (known.has(k)) overrides[k] = v;
  }
  return {
    values: resolveReturn(defs, computed, overrides),
    overrides,
    frozen: false,
    savedComputed: saved?.computed ?? null,
  };
}

// ---------------------------------------------------------------------------
// Prior payroll provider
// ---------------------------------------------------------------------------

/**
 * Lines that are not on the form: how much of the return's deposits line a
 * prior payroll service paid. A company that switches providers mid-quarter
 * files one return for the whole quarter, so its liability lines include
 * paychecks the old provider ran and its deposits line includes the old
 * provider's deposits — none of which went through CV Books. The true-up
 * leaves those deposits out of each liability account's target (filed
 * liability − prior-provider deposits), so the payments recorded in CV Books
 * clear the account exactly. Whatever the old provider withheld but did not
 * deposit is still owed on this return, which is why the deposits — not the
 * old provider's share of the liability lines — are what the books subtract.
 *
 * Stored with the return like any other line. Returns saved before these
 * existed lack the keys, so readers default them to 0.
 */
export const PRIOR_PROVIDER_KEYS = {
  /** Portion of NYS-45 line 15 (NYS-1 payments). */
  nys45: { withholding: 'priorLine15' },
  /** Portion of 941 line 13 (deposits), by the account each one cleared. */
  '941': {
    federalIncomeTax: 'priorLine13Fit',
    socialSecurity: 'priorLine13Ss',
    medicare: 'priorLine13Medicare',
  },
} as const;

const prior = (v: ReturnValues, key: string) => v[key] ?? 0;

/** Prior-provider amounts must be non-negative and fit inside their deposits line. */
export function priorProviderError(formType: ReturnFormType, v: ReturnValues): string | null {
  const keys = Object.values(PRIOR_PROVIDER_KEYS[formType]) as string[];
  if (keys.some((k) => prior(v, k) < 0)) return 'Prior payroll provider amounts cannot be negative';
  const total = round2(keys.reduce((s, k) => s + prior(v, k), 0));
  const [line, label] = formType === 'nys45' ? ['line15', 'line 15 (NYS-1 payments)'] : ['line13', 'line 13 (deposits)'];
  if (total > round2(v[line] ?? 0)) {
    return `Deposits by a prior payroll provider (${total.toFixed(2)}) are more than ${label} — enter the filed ${label} first`;
  }
  return null;
}

// ---------------------------------------------------------------------------
// NYS-45
// ---------------------------------------------------------------------------

export const NYS45_PART_C_COLUMNS = ['f', 'g', 'h', 'i', 'j'] as const;
export type Nys45PartCColumn = (typeof NYS45_PART_C_COLUMNS)[number];

export function nys45PartCKey(employeeId: string, column: Nys45PartCColumn): string {
  return `c:${employeeId}:${column}`;
}

/**
 * Line definitions for one NYS-45, in evaluation order. Part C comes first
 * because lines 1 and 24 are its totals.
 */
export function nys45LineDefs(employeeIds: string[]): ReturnLineDef[] {
  const sumColumn = (v: ReturnValues, ...cols: Nys45PartCColumn[]) =>
    employeeIds.reduce(
      (s, id) => s + cols.reduce((c, col) => c + (v[nys45PartCKey(id, col)] ?? 0), 0),
      0
    );

  const partC: ReturnLineDef[] = employeeIds.flatMap((id) =>
    NYS45_PART_C_COLUMNS.map((col) => ({ key: nys45PartCKey(id, col), kind: 'money' as const }))
  );

  return [
    ...partC,
    { key: 'countA', kind: 'count' },
    { key: 'countB', kind: 'count' },
    { key: 'countC', kind: 'count' },
    // Part A — UI
    { key: 'line1', kind: 'money', derive: (v) => sumColumn(v, 'f') },
    { key: 'line2', kind: 'money' },
    { key: 'line3', kind: 'money', derive: (v) => v.line1 - v.line2 },
    { key: 'line4aRate', kind: 'rate' },
    { key: 'line4', kind: 'money', derive: (v) => v.line3 * (v.line4aRate / 100) },
    { key: 'line5', kind: 'money', derive: (v) => v.line3 * NY_RSF_RATE },
    { key: 'line6', kind: 'money', derive: (v) => v.line4 + v.line5 },
    { key: 'line7', kind: 'money' },
    { key: 'line8', kind: 'money', derive: (v) => v.line6 + v.line7 },
    { key: 'line9', kind: 'money' },
    { key: 'line10', kind: 'money', derive: (v) => Math.max(0, v.line8 - v.line9) },
    { key: 'line11', kind: 'money', derive: (v) => Math.max(0, v.line9 - v.line8) },
    // Part C line 24 feeds Part B line 13.
    { key: 'line24', kind: 'money', derive: (v) => sumColumn(v, 'h', 'i', 'j') },
    // Part B — withholding
    { key: 'line13', kind: 'money', derive: (v) => v.line24 },
    { key: 'line14', kind: 'money' },
    { key: 'line15', kind: 'money' },
    { key: PRIOR_PROVIDER_KEYS.nys45.withholding, kind: 'money' },
    { key: 'line16', kind: 'money' },
    { key: 'line17', kind: 'money', derive: (v) => v.line14 + v.line15 + v.line16 },
    { key: 'line18', kind: 'money' },
    { key: 'line19', kind: 'money', derive: (v) => v.line17 - v.line18 },
    { key: 'line20', kind: 'money', derive: (v) => Math.max(0, v.line13 - v.line19) },
    { key: 'line21', kind: 'money', derive: (v) => Math.max(0, v.line19 - v.line13) },
    { key: 'line22', kind: 'money', derive: (v) => v.line10 + v.line20 },
  ];
}

export function nys45ComputedValues(r: Nys45Result): ReturnValues {
  const values: ReturnValues = {};
  for (const row of r.partC) {
    values[nys45PartCKey(row.employeeId, 'f')] = row.uiRemuneration;
    values[nys45PartCKey(row.employeeId, 'g')] = row.grossFederalWages;
    values[nys45PartCKey(row.employeeId, 'h')] = row.nysTaxWithheld;
    values[nys45PartCKey(row.employeeId, 'i')] = row.nycTaxWithheld;
    values[nys45PartCKey(row.employeeId, 'j')] = row.yonkersTaxWithheld;
  }
  const { partA, partB } = r;
  Object.assign(values, {
    countA: partA.employeeCounts[0],
    countB: partA.employeeCounts[1],
    countC: partA.employeeCounts[2],
    line1: partA.line1TotalRemuneration,
    line2: partA.line2ExcessRemuneration,
    line3: partA.line3WagesSubjectToContribution,
    line4aRate: partA.line4aUiRate,
    line4: partA.line4UiContributionsDue,
    line5: partA.line5ReemploymentServiceFund,
    line6: partA.line6Subtotal,
    // Lines 7, 9, 14, 16 and 18 depend on prior returns CV Books never sees.
    line7: 0,
    line8: partA.line6Subtotal,
    line9: 0,
    line10: partA.line6Subtotal,
    line11: 0,
    line24: partB.line24TotalAllTaxWithheld,
    line13: partB.line13TotalTaxWithheld,
    line14: 0,
    line15: partB.line15Nys1Payments,
    [PRIOR_PROVIDER_KEYS.nys45.withholding]: 0,
    line16: 0,
    line17: partB.line17TotalPayments,
    line18: 0,
    line19: partB.line17TotalPayments,
    line20: partB.line20TotalWtDue,
    line21: partB.line21TotalWtOverpaid,
    line22: round2(partA.line6Subtotal + partB.line20TotalWtDue),
  });
  return values;
}

// ---------------------------------------------------------------------------
// Form 941
// ---------------------------------------------------------------------------

export const FORM941_LINE_DEFS: ReturnLineDef[] = [
  { key: 'line1', kind: 'count' },
  { key: 'line2', kind: 'money' },
  { key: 'line3', kind: 'money' },
  { key: 'line5aWages', kind: 'money' },
  { key: 'line5aTax', kind: 'money', derive: (v) => v.line5aWages * SS_RATE_COMBINED },
  { key: 'line5bWages', kind: 'money' },
  { key: 'line5bTax', kind: 'money', derive: (v) => v.line5bWages * SS_RATE_COMBINED },
  { key: 'line5cWages', kind: 'money' },
  { key: 'line5cTax', kind: 'money', derive: (v) => v.line5cWages * MEDICARE_RATE_COMBINED },
  { key: 'line5dWages', kind: 'money' },
  { key: 'line5dTax', kind: 'money', derive: (v) => v.line5dWages * ADDITIONAL_MEDICARE_RATE },
  {
    key: 'line5e',
    kind: 'money',
    derive: (v) => v.line5aTax + v.line5bTax + v.line5cTax + v.line5dTax,
  },
  { key: 'line5f', kind: 'money' },
  { key: 'line6', kind: 'money', derive: (v) => v.line3 + v.line5e + v.line5f },
  { key: 'line7', kind: 'money' },
  { key: 'line8', kind: 'money' },
  { key: 'line9', kind: 'money' },
  { key: 'line10', kind: 'money', derive: (v) => v.line6 + v.line7 + v.line8 + v.line9 },
  { key: 'line11', kind: 'money' },
  { key: 'line12', kind: 'money', derive: (v) => v.line10 - v.line11 },
  { key: 'line13', kind: 'money' },
  { key: PRIOR_PROVIDER_KEYS['941'].federalIncomeTax, kind: 'money' },
  { key: PRIOR_PROVIDER_KEYS['941'].socialSecurity, kind: 'money' },
  { key: PRIOR_PROVIDER_KEYS['941'].medicare, kind: 'money' },
  { key: 'line14', kind: 'money', derive: (v) => Math.max(0, v.line12 - v.line13) },
  { key: 'line15', kind: 'money', derive: (v) => Math.max(0, v.line13 - v.line12) },
  // Part 2 line 16 — monthly liabilities (monthly depositors only).
  { key: 'month1', kind: 'money' },
  { key: 'month2', kind: 'money' },
  { key: 'month3', kind: 'money' },
  { key: 'monthTotal', kind: 'money', derive: (v) => v.month1 + v.month2 + v.month3 },
];

export function form941ComputedValues(r: Form941Result): ReturnValues {
  const l = r.lines;
  return {
    line1: l.line1EmployeeCount,
    line2: l.line2Wages,
    line3: l.line3FederalTaxWithheld,
    line5aWages: l.line5aSocialSecurityWages,
    line5aTax: l.line5aTax,
    line5bWages: l.line5bTipsWages,
    line5bTax: l.line5bTax,
    line5cWages: l.line5cMedicareWages,
    line5cTax: l.line5cTax,
    line5dWages: l.line5dAdditionalMedicareWages,
    line5dTax: l.line5dTax,
    line5e: l.line5eTotal,
    line5f: l.line5fSection3121q,
    line6: l.line6TotalBeforeAdjustments,
    line7: l.line7FractionsOfCents,
    line8: l.line8SickPay,
    line9: l.line9TipsAndGroupLife,
    line10: l.line10TotalAfterAdjustments,
    line11: l.line11NonrefundableCredits,
    line12: l.line12TotalAfterCredits,
    line13: l.line13TotalDeposits,
    [PRIOR_PROVIDER_KEYS['941'].federalIncomeTax]: 0,
    [PRIOR_PROVIDER_KEYS['941'].socialSecurity]: 0,
    [PRIOR_PROVIDER_KEYS['941'].medicare]: 0,
    line14: l.line14BalanceDue,
    line15: l.line15Overpayment,
    month1: r.monthlyLiabilities[0]?.liability ?? 0,
    month2: r.monthlyLiabilities[1]?.liability ?? 0,
    month3: r.monthlyLiabilities[2]?.liability ?? 0,
    monthTotal: r.monthlyTotal,
  };
}

// ---------------------------------------------------------------------------
// Books: filed return → liability true-up
// ---------------------------------------------------------------------------

/** Liability accounts each return settles (codes hardcoded by the payroll → JE bridge). */
export const RETURN_LIABILITY_CODES: Record<ReturnFormType, string[]> = {
  '941': ['2110', '2130', '2140'],
  nys45: ['2120', '2160'],
};

/** Expense account that absorbs filed-vs-accrued differences. */
export const PAYROLL_TAX_ADJUSTMENTS_CODE = '6020';

export interface AdjustmentLine {
  code: string;
  label: string;
  /** What payroll accrued to the account for the quarter (credit balance). */
  booked: number;
  /** What the filed return says the quarter's liability is. */
  filed: number;
  /** filed − booked: positive credits the liability, negative debits it. */
  amount: number;
  /** Which return lines the filed figure comes from. */
  basis: string;
}

/**
 * Per-account true-up so each liability account's quarter accrual equals the
 * filed return. `accruals` is the quarter's net credit to each account from
 * everything except tax payments.
 *
 * 941: line 3 maps to 2110 alone. Social Security and Medicare are settled as
 * one pool (line 12 − line 3) so line 7's fractions-of-cents — which by
 * definition reconcile the rate arithmetic to what was actually withheld —
 * do not churn pennies between 2130 and 2140. Changes the filer made to the
 * Social Security lines (5a/5b) go to 2130; the rest of the pool goes to 2140.
 *
 * Deposits a prior payroll provider made (PRIOR_PROVIDER_KEYS) come off each
 * account's target. On a 941 the old provider's paychecks show up as an edit to
 * 5a, so its Social Security deposits offset that edit on 2130.
 */
export function computeFilingAdjustment(
  formType: ReturnFormType,
  values: ReturnValues,
  computed: ReturnValues,
  accruals: Record<string, number>
): AdjustmentLine[] {
  const acc = (code: string) => round2(accruals[code] ?? 0);
  const line = (code: string, label: string, filed: number, basis: string): AdjustmentLine => ({
    code,
    label,
    booked: acc(code),
    filed: round2(filed),
    amount: round2(filed - acc(code)),
    basis,
  });

  const lessPrior = (basis: string, amount: number, what: string) =>
    amount ? `${basis}, less ${what} paid by prior payroll provider` : basis;

  if (formType === 'nys45') {
    const priorWt = prior(values, PRIOR_PROVIDER_KEYS.nys45.withholding);
    return [
      line('2160', 'NY UI contributions + RSF', values.line8 - values.line9, 'Part A line 8 − line 9'),
      line(
        '2120',
        'NY / NYC / Yonkers tax withheld',
        values.line13 - priorWt,
        lessPrior('Part B line 13', priorWt, 'NYS-1')
      ),
    ];
  }

  const keys = PRIOR_PROVIDER_KEYS['941'];
  const priorFit = prior(values, keys.federalIncomeTax);
  const priorSs = prior(values, keys.socialSecurity);
  const priorMed = prior(values, keys.medicare);

  const fit = line('2110', 'Federal income tax withheld', values.line3 - priorFit, lessPrior('Line 3', priorFit, 'deposits'));
  const poolFiled = round2(values.line12 - values.line3 - priorSs - priorMed);
  const poolDiff = round2(poolFiled - acc('2130') - acc('2140'));
  const ssEdit = round2(
    values.line5aTax + values.line5bTax - (computed.line5aTax ?? 0) - (computed.line5bTax ?? 0)
  );
  const ssAmount = round2(ssEdit - priorSs);
  const medAmount = round2(poolDiff - ssAmount);
  return [
    fit,
    {
      code: '2130',
      label: 'Social Security (employee + employer)',
      booked: acc('2130'),
      filed: round2(acc('2130') + ssAmount),
      amount: ssAmount,
      basis: lessPrior('Lines 5a + 5b as filed', priorSs, 'deposits'),
    },
    {
      code: '2140',
      label: 'Medicare (employee + employer) and other line 5–11 items',
      booked: acc('2140'),
      filed: round2(acc('2140') + medAmount),
      amount: medAmount,
      basis: lessPrior('Line 12 − line 3, less Social Security', priorMed, 'Medicare deposits'),
    },
  ];
}

/** Lines that actually move money (amount ≥ half a cent). */
export function materialAdjustments(lines: AdjustmentLine[]): AdjustmentLine[] {
  return lines.filter((l) => Math.abs(l.amount) >= 0.005);
}

/** Breakdown of the balance due on the filed return, keyed like TaxDeposit columns. */
export interface PaymentComponents {
  federalIncomeTaxWithheld: number;
  socialSecurityTax: number;
  medicareTax: number;
  stateIncomeTaxWithheld: number;
  stateUnemploymentTax: number;
}

export const ZERO_PAYMENT: PaymentComponents = {
  federalIncomeTaxWithheld: 0,
  socialSecurityTax: 0,
  medicareTax: 0,
  stateIncomeTaxWithheld: 0,
  stateUnemploymentTax: 0,
};

/**
 * Suggested payment for the balance due on the filed return.
 *
 * NYS-45: the return itself splits the remittance — line 10 (UI) and line 20
 * (withholding), which add to line 22.
 * 941: line 14 is a single figure, so it is split by what each liability
 * account still owes after the true-up and the deposits already recorded.
 */
export function suggestedPayment(
  formType: ReturnFormType,
  values: ReturnValues,
  adjustments: AdjustmentLine[],
  recordedDeposits: { federalIncomeTax: number; socialSecurity: number; medicare: number }
): { components: PaymentComponents; total: number; returnBalanceDue: number } {
  if (formType === 'nys45') {
    const components = {
      ...ZERO_PAYMENT,
      stateUnemploymentTax: round2(values.line10),
      stateIncomeTaxWithheld: round2(values.line20),
    };
    return { components, total: round2(values.line10 + values.line20), returnBalanceDue: round2(values.line22) };
  }
  const filedBy = new Map(adjustments.map((a) => [a.code, a.filed]));
  const remaining = (code: string, paid: number) => round2(Math.max(0, (filedBy.get(code) ?? 0) - paid));
  const components = {
    ...ZERO_PAYMENT,
    federalIncomeTaxWithheld: remaining('2110', recordedDeposits.federalIncomeTax),
    socialSecurityTax: remaining('2130', recordedDeposits.socialSecurity),
    medicareTax: remaining('2140', recordedDeposits.medicare),
  };
  const total = round2(
    components.federalIncomeTaxWithheld + components.socialSecurityTax + components.medicareTax
  );
  return { components, total, returnBalanceDue: round2(values.line14) };
}

/** Snapshot figures stored on TaxFiling for the filings list and reminders. */
export function filingTotals(
  formType: ReturnFormType,
  v: ReturnValues
): { totalLiability: number; totalDeposits: number; balanceDue: number } {
  if (formType === 'nys45') {
    return {
      totalLiability: round2(v.line6 + v.line13),
      totalDeposits: round2(v.line19),
      balanceDue: round2(v.line22),
    };
  }
  return {
    totalLiability: round2(v.line12),
    totalDeposits: round2(v.line13),
    balanceDue: round2(v.line14 - v.line15),
  };
}
