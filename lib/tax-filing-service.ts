/**
 * Filing a quarterly return (Form 941 / NYS-45) — the server half of the
 * editable-returns feature (pure half: lib/tax-return-values.ts).
 *
 * The filed return is the source of truth for the books. Marking a return
 * filed, in one transaction:
 *   1. voids the adjusting entry from any earlier filing of the same return,
 *   2. measures what the quarter accrued to each liability account the return
 *      settles (everything except tax payments and opening balances),
 *   3. posts one system entry (source "tax_filing_adjustment", dated the last
 *      day of the quarter) moving each account to the filed figure, with the
 *      net difference in 6020 Payroll Tax Adjustments,
 *   4. optionally records the payment of the balance due as a TaxDeposit (and
 *      its journal entry) — after which each account nets to zero.
 *
 * Re-filing, unfiling, and voiding a filing all void its adjusting entry
 * through the JE service, so they need APPROVER+ once an entry exists and are
 * blocked by a closed fiscal year — the same guards as any other void.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from './db';
import { logAudit } from './audit';
import { createEntry, voidEntry, JournalEntryStateError, type Actor } from './journal-entry-service';
import { JE_STATUS } from './je-status';
import { getPeriodAccruals } from './tax-liability';
import { createTaxDepositJournalEntry, ensurePayrollAccounts } from './bookkeeping';
import { parseBusinessDate, formatDate } from './date-utils';
import { quarterBounds } from './nys45';
import { loadForm941, loadNys45 } from './tax-return-data';
import {
  FORM941_LINE_DEFS,
  PAYROLL_TAX_ADJUSTMENTS_CODE,
  RETURN_LIABILITY_CODES,
  changedKeys,
  computeFilingAdjustment,
  filingTotals,
  form941ComputedValues,
  materialAdjustments,
  parseSavedReturn,
  priorProviderError,
  nys45ComputedValues,
  nys45LineDefs,
  resolveReturn,
  round2,
  sanitizeOverrides,
  suggestedPayment,
  type AdjustmentLine,
  type PaymentComponents,
  type ReturnFormType,
  type ReturnLineDef,
  type ReturnOverrides,
  type ReturnValues,
  type SavedReturn,
} from './tax-return-values';

type Tx = Prisma.TransactionClient;

/** A filing request the caller can fix — mapped to a 4xx by the routes. */
export class TaxFilingError extends Error {
  constructor(
    message: string,
    public status = 400
  ) {
    super(message);
    this.name = 'TaxFilingError';
  }
}

/** Map service errors to an HTTP status + message; null for unexpected errors. */
export function describeFilingError(err: unknown): { status: number; message: string } | null {
  if (err instanceof TaxFilingError) return { status: err.status, message: err.message };
  if (err instanceof JournalEntryStateError) return { status: 409, message: err.message };
  // createEntry's closed-period guard throws a plain Error.
  if (err instanceof Error && err.message.startsWith('Cannot create journal entry')) {
    return { status: 409, message: err.message };
  }
  return null;
}

export const FORM_LABEL: Record<ReturnFormType, string> = { '941': 'Form 941', nys45: 'NYS-45' };

/** TaxDeposit.formReference of a payment recorded with the return (recordReturnPayment). */
const RETURN_PAYMENT_FORM_REFERENCE: Record<ReturnFormType, string> = { '941': 'Form 941', nys45: 'NYS-45' };

interface ReturnContext {
  defs: ReturnLineDef[];
  computed: ReturnValues;
  recordedDeposits: { federalIncomeTax: number; socialSecurity: number; medicare: number };
  filing: { id: string; status: string; adjustmentEntryId: string | null; formDataJson: string | null } | null;
}

async function loadContext(
  companyId: string,
  formType: ReturnFormType,
  year: number,
  quarter: number
): Promise<ReturnContext> {
  if (formType === 'nys45') {
    const d = await loadNys45(companyId, year, quarter);
    if (!d) throw new TaxFilingError('Company not found', 404);
    return {
      defs: nys45LineDefs(d.form45.partC.map((r) => r.employeeId)),
      computed: nys45ComputedValues(d.form45),
      recordedDeposits: { federalIncomeTax: 0, socialSecurity: 0, medicare: 0 },
      filing: d.filing,
    };
  }
  const d = await loadForm941(companyId, year, quarter);
  if (!d) throw new TaxFilingError('Company not found', 404);
  return {
    defs: FORM941_LINE_DEFS,
    computed: form941ComputedValues(d.form941),
    recordedDeposits: d.recordedDeposits,
    filing: d.filing,
  };
}

function resolveOverrides(ctx: ReturnContext, raw: unknown): { overrides: ReturnOverrides; values: ReturnValues } {
  const result = sanitizeOverrides(ctx.defs, raw);
  if (!result.ok) throw new TaxFilingError(result.error);
  return { overrides: result.overrides, values: resolveReturn(ctx.defs, ctx.computed, result.overrides) };
}

/** Checks that only matter once the return is complete (drafts may be mid-edit). */
function assertFileable(formType: ReturnFormType, values: ReturnValues) {
  const error = priorProviderError(formType, values);
  if (error) throw new TaxFilingError(error);
}

/**
 * Net credit each liability account the return settles received over the
 * quarter — see getPeriodAccruals for what counts as an accrual.
 */
export async function getQuarterAccruals(
  db: Tx,
  companyId: string,
  formType: ReturnFormType,
  year: number,
  quarter: number,
  excludeEntryId: string | null = null
): Promise<Record<string, number>> {
  const { start, end } = quarterBounds(year, quarter);
  return getPeriodAccruals(db, companyId, RETURN_LIABILITY_CODES[formType], start, end, excludeEntryId);
}

/** The last day of the quarter, as a business date (noon UTC). */
function quarterEndDate(year: number, quarter: number): Date {
  return parseBusinessDate(formatDate(quarterBounds(year, quarter).end));
}

// ---------------------------------------------------------------------------
// Preview
// ---------------------------------------------------------------------------

export interface FilingPreview {
  values: ReturnValues;
  computed: ReturnValues;
  changedLines: string[];
  adjustments: AdjustmentLine[];
  /** Entry from a previous filing of this return that filing again will void. */
  supersedesEntryId: string | null;
  payment: ReturnType<typeof suggestedPayment>;
  /** Payments already recorded with this return — filing again would add another. */
  returnPayments: Array<{ id: string; depositDate: string; totalAmount: number }>;
}

/** What filing with these overrides would do to the books — nothing is written. */
export async function previewFiling(
  companyId: string,
  formType: ReturnFormType,
  year: number,
  quarter: number,
  rawOverrides: unknown
): Promise<FilingPreview> {
  const ctx = await loadContext(companyId, formType, year, quarter);
  const { values } = resolveOverrides(ctx, rawOverrides);
  assertFileable(formType, values);
  const supersedes = await liveAdjustmentEntryId(prisma, ctx.filing?.adjustmentEntryId ?? null);
  const accruals = await getQuarterAccruals(prisma, companyId, formType, year, quarter, supersedes);
  const adjustments = computeFilingAdjustment(formType, values, ctx.computed, accruals);
  const returnPayments = (await listReturnPayments(prisma, companyId, formType, year, quarter)).filter(
    (d) => d.status === 'recorded'
  );
  return {
    values,
    computed: ctx.computed,
    changedLines: changedKeys(values, ctx.computed),
    adjustments,
    supersedesEntryId: supersedes,
    payment: suggestedPayment(formType, values, adjustments, ctx.recordedDeposits),
    returnPayments: returnPayments.map(({ id, depositDate, totalAmount }) => ({ id, depositDate, totalAmount })),
  };
}

export interface ReturnPayment {
  id: string;
  depositDate: string;
  totalAmount: number;
  paymentMethod: string;
  confirmationNumber: string | null;
  status: string;
}

/**
 * Payments recorded with a return (recordReturnPayment) for its quarter,
 * voided ones included — the form page lists both.
 */
export async function listReturnPayments(
  db: Tx | typeof prisma,
  companyId: string,
  formType: ReturnFormType,
  year: number,
  quarter: number
): Promise<ReturnPayment[]> {
  const rows = await db.taxDeposit.findMany({
    where: {
      companyId,
      formReference: RETURN_PAYMENT_FORM_REFERENCE[formType],
      taxPeriodYear: year,
      taxPeriodQuarter: `Q${quarter}`,
    },
    select: {
      id: true,
      depositDate: true,
      totalAmount: true,
      paymentMethod: true,
      confirmationNumber: true,
      status: true,
    },
    orderBy: { depositDate: 'asc' },
  });
  return rows.map((d) => ({ ...d, depositDate: formatDate(d.depositDate) }));
}

async function liveAdjustmentEntryId(db: Tx, entryId: string | null): Promise<string | null> {
  if (!entryId) return null;
  const entry = await db.journalEntry.findUnique({ where: { id: entryId }, select: { status: true } });
  return entry?.status === JE_STATUS.BOOKED ? entryId : null;
}

// ---------------------------------------------------------------------------
// Save draft
// ---------------------------------------------------------------------------

function serialize(saved: SavedReturn): string {
  return JSON.stringify(saved);
}

/** Save the filer's edits without filing. Rejected once the return is filed. */
export async function saveReturnDraft(
  actor: Actor,
  companyId: string,
  formType: ReturnFormType,
  year: number,
  quarter: number,
  rawOverrides: unknown
) {
  const ctx = await loadContext(companyId, formType, year, quarter);
  const { overrides, values } = resolveOverrides(ctx, rawOverrides);

  if (ctx.filing?.status === 'filed') {
    throw new TaxFilingError(
      `This ${FORM_LABEL[formType]} is already filed. Edit the filed return and file it again to change it — that also updates the books.`,
      409
    );
  }

  const formDataJson = serialize({ version: 1, overrides, values, computed: ctx.computed });
  const filing = ctx.filing
    ? await prisma.taxFiling.update({
        where: { id: ctx.filing.id },
        data: { status: 'pending', formDataJson },
      })
    : await prisma.taxFiling.create({
        data: { companyId, formType, year, quarter, status: 'pending', formDataJson },
      });

  await logAudit({
    companyId,
    userId: actor.userId,
    action: 'tax_filing.save_draft',
    entityType: 'TaxFiling',
    entityId: filing.id,
    metadata: { formType, year, quarter, overriddenLines: Object.keys(overrides) },
  });

  return filing;
}

// ---------------------------------------------------------------------------
// File
// ---------------------------------------------------------------------------

export interface FileReturnInput {
  formType: ReturnFormType;
  year: number;
  quarter: number;
  overrides: unknown;
  filedDate: string;
  filingMethod: string;
  confirmationNumber: string | null;
  notes: string | null;
  acknowledgedNoDeposits?: boolean;
  /** Record the payment sent with the return, in the same transaction. */
  payment?: {
    bankAccountId: string;
    depositDate: string;
    paymentMethod: string;
    confirmationNumber: string | null;
    components: PaymentComponents;
  } | null;
}

export async function fileReturn(actor: Actor, companyId: string, input: FileReturnInput) {
  const { formType, year, quarter } = input;
  const ctx = await loadContext(companyId, formType, year, quarter);
  const { overrides, values } = resolveOverrides(ctx, input.overrides);
  assertFileable(formType, values);
  const label = `${FORM_LABEL[formType]} Q${quarter} ${year}`;
  const totals = filingTotals(formType, values);

  if (input.payment) {
    const c = input.payment.components;
    const parts = [
      c.federalIncomeTaxWithheld,
      c.socialSecurityTax,
      c.medicareTax,
      c.stateIncomeTaxWithheld,
      c.stateUnemploymentTax,
    ];
    if (parts.some((n) => !Number.isFinite(n) || n < 0)) {
      throw new TaxFilingError('Payment amounts must be zero or more');
    }
    if (round2(parts.reduce((s, n) => s + n, 0)) <= 0) {
      throw new TaxFilingError('Enter a payment amount, or turn off "Record payment now"');
    }
  }

  return prisma.$transaction(
    async (tx) => {
      const existing = await tx.taxFiling.findFirst({
        where: { companyId, formType, year, quarter },
      });

      // 1. Supersede the previous filing's true-up.
      const supersedes = await liveAdjustmentEntryId(tx, existing?.adjustmentEntryId ?? null);
      if (supersedes) {
        await voidEntry(actor, supersedes, `Superseded: ${label} filed again with updated figures`, tx);
      }

      const formDataJson = serialize({ version: 1, overrides, values, computed: ctx.computed });
      const filingData = {
        status: 'filed',
        filedDate: parseBusinessDate(input.filedDate),
        filingMethod: input.filingMethod,
        confirmationNumber: input.confirmationNumber,
        notes: input.notes,
        ...totals,
        formDataJson,
        adjustmentEntryId: null,
      };
      let filing = existing
        ? await tx.taxFiling.update({ where: { id: existing.id }, data: filingData })
        : await tx.taxFiling.create({ data: { companyId, formType, year, quarter, ...filingData } });

      // 2–3. True the liability accounts up to the filed return.
      const { adjustments, entry: adjustmentEntry } = await postFilingAdjustment(
        tx, actor, companyId, formType, year, quarter, filing.id, values, ctx.computed
      );
      if (adjustmentEntry) {
        filing = await tx.taxFiling.update({
          where: { id: filing.id },
          data: { adjustmentEntryId: adjustmentEntry.id },
        });
      }

      // 4. Optional payment of the balance due.
      let deposit: { id: string; totalAmount: number } | null = null;
      if (input.payment) {
        deposit = await recordReturnPayment(tx, actor, companyId, formType, year, quarter, input.payment);
      }

      const changed = changedKeys(values, ctx.computed);
      await logAudit({
        tx,
        companyId,
        userId: actor.userId,
        action: input.acknowledgedNoDeposits
          ? 'tax_filing.mark_filed_without_deposits'
          : existing?.status === 'filed'
            ? 'tax_filing.refile'
            : 'tax_filing.create',
        entityType: 'TaxFiling',
        entityId: filing.id,
        before: existing ? { status: existing.status, formDataJson: existing.formDataJson } : undefined,
        after: { status: 'filed', formDataJson },
        metadata: {
          formType,
          year,
          quarter,
          ...totals,
          changedLines: Object.fromEntries(
            changed.map((k) => [k, { computed: ctx.computed[k] ?? 0, filed: values[k] }])
          ),
          adjustmentEntryNumber: adjustmentEntry?.entryNumber ?? null,
          supersededEntryId: supersedes,
          paymentDepositId: deposit?.id ?? null,
          ...(input.acknowledgedNoDeposits && { acknowledgedNoDeposits: true }),
        },
      });

      return { filing, adjustmentEntry, deposit, adjustments };
    },
    { timeout: 20000 }
  );
}

/**
 * Measure the quarter's accrual to each liability account and post the one
 * tax_filing_adjustment entry (dated the last day of the quarter) that moves
 * each to the filed figure, net difference to 6020. No entry when nothing is
 * material. Shared by filing and by moving a filing to another quarter.
 */
async function postFilingAdjustment(
  tx: Tx,
  actor: Actor,
  companyId: string,
  formType: ReturnFormType,
  year: number,
  quarter: number,
  filingId: string,
  values: ReturnValues,
  computed: ReturnValues
): Promise<{ adjustments: AdjustmentLine[]; entry: { id: string; entryNumber: number } | null }> {
  const accruals = await getQuarterAccruals(tx, companyId, formType, year, quarter);
  const adjustments = computeFilingAdjustment(formType, values, computed, accruals);
  const material = materialAdjustments(adjustments);
  if (material.length === 0) return { adjustments, entry: null };

  const codes = [...material.map((a) => a.code), PAYROLL_TAX_ADJUSTMENTS_CODE];
  const accountIds = await ensurePayrollAccounts(companyId, codes, tx);
  const lines = material.map((a) => ({
    accountId: accountIds.get(a.code)!,
    description: `${a.label}: filed ${a.filed.toFixed(2)} vs accrued ${a.booked.toFixed(2)} (${a.basis})`,
    debit: a.amount < 0 ? round2(-a.amount) : 0,
    credit: a.amount > 0 ? a.amount : 0,
  }));
  const net = round2(material.reduce((s, a) => s + a.amount, 0));
  if (net !== 0) {
    lines.push({
      accountId: accountIds.get(PAYROLL_TAX_ADJUSTMENTS_CODE)!,
      description: `Difference between accrued payroll taxes and filed ${FORM_LABEL[formType]}`,
      debit: net > 0 ? net : 0,
      credit: net < 0 ? round2(-net) : 0,
    });
  }
  const entry = await createEntry(
    actor,
    {
      companyId,
      date: quarterEndDate(year, quarter),
      memo: `${FORM_LABEL[formType]} Q${quarter} ${year} — adjust payroll tax liabilities to filed return`,
      source: 'tax_filing_adjustment',
      sourceId: filingId,
      lines,
    },
    tx
  );
  return { adjustments, entry: { id: entry.id, entryNumber: entry.entryNumber } };
}

async function recordReturnPayment(
  tx: Tx,
  actor: Actor,
  companyId: string,
  formType: ReturnFormType,
  year: number,
  quarter: number,
  payment: NonNullable<FileReturnInput['payment']>
) {
  const bank = await tx.account.findFirst({
    where: { id: payment.bankAccountId, companyId, type: 'asset' },
    select: { id: true },
  });
  if (!bank) throw new TaxFilingError('Payment account not found or is not an asset account');

  const c = payment.components;
  const isNy = formType === 'nys45';
  const amounts = {
    federalIncomeTaxWithheld: isNy ? 0 : round2(c.federalIncomeTaxWithheld),
    socialSecurityTax: isNy ? 0 : round2(c.socialSecurityTax),
    medicareTax: isNy ? 0 : round2(c.medicareTax),
    additionalMedicareTax: 0,
    stateIncomeTaxWithheld: isNy ? round2(c.stateIncomeTaxWithheld) : 0,
    stateUnemploymentTax: isNy ? round2(c.stateUnemploymentTax) : 0,
    stateDisabilityTax: 0,
    statePaidFamilyLeaveTax: 0,
  };
  const totalAmount = round2(Object.values(amounts).reduce((s, n) => s + n, 0));
  if (totalAmount <= 0) throw new TaxFilingError('Enter a payment amount, or turn off "Record payment now"');

  // The NYS-45 remittance carries UI and withholding together. Its
  // formReference keeps it out of line 15 (NYS-1 payments) on later loads.
  const created = await tx.taxDeposit.create({
    data: {
      companyId,
      taxAuthority: isNy ? 'ny_sui' : 'federal_941',
      formReference: RETURN_PAYMENT_FORM_REFERENCE[formType],
      taxPeriodYear: year,
      taxPeriodQuarter: `Q${quarter}`,
      depositDate: parseBusinessDate(payment.depositDate),
      paymentMethod: payment.paymentMethod,
      confirmationNumber: payment.confirmationNumber,
      ...amounts,
      totalAmount,
      notes: `Paid with ${FORM_LABEL[formType]} Q${quarter} ${year}`,
      createdBy: actor.userId,
    },
  });

  const { journalEntryId } = await createTaxDepositJournalEntry(
    tx,
    companyId,
    created.id,
    {
      taxAuthority: created.taxAuthority,
      depositDate: created.depositDate,
      formReference: created.formReference,
      taxPeriodYear: created.taxPeriodYear,
      taxPeriodQuarter: created.taxPeriodQuarter,
      ...amounts,
      totalAmount,
    },
    payment.bankAccountId,
    actor
  );

  await tx.taxDeposit.update({ where: { id: created.id }, data: { journalEntryId } });

  await logAudit({
    tx,
    companyId,
    userId: actor.userId,
    action: 'tax_deposit.create',
    entityType: 'TaxDeposit',
    entityId: created.id,
    metadata: {
      taxAuthority: created.taxAuthority,
      formReference: created.formReference,
      taxPeriodYear: year,
      taxPeriodQuarter: `Q${quarter}`,
      totalAmount,
      journalEntryId,
      recordedWithFiling: true,
    },
  });

  return { id: created.id, totalAmount };
}

// ---------------------------------------------------------------------------
// Unfile / void
// ---------------------------------------------------------------------------

/**
 * Take a filing back. `unfile` returns it to an unfiled state — keeping the
 * filer's edits as a draft when there are any — and `void` marks it recorded
 * in error. Either way its adjusting entry is voided; payments recorded with
 * it are real money and are left alone (void them under Tax Deposits).
 */
export async function withdrawFiling(
  actor: Actor,
  companyId: string,
  filingId: string,
  mode: 'unfile' | 'void'
) {
  return prisma.$transaction(
    async (tx) => {
      const filing = await tx.taxFiling.findFirst({ where: { id: filingId, companyId } });
      if (!filing) throw new TaxFilingError('Tax filing not found', 404);

      const label = `${FORM_LABEL[filing.formType as ReturnFormType] ?? filing.formType} ${
        filing.quarter ? `Q${filing.quarter} ` : ''
      }${filing.year}`;
      const live = await liveAdjustmentEntryId(tx, filing.adjustmentEntryId);
      if (live) {
        await voidEntry(actor, live, `${label} ${mode === 'void' ? 'filing voided' : 'unfiled'}`, tx);
      }

      let result;
      if (mode === 'void') {
        result = await tx.taxFiling.update({ where: { id: filingId }, data: { status: 'voided' } });
      } else if (filing.formDataJson) {
        result = await tx.taxFiling.update({
          where: { id: filingId },
          data: {
            status: 'pending',
            filedDate: null,
            filingMethod: null,
            confirmationNumber: null,
            totalLiability: null,
            totalDeposits: null,
            balanceDue: null,
            adjustmentEntryId: null,
          },
        });
      } else {
        result = await tx.taxFiling.delete({ where: { id: filingId } });
      }

      await logAudit({
        tx,
        companyId,
        userId: actor.userId,
        action: mode === 'void' ? 'tax_filing.void' : 'tax_filing.unfile',
        entityType: 'TaxFiling',
        entityId: filingId,
        before: { status: filing.status, formDataJson: filing.formDataJson },
        metadata: {
          formType: filing.formType,
          year: filing.year,
          quarter: filing.quarter,
          voidedAdjustmentEntryId: live,
        },
      });

      return result;
    },
    { timeout: 20000 }
  );
}

// ---------------------------------------------------------------------------
// Filing details and later payments (no re-file)
// ---------------------------------------------------------------------------

async function findFiledReturn(db: Tx | typeof prisma, companyId: string, filingId: string) {
  const filing = await db.taxFiling.findFirst({ where: { id: filingId, companyId } });
  if (!filing) throw new TaxFilingError('Tax filing not found', 404);
  const formType = filing.formType as ReturnFormType;
  if (!(formType in FORM_LABEL) || filing.quarter == null) {
    throw new TaxFilingError('Only a quarterly Form 941 or NYS-45 is handled here');
  }
  if (filing.status !== 'filed') throw new TaxFilingError('This return is not filed');
  return { filing, formType, quarter: filing.quarter };
}

export interface FilingDetailsInput {
  filedDate?: string;
  filingMethod?: string | null;
  confirmationNumber?: string | null;
  notes?: string | null;
}

/**
 * Correct when/how a return was filed. The figures and the books are
 * untouched, so this never needs File again.
 */
export async function updateFilingDetails(
  actor: Actor,
  companyId: string,
  filingId: string,
  input: FilingDetailsInput
) {
  const { filing } = await findFiledReturn(prisma, companyId, filingId);
  const data = {
    ...(input.filedDate !== undefined && { filedDate: parseBusinessDate(input.filedDate) }),
    ...(input.filingMethod !== undefined && { filingMethod: input.filingMethod }),
    ...(input.confirmationNumber !== undefined && { confirmationNumber: input.confirmationNumber }),
    ...(input.notes !== undefined && { notes: input.notes }),
  };
  const updated = await prisma.taxFiling.update({ where: { id: filing.id }, data });

  const pick = (f: typeof filing) => ({
    filedDate: f.filedDate ? formatDate(f.filedDate) : null,
    filingMethod: f.filingMethod,
    confirmationNumber: f.confirmationNumber,
    notes: f.notes,
  });
  await logAudit({
    companyId,
    userId: actor.userId,
    action: 'tax_filing.update_details',
    entityType: 'TaxFiling',
    entityId: filing.id,
    before: pick(filing),
    after: pick(updated),
    metadata: { formType: filing.formType, year: filing.year, quarter: filing.quarter },
  });
  return updated;
}

/**
 * Record a payment for a return that is already filed — the original
 * remittance if it wasn't recorded at filing time, or a later one (an
 * amended return's balance, a notice). Payments are separate dated events;
 * an earlier one is never edited into this one.
 */
export async function recordFilingPayment(
  actor: Actor,
  companyId: string,
  filingId: string,
  payment: NonNullable<FileReturnInput['payment']>
) {
  return prisma.$transaction(
    async (tx) => {
      const { filing, formType, quarter } = await findFiledReturn(tx, companyId, filingId);
      return recordReturnPayment(tx, actor, companyId, formType, filing.year, quarter, payment);
    },
    { timeout: 20000 }
  );
}

// ---------------------------------------------------------------------------
// Move to another quarter
// ---------------------------------------------------------------------------

export interface MoveFilingInput {
  year: number;
  quarter: number;
  /** The target quarter already has a filed return: trade places with it. */
  swap?: boolean;
}

export interface MovedFiling {
  id: string;
  from: { year: number; quarter: number };
  to: { year: number; quarter: number };
  /** Lines where the filed figures differ from the new quarter's payroll. */
  differsFromPayroll: string[];
  adjustmentEntry: { id: string; entryNumber: number } | null;
}

/**
 * Move a filed 941 / NYS-45 that was recorded under the wrong quarter.
 *
 * The filed figures go with it — they are what was submitted. For a return
 * filed through the editable-return flow, the old quarter's adjusting entry
 * is voided and a new one is posted at the end of the new quarter against
 * THAT quarter's payroll, so each quarter's books match the return that was
 * actually filed for it. Older status-only filings just change quarter.
 *
 * A target quarter holding a filed return is refused unless `swap` is set
 * (two quarters recorded backwards); a draft or voided record there is
 * replaced. Payments recorded with a return keep their period — they're
 * moved with Change quarter on Tax Deposits, since a deposit can't be told
 * apart from an ordinary one reliably.
 */
export async function moveFiling(actor: Actor, companyId: string, filingId: string, input: MoveFilingInput) {
  const { year: toYear, quarter: toQuarter } = input;
  if (!Number.isInteger(toYear) || !Number.isInteger(toQuarter) || toQuarter < 1 || toQuarter > 4) {
    throw new TaxFilingError('Choose a year and a quarter (1–4)');
  }

  const filing = await prisma.taxFiling.findFirst({ where: { id: filingId, companyId } });
  if (!filing) throw new TaxFilingError('Tax filing not found', 404);
  const formType = filing.formType as ReturnFormType;
  if (!(formType in FORM_LABEL) || filing.quarter == null) {
    throw new TaxFilingError('Only a quarterly Form 941 or NYS-45 can be moved to another quarter');
  }
  if (filing.status !== 'filed') {
    throw new TaxFilingError('Only a filed return can be moved — open the quarter you want and file it there');
  }
  if (filing.year === toYear && filing.quarter === toQuarter) {
    throw new TaxFilingError(`This ${FORM_LABEL[formType]} is already recorded for Q${toQuarter} ${toYear}`);
  }

  const occupant = await prisma.taxFiling.findFirst({
    where: { companyId, formType, year: toYear, quarter: toQuarter },
  });
  // Only a draft or a voided record may be replaced; anything else is a real filing.
  const swapping = !!occupant && !['pending', 'voided'].includes(occupant.status);
  if (swapping && !input.swap) {
    throw new TaxFilingError(
      `Q${toQuarter} ${toYear} already has a filed ${FORM_LABEL[formType]}. If the two were recorded backwards, swap them.`,
      409
    );
  }

  // Each quarter's payroll figures, loaded before the transaction (the loaders
  // use the global client, which would deadlock inside it).
  const from = { year: filing.year, quarter: filing.quarter };
  const to = { year: toYear, quarter: toQuarter };
  const computedTo = (await loadContext(companyId, formType, to.year, to.quarter)).computed;
  const computedFrom = swapping ? (await loadContext(companyId, formType, from.year, from.quarter)).computed : null;

  return prisma.$transaction(
    async (tx) => {
      const legs: Array<{ row: typeof filing; target: { year: number; quarter: number }; computed: ReturnValues }> = [
        { row: filing, target: to, computed: computedTo },
      ];
      if (swapping) legs.push({ row: occupant!, target: from, computed: computedFrom! });

      // 1. Void each moving filing's adjusting entry (APPROVER+, closed-year guard).
      for (const leg of legs) {
        const live = await liveAdjustmentEntryId(tx, leg.row.adjustmentEntryId);
        if (live) {
          await voidEntry(
            actor,
            live,
            `${FORM_LABEL[formType]} recorded for Q${leg.row.quarter} ${leg.row.year} belongs to Q${leg.target.quarter} ${leg.target.year} — moved`,
            tx
          );
        }
      }

      // 2. Clear the target slot: a draft or voided record there is replaced.
      if (occupant && !swapping) {
        await tx.taxFiling.delete({ where: { id: occupant.id } });
      }

      // 3. Re-key. Park the first row on a null quarter while swapping so the
      //    (company, form, year, quarter) unique key never collides.
      if (swapping) {
        await tx.taxFiling.update({ where: { id: filing.id }, data: { quarter: null, adjustmentEntryId: null } });
        await tx.taxFiling.update({
          where: { id: occupant!.id },
          data: { year: from.year, quarter: from.quarter, adjustmentEntryId: null },
        });
      }
      await tx.taxFiling.update({
        where: { id: filing.id },
        data: { year: to.year, quarter: to.quarter, adjustmentEntryId: null },
      });

      // 4. True each moved return up against its new quarter's payroll.
      const moved: MovedFiling[] = [];
      for (const leg of legs) {
        const saved = parseSavedReturn(leg.row.formDataJson);
        let adjustmentEntry: MovedFiling['adjustmentEntry'] = null;
        let differsFromPayroll: string[] = [];
        if (saved) {
          ({ entry: adjustmentEntry } = await postFilingAdjustment(
            tx, actor, companyId, formType, leg.target.year, leg.target.quarter, leg.row.id, saved.values, leg.computed
          ));
          differsFromPayroll = changedKeys(saved.values, leg.computed);
          await tx.taxFiling.update({
            where: { id: leg.row.id },
            data: {
              formDataJson: serialize({ ...saved, computed: leg.computed }),
              adjustmentEntryId: adjustmentEntry?.id ?? null,
            },
          });
        }
        moved.push({
          id: leg.row.id,
          from: { year: leg.row.year, quarter: leg.row.quarter! },
          to: leg.target,
          differsFromPayroll,
          adjustmentEntry,
        });

        await logAudit({
          tx,
          companyId,
          userId: actor.userId,
          action: 'tax_filing.move',
          entityType: 'TaxFiling',
          entityId: leg.row.id,
          before: { year: leg.row.year, quarter: leg.row.quarter, adjustmentEntryId: leg.row.adjustmentEntryId },
          after: { year: leg.target.year, quarter: leg.target.quarter, adjustmentEntryId: adjustmentEntry?.id ?? null },
          metadata: {
            formType,
            swapped: swapping,
            replacedRecord: occupant && !swapping ? { id: occupant.id, status: occupant.status } : null,
            differsFromPayroll,
          },
        });
      }

      return { moved, swapped: swapping };
    },
    { timeout: 20000 }
  );
}
