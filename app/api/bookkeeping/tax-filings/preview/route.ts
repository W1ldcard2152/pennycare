import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { taxReturnOverridesSchema, validateRequest } from '@/lib/validation';
import { describeFilingError, previewFiling } from '@/lib/tax-filing-service';

// POST /api/bookkeeping/tax-filings/preview
//   { formType: '941' | 'NYS-45', taxPeriodYear, taxPeriodQuarter, overrides }
// What filing the return with these overrides would post to the books — the
// adjusting entry's lines and the suggested payment. Writes nothing.
export async function POST(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;

    const validation = validateRequest(taxReturnOverridesSchema, await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }
    const data = validation.data;
    const preview = await previewFiling(
      companyId!,
      data.formType === 'NYS-45' ? 'nys45' : '941',
      data.taxPeriodYear,
      parseInt(data.taxPeriodQuarter.slice(1)),
      data.overrides
    );
    return NextResponse.json(preview);
  } catch (err) {
    const known = describeFilingError(err);
    if (known) return NextResponse.json({ error: known.message }, { status: known.status });
    console.error('Error previewing tax filing:', err);
    return NextResponse.json({ error: 'Failed to preview filing' }, { status: 500 });
  }
}
