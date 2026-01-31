import { NextRequest, NextResponse } from 'next/server';
import { getSession, updateCurrentCompany } from '@/lib/auth';
import { prisma } from '@/lib/db';

export async function POST(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    const { companyId } = await request.json();

    if (!companyId) {
      return NextResponse.json(
        { error: 'Company ID is required' },
        { status: 400 }
      );
    }

    // Verify user has access to this company
    const access = await prisma.userCompanyAccess.findUnique({
      where: {
        userId_companyId: {
          userId: session.userId,
          companyId,
        },
      },
      include: {
        company: true,
      },
    });

    if (!access) {
      return NextResponse.json(
        { error: 'You do not have access to this company' },
        { status: 403 }
      );
    }

    // Update session with new company
    await updateCurrentCompany(companyId);

    return NextResponse.json({
      success: true,
      currentCompanyId: companyId,
      companyName: access.company.companyName,
    });
  } catch (error) {
    console.error('Switch company error:', error);
    return NextResponse.json(
      { error: 'Failed to switch company' },
      { status: 500 }
    );
  }
}
