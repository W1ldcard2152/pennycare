import { NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { seedChartOfAccounts } from '@/lib/bookkeeping';

// POST /api/bookkeeping/accounts/seed - Seed default chart of accounts
export async function POST() {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;

    const created = await seedChartOfAccounts(companyId!);

    return NextResponse.json({
      success: true,
      message: `Created ${created} account(s)`,
      accountsCreated: created,
    });
  } catch (err) {
    console.error('Error seeding accounts:', err);
    return NextResponse.json({ error: 'Failed to seed accounts' }, { status: 500 });
  }
}
