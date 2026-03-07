import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { testRules } from '@/lib/transaction-rules';

// POST /api/bookkeeping/rules/test - Test a description against rules
export async function POST(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const body = await request.json();
    const { description, sourceAccountId } = body;

    if (!description || typeof description !== 'string') {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    const matches = await testRules(companyId!, description, sourceAccountId || null);

    return NextResponse.json({
      description,
      matchCount: matches.length,
      matches,
      // The first match would be the one that would be applied
      appliedMatch: matches.length > 0 ? matches[0] : null,
    });
  } catch (err) {
    console.error('Error testing rules:', err);
    return NextResponse.json({ error: 'Failed to test rules' }, { status: 500 });
  }
}
