/**
 * Journal entry lifecycle status constants.
 *
 * The stored value for BOOKED stays 'posted' for compatibility with every
 * pre-1.2 row and query — do not "fix" this to 'booked'. All code should
 * reference these constants rather than string literals.
 *
 * Legal transitions (enforced by lib/journal-entry-service.ts):
 *   draft            → pending_approval
 *   pending_approval → posted | rejected
 *   rejected         → draft
 *   posted           → voided
 *
 * VOIDED is terminal. BOOKED entries are never edited in place — corrections
 * are reversing entries (see createReversingEntry).
 */
export const JE_STATUS = {
  DRAFT: 'draft',
  PENDING: 'pending_approval',
  BOOKED: 'posted',
  REJECTED: 'rejected',
  VOIDED: 'voided',
} as const;

export type JeStatus = (typeof JE_STATUS)[keyof typeof JE_STATUS];

export const LEGAL_TRANSITIONS: Record<JeStatus, JeStatus[]> = {
  [JE_STATUS.DRAFT]: [JE_STATUS.PENDING],
  [JE_STATUS.PENDING]: [JE_STATUS.BOOKED, JE_STATUS.REJECTED],
  [JE_STATUS.REJECTED]: [JE_STATUS.DRAFT],
  [JE_STATUS.BOOKED]: [JE_STATUS.VOIDED],
  [JE_STATUS.VOIDED]: [],
};

export function isLegalTransition(from: JeStatus, to: JeStatus): boolean {
  return (LEGAL_TRANSITIONS[from] ?? []).includes(to);
}

/**
 * Journal entry source values. Everything except 'manual' is system-generated
 * and exempt from the approval matrix (ratified product decision — the matrix
 * governs manual entries only; a future ApprovalRule MAY target other sources
 * via a {"source": ...} condition, but none ship in 1.2).
 */
export const JE_SOURCES = [
  'manual',
  'payroll',
  'payroll_payment',
  'expense',
  'statement_import',
  'cc_import',
  'ebay_import',
  'opening_balance',
  'reconciliation',
  'year_end_closing',
  'tax_deposit',
  'reversal',
  'reclassification',
] as const;

export type JeSource = (typeof JE_SOURCES)[number];

export function isSystemSource(source: string): boolean {
  return source !== 'manual';
}
