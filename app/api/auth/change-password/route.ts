import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession, hashPassword, verifyPassword } from '@/lib/auth';
import { changePasswordSchema, validateRequest } from '@/lib/validation';
import { logSecurityEvent } from '@/lib/audit';

// POST /api/auth/change-password — the one self-service account mutation.
// Requires the current password. Clears the mustChangePassword flag so a user
// reset by an admin can get back in.
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = validateRequest(changePasswordSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }
    const { currentPassword, newPassword } = validation.data;

    const user = await prisma.user.findUnique({ where: { id: session.userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const valid = await verifyPassword(currentPassword, user.passwordHash);
    if (!valid) {
      await logSecurityEvent({
        action: 'auth.change_password_failed',
        metadata: { userId: user.id, reason: 'invalid_current_password' },
      });
      return NextResponse.json({ error: 'Current password is incorrect' }, { status: 400 });
    }

    if (currentPassword === newPassword) {
      return NextResponse.json({ error: 'New password must differ from the current password' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(newPassword), mustChangePassword: false },
    });

    await logSecurityEvent({
      action: 'auth.change_password',
      metadata: { userId: user.id },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error changing password:', err);
    return NextResponse.json({ error: 'Failed to change password' }, { status: 500 });
  }
}
