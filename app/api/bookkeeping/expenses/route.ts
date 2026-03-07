import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createExpenseSchema, validateRequest } from '@/lib/validation';
import { createJournalEntry } from '@/lib/bookkeeping';
import { logAudit } from '@/lib/audit';

// GET /api/bookkeeping/expenses
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const category = searchParams.get('category');
    const vendorId = searchParams.get('vendorId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = { companyId: companyId! };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate);
      if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate);
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
    const { error, companyId, session } = await requireCompanyAccess('payroll');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(createExpenseSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const data = validation.data;
    const amount = Number(data.amount);

    const expense = await prisma.expense.create({
      data: {
        companyId: companyId!,
        date: new Date(data.date),
        vendorId: data.vendorId || null,
        description: data.description,
        category: data.category,
        amount,
        paymentMethod: data.paymentMethod || null,
        referenceNumber: data.referenceNumber || null,
        isPaid: data.isPaid || false,
        paidDate: data.paidDate ? new Date(data.paidDate) : null,
        notes: data.notes || null,
      },
      include: {
        vendor: { select: { id: true, name: true } },
      },
    });

    // Create journal entry if both debit and credit accounts are specified
    let journalEntryId: string | null = null;
    if (data.debitAccountId && data.creditAccountId) {
      try {
        const vendorName = expense.vendor?.name || 'Unknown';
        const entry = await createJournalEntry({
          companyId: companyId!,
          date: new Date(data.date),
          memo: `Expense: ${data.description}${expense.vendor ? ` (${vendorName})` : ''}`,
          referenceNumber: data.referenceNumber || undefined,
          source: 'expense',
          sourceId: expense.id,
          lines: [
            { accountId: data.debitAccountId, description: data.description, debit: amount, credit: 0 },
            { accountId: data.creditAccountId, description: data.description, debit: 0, credit: amount },
          ],
        });
        journalEntryId = entry.id;
      } catch (jeError) {
        console.error('Failed to create journal entry for expense:', jeError);
        // Expense was still created, just without a journal entry
      }
    }

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
