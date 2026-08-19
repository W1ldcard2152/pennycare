/**
 * Centralized journal entry service — the SOLE owner of every JournalEntry
 * and JournalEntryLine mutation in the codebase.
 *
 * Invariant (enforced by scripts/lint-invariants.mjs, run as part of
 * `npm test`): `prisma.journalEntry.create|update|delete` and any
 * journalEntryLine write may appear ONLY in this module (and in
 * scripts/, for migrations/repairs). Route handlers and other lib code go
 * through this service so the state machine, closed-period guards,
 * reconciled-line guards, segregation of duties, and tier-1 audit can never
 * be bypassed by a forgotten code path.
 *
 * State machine (stored values via lib/je-status.ts; BOOKED = 'posted'):
 *   draft → pending_approval → posted → voided
 *                            ↘ rejected → draft
 *
 * Booked entries are immutable: corrections are reversing entries
 * (createReversingEntry), never in-place edits.
 */
import { prisma } from './db';
import { logAudit } from './audit';
import type { Prisma } from '@prisma/client';
import type { Role } from './api-utils';
import { roleAtLeast } from './api-utils';
import { JE_STATUS, isLegalTransition, isSystemSource, type JeStatus } from './je-status';
import { evaluateApprovalRules } from './approval-rules';

export interface Actor {
  userId: string;
  role: Role;
}

export interface JournalEntryLineInput {
  accountId: string;
  description?: string;
  debit: number;
  credit: number;
}

/**
 * Validate that debits equal credits in a journal entry.
 */
export function validateJournalEntry(lines: JournalEntryLineInput[]): {
  valid: boolean;
  totalDebits: number;
  totalCredits: number;
  error?: string;
} {
  if (lines.length < 2) {
    return { valid: false, totalDebits: 0, totalCredits: 0, error: 'A journal entry must have at least 2 lines' };
  }

  // Sum in integer cents so floating-point can't introduce drift. This also
  // means we enforce penny-exact balance: any difference, even $0.01, fails.
  // The previous `> 0.01` tolerance let single-penny payroll-aggregation drift
  // slip through (see JE #340/#341 incident), bypassing the self-heal branch
  // in createPayrollJournalEntries.
  const debitCents = lines.reduce((sum, l) => sum + Math.round((l.debit || 0) * 100), 0);
  const creditCents = lines.reduce((sum, l) => sum + Math.round((l.credit || 0) * 100), 0);
  const totalDebits = debitCents / 100;
  const totalCredits = creditCents / 100;

  if (debitCents !== creditCents) {
    return {
      valid: false,
      totalDebits,
      totalCredits,
      error: `Debits ($${totalDebits.toFixed(2)}) must equal credits ($${totalCredits.toFixed(2)})`,
    };
  }

  // Each line must have either a debit or credit (not both, not neither).
  // Negative amounts are rejected — they used to slip past `> 0` checks and
  // produce lines that render as blank cells in the UI (see year-end closing
  // bug for accounts with abnormal balance signs).
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const debit = line.debit || 0;
    const credit = line.credit || 0;
    if (debit < 0 || credit < 0) {
      return { valid: false, totalDebits, totalCredits, error: `Line ${i + 1}: Debit and credit amounts must be non-negative` };
    }
    if (debit > 0 && credit > 0) {
      return { valid: false, totalDebits, totalCredits, error: `Line ${i + 1}: Cannot have both debit and credit on the same line` };
    }
    if (debit === 0 && credit === 0) {
      return { valid: false, totalDebits, totalCredits, error: `Line ${i + 1}: Must have either a debit or credit amount` };
    }
  }

  return { valid: true, totalDebits, totalCredits };
}

/**
 * Check if a date falls within a closed fiscal period.
 * Returns the closed period if found, null otherwise.
 *
 * Pass the active transaction client as `db` when calling from inside a
 * $transaction — with connection_limit=1 a global-client query would queue
 * behind the open transaction and deadlock.
 */
export async function checkClosedPeriod(
  companyId: string,
  date: Date,
  db: Prisma.TransactionClient = prisma,
): Promise<{
  isClosed: boolean;
  closedPeriod?: {
    id: string;
    fiscalYear: number;
    periodEnd: Date;
    closedAt: Date;
    isOpen: boolean;
  };
}> {
  // Get the fiscal year for the date
  const year = date.getUTCFullYear();

  const closedPeriod = await db.closedPeriod.findUnique({
    where: { companyId_fiscalYear: { companyId, fiscalYear: year } },
    select: {
      id: true,
      fiscalYear: true,
      periodEnd: true,
      closedAt: true,
      isOpen: true,
    },
  });

  if (!closedPeriod) {
    return { isClosed: false };
  }

  // If the period has been reopened, it's not closed
  if (closedPeriod.isOpen) {
    return { isClosed: false };
  }

  // Check if the date is within the closed period
  if (date <= closedPeriod.periodEnd) {
    return { isClosed: true, closedPeriod };
  }

  return { isClosed: false };
}

export interface CreateEntryInput {
  companyId: string;
  date: Date;
  memo: string;
  referenceNumber?: string;
  source?: string; // default 'manual' — see JE_SOURCES in lib/je-status.ts
  sourceId?: string;
  lines: JournalEntryLineInput[];
  notes?: string;
  /** Set on reversing entries; links back to the entry being reversed. */
  reversesEntryId?: string;
  /** Create as an editable draft instead of entering the booking pipeline. */
  asDraft?: boolean;
  /** Internal escape hatch for year-end closing, which writes INTO the year being closed. */
  skipClosedPeriodCheck?: boolean;
}

type Tx = Prisma.TransactionClient;

const entryInclude = {
  lines: { include: { account: true } },
} satisfies Prisma.JournalEntryInclude;

/** Snapshot shape stored in AuditLog.beforeJson/afterJson for tier-1 rows. */
function snapshot(entry: {
  id: string;
  companyId: string;
  entryNumber: number;
  date: Date;
  memo: string;
  referenceNumber: string | null;
  source: string;
  sourceId: string | null;
  status: string;
  notes: string | null;
  createdById: string | null;
  approvedById: string | null;
  reversesEntryId?: string | null;
  voidedBy?: string | null;
  voidReason?: string | null;
  rejectedReason?: string | null;
  lines: Array<{ accountId: string; description: string | null; debit: number; credit: number }>;
}) {
  return {
    id: entry.id,
    companyId: entry.companyId,
    entryNumber: entry.entryNumber,
    date: entry.date,
    memo: entry.memo,
    referenceNumber: entry.referenceNumber,
    source: entry.source,
    sourceId: entry.sourceId,
    status: entry.status,
    notes: entry.notes,
    createdById: entry.createdById,
    approvedById: entry.approvedById,
    reversesEntryId: entry.reversesEntryId ?? null,
    voidedBy: entry.voidedBy ?? null,
    voidReason: entry.voidReason ?? null,
    rejectedReason: entry.rejectedReason ?? null,
    lines: entry.lines.map((l) => ({
      accountId: l.accountId,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    })),
  };
}

/**
 * Flip debit ↔ credit on every line (the core of a reversing entry). Pure and
 * penny-exact: amounts are swapped, never recomputed. Exported for unit tests.
 */
export function flipLines(
  lines: Array<{ accountId: string; description?: string | null; debit: number; credit: number }>
): JournalEntryLineInput[] {
  return lines.map((l) => ({
    accountId: l.accountId,
    description: l.description ?? undefined,
    debit: l.credit,
    credit: l.debit,
  }));
}

/** Run `fn` on the given tx, or open a transaction if none was provided. */
async function withTx<T>(tx: Tx | undefined, fn: (tx: Tx) => Promise<T>): Promise<T> {
  if (tx) return fn(tx);
  return prisma.$transaction(fn, { timeout: 15000 });
}

/** The ONE place a journal entry number is allocated (atomic counter bump). */
async function nextEntryNumber(tx: Tx, companyId: string): Promise<number> {
  const company = await tx.company.update({
    where: { id: companyId },
    data: { nextJournalEntryNumber: { increment: 1 } },
    select: { nextJournalEntryNumber: true },
  });
  return company.nextJournalEntryNumber - 1;
}

/**
 * Create a journal entry.
 *
 * Status on creation:
 *  - `asDraft: true`                          → DRAFT (any mode, any source)
 *  - system source (anything except 'manual') → BOOKED, actor stamped as both
 *    creator and approver (system entries are exempt from the matrix)
 *  - 'single_user' approval mode              → BOOKED, same stamping
 *  - 'team' mode + manual source              → PENDING_APPROVAL. Booking
 *    happens via transition(), where the approval matrix and segregation of
 *    duties (approver ≠ creator) are enforced. Self-approval at create time
 *    would always violate SoD, so team-mode manual entries never auto-book.
 */
export async function createEntry(actor: Actor, input: CreateEntryInput, tx?: Tx) {
  const validation = validateJournalEntry(input.lines);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const source = input.source || 'manual';

  return withTx(tx, async (tx) => {
    if (!input.skipClosedPeriodCheck) {
      const { isClosed, closedPeriod } = await checkClosedPeriod(input.companyId, input.date, tx);
      if (isClosed) {
        throw new Error(
          `Cannot create journal entry: Fiscal year ${closedPeriod!.fiscalYear} is closed. Reopen the period to make changes.`
        );
      }
    }

    let status: JeStatus;
    if (input.asDraft) {
      status = JE_STATUS.DRAFT;
    } else if (isSystemSource(source)) {
      status = JE_STATUS.BOOKED;
    } else {
      const company = await tx.company.findUniqueOrThrow({
        where: { id: input.companyId },
        select: { approvalMode: true },
      });
      status = company.approvalMode === 'team' ? JE_STATUS.PENDING : JE_STATUS.BOOKED;
    }

    const booked = status === JE_STATUS.BOOKED;
    const entryNumber = await nextEntryNumber(tx, input.companyId);

    const entry = await tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        entryNumber,
        date: input.date,
        memo: input.memo,
        referenceNumber: input.referenceNumber || null,
        source,
        sourceId: input.sourceId || null,
        notes: input.notes || null,
        status,
        createdById: actor.userId,
        approvedById: booked ? actor.userId : null,
        approvedAt: booked ? new Date() : null,
        reversesEntryId: input.reversesEntryId || null,
        lines: {
          create: input.lines.map((line) => ({
            accountId: line.accountId,
            description: line.description || null,
            debit: line.debit || 0,
            credit: line.credit || 0,
          })),
        },
      },
      include: entryInclude,
    });

    await logAudit({
      tx,
      companyId: input.companyId,
      userId: actor.userId,
      action: 'journal_entry.create',
      entityType: 'JournalEntry',
      entityId: entry.id,
      after: snapshot(entry),
      metadata: { entryNumber, status, source },
    });

    return entry;
  });
}

/**
 * Update a DRAFT entry (header fields + full line replacement).
 * Any other status is rejected — booked entries are corrected by reversal.
 */
export async function updateDraft(
  actor: Actor,
  entryId: string,
  data: {
    date?: Date;
    memo?: string;
    referenceNumber?: string | null;
    notes?: string | null;
    lines?: JournalEntryLineInput[];
  },
  tx?: Tx
) {
  return withTx(tx, async (tx) => {
    const existing = await tx.journalEntry.findUniqueOrThrow({
      where: { id: entryId },
      include: entryInclude,
    });

    if (existing.status !== JE_STATUS.DRAFT) {
      throw new JournalEntryStateError(
        `Only draft entries can be edited (this entry is ${existing.status}). Booked entries are corrected with a reversing entry.`
      );
    }

    if (data.lines) {
      const validation = validateJournalEntry(data.lines);
      if (!validation.valid) throw new Error(validation.error);
    }

    const date = data.date ?? existing.date;
    const { isClosed, closedPeriod } = await checkClosedPeriod(existing.companyId, date, tx);
    if (isClosed) {
      throw new Error(`Cannot date a journal entry inside closed fiscal year ${closedPeriod!.fiscalYear}.`);
    }

    if (data.lines) {
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: entryId } });
    }

    const entry = await tx.journalEntry.update({
      where: { id: entryId },
      data: {
        date: data.date,
        memo: data.memo,
        referenceNumber: data.referenceNumber,
        notes: data.notes,
        lines: data.lines
          ? {
              create: data.lines.map((line) => ({
                accountId: line.accountId,
                description: line.description || null,
                debit: line.debit || 0,
                credit: line.credit || 0,
              })),
            }
          : undefined,
      },
      include: entryInclude,
    });

    await logAudit({
      tx,
      companyId: existing.companyId,
      userId: actor.userId,
      action: 'journal_entry.update_draft',
      entityType: 'JournalEntry',
      entityId: entryId,
      before: snapshot(existing),
      after: snapshot(entry),
      metadata: { entryNumber: existing.entryNumber },
    });

    return entry;
  });
}

/**
 * Hard-delete a DRAFT entry. The audit row (with the full snapshot in
 * beforeJson) is written in the same transaction as the delete.
 */
export async function deleteDraft(actor: Actor, entryId: string, tx?: Tx) {
  return withTx(tx, async (tx) => {
    const existing = await tx.journalEntry.findUniqueOrThrow({
      where: { id: entryId },
      include: entryInclude,
    });

    if (existing.status !== JE_STATUS.DRAFT) {
      throw new JournalEntryStateError(
        `Only draft entries can be deleted (this entry is ${existing.status}). Booked entries are voided or reversed.`
      );
    }

    await logAudit({
      tx,
      companyId: existing.companyId,
      userId: actor.userId,
      action: 'journal_entry.delete_draft',
      entityType: 'JournalEntry',
      entityId: entryId,
      before: snapshot(existing),
      metadata: { entryNumber: existing.entryNumber },
    });

    await tx.journalEntry.delete({ where: { id: entryId } });

    return { deleted: true, entryNumber: existing.entryNumber };
  });
}

/** Error class so routes can map state-machine violations to 409s. */
export class JournalEntryStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JournalEntryStateError';
  }
}

const TRANSITION_AUDIT_ACTION: Record<string, string> = {
  [`${JE_STATUS.DRAFT}>${JE_STATUS.PENDING}`]: 'journal_entry.submit',
  [`${JE_STATUS.PENDING}>${JE_STATUS.BOOKED}`]: 'journal_entry.book',
  [`${JE_STATUS.PENDING}>${JE_STATUS.REJECTED}`]: 'journal_entry.reject',
  [`${JE_STATUS.REJECTED}>${JE_STATUS.DRAFT}`]: 'journal_entry.return_to_draft',
  [`${JE_STATUS.BOOKED}>${JE_STATUS.VOIDED}`]: 'journal_entry.void',
};

/**
 * The state machine. Enforces, in one place:
 *  - legal transitions only (see lib/je-status.ts)
 *  - role floors: BOOKKEEPER+ to submit / return-to-draft; APPROVER+ to
 *    book, reject, or void
 *  - approval matrix on pending→booked (manual entries in team mode;
 *    default-deny escalates to OWNER when no rule matches)
 *  - segregation of duties on pending→booked: approver ≠ creator
 *  - reasons required for reject and void
 *  - closed-period and reconciled-line guards on void — these apply to ALL
 *    voids (the pre-1.2 auto-void paths bypassed them)
 */
export async function transition(
  actor: Actor,
  entryId: string,
  toStatus: JeStatus,
  options: { reason?: string } = {},
  tx?: Tx
) {
  return withTx(tx, async (tx) => {
    const entry = await tx.journalEntry.findUniqueOrThrow({
      where: { id: entryId },
      include: entryInclude,
    });
    const fromStatus = entry.status as JeStatus;

    if (!isLegalTransition(fromStatus, toStatus)) {
      throw new JournalEntryStateError(
        `Illegal status transition: ${fromStatus} → ${toStatus}`
      );
    }

    const reason = options.reason?.trim();

    switch (toStatus) {
      case JE_STATUS.PENDING:
      case JE_STATUS.DRAFT: {
        if (!roleAtLeast(actor.role, 'BOOKKEEPER')) {
          throw new JournalEntryStateError('BOOKKEEPER role or higher required');
        }
        break;
      }
      case JE_STATUS.BOOKED: {
        if (!roleAtLeast(actor.role, 'APPROVER')) {
          throw new JournalEntryStateError('APPROVER role or higher required to book an entry');
        }
        // Segregation of duties: the creator cannot approve their own entry.
        // (createdById null = pre-1.2 entry; cannot occur for pending rows.)
        if (entry.createdById !== null && entry.createdById === actor.userId) {
          throw new JournalEntryStateError(
            'Segregation of duties: an entry cannot be approved by its creator'
          );
        }
        // Approval matrix (manual entries; system entries never sit in pending)
        const rules = await tx.approvalRule.findMany({
          where: { companyId: entry.companyId, active: true },
        });
        const evaluation = evaluateApprovalRules(rules, {
          totalCents: entry.lines.reduce((s, l) => s + Math.round(l.debit * 100), 0),
          source: entry.source,
        });
        if (!roleAtLeast(actor.role, evaluation.requiredRole)) {
          throw new JournalEntryStateError(
            `This entry requires ${evaluation.requiredRole} approval` +
              (evaluation.defaultDeny ? ' (no approval rule matched — default-deny)' : '')
          );
        }
        break;
      }
      case JE_STATUS.REJECTED: {
        if (!roleAtLeast(actor.role, 'APPROVER')) {
          throw new JournalEntryStateError('APPROVER role or higher required to reject an entry');
        }
        if (!reason) {
          throw new JournalEntryStateError('A reason is required to reject an entry');
        }
        break;
      }
      case JE_STATUS.VOIDED: {
        if (!roleAtLeast(actor.role, 'APPROVER')) {
          throw new JournalEntryStateError('APPROVER role or higher required to void an entry');
        }
        if (!reason) {
          throw new JournalEntryStateError('A reason is required to void an entry');
        }
        const { isClosed, closedPeriod } = await checkClosedPeriod(entry.companyId, entry.date, tx);
        if (isClosed) {
          throw new JournalEntryStateError(
            `Cannot void: entry is dated within closed fiscal year ${closedPeriod!.fiscalYear}. Reopen the period first.`
          );
        }
        const reconciledLines = entry.lines.filter((l) => l.isReconciled);
        if (reconciledLines.length > 0) {
          throw new JournalEntryStateError(
            'Cannot void: one or more lines have been reconciled. Reopen the reconciliation first.'
          );
        }
        break;
      }
      default:
        throw new JournalEntryStateError(`Unknown target status: ${toStatus}`);
    }

    const now = new Date();
    const updated = await tx.journalEntry.update({
      where: { id: entryId },
      data: {
        status: toStatus,
        ...(toStatus === JE_STATUS.BOOKED && {
          approvedById: actor.userId,
          approvedAt: now,
          rejectedReason: null,
        }),
        ...(toStatus === JE_STATUS.REJECTED && { rejectedReason: reason }),
        ...(toStatus === JE_STATUS.DRAFT && { rejectedReason: null }),
        ...(toStatus === JE_STATUS.VOIDED && {
          voidedAt: now,
          voidedBy: actor.userId,
          voidReason: reason,
        }),
      },
      include: entryInclude,
    });

    await logAudit({
      tx,
      companyId: entry.companyId,
      userId: actor.userId,
      action: TRANSITION_AUDIT_ACTION[`${fromStatus}>${toStatus}`] ?? 'journal_entry.transition',
      entityType: 'JournalEntry',
      entityId: entryId,
      before: snapshot(entry),
      after: snapshot(updated),
      metadata: { entryNumber: entry.entryNumber, fromStatus, toStatus, reason },
    });

    return updated;
  });
}

/** Void a booked entry (sugar over transition). Reason is mandatory. */
export async function voidEntry(actor: Actor, entryId: string, reason: string, tx?: Tx) {
  return transition(actor, entryId, JE_STATUS.VOIDED, { reason }, tx);
}

/**
 * Set or clear the isReconciled flag on journal entry lines. Owned by the
 * service so the "no journalEntryLine writes outside this module" invariant
 * holds; the reconciliation routes call this instead of raw updates.
 */
export async function markLinesReconciled(lineIds: string[], reconciled: boolean, tx?: Tx) {
  if (lineIds.length === 0) return { count: 0 };
  const db = tx ?? prisma;
  return db.journalEntryLine.updateMany({
    where: { id: { in: lineIds } },
    data: { isReconciled: reconciled },
  });
}

/**
 * Set or clear the header-level isReconciled flag (kept for entries whose
 * lines were cleared by a completed reconciliation).
 */
export async function markEntriesReconciled(entryIds: string[], reconciled: boolean, tx?: Tx) {
  if (entryIds.length === 0) return { count: 0 };
  const db = tx ?? prisma;
  return db.journalEntry.updateMany({
    where: { id: { in: entryIds } },
    data: {
      isReconciled: reconciled,
      reconciledDate: reconciled ? new Date() : null,
    },
  });
}

/**
 * Create a reversing entry for a BOOKED entry: same accounts, debits and
 * credits flipped, source 'reversal', linked via reversesEntryId. This is
 * the correction mechanism for booked entries (which are immutable).
 *
 * Requires APPROVER+ — reversing has the same books impact as voiding.
 * The reversal flows through createEntry; as a system source it books
 * immediately in either approval mode.
 */
export async function createReversingEntry(
  actor: Actor,
  sourceEntryId: string,
  options: { date: Date; memo?: string },
  tx?: Tx
) {
  if (!roleAtLeast(actor.role, 'APPROVER')) {
    throw new JournalEntryStateError('APPROVER role or higher required to reverse an entry');
  }

  return withTx(tx, async (tx) => {
    const original = await tx.journalEntry.findUniqueOrThrow({
      where: { id: sourceEntryId },
      include: entryInclude,
    });

    if (original.status !== JE_STATUS.BOOKED) {
      throw new JournalEntryStateError(
        `Only booked entries can be reversed (this entry is ${original.status})`
      );
    }

    const reversal = await createEntry(
      actor,
      {
        companyId: original.companyId,
        date: options.date,
        memo: options.memo?.trim() || `Reversal of JE #${original.entryNumber}: ${original.memo}`,
        referenceNumber: original.referenceNumber ? `REV-${original.referenceNumber}` : undefined,
        source: 'reversal',
        sourceId: original.id,
        reversesEntryId: original.id,
        notes: `Reverses journal entry #${original.entryNumber} (${original.id})`,
        lines: flipLines(original.lines),
      },
      tx
    );

    await logAudit({
      tx,
      companyId: original.companyId,
      userId: actor.userId,
      action: 'journal_entry.reverse',
      entityType: 'JournalEntry',
      entityId: original.id,
      metadata: {
        originalEntryNumber: original.entryNumber,
        reversalEntryId: reversal.id,
        reversalEntryNumber: reversal.entryNumber,
      },
    });

    return reversal;
  });
}
