import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { seedChartOfAccounts } from '@/lib/bookkeeping';
import { seedAccountsSchema, validateRequest } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

// POST /api/bookkeeping/accounts/seed
//
// Seeds the chart of accounts. Accepts an optional body:
//   { tier?: 'basic' | 'business' | 'business_payroll', additionalCodes?: string[] }
// Tier defaults to 'basic' if omitted. Codes already present for this
// company are skipped — the operation is idempotent.
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    // Accept empty body (backward-compat) — default tier kicks in
    let body: unknown = {};
    try {
      const text = await request.text();
      if (text.trim().length > 0) {
        body = JSON.parse(text);
      }
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const validation = validateRequest(seedAccountsSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { tier, additionalCodes } = validation.data;

    const result = await seedChartOfAccounts(companyId!, { tier, additionalCodes });

    if (result.created > 0) {
      await logAudit({
        companyId: companyId!,
        userId: session!.userId,
        action: 'accounts.seed',
        entityType: 'Company',
        entityId: companyId!,
        metadata: {
          tier,
          additionalCodes,
          created: result.created,
          skipped: result.skipped,
          createdCodes: result.accounts.map((a) => a.code),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `Created ${result.created} account(s)${result.skipped > 0 ? `, skipped ${result.skipped} existing` : ''}`,
      accountsCreated: result.created,
      created: result.created,
      skipped: result.skipped,
      accounts: result.accounts,
    });
  } catch (err) {
    console.error('Error seeding accounts:', err);
    return NextResponse.json({ error: 'Failed to seed accounts' }, { status: 500 });
  }
}
