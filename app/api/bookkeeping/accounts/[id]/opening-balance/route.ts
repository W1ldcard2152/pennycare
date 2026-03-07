import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { validateRequest } from '@/lib/validation';
import { createOpeningBalanceEntry } from '@/lib/bookkeeping';

const openingBalanceSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((v) => Number(v)).refine(
    (val) => val > 0,
    { message: 'Amount must be positive' }
  ),
  date: z.string().min(1, 'Date is required'),
});

// POST /api/bookkeeping/accounts/[id]/opening-balance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const validation = validateRequest(openingBalanceSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { amount, date } = validation.data;

    // Verify the account exists and belongs to this company
    const account = await prisma.account.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Create the opening balance journal entry
    const entry = await createOpeningBalanceEntry(
      companyId!,
      id,
      amount,
      new Date(date),
    );

    // Log audit entry
    await prisma.auditLog.create({
      data: {
        userId: session!.userId,
        companyId: companyId!,
        action: 'CREATE_OPENING_BALANCE',
        entityType: 'JournalEntry',
        entityId: entry.id,
        metadata: JSON.stringify({
          accountId: id,
          accountName: account.name,
          accountCode: account.code,
          amount,
          date,
          journalEntryNumber: entry.entryNumber,
        }),
      },
    });

    return NextResponse.json({
      success: true,
      journalEntry: {
        id: entry.id,
        entryNumber: entry.entryNumber,
        date: entry.date,
        memo: entry.memo,
      },
    }, { status: 201 });
  } catch (err) {
    console.error('Error creating opening balance:', err);
    const message = err instanceof Error ? err.message : 'Failed to create opening balance';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
