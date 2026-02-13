import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/tax-filings - List all filings for the company
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const filings = await prisma.taxFiling.findMany({
      where: { companyId: companyId! },
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }, { formType: 'asc' }],
    });

    return NextResponse.json(filings);
  } catch (error) {
    console.error('Error fetching tax filings:', error);
    return NextResponse.json({ error: 'Failed to fetch tax filings' }, { status: 500 });
  }
}

// POST /api/tax-filings - Create or upsert a filing record
export async function POST(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('payroll');
    if (error) return error;

    const body = await request.json();
    const { formType, year, quarter, status, filedDate, confirmationNumber, notes } = body;

    if (!formType || !year) {
      return NextResponse.json({ error: 'formType and year are required' }, { status: 400 });
    }

    const validFormTypes = ['941', 'nys45', '940', 'w2'];
    if (!validFormTypes.includes(formType)) {
      return NextResponse.json({ error: `Invalid formType. Must be one of: ${validFormTypes.join(', ')}` }, { status: 400 });
    }

    // Find existing filing by compound key (using findFirst because quarter can be null)
    const parsedYear = parseInt(year);
    const parsedQuarter = quarter ? parseInt(quarter) : null;

    const existing = await prisma.taxFiling.findFirst({
      where: { companyId: companyId!, formType, year: parsedYear, quarter: parsedQuarter },
    });

    const filing = existing
      ? await prisma.taxFiling.update({
          where: { id: existing.id },
          data: {
            status: status || 'filed',
            filedDate: filedDate ? new Date(filedDate) : new Date(),
            confirmationNumber: confirmationNumber || null,
            notes: notes || null,
          },
        })
      : await prisma.taxFiling.create({
          data: {
            companyId: companyId!,
            formType,
            year: parsedYear,
            quarter: parsedQuarter,
            status: status || 'filed',
            filedDate: filedDate ? new Date(filedDate) : new Date(),
            confirmationNumber: confirmationNumber || null,
            notes: notes || null,
          },
        });

    return NextResponse.json(filing);
  } catch (error) {
    console.error('Error creating tax filing:', error);
    return NextResponse.json({ error: 'Failed to create tax filing' }, { status: 500 });
  }
}
