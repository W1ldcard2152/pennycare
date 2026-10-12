import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCompanyAccess } from '@/lib/api-utils';
import { validateRequest } from '@/lib/validation';
import { describeFilingError, moveFiling } from '@/lib/tax-filing-service';

const moveFilingSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  quarter: z.number().int().min(1).max(4),
  swap: z.boolean().optional(),
});

// POST /api/bookkeeping/tax-filings/[id]/move — a filed 941 / NYS-45 recorded
// under the wrong quarter. Moving a return that has an adjusting entry voids
// it, so that case needs APPROVER+ (enforced by the JE service), like re-filing.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;

    const validation = validateRequest(moveFilingSchema, await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { id } = await params;
    const result = await moveFiling({ userId: session!.userId, role: role! }, companyId!, id, validation.data);
    return NextResponse.json(result);
  } catch (err) {
    const known = describeFilingError(err);
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    console.error('Error moving tax filing:', err);
    return NextResponse.json({ error: 'Failed to move the filing' }, { status: 500 });
  }
}
