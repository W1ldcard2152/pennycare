import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/employees/next-number - Get the next employee number
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const company = await prisma.company.findUnique({
      where: { id: companyId! },
      select: { nextEmployeeNumber: true },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // Format as zero-padded 3-digit number (e.g., 001, 002, 003)
    const nextNumber = company.nextEmployeeNumber || 1;
    const formattedNumber = String(nextNumber).padStart(3, '0');

    return NextResponse.json({
      nextEmployeeNumber: formattedNumber,
      rawNumber: nextNumber,
    });
  } catch (error) {
    console.error('Error fetching next employee number:', error);
    return NextResponse.json(
      { error: 'Failed to fetch next employee number' },
      { status: 500 }
    );
  }
}
