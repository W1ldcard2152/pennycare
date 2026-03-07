import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// PUT /api/tax-filings/[id] - Update a filing record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('payroll');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();
    const { status, filedDate, confirmationNumber, notes } = body;

    // Verify filing belongs to this company
    const existing = await prisma.taxFiling.findFirst({
      where: { id, companyId: companyId! },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Tax filing not found' }, { status: 404 });
    }

    const filing = await prisma.taxFiling.update({
      where: { id },
      data: {
        ...(status !== undefined && { status }),
        ...(filedDate !== undefined && { filedDate: filedDate ? new Date(filedDate) : null }),
        ...(confirmationNumber !== undefined && { confirmationNumber }),
        ...(notes !== undefined && { notes }),
      },
    });

    return NextResponse.json(filing);
  } catch (error) {
    console.error('Error updating tax filing:', error);
    return NextResponse.json({ error: 'Failed to update tax filing' }, { status: 500 });
  }
}

// DELETE /api/tax-filings/[id] - Delete a filing record (un-file)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;

    const { id } = await params;

    // Verify filing belongs to this company
    const existing = await prisma.taxFiling.findFirst({
      where: { id, companyId: companyId! },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Tax filing not found' }, { status: 404 });
    }

    await prisma.taxFiling.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting tax filing:', error);
    return NextResponse.json({ error: 'Failed to delete tax filing' }, { status: 500 });
  }
}
