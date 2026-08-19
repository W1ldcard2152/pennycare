import { NextResponse } from 'next/server';
import { getSession } from './auth';
import { prisma } from './db';

/**
 * Per-company roles (stored on UserCompanyAccess.role), v1.2 naming:
 *   OWNER      — full access, user management, ownership transfer
 *   APPROVER   — approves/books/voids journal entries (pre-1.2 'admin')
 *   BOOKKEEPER — prepares entries, imports, payroll ops (pre-1.2 'payroll')
 *   VIEWER     — read-only
 */
export type Role = 'OWNER' | 'APPROVER' | 'BOOKKEEPER' | 'VIEWER';

export const ROLE_LEVEL: Record<Role, number> = {
  VIEWER: 1,
  BOOKKEEPER: 2,
  APPROVER: 3,
  OWNER: 4,
};

// Pre-1.2 stored values, mapped in place by scripts/repair-pre-1.2-migration.ts.
// Normalizing here too keeps a not-yet-migrated database working.
const LEGACY_ROLE_MAP: Record<string, Role> = {
  owner: 'OWNER',
  admin: 'APPROVER',
  payroll: 'BOOKKEEPER',
  viewer: 'VIEWER',
};

export function normalizeRole(stored: string): Role | null {
  if (stored in ROLE_LEVEL) return stored as Role;
  return LEGACY_ROLE_MAP[stored] ?? null;
}

/** True if `role` meets or exceeds `required` on the role ladder. */
export function roleAtLeast(role: Role, required: Role): boolean {
  return ROLE_LEVEL[role] >= ROLE_LEVEL[required];
}

/**
 * Check that the caller is authenticated, has a company selected,
 * their user account is still active, and (optionally) that their role
 * meets the minimum required level.
 *
 * Passing no `requiredRole` still enforces authentication, company selection,
 * and active-user status — the same as before, but now with a DB check.
 */
export async function requireCompanyAccess(requiredRole?: Role) {
  const session = await getSession();

  if (!session) {
    return {
      error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
      session: null,
      companyId: null,
      role: null as Role | null,
    };
  }

  if (!session.currentCompanyId) {
    return {
      error: NextResponse.json({ error: 'No company selected' }, { status: 400 }),
      session,
      companyId: null,
      role: null as Role | null,
    };
  }

  // Verify the user actually has access to this company AND is still active
  const access = await prisma.userCompanyAccess.findUnique({
    where: {
      userId_companyId: {
        userId: session.userId,
        companyId: session.currentCompanyId,
      },
    },
    include: {
      user: { select: { isActive: true } },
    },
  });

  if (!access || !access.user.isActive) {
    return {
      error: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
      session,
      companyId: null,
      role: null as Role | null,
    };
  }

  const userRole = normalizeRole(access.role);

  if (!userRole) {
    return {
      error: NextResponse.json({ error: 'Access denied' }, { status: 403 }),
      session,
      companyId: null,
      role: null as Role | null,
    };
  }

  // Check role level if a minimum role is required
  if (requiredRole && ROLE_LEVEL[userRole] < ROLE_LEVEL[requiredRole]) {
    return {
      error: NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 }),
      session,
      companyId: session.currentCompanyId,
      role: userRole,
    };
  }

  return {
    error: null,
    session,
    companyId: session.currentCompanyId,
    role: userRole,
  };
}
