import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { generateProfitAndLoss } from '@/lib/bookkeeping';

// GET /api/bookkeeping/reports/profit-loss
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate and endDate are required' }, { status: 400 });
    }

    const report = await generateProfitAndLoss(companyId!, new Date(startDate), new Date(endDate));

    return NextResponse.json(report);
  } catch (err) {
    console.error('Error generating P&L:', err);
    return NextResponse.json({ error: 'Failed to generate report' }, { status: 500 });
  }
}
