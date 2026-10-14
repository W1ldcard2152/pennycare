import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { filingDetailsSchema, validateRequest } from '@/lib/validation';
import { describeFilingError, updateFilingDetails, withdrawFiling } from '@/lib/tax-filing-service';

// GET /api/bookkeeping/tax-filings/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('VIEWER');
    if (error) return error;

    const { id } = await params;
    const filing = await prisma.taxFiling.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!filing) {
      return NextResponse.json({ error: 'Tax filing not found' }, { status: 404 });
    }
    return NextResponse.json(filing);
  } catch (err) {
    console.error('Error fetching tax filing:', err);
    return NextResponse.json({ error: 'Failed to fetch tax filing' }, { status: 500 });
  }
}

// PATCH /api/bookkeeping/tax-filings/[id] — correct a filed 941 / NYS-45's
// filed date, method, confirmation # or notes. The figures and the books are
// untouched; changing those is File again on the form page.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;

    const validation = validateRequest(filingDetailsSchema, await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { id } = await params;
    const updated = await updateFilingDetails({ userId: session!.userId, role: role! }, companyId!, id, validation.data);
    return NextResponse.json(updated);
  } catch (err) {
    const known = describeFilingError(err);
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    console.error('Error updating tax filing details:', err);
    return NextResponse.json({ error: 'Failed to update the filing' }, { status: 500 });
  }
}

// DELETE /api/bookkeeping/tax-filings/[id] — voids the filing record. Use this
// for filings recorded in error. Its adjusting journal entry is voided with it;
// payments recorded with the filing are left for Tax Deposits to void.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('APPROVER');
    if (error) return error;

    const { id } = await params;
    const updated = await withdrawFiling({ userId: session!.userId, role: role! }, companyId!, id, 'void');

    return NextResponse.json(updated);
  } catch (err) {
    const known = describeFilingError(err);
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    console.error('Error voiding tax filing:', err);
    return NextResponse.json({ error: 'Failed to void tax filing' }, { status: 500 });
  }
}
