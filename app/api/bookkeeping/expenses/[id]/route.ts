import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { voidEntry } from '@/lib/journal-entry-service';
import { logAudit } from '@/lib/audit';

// GET /api/bookkeeping/expenses/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;
    const { id } = await params;

    const expense = await prisma.expense.findFirst({
      where: { id, companyId: companyId! },
      include: { vendor: true },
    });
    if (!expense) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    return NextResponse.json(expense);
  } catch (err) {
    console.error('Error fetching expense:', err);
    return NextResponse.json({ error: 'Failed to fetch expense' }, { status: 500 });
  }
}

// DELETE /api/bookkeeping/expenses/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('APPROVER');
    if (error) return error;
    const { id } = await params;

    const existing = await prisma.expense.findFirst({ where: { id, companyId: companyId! } });
    if (!existing) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Void associated journal entries (via the service — closed-period and
    // reconciled guards, voidedBy attribution, tier-1 audit) and hard-delete
    // the expense in one transaction.
    const actor = { userId: session!.userId, role: role! };
    const relatedEntries = await prisma.journalEntry.findMany({
      where: { companyId: companyId!, source: 'expense', sourceId: id, status: 'posted' },
      select: { id: true },
    });
    await prisma.$transaction(async (tx) => {
      for (const entry of relatedEntries) {
        await voidEntry(actor, entry.id, 'Auto-voided: associated expense was deleted', tx);
      }
      await tx.expense.delete({ where: { id } });
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'expense.delete',
      entityType: 'Expense',
      entityId: id,
      metadata: {
        description: existing.description,
        amount: existing.amount,
        voidedJournalEntries: relatedEntries.length,
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting expense:', err);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
