import { NextResponse } from 'next/server';
import { getSession } from './auth';
import { prisma } from './db';

export type Role = 'owner' | 'admin' | 'payroll' | 'viewer';

const ROLE_LEVEL: Record<Role, number> = {
  viewer: 1,
  payroll: 2,
  admin: 3,
  owner: 4,
};

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

  const userRole = access.role as Role;

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
