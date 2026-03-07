import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';

// DELETE /api/bookkeeping/ebay/import/[batchName] - Undo an import batch
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ batchName: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('payroll');
    if (error) return error;

    const { batchName } = await params;

    if (!batchName) {
      return NextResponse.json({ error: 'Batch name is required' }, { status: 400 });
    }

    const decodedBatchName = decodeURIComponent(batchName);

    // Find all sales in this batch
    const salesToDelete = await prisma.ebaySale.findMany({
      where: {
        companyId: companyId!,
        importBatch: decodedBatchName,
      },
      select: {
        id: true,
        journalEntryId: true,
        grossAmount: true,
        totalFees: true,
        netAmount: true,
      },
    });

    if (salesToDelete.length === 0) {
      return NextResponse.json(
        { error: `No sales found for batch "${decodedBatchName}"` },
        { status: 404 }
      );
    }

    // Get unique journal entry IDs
    const journalEntryIds = [...new Set(
      salesToDelete
        .filter((s) => s.journalEntryId)
        .map((s) => s.journalEntryId!)
    )];

    // Calculate totals before deletion
    const totals = salesToDelete.reduce(
      (acc, s) => ({
        grossAmount: acc.grossAmount + s.grossAmount,
        totalFees: acc.totalFees + s.totalFees,
        netAmount: acc.netAmount + s.netAmount,
      }),
      { grossAmount: 0, totalFees: 0, netAmount: 0 }
    );

    // Perform deletion in transaction
    const result = await prisma.$transaction(async (tx) => {
      // Delete eBay sales first (they reference journal entries)
      const deleteResult = await tx.ebaySale.deleteMany({
        where: {
          companyId: companyId!,
          importBatch: decodedBatchName,
        },
      });

      // Void associated journal entries (don't delete, just void for audit trail)
      let voidedEntries = 0;
      for (const entryId of journalEntryIds) {
        await tx.journalEntry.update({
          where: { id: entryId },
          data: {
            status: 'voided',
            voidedAt: new Date(),
            voidedBy: session!.userId,
            voidReason: `Batch import "${decodedBatchName}" was deleted`,
          },
        });
        voidedEntries++;
      }

      return {
        deletedSales: deleteResult.count,
        voidedEntries,
      };
    });

    // Audit log
    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'ebay.import_delete',
      entityType: 'EbaySale',
      entityId: decodedBatchName,
      metadata: {
        batchName: decodedBatchName,
        deletedSales: result.deletedSales,
        voidedJournalEntries: result.voidedEntries,
        totals,
      },
    });

    return NextResponse.json({
      success: true,
      batchName: decodedBatchName,
      deletedSales: result.deletedSales,
      voidedJournalEntries: result.voidedEntries,
      totals: {
        grossAmount: Math.round(totals.grossAmount * 100) / 100,
        totalFees: Math.round(totals.totalFees * 100) / 100,
        netAmount: Math.round(totals.netAmount * 100) / 100,
      },
    });
  } catch (err) {
    console.error('Error deleting eBay import batch:', err);
    return NextResponse.json(
      { error: 'Failed to delete eBay import batch' },
      { status: 500 }
    );
  }
}
