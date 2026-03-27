import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { isDebitNormal } from '@/lib/bookkeeping';
import { startOfDay, endOfDay } from '@/lib/date-utils';

// GET /api/bookkeeping/accounts/[id]/transactions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;
    const { id } = await params;

    // Get query params
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const offset = (page - 1) * limit;

    // Verify the account exists and belongs to this company
    const account = await prisma.account.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Build date filter using timezone-safe date handling
    const dateFilter: Record<string, unknown> = {};
    if (startDate) dateFilter.gte = startOfDay(startDate);
    if (endDate) dateFilter.lte = endOfDay(endDate);

    // Get journal entry lines for this account with posted entries only
    const whereClause = {
      accountId: id,
      journalEntry: {
        companyId: companyId!,
        status: 'posted',
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      },
    };

    // Get total count for pagination
    const total = await prisma.journalEntryLine.count({ where: whereClause });

    // Get the lines with journal entry data
    const lines = await prisma.journalEntryLine.findMany({
      where: whereClause,
      include: {
        journalEntry: {
          select: {
            id: true,
            entryNumber: true,
            date: true,
            memo: true,
            source: true,
          },
        },
      },
      orderBy: [
        { journalEntry: { date: 'asc' } },
        { journalEntry: { entryNumber: 'asc' } },
      ],
      skip: offset,
      take: limit,
    });

    // Calculate totals and running balances
    // For running balance, we need all lines up to the current page
    // to get the correct starting balance
    let startingBalance = 0;
    if (offset > 0) {
      // Get all lines before the current page to calculate starting balance
      const priorLines = await prisma.journalEntryLine.findMany({
        where: whereClause,
        select: { debit: true, credit: true },
        orderBy: [
          { journalEntry: { date: 'asc' } },
          { journalEntry: { entryNumber: 'asc' } },
        ],
        take: offset,
      });

      const accountIsDebitNormal = isDebitNormal(account.type);
      for (const line of priorLines) {
        if (accountIsDebitNormal) {
          startingBalance += line.debit - line.credit;
        } else {
          startingBalance += line.credit - line.debit;
        }
      }
    }

    // Build transactions array with running balance
    const accountIsDebitNormal = isDebitNormal(account.type);
    let runningBalance = startingBalance;
    let totalDebits = 0;
    let totalCredits = 0;

    const transactions = lines.map((line) => {
      totalDebits += line.debit;
      totalCredits += line.credit;

      if (accountIsDebitNormal) {
        runningBalance += line.debit - line.credit;
      } else {
        runningBalance += line.credit - line.debit;
      }

      return {
        id: line.id,
        date: line.journalEntry.date,
        entryNumber: line.journalEntry.entryNumber,
        entryId: line.journalEntry.id,
        memo: line.journalEntry.memo,
        source: line.journalEntry.source,
        description: line.description,
        debit: line.debit,
        credit: line.credit,
        runningBalance: Math.round(runningBalance * 100) / 100,
      };
    });

    // Get total balance for the account (all time, for the header)
    const allLines = await prisma.journalEntryLine.findMany({
      where: {
        accountId: id,
        journalEntry: {
          companyId: companyId!,
          status: 'posted',
        },
      },
      select: { debit: true, credit: true },
    });

    let balance = 0;
    for (const line of allLines) {
      if (accountIsDebitNormal) {
        balance += line.debit - line.credit;
      } else {
        balance += line.credit - line.debit;
      }
    }
    balance = Math.round(balance * 100) / 100;

    // Check for existing opening balance entry
    const openingBalanceEntry = await prisma.journalEntry.findFirst({
      where: {
        companyId: companyId!,
        source: 'opening_balance',
        sourceId: id,
        status: 'posted',
      },
      include: {
        lines: {
          where: { accountId: id },
        },
      },
      orderBy: { date: 'desc' },
    });

    let openingBalance = null;
    if (openingBalanceEntry && openingBalanceEntry.lines.length > 0) {
      const line = openingBalanceEntry.lines[0];
      const amount = line.debit > 0 ? line.debit : line.credit;
      openingBalance = {
        entryId: openingBalanceEntry.id,
        date: openingBalanceEntry.date,
        amount,
      };
    }

    return NextResponse.json({
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        accountGroup: account.accountGroup,
        description: account.description,
        taxLine: account.taxLine,
        isActive: account.isActive,
      },
      balance,
      openingBalance,
      transactions,
      totals: {
        totalDebits: Math.round(totalDebits * 100) / 100,
        totalCredits: Math.round(totalCredits * 100) / 100,
      },
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error('Error fetching account transactions:', err);
    return NextResponse.json({ error: 'Failed to fetch account transactions' }, { status: 500 });
  }
}
