import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import {
  depositBreakdown,
  getPeriodLiability,
  recentQuarters,
  suggestDepositPeriod,
  type LiabilityScope,
} from '@/lib/tax-liability';

const SCOPE_BY_AUTHORITY: Record<string, LiabilityScope> = {
  federal_941: 'federal',
  ny_withholding: 'state',
  ny_sui: 'state',
  ny_dbl_pfl: 'state',
};

// GET /api/bookkeeping/tax-deposits/suggested-amount
//   ?authority=federal_941&periodYear=2026&periodQuarter=Q2
// What is still owed FOR the given period: the period's accrued liability
// less deposits recorded for that period (by tax period, not deposit date —
// see lib/tax-liability.ts). Used by the deposit form's "Auto-fill" button.
//
// Without periodYear, returns the recent-quarter summary the deposit form
// shows, plus the period a new deposit most likely pays.
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('VIEWER');
    if (error) return error;

    const params = request.nextUrl.searchParams;
    const authority = params.get('authority');
    const periodYear = params.get('periodYear');
    const periodQuarter = params.get('periodQuarter'); // "Q1".."Q4" or null

    if (!authority) {
      return NextResponse.json({ error: 'authority is required' }, { status: 400 });
    }
    if (authority === 'federal_940') {
      // FUTA (2150) has no column on TaxDeposit and no line in the deposit
      // journal entry, so there is nothing reliable to suggest.
      return NextResponse.json(
        { error: 'Auto-fill is not available for Form 940 (FUTA) deposits.' },
        { status: 400 }
      );
    }
    const scope = SCOPE_BY_AUTHORITY[authority];
    if (!scope) {
      return NextResponse.json({ error: `Unknown authority: ${authority}` }, { status: 400 });
    }

    if (!periodYear) {
      const now = new Date();
      const quarters = recentQuarters(now, 5);
      const periods = await Promise.all(
        quarters.map((q) => getPeriodLiability(companyId!, scope, q.year, q.quarter))
      );
      return NextResponse.json({
        scope,
        authority,
        periods: periods.map(({ year, quarter, accrued, paid, outstanding }) => ({
          year,
          quarter,
          accrued,
          paid,
          outstanding,
        })),
        suggested: suggestDepositPeriod(periods, quarters[quarters.length - 1]),
      });
    }

    const year = parseInt(periodYear);
    let quarter: number | null = null;
    if (periodQuarter) {
      quarter = parseInt(periodQuarter.replace('Q', ''));
      if (!(quarter >= 1 && quarter <= 4)) {
        return NextResponse.json({ error: 'periodQuarter must be Q1-Q4' }, { status: 400 });
      }
    }

    const liability = await getPeriodLiability(companyId!, scope, year, quarter);
    return NextResponse.json({
      scope,
      authority,
      periodYear: year,
      periodQuarter,
      accrued: liability.accrued,
      paid: liability.paid,
      outstanding: liability.outstanding,
      ...depositBreakdown(liability),
    });
  } catch (err) {
    console.error('Error computing suggested deposit amount:', err);
    return NextResponse.json({ error: 'Failed to compute suggested amount' }, { status: 500 });
  }
}
