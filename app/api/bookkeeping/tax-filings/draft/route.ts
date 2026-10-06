import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { taxReturnOverridesSchema, validateRequest } from '@/lib/validation';
import { describeFilingError, saveReturnDraft } from '@/lib/tax-filing-service';

// PUT /api/bookkeeping/tax-filings/draft
//   { formType: '941' | 'NYS-45', taxPeriodYear, taxPeriodQuarter, overrides }
// Saves the filer's line edits for an unfiled return. An empty overrides map
// resets the return to the computed figures. 409 once the return is filed.
export async function PUT(request: NextRequest) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;

    const validation = validateRequest(taxReturnOverridesSchema, await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }
    const data = validation.data;
    const filing = await saveReturnDraft(
      { userId: session!.userId, role: role! },
      companyId!,
      data.formType === 'NYS-45' ? 'nys45' : '941',
      data.taxPeriodYear,
      parseInt(data.taxPeriodQuarter.slice(1)),
      data.overrides
    );
    return NextResponse.json({ id: filing.id, status: filing.status });
  } catch (err) {
    const known = describeFilingError(err);
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    console.error('Error saving tax return draft:', err);
    return NextResponse.json({ error: 'Failed to save draft' }, { status: 500 });
  }
}
