import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/company - Get company settings for current company
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const company = await prisma.company.findUnique({
      where: { id: companyId! },
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
    const { error, companyId } = await requireCompanyAccess('owner');
    if (error) return error;

    const data = await request.json();

    const company = await prisma.company.update({
      where: { id: companyId! },
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
