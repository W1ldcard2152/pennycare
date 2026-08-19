import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { hashPassword } from '@/lib/auth';
import { updateUserSchema, validateRequest } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

// PATCH /api/users/[id] — manage a user's access to the current company
// (OWNER only). Actions: deactivate, reactivate, reset_password, change_role.
//
// Policy: we never DELETE users (referential integrity for createdById/
// approvedById, and the audit trail). Deactivation is the off switch.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, companyId, session } = await requireCompanyAccess('OWNER');
  if (error) return error;
  const { id } = await params;

  try {
    const body = await request.json();
    const validation = validateRequest(updateUserSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }
    const { action, role, temporaryPassword } = validation.data;

    // The target must have access to the current company — scopes management
    // to your own company and prevents cross-tenant tampering.
    const access = await prisma.userCompanyAccess.findUnique({
      where: { userId_companyId: { userId: id, companyId: companyId! } },
      include: { user: { select: { id: true, email: true, isActive: true } } },
    });
    if (!access) {
      return NextResponse.json({ error: 'User not found in this company' }, { status: 404 });
    }

    // Guard against self-lockout / removing the last owner.
    if ((action === 'deactivate' || action === 'change_role') && id === session!.userId) {
      return NextResponse.json(
        { error: 'You cannot deactivate or change the role of your own account.' },
        { status: 400 }
      );
    }
    if (action === 'change_role' && access.role === 'OWNER' && role !== 'OWNER') {
      const ownerCount = await prisma.userCompanyAccess.count({
        where: { companyId: companyId!, role: 'OWNER' },
      });
      if (ownerCount <= 1) {
        return NextResponse.json({ error: 'A company must have at least one owner.' }, { status: 400 });
      }
    }

    if (action === 'deactivate') {
      await prisma.user.update({ where: { id }, data: { isActive: false } });
    } else if (action === 'reactivate') {
      await prisma.user.update({ where: { id }, data: { isActive: true } });
    } else if (action === 'reset_password') {
      if (!temporaryPassword) {
        return NextResponse.json({ error: 'A temporary password is required' }, { status: 400 });
      }
      await prisma.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(temporaryPassword), mustChangePassword: true },
      });
    } else if (action === 'change_role') {
      if (!role) {
        return NextResponse.json({ error: 'A role is required' }, { status: 400 });
      }
      await prisma.userCompanyAccess.update({
        where: { userId_companyId: { userId: id, companyId: companyId! } },
        data: { role },
      });
    }

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: `user.${action}`,
      entityType: 'User',
      entityId: id,
      metadata: { targetEmail: access.user.email, role },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error updating user:', err);
    return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
  }
}
