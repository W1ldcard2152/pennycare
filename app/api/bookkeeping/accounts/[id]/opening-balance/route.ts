import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { validateRequest } from '@/lib/validation';
import { createOpeningBalanceEntry } from '@/lib/bookkeeping';
import { logAudit } from '@/lib/audit';
import { parseBusinessDate } from '@/lib/date-utils';

const openingBalanceSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((v) => Number(v)).refine(
    (val) => val !== 0,
    { message: 'Amount cannot be zero' }
  ),
  date: z.string().min(1, 'Date is required'),
});

// POST /api/bookkeeping/accounts/[id]/opening-balance
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('APPROVER');
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

    // Create the opening balance journal entry using timezone-safe date.
    // The JE service writes the tier-1 create audit row; this adds a tier-2
    // context row naming the account so the audit trail is searchable.
    const entry = await createOpeningBalanceEntry(
      companyId!,
      id,
      amount,
      parseBusinessDate(date),
      { userId: session!.userId, role: role! },
    );

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'opening_balance.create',
      entityType: 'JournalEntry',
      entityId: entry.id,
      metadata: {
        accountId: id,
        accountName: account.name,
        accountCode: account.code,
        amount,
        date,
        journalEntryNumber: entry.entryNumber,
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
