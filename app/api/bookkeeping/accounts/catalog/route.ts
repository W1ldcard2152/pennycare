import { NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import {
  ACCOUNT_CATALOG,
  CATALOG_GROUPS,
  ACCOUNT_DEPENDENCIES,
  RESERVED_RANGES,
  TIER_INFO,
  TIER_ORDER,
  getAccountsForTier,
} from '@/lib/account-catalog';

// GET /api/bookkeeping/accounts/catalog
//
// Returns the full account catalog (tier definitions, accounts, functional
// groups, dependencies, reserved ranges). The onboarding UI uses this to
// render tier cards, the per-account customization grid, and the
// dependency-resolution hints.
export async function GET() {
  try {
    const { error } = await requireCompanyAccess();
    if (error) return error;

    const tiers = Object.fromEntries(
      TIER_ORDER.map((tier) => [
        tier,
        {
          name: TIER_INFO[tier].name,
          description: TIER_INFO[tier].description,
          highlights: TIER_INFO[tier].highlights,
          accountCount: getAccountsForTier(tier).length,
          // Codes included by selecting this tier (transitive: includes lower tiers)
          codes: getAccountsForTier(tier).map((a) => a.code),
        },
      ]),
    );

    return NextResponse.json({
      tiers,
      tierOrder: TIER_ORDER,
      accounts: ACCOUNT_CATALOG,
      groups: CATALOG_GROUPS,
      dependencies: ACCOUNT_DEPENDENCIES,
      reservedRanges: RESERVED_RANGES,
    });
  } catch (err) {
    console.error('Error fetching account catalog:', err);
    return NextResponse.json({ error: 'Failed to fetch catalog' }, { status: 500 });
  }
}
