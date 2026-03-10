import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { startOfDay, endOfDay } from '@/lib/date-utils';

// GET /api/bookkeeping/cc-import/history
// Fetches CC import batch history with optional filtering
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const sourceAccountId = searchParams.get('sourceAccountId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build where clause for StatementImport
    const whereClause: Record<string, unknown> = {
      companyId: companyId!,
      importBatch: { startsWith: 'cc-' },
    };

    if (sourceAccountId) {
      whereClause.sourceAccountId = sourceAccountId;
    }

    if (startDate || endDate) {
      whereClause.postDate = {};
      if (startDate) {
        (whereClause.postDate as Record<string, unknown>).gte = startOfDay(startDate);
      }
      if (endDate) {
        (whereClause.postDate as Record<string, unknown>).lte = endOfDay(endDate);
      }
    }

    // Get all matching imports
    const imports = await prisma.statementImport.findMany({
      where: whereClause,
      include: {
        sourceAccount: {
          select: { id: true, code: true, name: true },
        },
      },
      orderBy: [{ importedAt: 'desc' }, { postDate: 'desc' }],
    });

    // Group by batch name
    const batchMap = new Map<string, {
      batchName: string;
      sourceAccount: { id: string; code: string; name: string };
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
        if (!existing.earliestDate || imp.postDate < existing.earliestDate) {
          existing.earliestDate = imp.postDate;
        }
        if (!existing.latestDate || imp.postDate > existing.latestDate) {
          existing.latestDate = imp.postDate;
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
          earliestDate: imp.postDate,
          latestDate: imp.postDate,
          totalAmount: imp.amount,
        });
      }
    }

    // Also fetch journal entries for cc_import source that may not have StatementImport records
    // (interest and direct payment entries)
    const journalEntryWhere: Record<string, unknown> = {
      companyId: companyId!,
      source: 'cc_import',
      referenceNumber: { startsWith: 'cc-' },
    };

    if (startDate || endDate) {
      journalEntryWhere.date = {};
      if (startDate) {
        (journalEntryWhere.date as Record<string, unknown>).gte = startOfDay(startDate);
      }
      if (endDate) {
        (journalEntryWhere.date as Record<string, unknown>).lte = endOfDay(endDate);
      }
    }

    const journalEntries = await prisma.journalEntry.findMany({
      where: journalEntryWhere,
      include: {
        lines: {
          include: {
            account: {
              select: { id: true, code: true, name: true, type: true },
            },
          },
        },
      },
    });

    // Add journal entry info to batch summaries (for interest/payments without StatementImport)
    for (const je of journalEntries) {
      const batchName = je.referenceNumber;
      if (!batchName) continue;

      // Find the CC account in the lines to match with filter
      const ccLine = je.lines.find(l => l.account.type === 'credit_card');
      if (!ccLine) continue;

      // If filtering by sourceAccountId, skip entries that don't match
      if (sourceAccountId && ccLine.account.id !== sourceAccountId) continue;

      const existing = batchMap.get(batchName);
      if (!existing) {
        // This batch has no StatementImport records (could be interest-only or payment-only)
        batchMap.set(batchName, {
          batchName,
          sourceAccount: ccLine.account,
          totalCount: 0,
          pendingCount: 0,
          bookedCount: 0,
          skippedCount: 0,
          matchedCount: 0,
          unmatchedCount: 0,
          importedAt: je.createdAt,
          earliestDate: je.date,
          latestDate: je.date,
          totalAmount: 0,
        });
      }
    }

    // Convert map to array and sort by importedAt descending
    const batches = Array.from(batchMap.values()).sort(
      (a, b) => b.importedAt.getTime() - a.importedAt.getTime()
    );

    return NextResponse.json(batches);
  } catch (err) {
    console.error('Error fetching CC import history:', err);
    return NextResponse.json({ error: 'Failed to fetch CC import history' }, { status: 500 });
  }
}
