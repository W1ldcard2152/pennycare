import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { hashPassword } from '@/lib/auth';
import { createUserSchema, validateRequest } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

// GET /api/users — list users with access to the CURRENT company (OWNER only).
export async function GET() {
  const { error, companyId } = await requireCompanyAccess('OWNER');
  if (error) return error;

  const access = await prisma.userCompanyAccess.findMany({
    where: { companyId: companyId! },
    include: {
      user: { select: { id: true, email: true, firstName: true, lastName: true, isActive: true, mustChangePassword: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({
    users: access.map((a) => ({
      id: a.user.id,
      email: a.user.email,
      firstName: a.user.firstName,
      lastName: a.user.lastName,
      isActive: a.user.isActive,
      mustChangePassword: a.user.mustChangePassword,
      role: a.role,
    })),
  });
}

// POST /api/users — create a user with access to the current company (OWNER
// only). The user starts with a temporary password and mustChangePassword=true.
// If a user with the email already exists, they're granted access to this
// company instead of erroring (re-using the account across companies).
export async function POST(request: NextRequest) {
  const { error, companyId, session } = await requireCompanyAccess('OWNER');
  if (error) return error;

  try {
    const body = await request.json();
    const validation = validateRequest(createUserSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }
    const { email, firstName, lastName, temporaryPassword, role } = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      let user = await tx.user.findUnique({ where: { email } });

      if (user) {
        // Existing account — just grant access to this company if not present.
        const existingAccess = await tx.userCompanyAccess.findUnique({
          where: { userId_companyId: { userId: user.id, companyId: companyId! } },
        });
        if (existingAccess) {
          throw new UserConflictError('That user already has access to this company.');
        }
      } else {
        user = await tx.user.create({
          data: {
            email,
            firstName,
            lastName,
            passwordHash: await hashPassword(temporaryPassword),
            mustChangePassword: true,
          },
        });
      }

      await tx.userCompanyAccess.create({
        data: { userId: user.id, companyId: companyId!, role },
      });

      return user;
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'user.create',
      entityType: 'User',
      entityId: result.id,
      metadata: { email, role },
    });

    return NextResponse.json(
      { id: result.id, email: result.email, firstName: result.firstName, lastName: result.lastName, role },
      { status: 201 }
    );
  } catch (err) {
    if (err instanceof UserConflictError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('Error creating user:', err);
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
  }
}

class UserConflictError extends Error {}
