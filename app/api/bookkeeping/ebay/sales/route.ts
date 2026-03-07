import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/bookkeeping/ebay/sales - List imported eBay sales
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const importBatch = searchParams.get('importBatch');
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));
    const skip = (page - 1) * limit;

    // Build where clause
    const where: Record<string, unknown> = { companyId: companyId! };

    if (startDate || endDate) {
      where.orderDate = {};
      if (startDate) {
        (where.orderDate as Record<string, Date>).gte = new Date(startDate);
      }
      if (endDate) {
        // Set to end of day
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        (where.orderDate as Record<string, Date>).lte = end;
      }
    }

    if (importBatch) {
      where.importBatch = importBatch;
    }

    // Get total count and paginated sales
    const [sales, total] = await Promise.all([
      prisma.ebaySale.findMany({
        where,
        orderBy: [{ orderDate: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          journalEntry: {
            select: { id: true, entryNumber: true, status: true },
          },
        },
      }),
      prisma.ebaySale.count({ where }),
    ]);

    // Get aggregate totals for the filtered set
    const aggregates = await prisma.ebaySale.aggregate({
      where,
      _sum: {
        grossAmount: true,
        totalFees: true,
        netAmount: true,
        itemSubtotal: true,
        shippingAmount: true,
        discountAmount: true,
        ebayCollectedTax: true,
      },
      _count: true,
    });

    // Get list of unique import batches for filtering
    const batches = await prisma.ebaySale.groupBy({
      by: ['importBatch'],
      where: { companyId: companyId! },
      _count: true,
      _sum: { grossAmount: true, totalFees: true, netAmount: true },
      orderBy: { importBatch: 'desc' },
    });

    return NextResponse.json({
      sales,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
      totals: {
        count: aggregates._count,
        grossAmount: aggregates._sum.grossAmount || 0,
        totalFees: aggregates._sum.totalFees || 0,
        netAmount: aggregates._sum.netAmount || 0,
        itemSubtotal: aggregates._sum.itemSubtotal || 0,
        shippingAmount: aggregates._sum.shippingAmount || 0,
        discountAmount: aggregates._sum.discountAmount || 0,
        ebayCollectedTax: aggregates._sum.ebayCollectedTax || 0,
      },
      batches: batches.map((b) => ({
        name: b.importBatch,
        count: b._count,
        grossAmount: b._sum.grossAmount || 0,
        totalFees: b._sum.totalFees || 0,
        netAmount: b._sum.netAmount || 0,
      })),
    });
  } catch (err) {
    console.error('Error listing eBay sales:', err);
    return NextResponse.json(
      { error: 'Failed to list eBay sales' },
      { status: 500 }
    );
  }
}
