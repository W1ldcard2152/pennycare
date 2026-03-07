import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { generateBalanceSheet } from '@/lib/bookkeeping';

// GET /api/bookkeeping/reports/balance-sheet
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const asOfDate = searchParams.get('asOfDate');

    if (!asOfDate) {
      return NextResponse.json({ error: 'asOfDate is required' }, { status: 400 });
    }

    const report = await generateBalanceSheet(companyId!, new Date(asOfDate));

    return NextResponse.json(report);
  } catch (err) {
    console.error('Error generating balance sheet:', err);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
