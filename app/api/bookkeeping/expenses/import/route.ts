import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { importExpenseBatchSchema, validateRequest } from '@/lib/validation';
import { createJournalEntry } from '@/lib/bookkeeping';
import { logAudit } from '@/lib/audit';

// POST /api/bookkeeping/expenses/import - Bulk import expenses from CSV
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('payroll');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(importExpenseBatchSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    const { sourceAccountId, expenses } = validation.data;

    // Verify source account exists and belongs to this company
    const sourceAccount = await prisma.account.findFirst({
      where: { id: sourceAccountId, companyId: companyId!, isActive: true },
    });
    if (!sourceAccount) {
      return NextResponse.json(
        { error: 'Source account not found or inactive' },
        { status: 400 }
      );
    }

    // Verify all debit account IDs exist
    const debitAccountIds = [...new Set(expenses.map((e) => e.debitAccountId))];
    const debitAccounts = await prisma.account.findMany({
      where: { id: { in: debitAccountIds }, companyId: companyId!, isActive: true },
    });
    const validDebitIds = new Set(debitAccounts.map((a) => a.id));
    const invalidDebitIds = debitAccountIds.filter((id) => !validDebitIds.has(id));
    if (invalidDebitIds.length > 0) {
      return NextResponse.json(
        { error: `Invalid debit account IDs: some accounts not found or inactive` },
        { status: 400 }
      );
    }

    const createdExpenses: Array<{ id: string; description: string; amount: number }> = [];
    let journalEntriesCreated = 0;
    const errors: Array<{ index: number; message: string }> = [];

    // Process all expenses in a transaction
    await prisma.$transaction(async (tx) => {
      for (let i = 0; i < expenses.length; i++) {
        const exp = expenses[i];
        const amount = Number(exp.amount);

        try {
          const expense = await tx.expense.create({
            data: {
              companyId: companyId!,
              date: new Date(exp.date),
              description: exp.description,
              category: exp.category || 'miscellaneous',
              amount,
              paymentMethod: exp.paymentMethod || null,
              referenceNumber: exp.referenceNumber || null,
              isPaid: exp.isPaid ?? true,
              paidDate: exp.isPaid !== false ? new Date(exp.date) : null,
              notes: exp.notes || null,
            },
          });

          createdExpenses.push({
            id: expense.id,
            description: expense.description,
            amount: expense.amount,
          });
        } catch (err) {
          errors.push({ index: i, message: `Failed to create expense: ${exp.description}` });
          throw err; // Roll back entire transaction
        }
      }
    });

    // Create journal entries outside the main transaction (best-effort)
    // Each expense gets its own journal entry: debit expense account, credit source account
    for (let i = 0; i < createdExpenses.length; i++) {
      const exp = expenses[i];
      const created = createdExpenses[i];
      const amount = Number(exp.amount);

      try {
        await createJournalEntry({
          companyId: companyId!,
          date: new Date(exp.date),
          memo: `Import: ${exp.description}`,
          referenceNumber: exp.referenceNumber || undefined,
          source: 'expense',
          sourceId: created.id,
          lines: [
            { accountId: exp.debitAccountId, description: exp.description, debit: amount, credit: 0 },
            { accountId: sourceAccountId, description: exp.description, debit: 0, credit: amount },
          ],
        });
        journalEntriesCreated++;
      } catch (jeErr) {
        console.error(`Failed to create journal entry for imported expense ${i}:`, jeErr);
        // Don't fail the whole import for a journal entry failure
      }
    }

    // Audit log
    const totalAmount = createdExpenses.reduce((sum, e) => sum + e.amount, 0);
    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'expense.bulk_import',
      entityType: 'Expense',
      entityId: 'bulk',
      metadata: {
        count: createdExpenses.length,
        totalAmount,
        journalEntriesCreated,
        sourceAccountId,
        sourceAccountCode: sourceAccount.code,
      },
    });

    return NextResponse.json({
      success: true,
      created: createdExpenses.length,
      journalEntriesCreated,
      totalAmount,
      errors: errors.length > 0 ? errors : undefined,
    }, { status: 201 });
  } catch (err) {
    console.error('Error importing expenses:', err);
    return NextResponse.json(
      { error: 'Failed to import expenses' },
      { status: 500 }
    );
  }
}
