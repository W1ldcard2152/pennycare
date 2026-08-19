import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { voidEntry } from '@/lib/journal-entry-service';
import { logAudit } from '@/lib/audit';

// GET /api/bookkeeping/statements/batch/[batchName] - Get batch summary
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ batchName: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;
    const { batchName } = await params;

    const decodedBatchName = decodeURIComponent(batchName);

    const imports = await prisma.statementImport.findMany({
      where: {
        companyId: companyId!,
        importBatch: decodedBatchName,
      },
      include: {
        sourceAccount: {
          select: { id: true, code: true, name: true },
        },
      },
    });

    if (imports.length === 0) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    const summary = {
      batchName: decodedBatchName,
      sourceAccount: imports[0].sourceAccount,
      totalCount: imports.length,
      pendingCount: imports.filter((i) => i.status === 'pending').length,
      bookedCount: imports.filter((i) => i.status === 'booked').length,
      skippedCount: imports.filter((i) => i.status === 'skipped').length,
      matchedCount: imports.filter((i) => i.targetAccountId !== null).length,
      unmatchedCount: imports.filter((i) => i.targetAccountId === null).length,
      importedAt: imports[0].importedAt,
    };

    return NextResponse.json(summary);
  } catch (err) {
    console.error('Error fetching batch summary:', err);
    return NextResponse.json({ error: 'Failed to fetch batch summary' }, { status: 500 });
  }
}

// DELETE /api/bookkeeping/statements/batch/[batchName] - Delete/undo an import
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ batchName: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('APPROVER');
    if (error) return error;
    const actor = { userId: session!.userId, role: role! };
    const { batchName } = await params;

    const decodedBatchName = decodeURIComponent(batchName);

    const imports = await prisma.statementImport.findMany({
      where: {
        companyId: companyId!,
        importBatch: decodedBatchName,
      },
    });

    if (imports.length === 0) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // Separate booked and pending imports
    const bookedImports = imports.filter((i) => i.status === 'booked');

    let voidedCount = 0;
    let deletedCount = 0;

    await prisma.$transaction(async (tx) => {
      // For booked imports, void the journal entries via the service (closed-
      // period + reconciled guards, tier-1 audit) on the same transaction.
      for (const imp of bookedImports) {
        if (imp.journalEntryId) {
          await voidEntry(actor, imp.journalEntryId, `Batch import "${decodedBatchName}" was deleted`, tx);
          voidedCount++;
        }
      }

      // For CC imports: also void any journal entries linked by referenceNumber
      // (interest and payment entries are booked immediately without StatementImport records)
      if (decodedBatchName.startsWith('cc-')) {
        const ccJournalEntries = await tx.journalEntry.findMany({
          where: {
            companyId: companyId!,
            source: 'cc_import',
            referenceNumber: decodedBatchName,
            status: 'posted',
          },
          select: { id: true },
        });

        for (const entry of ccJournalEntries) {
          await voidEntry(actor, entry.id, `CC import batch "${decodedBatchName}" was deleted`, tx);
          voidedCount++;
        }
      }

      // Delete all imports in the batch
      await tx.statementImport.deleteMany({
        where: {
          companyId: companyId!,
          importBatch: decodedBatchName,
        },
      });
      deletedCount = imports.length;
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'statement.batch_delete',
      entityType: 'StatementImport',
      entityId: decodedBatchName,
      metadata: {
        batchName: decodedBatchName,
        deletedCount,
        voidedJournalEntries: voidedCount,
      },
    });

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      voidedJournalEntries: voidedCount,
    });
  } catch (err) {
    console.error('Error deleting batch:', err);
    return NextResponse.json({ error: 'Failed to delete batch' }, { status: 500 });
  }
}
