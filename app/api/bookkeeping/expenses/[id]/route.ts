import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

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
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const existing = await prisma.expense.findFirst({ where: { id, companyId: companyId! } });
    if (!existing) {
      return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    }

    // Void any associated journal entries before deleting the expense
    const relatedEntries = await prisma.journalEntry.findMany({
      where: {
        companyId: companyId!,
        source: 'expense',
        sourceId: id,
        status: 'posted',
      },
    });
    for (const entry of relatedEntries) {
      await prisma.journalEntry.update({
        where: { id: entry.id },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidReason: 'Auto-voided: associated expense was deleted',
        },
      });
    }

    await prisma.expense.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting expense:', err);
    return NextResponse.json({ error: 'Failed to delete expense' }, { status: 500 });
  }
}
