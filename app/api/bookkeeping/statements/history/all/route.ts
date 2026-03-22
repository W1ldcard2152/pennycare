import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { startOfDay, endOfDay } from '@/lib/date-utils';

// GET /api/bookkeeping/statements/history/all - Get all import batches (bank + CC) with filters
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const sourceAccountId = searchParams.get('sourceAccountId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where clause - include ALL imports (no cc- prefix filter)
    const where: {
      companyId: string;
      sourceAccountId?: string;
      importedAt?: { gte?: Date; lte?: Date };
    } = {
      companyId: companyId!,
    };

    if (sourceAccountId) {
      where.sourceAccountId = sourceAccountId;
    }

    if (startDate || endDate) {
      where.importedAt = {};
      if (startDate) {
        where.importedAt.gte = startOfDay(startDate);
      }
      if (endDate) {
        where.importedAt.lte = endOfDay(endDate);
      }
    }

    // Get all imports matching filters
    const imports = await prisma.statementImport.findMany({
      where,
      include: {
        sourceAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
      },
      orderBy: { importedAt: 'desc' },
    });

    // Group by batch
    const batchMap = new Map<string, {
      batchName: string;
      sourceAccount: { id: string; code: string; name: string; type: string };
      totalCount: number;
      pendingCount: number;
      bookedCount: number;
      skippedCount: number;
      matchedCount: number;
      unmatchedCount: number;
      importedAt: Date;
      earliestDate: Date | null;
      latestDate: Date | null;
      totalAmount: number;
    }>();

    for (const imp of imports) {
      const existing = batchMap.get(imp.importBatch);
      if (existing) {
        existing.totalCount++;
        if (imp.status === 'pending') existing.pendingCount++;
        if (imp.status === 'booked') existing.bookedCount++;
        if (imp.status === 'skipped') existing.skippedCount++;
        if (imp.targetAccountId) existing.matchedCount++;
        else existing.unmatchedCount++;
        existing.totalAmount += imp.amount;

        // Track date range
        const postDate = new Date(imp.postDate);
        if (!existing.earliestDate || postDate < existing.earliestDate) {
          existing.earliestDate = postDate;
        }
        if (!existing.latestDate || postDate > existing.latestDate) {
          existing.latestDate = postDate;
        }
      } else {
        batchMap.set(imp.importBatch, {
          batchName: imp.importBatch,
          sourceAccount: imp.sourceAccount,
          totalCount: 1,
          pendingCount: imp.status === 'pending' ? 1 : 0,
          bookedCount: imp.status === 'booked' ? 1 : 0,
          skippedCount: imp.status === 'skipped' ? 1 : 0,
          matchedCount: imp.targetAccountId ? 1 : 0,
          unmatchedCount: imp.targetAccountId ? 0 : 1,
          importedAt: imp.importedAt,
          earliestDate: new Date(imp.postDate),
          latestDate: new Date(imp.postDate),
          totalAmount: imp.amount,
        });
      }
    }

    // Convert to array and sort by import date
    const batches = Array.from(batchMap.values()).sort(
      (a, b) => b.importedAt.getTime() - a.importedAt.getTime()
    );

    return NextResponse.json(batches);
  } catch (err) {
    console.error('Error fetching all statement history:', err);
    return NextResponse.json({ error: 'Failed to fetch statement history' }, { status: 500 });
  }
}
