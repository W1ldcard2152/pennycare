import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

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
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
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
      // For booked imports, void the journal entries
      for (const imp of bookedImports) {
        if (imp.journalEntryId) {
          await tx.journalEntry.update({
            where: { id: imp.journalEntryId },
            data: {
              status: 'voided',
              voidedAt: new Date(),
              voidedBy: session!.userId,
              voidReason: `Batch import "${decodedBatchName}" was deleted`,
            },
          });
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
        });

        for (const entry of ccJournalEntries) {
          await tx.journalEntry.update({
            where: { id: entry.id },
            data: {
              status: 'voided',
              voidedAt: new Date(),
              voidedBy: session!.userId,
              voidReason: `CC import batch "${decodedBatchName}" was deleted`,
            },
          });
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

    // Log audit entry
    await prisma.auditLog.create({
      data: {
        userId: session!.userId,
        companyId: companyId!,
        action: 'STATEMENT_BATCH_DELETE',
        entityType: 'StatementImport',
        entityId: decodedBatchName,
        metadata: JSON.stringify({
          batchName: decodedBatchName,
          deletedCount,
          voidedJournalEntries: voidedCount,
        }),
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
