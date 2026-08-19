import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { requireCompanyAccess } from '@/lib/api-utils';
import { z } from 'zod';
import { validateRequest } from '@/lib/validation';

const createFeedbackSchema = z.object({
  feedbackText: z.string().min(1, 'Feedback text is required').max(5000),
  page: z.string().optional(),
});

// POST /api/feedback - Create new feedback
export async function POST(request: NextRequest) {
  const session = await getSession();

  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const validation = validateRequest(createFeedbackSchema, body);

    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    const { feedbackText, page } = validation.data;

    const feedback = await prisma.feedback.create({
      data: {
        userId: session.userId,
        feedbackText,
        page,
      },
    });

    return NextResponse.json({ feedback }, { status: 201 });
  } catch (error) {
    console.error('Error creating feedback:', error);
    return NextResponse.json({ error: 'Failed to create feedback' }, { status: 500 });
  }
}

// GET /api/feedback - List feedback (APPROVER+ of the current company).
//
// Scoped to users who have access to the active company — previously this read
// ALL feedback across every company for anyone who was owner/admin of ANY
// company (a cross-tenant leak, harmless single-user but wrong in team mode).
export async function GET(request: NextRequest) {
  const { error, companyId } = await requireCompanyAccess('APPROVER');
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const showArchived = searchParams.get('archived') === 'true';

  try {
    // Restrict to feedback submitted by users who have access to this company.
    const companyUserIds = (
      await prisma.userCompanyAccess.findMany({
        where: { companyId: companyId! },
        select: { userId: true },
      })
    ).map((a) => a.userId);

    const feedbackList = await prisma.feedback.findMany({
      where: {
        archived: showArchived,
        userId: { in: companyUserIds },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Get user info for each feedback
    const userIds = [...new Set(feedbackList.map((f) => f.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true, email: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const feedbackWithUsers = feedbackList.map((f) => ({
      ...f,
      user: userMap.get(f.userId) || null,
    }));

    return NextResponse.json({ feedback: feedbackWithUsers });
  } catch (error) {
    console.error('Error fetching feedback:', error);
    return NextResponse.json({ error: 'Failed to fetch feedback' }, { status: 500 });
  }
}
