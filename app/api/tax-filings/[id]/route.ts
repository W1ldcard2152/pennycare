import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { describeFilingError, withdrawFiling } from '@/lib/tax-filing-service';

// 941 / NYS-45 filings are tied to an adjusting journal entry; their status is
// changed only through the filing service so that entry stays in step.
const QUARTERLY_RETURNS = ['941', 'nys45'];

// PUT /api/tax-filings/[id] - Update a filing record
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('BOOKKEEPER');
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
    if (status !== undefined && status !== existing.status && QUARTERLY_RETURNS.includes(existing.formType)) {
      return NextResponse.json(
        { error: 'Change the status of a 941 or NYS-45 from its form page so the books stay in step.' },
        { status: 400 }
      );
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

// DELETE /api/tax-filings/[id] - Un-file. Voids the filing's adjusting entry;
// a return with saved edits drops back to a draft, anything else is removed.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('APPROVER');
    if (error) return error;

    const { id } = await params;
    await withdrawFiling({ userId: session!.userId, role: role! }, companyId!, id, 'unfile');

    return NextResponse.json({ success: true });
  } catch (error) {
    const known = describeFilingError(error);
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    console.error('Error deleting tax filing:', error);
    return NextResponse.json({ error: 'Failed to delete tax filing' }, { status: 500 });
  }
}
