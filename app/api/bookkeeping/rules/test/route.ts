import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { testRules } from '@/lib/transaction-rules';

// POST /api/bookkeeping/rules/test - Test description(s) against rules
export async function POST(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const body = await request.json();
    const { description, descriptions, sourceAccountId } = body;

    // Handle batch mode: array of descriptions
    if (descriptions && Array.isArray(descriptions)) {
      const results: Array<{
        ruleId: string;
        targetAccountId: string;
        targetAccountName: string;
      } | null> = [];

      for (const desc of descriptions) {
        if (typeof desc !== 'string') {
          results.push(null);
          continue;
        }
        const matches = await testRules(companyId!, desc, sourceAccountId || null);
        if (matches.length > 0) {
          results.push({
            ruleId: matches[0].ruleId,
            targetAccountId: matches[0].targetAccountId,
            targetAccountName: matches[0].targetAccountName,
          });
        } else {
          results.push(null);
        }
      }

      return NextResponse.json(results);
    }

    // Handle single description mode (original behavior)
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
