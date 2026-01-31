import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';

// GET /api/company - Get company settings for current company
export async function GET() {
  try {
    const session = await getSession();

    if (!session || !session.currentCompanyId) {
      return NextResponse.json(
        { error: 'No company selected' },
        { status: 400 }
      );
    }

    const company = await prisma.company.findUnique({
      where: { id: session.currentCompanyId },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(company);
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company settings' },
      { status: 500 }
    );
  }
}

// PUT /api/company - Update company settings for current company
export async function PUT(request: NextRequest) {
  try {
    const session = await getSession();

    if (!session || !session.currentCompanyId) {
      return NextResponse.json(
        { error: 'No company selected' },
        { status: 400 }
      );
    }

    const data = await request.json();

    // Update existing company
    const company = await prisma.company.update({
      where: { id: session.currentCompanyId },
      data,
    });

    return NextResponse.json(company);
  } catch (error) {
    console.error('Error updating company:', error);
    return NextResponse.json(
      { error: 'Failed to update company settings' },
      { status: 500 }
    );
  }
}
