import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { validateRequest, startReconciliationSchema } from '@/lib/validation';
import { parseBusinessDate, startOfDay, endOfDay, formatDate } from '@/lib/date-utils';
import { logAudit } from '@/lib/audit';

// POST /api/bookkeeping/reconciliation/start
// Creates a new reconciliation for an account
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(startReconciliationSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { accountId, statementStartDate, statementEndDate, statementBalance } = validation.data;

    // Verify account belongs to company and is reconcilable
    const account = await prisma.account.findFirst({
      where: {
        id: accountId,
        companyId: companyId!,
        isActive: true,
        OR: [
          { type: 'asset', accountGroup: 'Cash' },
          { type: 'credit_card' },
        ],
      },
    });

    if (!account) {
      return NextResponse.json({ error: 'Account not found or not eligible for reconciliation' }, { status: 404 });
    }

    // Check for existing in-progress reconciliation
    const existingInProgress = await prisma.reconciliation.findFirst({
      where: {
        companyId: companyId!,
        accountId,
        status: 'in_progress',
      },
    });

    if (existingInProgress) {
      return NextResponse.json(
        { error: 'An in-progress reconciliation already exists for this account', existingId: existingInProgress.id },
        { status: 409 }
      );
    }

    // Calculate beginning balance from last completed reconciliation
    const lastCompleted = await prisma.reconciliation.findFirst({
      where: {
        companyId: companyId!,
        accountId,
        status: 'completed',
      },
      orderBy: { statementEndDate: 'desc' },
      select: {
        reconciledBalance: true,
        statementEndDate: true,
      },
    });

    // Beginning balance is the reconciledBalance from last completed reconciliation
    // or 0 if this is the first reconciliation
    const beginningBalance = lastCompleted?.reconciledBalance ?? 0;

    // Create the reconciliation
    const reconciliation = await prisma.reconciliation.create({
      data: {
        companyId: companyId!,
        accountId,
        statementStartDate: parseBusinessDate(statementStartDate),
        statementEndDate: parseBusinessDate(statementEndDate),
        statementBalance,
        status: 'in_progress',
      },
      include: {
        account: {
          select: { id: true, code: true, name: true, type: true, accountGroup: true },
        },
      },
    });

    // Get uncleared transactions for this account (not reconciled, posted, on or before statement end date)
    const unclearedLines = await prisma.journalEntryLine.findMany({
      where: {
        accountId,
        isReconciled: false,
        journalEntry: {
          companyId: companyId!,
          status: 'posted',
          date: { lte: endOfDay(statementEndDate) },
        },
      },
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNumber: true,
            date: true,
            memo: true,
            source: true,
            referenceNumber: true,
          },
        },
      },
      orderBy: {
        journalEntry: { date: 'asc' },
      },
    });

    const transactions = unclearedLines.map((line) => ({
      lineId: line.id,
      entryId: line.journalEntry.id,
      entryNumber: line.journalEntry.entryNumber,
      date: formatDate(line.journalEntry.date),
      memo: line.journalEntry.memo,
      description: line.description,
      source: line.journalEntry.source,
      referenceNumber: line.journalEntry.referenceNumber,
      debit: line.debit,
      credit: line.credit,
      isCleared: false,
    }));

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'reconciliation.start',
      entityType: 'Reconciliation',
      entityId: reconciliation.id,
      metadata: {
        accountId,
        accountCode: account.code,
        accountName: account.name,
        statementStartDate,
        statementEndDate,
        statementBalance,
      },
    });

    return NextResponse.json({
      id: reconciliation.id,
      account: reconciliation.account,
      statementStartDate: formatDate(reconciliation.statementStartDate),
      statementEndDate: formatDate(reconciliation.statementEndDate),
      statementBalance: reconciliation.statementBalance,
      beginningBalance,
      transactions,
      clearedItems: [],
      status: reconciliation.status,
    });
  } catch (err) {
    console.error('Error starting reconciliation:', err);
    return NextResponse.json({ error: 'Failed to start reconciliation' }, { status: 500 });
  }
}
