import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { generateTrialBalance } from '@/lib/bookkeeping';

// GET /api/bookkeeping/reports/trial-balance
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const asOfDate = searchParams.get('asOfDate');

    if (!asOfDate) {
      return NextResponse.json({ error: 'asOfDate is required' }, { status: 400 });
    }

    const report = await generateTrialBalance(companyId!, new Date(asOfDate));

    return NextResponse.json(report);
  } catch (err) {
    console.error('Error generating trial balance:', err);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
