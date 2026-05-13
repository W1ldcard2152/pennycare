import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { getFederalPayrollLiability, getNYStatePayrollLiability } from '@/lib/bookkeeping';
import { endOfDay, startOfDay } from '@/lib/date-utils';

// GET /api/bookkeeping/tax-deposits/suggested-amount
//   ?authority=federal_941&periodYear=2026&periodQuarter=Q2
// Returns the outstanding liability balance for the given authority/period.
// Used by the deposit form's "Auto-fill" button.
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const params = request.nextUrl.searchParams;
    const authority = params.get('authority');
    const periodYear = params.get('periodYear');
    const periodQuarter = params.get('periodQuarter'); // "Q1".."Q4" or null

    if (!authority || !periodYear) {
      return NextResponse.json(
        { error: 'authority and periodYear are required' },
        { status: 400 }
      );
    }

    const year = parseInt(periodYear);
    let asOfDate: Date;
    let sinceDate: Date | undefined;

    if (periodQuarter) {
      const qNum = parseInt(periodQuarter.replace('Q', ''));
      if (qNum < 1 || qNum > 4) {
        return NextResponse.json({ error: 'periodQuarter must be Q1-Q4' }, { status: 400 });
      }
      const startMonth = String((qNum - 1) * 3 + 1).padStart(2, '0');
      const endMonth = String(qNum * 3).padStart(2, '0');
      const lastDay = new Date(Date.UTC(year, qNum * 3, 0)).getUTCDate();
      sinceDate = startOfDay(`${year}-${startMonth}-01`);
      asOfDate = endOfDay(`${year}-${endMonth}-${String(lastDay).padStart(2, '0')}`);
    } else {
      // Annual scope
      sinceDate = startOfDay(`${year}-01-01`);
      asOfDate = endOfDay(`${year}-12-31`);
    }

    const isFederal = authority === 'federal_941' || authority === 'federal_940';
    if (isFederal) {
      const liability = await getFederalPayrollLiability(companyId!, asOfDate, sinceDate);
      return NextResponse.json({ scope: 'federal', authority, periodYear: year, periodQuarter, ...liability });
    }

    const stateAuthorities = ['ny_withholding', 'ny_sui', 'ny_dbl_pfl'];
    if (stateAuthorities.includes(authority)) {
      const liability = await getNYStatePayrollLiability(companyId!, asOfDate, sinceDate);
      return NextResponse.json({ scope: 'state', authority, periodYear: year, periodQuarter, ...liability });
    }

    return NextResponse.json({ error: `Unknown authority: ${authority}` }, { status: 400 });
  } catch (err) {
    console.error('Error computing suggested deposit amount:', err);
    return NextResponse.json({ error: 'Failed to compute suggested amount' }, { status: 500 });
  }
}
