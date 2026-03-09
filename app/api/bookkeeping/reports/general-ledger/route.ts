import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { generateGeneralLedger } from '@/lib/bookkeeping';

// GET /api/bookkeeping/reports/general-ledger
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const accountId = searchParams.get('accountId');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    // Pass date strings directly - generateGeneralLedger handles timezone-safe conversion
    const report = await generateGeneralLedger(
      companyId!,
      startDate,
      endDate,
      accountId || undefined,
    );

    return NextResponse.json(report);
  } catch (err) {
    console.error('Error generating general ledger:', err);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
