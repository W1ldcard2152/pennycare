import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
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

// GET /api/feedback - List all feedback (admin only)
export async function GET(request: NextRequest) {
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

  const { searchParams } = new URL(request.url);
  const showArchived = searchParams.get('archived') === 'true';

  try {
    const feedbackList = await prisma.feedback.findMany({
      where: {
        archived: showArchived,
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
