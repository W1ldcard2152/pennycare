/**
 * Payroll-tax liability by tax period — what a quarter accrued, what has been
 * paid FOR that quarter, and what is still owed.
 *
 * Payments are attributed by the period they were recorded for
 * (TaxDeposit.taxPeriodYear / taxPeriodQuarter), never by the date they were
 * made. Deposits routinely land in the quarter after the liability — June's
 * withholding is paid in July — so filtering ledger lines by date credits that
 * payment to the wrong quarter: the earlier quarter looks unpaid forever and
 * the later one looks paid before it is. Accruals, on the other hand, ARE
 * dated by the payroll that created them, so they are taken from the ledger
 * by date.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { JE_STATUS } from './je-status';
import { startOfDay, endOfDay } from './date-utils';

type Db = Prisma.TransactionClient;

export type LiabilityScope = 'federal' | 'state';

/** Liability accounts per scope (codes hardcoded by the payroll → JE bridge). */
export const SCOPE_ACCOUNTS: Record<LiabilityScope, string[]> = {
  federal: ['2110', '2130', '2140'],
  state: ['2120', '2160', '2170', '2180'],
};

/** TaxDeposit breakdown column → liability account it clears (mirrors createTaxDepositJournalEntry). */
export const DEPOSIT_COLUMN_ACCOUNT = {
  federalIncomeTaxWithheld: '2110',
  socialSecurityTax: '2130',
  medicareTax: '2140',
  additionalMedicareTax: '2140',
  stateIncomeTaxWithheld: '2120',
  stateUnemploymentTax: '2160',
  stateDisabilityTax: '2170',
  statePaidFamilyLeaveTax: '2180',
} as const;

type DepositColumn = keyof typeof DEPOSIT_COLUMN_ACCOUNT;

/** Sources that settle or carry in a liability rather than accrue it. */
const NON_ACCRUAL_SOURCES = ['tax_deposit', 'opening_balance'];

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** Calendar bounds of a quarter (1–4), or of the whole year when quarter is null. */
export function periodBounds(year: number, quarter: number | null): { start: Date; end: Date } {
  const startMonth = quarter ? (quarter - 1) * 3 + 1 : 1;
  const endMonth = quarter ? quarter * 3 : 12;
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  const mm = (m: number) => String(m).padStart(2, '0');
  return {
    start: startOfDay(`${year}-${mm(startMonth)}-01`),
    end: endOfDay(`${year}-${mm(endMonth)}-${String(lastDay).padStart(2, '0')}`),
  };
}

/** The quarter (1–4) a business date falls in. Business dates are noon UTC. */
export function quarterOfBusinessDate(d: Date): number {
  return Math.floor(d.getUTCMonth() / 3) + 1;
}

/**
 * Net credit each account received in the period from everything that accrues
 * it — payroll, filing adjustments, corrections, reclassifications — but not
 * tax payments or opening balances (nor reversals of those).
 */
export async function getPeriodAccruals(
  db: Db,
  companyId: string,
  codes: string[],
  start: Date,
  end: Date,
  excludeEntryId: string | null = null
): Promise<Record<string, number>> {
  const accounts = await db.account.findMany({
    where: { companyId, code: { in: codes } },
    select: { id: true, code: true },
  });
  if (accounts.length === 0) return {};
  const codeById = new Map(accounts.map((a) => [a.id, a.code]));

  const lines = await db.journalEntryLine.findMany({
    where: {
      accountId: { in: accounts.map((a) => a.id) },
      journalEntry: {
        companyId,
        status: JE_STATUS.BOOKED,
        date: { gte: start, lte: end },
        source: { notIn: NON_ACCRUAL_SOURCES },
        ...(excludeEntryId && { id: { not: excludeEntryId } }),
        // A reversal of a payment is still a payment.
        OR: [
          { reversesEntryId: null },
          { reversesEntry: { is: { source: { notIn: NON_ACCRUAL_SOURCES } } } },
        ],
      },
    },
    select: { accountId: true, debit: true, credit: true },
  });

  const accruals: Record<string, number> = {};
  for (const line of lines) {
    const code = codeById.get(line.accountId)!;
    accruals[code] = (accruals[code] ?? 0) + line.credit - line.debit;
  }
  for (const code of Object.keys(accruals)) accruals[code] = round2(accruals[code]);
  return accruals;
}

/**
 * Recorded (not voided) payments made FOR the period, by the account each
 * clears. A null quarter means the whole year: every deposit for that year.
 */
export async function getPeriodPayments(
  db: Db,
  companyId: string,
  year: number,
  quarter: number | null
): Promise<Record<string, number>> {
  const deposits = await db.taxDeposit.findMany({
    where: {
      companyId,
      status: 'recorded',
      taxPeriodYear: year,
      ...(quarter && { taxPeriodQuarter: `Q${quarter}` }),
    },
    select: {
      federalIncomeTaxWithheld: true,
      socialSecurityTax: true,
      medicareTax: true,
      additionalMedicareTax: true,
      stateIncomeTaxWithheld: true,
      stateUnemploymentTax: true,
      stateDisabilityTax: true,
      statePaidFamilyLeaveTax: true,
    },
  });
  return sumPaymentsByAccount(deposits);
}

/** Pure: TaxDeposit rows → amount paid per liability account. */
export function sumPaymentsByAccount(deposits: Array<Partial<Record<DepositColumn, number>>>): Record<string, number> {
  const paid: Record<string, number> = {};
  for (const d of deposits) {
    for (const [column, code] of Object.entries(DEPOSIT_COLUMN_ACCOUNT) as [DepositColumn, string][]) {
      const amount = d[column] ?? 0;
      if (amount) paid[code] = (paid[code] ?? 0) + amount;
    }
  }
  for (const code of Object.keys(paid)) paid[code] = round2(paid[code]);
  return paid;
}

export interface PeriodLiability {
  year: number;
  quarter: number | null;
  accrued: number;
  paid: number;
  /** accrued − paid; negative means the period is overpaid. */
  outstanding: number;
  byAccount: Record<string, { accrued: number; paid: number; outstanding: number }>;
}

/** Pure: combine accruals and payments for the scope's accounts. */
export function combinePeriodLiability(
  year: number,
  quarter: number | null,
  codes: string[],
  accrued: Record<string, number>,
  paid: Record<string, number>
): PeriodLiability {
  const byAccount: PeriodLiability['byAccount'] = {};
  for (const code of codes) {
    const a = round2(accrued[code] ?? 0);
    const p = round2(paid[code] ?? 0);
    byAccount[code] = { accrued: a, paid: p, outstanding: round2(a - p) };
  }
  const sum = (pick: (v: { accrued: number; paid: number; outstanding: number }) => number) =>
    round2(Object.values(byAccount).reduce((s, v) => s + pick(v), 0));
  return {
    year,
    quarter,
    accrued: sum((v) => v.accrued),
    paid: sum((v) => v.paid),
    outstanding: sum((v) => v.outstanding),
    byAccount,
  };
}

export async function getPeriodLiability(
  companyId: string,
  scope: LiabilityScope,
  year: number,
  quarter: number | null,
  db: Db = prisma
): Promise<PeriodLiability> {
  const codes = SCOPE_ACCOUNTS[scope];
  const { start, end } = periodBounds(year, quarter);
  const [accrued, paid] = await Promise.all([
    getPeriodAccruals(db, companyId, codes, start, end),
    getPeriodPayments(db, companyId, year, quarter),
  ]);
  return combinePeriodLiability(year, quarter, codes, accrued, paid);
}

/**
 * Pure: the deposit breakdown that pays off a period — each account's
 * outstanding balance, floored at zero (an overpaid account contributes
 * nothing). Keys match the TaxDeposit columns / deposit form fields.
 */
export function depositBreakdown(liability: PeriodLiability) {
  const owed = (code: string) => round2(Math.max(0, liability.byAccount[code]?.outstanding ?? 0));
  const breakdown = {
    federalIncomeTaxWithheld: owed('2110'),
    socialSecurityTax: owed('2130'),
    medicareTax: owed('2140'),
    additionalMedicareTax: 0,
    stateIncomeTaxWithheld: owed('2120'),
    stateUnemploymentTax: owed('2160'),
    stateDisabilityTax: owed('2170'),
    statePaidFamilyLeaveTax: owed('2180'),
  };
  const total = round2(Object.values(breakdown).reduce((s, n) => s + n, 0));
  return { ...breakdown, total };
}

/** The `count` quarters ending with the one containing `today`, oldest first. */
export function recentQuarters(today: Date, count: number): Array<{ year: number; quarter: number }> {
  let year = today.getFullYear();
  let quarter = Math.floor(today.getMonth() / 3) + 1;
  const out: Array<{ year: number; quarter: number }> = [];
  for (let i = 0; i < count; i++) {
    out.unshift({ year, quarter });
    quarter -= 1;
    if (quarter === 0) {
      quarter = 4;
      year -= 1;
    }
  }
  return out;
}

/**
 * Pure: which period a new deposit most likely pays — the oldest recent
 * quarter that still has a balance owed, else the current quarter.
 */
export function suggestDepositPeriod(
  periods: PeriodLiability[],
  current: { year: number; quarter: number }
): { year: number; quarter: number } {
  const owed = periods.find((p) => p.quarter !== null && p.outstanding >= 0.01);
  return owed ? { year: owed.year, quarter: owed.quarter! } : current;
}
