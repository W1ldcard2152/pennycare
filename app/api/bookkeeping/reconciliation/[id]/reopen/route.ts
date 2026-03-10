import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { validateRequest, reopenReconciliationSchema } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { formatDate } from '@/lib/date-utils';

// POST /api/bookkeeping/reconciliation/[id]/reopen
// Reopens a completed reconciliation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const validation = validateRequest(reopenReconciliationSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { reason } = validation.data;

    // Get the reconciliation with cleared items
    const reconciliation = await prisma.reconciliation.findFirst({
      where: { id, companyId: companyId! },
      include: {
        account: { select: { code: true, name: true } },
        clearedItems: {
          select: { journalEntryLineId: true },
        },
      },
    });

    if (!reconciliation) {
      return NextResponse.json({ error: 'Reconciliation not found' }, { status: 404 });
    }

    if (reconciliation.status !== 'completed') {
      return NextResponse.json(
        { error: 'Only completed reconciliations can be reopened' },
        { status: 400 }
      );
    }

    // Check if there are any later completed reconciliations for this account
    const laterReconciliations = await prisma.reconciliation.findFirst({
      where: {
        companyId: companyId!,
        accountId: reconciliation.accountId,
        status: 'completed',
        statementEndDate: { gt: reconciliation.statementEndDate },
      },
    });

    if (laterReconciliations) {
      return NextResponse.json(
        {
          error: 'Cannot reopen: there are later reconciliations for this account. Reopen them first.',
        },
        { status: 400 }
      );
    }

    // Un-reconcile all cleared items' journal entry lines
    const lineIds = reconciliation.clearedItems.map((item) => item.journalEntryLineId);
    if (lineIds.length > 0) {
      await prisma.journalEntryLine.updateMany({
        where: { id: { in: lineIds } },
        data: { isReconciled: false },
      });
    }

    // Update the reconciliation status
    const updated = await prisma.reconciliation.update({
      where: { id },
      data: {
        status: 'reopened',
        reopenedAt: new Date(),
        reopenedBy: session!.userId,
        reopenReason: reason.trim(),
        // Clear completion data
        completedAt: null,
        completedBy: null,
        reconciledBalance: null,
        difference: null,
      },
    });

    // Delete cleared items so user can start fresh
    await prisma.reconciledItem.deleteMany({
      where: { reconciliationId: id },
    });

    // If there was an adjusting entry, void it
    if (reconciliation.adjustingEntryId) {
      await prisma.journalEntry.update({
        where: { id: reconciliation.adjustingEntryId },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: session!.userId,
          voidReason: 'Reconciliation reopened',
        },
      });

      // Clear the adjusting entry reference
      await prisma.reconciliation.update({
        where: { id },
        data: { adjustingEntryId: null },
      });
    }

    // Update status to in_progress so user can redo it
    await prisma.reconciliation.update({
      where: { id },
      data: { status: 'in_progress' },
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'reconciliation.reopen',
      entityType: 'Reconciliation',
      entityId: id,
      metadata: {
        accountCode: reconciliation.account.code,
        accountName: reconciliation.account.name,
        statementEndDate: formatDate(reconciliation.statementEndDate),
        reason: reason.trim(),
      },
    });

    return NextResponse.json({
      success: true,
      id: updated.id,
      status: 'in_progress',
    });
  } catch (err) {
    console.error('Error reopening reconciliation:', err);
    return NextResponse.json({ error: 'Failed to reopen reconciliation' }, { status: 500 });
  }
}
