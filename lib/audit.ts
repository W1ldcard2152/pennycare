import { prisma } from './db';

interface AuditParams {
  companyId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  changes?: Record<string, { old: unknown; new: unknown }>;
  metadata?: Record<string, unknown>;
}

export async function logAudit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        companyId: params.companyId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        changes: params.changes ? JSON.stringify(params.changes) : null,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      },
    });
  } catch (error) {
    // Audit logging should never break the main operation
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
