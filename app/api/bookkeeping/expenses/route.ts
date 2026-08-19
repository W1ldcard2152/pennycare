import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createExpenseSchema, validateRequest } from '@/lib/validation';
import { createEntry } from '@/lib/journal-entry-service';
import { logAudit } from '@/lib/audit';
import { parseBusinessDate, startOfDay, endOfDay } from '@/lib/date-utils';

// GET /api/bookkeeping/expenses
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const category = searchParams.get('category');
    const vendorId = searchParams.get('vendorId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = { companyId: companyId! };
    if (startDateStr || endDateStr) {
      where.date = {};
      if (startDateStr) (where.date as Record<string, unknown>).gte = startOfDay(startDateStr);
      if (endDateStr) (where.date as Record<string, unknown>).lte = endOfDay(endDateStr);
    }
    if (category) where.category = category;
    if (vendorId) where.vendorId = vendorId;

    const [expenses, total] = await Promise.all([
      prisma.expense.findMany({
        where,
        include: {
          vendor: { select: { id: true, name: true } },
        },
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.expense.count({ where }),
    ]);

    return NextResponse.json({ expenses, total, limit, offset });
  } catch (err) {
    console.error('Error fetching expenses:', err);
    return NextResponse.json({ error: 'Failed to fetch expenses' }, { status: 500 });
  }
}

// POST /api/bookkeeping/expenses
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(createExpenseSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const data = validation.data;
    const amount = Number(data.amount);
    const expenseDate = parseBusinessDate(data.date);
    const paidDate = data.paidDate ? parseBusinessDate(data.paidDate) : null;

    // Expense row + its journal entry commit together (1.2): a JE failure now
    // rolls back the expense rather than leaving an expense with no books entry.
    const actor = { userId: session!.userId, role: role! };
    const { expense, journalEntryId } = await prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          companyId: companyId!,
          date: expenseDate,
          vendorId: data.vendorId || null,
          description: data.description,
          category: data.category,
          amount,
          paymentMethod: data.paymentMethod || null,
          referenceNumber: data.referenceNumber || null,
          isPaid: data.isPaid || false,
          paidDate,
          notes: data.notes || null,
        },
        include: {
          vendor: { select: { id: true, name: true } },
        },
      });

      let journalEntryId: string | null = null;
      if (data.debitAccountId && data.creditAccountId) {
        const vendorName = expense.vendor?.name || 'Unknown';
        const entry = await createEntry(
          actor,
          {
            companyId: companyId!,
            date: expenseDate,
            memo: `Expense: ${data.description}${expense.vendor ? ` (${vendorName})` : ''}`,
            referenceNumber: data.referenceNumber || undefined,
            source: 'expense',
            sourceId: expense.id,
            lines: [
              { accountId: data.debitAccountId, description: data.description, debit: amount, credit: 0 },
              { accountId: data.creditAccountId, description: data.description, debit: 0, credit: amount },
            ],
          },
          tx
        );
        journalEntryId = entry.id;
      }

      return { expense, journalEntryId };
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'expense.create',
      entityType: 'Expense',
      entityId: expense.id,
      metadata: {
        description: data.description,
        amount,
        category: data.category,
        journalEntryId,
      },
    });

    return NextResponse.json({ ...expense, journalEntryId }, { status: 201 });
  } catch (err) {
    console.error('Error creating expense:', err);
    return NextResponse.json({ error: 'Failed to create expense' }, { status: 500 });
  }
}
