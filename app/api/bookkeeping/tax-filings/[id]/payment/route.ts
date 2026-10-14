import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { returnPaymentSchema, validateRequest } from '@/lib/validation';
import { describeFilingError, recordFilingPayment } from '@/lib/tax-filing-service';

// POST /api/bookkeeping/tax-filings/[id]/payment — record a payment for a
// filed 941 / NYS-45 without filing it again: the original remittance if it
// wasn't recorded when filing, or a later one. Same TaxDeposit + journal
// entry as "Record payment now" in the file dialog.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;

    const validation = validateRequest(returnPaymentSchema, await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { id } = await params;
    const payment = { ...validation.data, confirmationNumber: validation.data.confirmationNumber ?? null };
    const deposit = await recordFilingPayment({ userId: session!.userId, role: role! }, companyId!, id, payment);
    return NextResponse.json(deposit, { status: 201 });
  } catch (err) {
    const known = describeFilingError(err);
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    console.error('Error recording return payment:', err);
    return NextResponse.json({ error: 'Failed to record the payment' }, { status: 500 });
  }
}
