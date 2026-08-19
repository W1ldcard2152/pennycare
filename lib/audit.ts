import { prisma } from './db';
import type { Prisma } from '@prisma/client';

interface AuditParams {
  companyId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
  /** Full entity snapshot before the action (tier-1 financial audit). */
  before?: unknown;
  /** Full entity snapshot after the action (tier-1 financial audit). */
  after?: unknown;
  /**
   * Tier-1 mode: pass the transaction the financial mutation runs on. The
   * audit row commits atomically with the action, and a failed audit write
   * ABORTS the whole action (throws instead of swallowing).
   *
   * Without `tx` this is tier-2: fire-and-forget, errors swallowed — correct
   * for logins, settings changes, and other non-financial events.
   */
  tx?: Prisma.TransactionClient;
}

export async function logAudit(params: AuditParams): Promise<void> {
  const data = {
    companyId: params.companyId,
    userId: params.userId,
    action: params.action,
    entityType: params.entityType,
    entityId: params.entityId,
    changes: params.changes ? JSON.stringify(params.changes) : null,
    metadata: params.metadata ? JSON.stringify(params.metadata) : null,
    beforeJson: params.before !== undefined ? JSON.stringify(params.before) : null,
    afterJson: params.after !== undefined ? JSON.stringify(params.after) : null,
  };

  if (params.tx) {
    // Tier 1: same-transaction, failure propagates and rolls back the action
    await params.tx.auditLog.create({ data });
    return;
  }

  try {
    await prisma.auditLog.create({ data });
  } catch (error) {
    // Tier 2: audit logging should never break the main operation
    console.error('Failed to write audit log:', error);
  }
}

/**
 * Log a security event (login attempts, lockouts, etc.) that may not
 * have a company context. Uses sentinel values for companyId/userId.
 */
export async function logSecurityEvent(params: {
  action: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: 'system',
        userId: params.metadata?.userId as string || 'anonymous',
        action: params.action,
        entityType: 'Auth',
        entityId: 'N/A',
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (error) {
    console.error('Failed to write security event:', error);
  }
}

/**
 * Compare two objects and return only the fields that changed.
 * Useful for employee.update audit logs.
 */
export function computeChanges(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[]
): Record<string, { old: unknown; new: unknown }> | null {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  for (const field of fields) {
    const oldVal = before[field];
    const newVal = after[field];
    // Compare stringified to handle Date objects, nulls, etc.
    if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
      changes[field] = { old: oldVal, new: newVal };
    }
  }

  return Object.keys(changes).length > 0 ? changes : null;
}
