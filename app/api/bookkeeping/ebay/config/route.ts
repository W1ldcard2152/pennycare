import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// Default account codes matching the default chart of accounts
const EBAY_ACCOUNT_DEFAULTS = {
  pendingPayouts: { code: '1120', label: 'eBay Pending Payouts' },
  sales: { code: '4010', label: 'eBay Sales' },
  fees: { code: '6590', label: 'eBay Fees' },
};

// GET /api/bookkeeping/ebay/config - Get eBay account mappings
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const company = await prisma.company.findUnique({
      where: { id: companyId! },
      select: {
        ebayPendingPayoutsAccountId: true,
        ebaySalesAccountId: true,
        ebayFeesAccountId: true,
      },
    });

    // Load the configured accounts (or find defaults by code)
    const [pendingPayoutsAccount, salesAccount, feesAccount] = await Promise.all([
      company?.ebayPendingPayoutsAccountId
        ? prisma.account.findFirst({ where: { id: company.ebayPendingPayoutsAccountId, companyId: companyId!, isActive: true }, select: { id: true, code: true, name: true, type: true } })
        : prisma.account.findFirst({ where: { code: EBAY_ACCOUNT_DEFAULTS.pendingPayouts.code, companyId: companyId!, isActive: true }, select: { id: true, code: true, name: true, type: true } }),
      company?.ebaySalesAccountId
        ? prisma.account.findFirst({ where: { id: company.ebaySalesAccountId, companyId: companyId!, isActive: true }, select: { id: true, code: true, name: true, type: true } })
        : prisma.account.findFirst({ where: { code: EBAY_ACCOUNT_DEFAULTS.sales.code, companyId: companyId!, isActive: true }, select: { id: true, code: true, name: true, type: true } }),
      company?.ebayFeesAccountId
        ? prisma.account.findFirst({ where: { id: company.ebayFeesAccountId, companyId: companyId!, isActive: true }, select: { id: true, code: true, name: true, type: true } })
        : prisma.account.findFirst({ where: { code: EBAY_ACCOUNT_DEFAULTS.fees.code, companyId: companyId!, isActive: true }, select: { id: true, code: true, name: true, type: true } }),
    ]);

    return NextResponse.json({
      pendingPayoutsAccount,
      salesAccount,
      feesAccount,
      isConfigured: !!(company?.ebayPendingPayoutsAccountId && company?.ebaySalesAccountId && company?.ebayFeesAccountId),
      defaults: EBAY_ACCOUNT_DEFAULTS,
    });
  } catch (err) {
    console.error('Error getting eBay config:', err);
    return NextResponse.json({ error: 'Failed to get eBay config' }, { status: 500 });
  }
}

// PUT /api/bookkeeping/ebay/config - Update eBay account mappings
export async function PUT(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json();
    const { pendingPayoutsAccountId, salesAccountId, feesAccountId } = body;

    // Validate that all three account IDs are provided
    if (!pendingPayoutsAccountId || !salesAccountId || !feesAccountId) {
      return NextResponse.json(
        { error: 'All three account mappings are required: pendingPayoutsAccountId, salesAccountId, feesAccountId' },
        { status: 400 }
      );
    }

    // Verify all accounts exist and belong to this company
    const accounts = await prisma.account.findMany({
      where: {
        id: { in: [pendingPayoutsAccountId, salesAccountId, feesAccountId] },
        companyId: companyId!,
        isActive: true,
      },
      select: { id: true, code: true, name: true, type: true },
    });

    const accountMap = new Map(accounts.map((a) => [a.id, a]));
    const missing = [pendingPayoutsAccountId, salesAccountId, feesAccountId].filter((id) => !accountMap.has(id));

    if (missing.length > 0) {
      return NextResponse.json(
        { error: 'One or more selected accounts not found or inactive' },
        { status: 400 }
      );
    }

    // Update company with the new mappings
    await prisma.company.update({
      where: { id: companyId! },
      data: {
        ebayPendingPayoutsAccountId: pendingPayoutsAccountId,
        ebaySalesAccountId: salesAccountId,
        ebayFeesAccountId: feesAccountId,
      },
    });

    return NextResponse.json({
      success: true,
      pendingPayoutsAccount: accountMap.get(pendingPayoutsAccountId),
      salesAccount: accountMap.get(salesAccountId),
      feesAccount: accountMap.get(feesAccountId),
    });
  } catch (err) {
    console.error('Error updating eBay config:', err);
    return NextResponse.json({ error: 'Failed to update eBay config' }, { status: 500 });
  }
}
