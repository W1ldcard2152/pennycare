import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createAccountSchema, validateRequest } from '@/lib/validation';

// GET /api/bookkeeping/accounts - List all accounts with balances
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const includeBalances = searchParams.get('balances') !== 'false';

    const accounts = await prisma.account.findMany({
      where: { companyId: companyId! },
      orderBy: { code: 'asc' },
    });

    if (!includeBalances) {
      return NextResponse.json(accounts);
    }

    // Aggregate journal entry lines to compute balances
    const lines = await prisma.journalEntryLine.findMany({
      where: {
        journalEntry: {
          companyId: companyId!,
          status: 'posted',
        },
      },
      select: {
        accountId: true,
        debit: true,
        credit: true,
      },
    });

    const balanceMap = new Map<string, { debits: number; credits: number }>();
    for (const line of lines) {
      const existing = balanceMap.get(line.accountId) || { debits: 0, credits: 0 };
      existing.debits += line.debit;
      existing.credits += line.credit;
      balanceMap.set(line.accountId, existing);
    }

    const DEBIT_NORMAL_TYPES = ['asset', 'expense'];
    const accountsWithBalances = accounts.map((acct) => {
      const totals = balanceMap.get(acct.id) || { debits: 0, credits: 0 };
      const balance = DEBIT_NORMAL_TYPES.includes(acct.type)
        ? Math.round((totals.debits - totals.credits) * 100) / 100
        : Math.round((totals.credits - totals.debits) * 100) / 100;
      return { ...acct, balance };
    });

    return NextResponse.json(accountsWithBalances);
  } catch (err) {
    console.error('Error fetching accounts:', err);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

// POST /api/bookkeeping/accounts - Create new account
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(createAccountSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { code, name, type, subtype, description, taxLine } = validation.data;

    // Check for duplicate code
    const existing = await prisma.account.findUnique({
      where: { companyId_code: { companyId: companyId!, code } },
    });
    if (existing) {
      return NextResponse.json({ error: `Account code "${code}" already exists` }, { status: 409 });
    }

    const account = await prisma.account.create({
      data: {
        companyId: companyId!,
        code,
        name,
        type,
        subtype,
        description: description || null,
        taxLine: taxLine || null,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    console.error('Error creating account:', err);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
