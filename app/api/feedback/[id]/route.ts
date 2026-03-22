import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

// PATCH /api/feedback/[id] - Archive/unarchive feedback
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Check if user is an owner/admin of any company
  const access = await prisma.userCompanyAccess.findFirst({
    where: {
      userId: session.userId,
      role: { in: ['owner', 'admin'] },
    },
  });

  if (!access) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { archived } = body;

    const feedback = await prisma.feedback.update({
      where: { id },
      data: {
        archived: archived ?? true,
        archivedAt: archived ? new Date() : null,
      },
    });

    return NextResponse.json({ feedback });
  } catch (error) {
    console.error('Error updating feedback:', error);
    return NextResponse.json({ error: 'Failed to update feedback' }, { status: 500 });
  }
}

// DELETE /api/feedback/[id] - Delete feedback
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Check if user is an owner/admin of any company
  const access = await prisma.userCompanyAccess.findFirst({
    where: {
      userId: session.userId,
      role: { in: ['owner', 'admin'] },
    },
  });

  if (!access) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
  }

  const { id } = await params;

  try {
    await prisma.feedback.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting feedback:', error);
    return NextResponse.json({ error: 'Failed to delete feedback' }, { status: 500 });
  }
}
