import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// Confirm the feedback row was submitted by a user with access to the active
// company before an APPROVER+ of that company can touch it — prevents
// cross-tenant archive/delete.
async function feedbackInCompany(feedbackId: string, companyId: string): Promise<boolean> {
  const feedback = await prisma.feedback.findUnique({
    where: { id: feedbackId },
    select: { userId: true },
  });
  if (!feedback) return false;
  const access = await prisma.userCompanyAccess.findUnique({
    where: { userId_companyId: { userId: feedback.userId, companyId } },
    select: { id: true },
  });
  return Boolean(access);
}

// PATCH /api/feedback/[id] - Archive/unarchive feedback (APPROVER+)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, companyId } = await requireCompanyAccess('APPROVER');
  if (error) return error;
  const { id } = await params;

  if (!(await feedbackInCompany(id, companyId!))) {
    return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
  }

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

// DELETE /api/feedback/[id] - Delete feedback (APPROVER+)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error, companyId } = await requireCompanyAccess('APPROVER');
  if (error) return error;
  const { id } = await params;

  if (!(await feedbackInCompany(id, companyId!))) {
    return NextResponse.json({ error: 'Feedback not found' }, { status: 404 });
  }

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
