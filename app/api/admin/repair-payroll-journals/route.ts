import { NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { repairUnbalancedPayrollJournals } from '@/lib/bookkeeping';

// POST /api/admin/repair-payroll-journals — scan posted payroll JEs in the
// active company for sub-penny drift and absorb each diff into the wage
// expense debit (6010 preferred, 6000 fallback). Idempotent; skips entries
// in closed periods and entries off by more than 5¢ (real imbalance).
export async function POST() {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const summary = await repairUnbalancedPayrollJournals(companyId!, session!.userId);
    return NextResponse.json(summary);
  } catch (err) {
    console.error('Error repairing payroll journals:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Repair failed: ${errorMessage}` }, { status: 500 });
  }
}
