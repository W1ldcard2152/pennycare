import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createTransactionRuleSchema, validateRequest } from '@/lib/validation';

// GET /api/bookkeeping/rules - List all transaction rules
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const activeOnly = searchParams.get('active') !== 'false';
    const sourceAccountId = searchParams.get('sourceAccountId');

    const whereClause: Record<string, unknown> = {
      companyId: companyId!,
    };

    if (activeOnly) {
      whereClause.isActive = true;
    }

    if (sourceAccountId) {
      whereClause.OR = [
        { sourceAccountId: null },
        { sourceAccountId },
      ];
    }

    const rules = await prisma.transactionRule.findMany({
      where: whereClause,
      include: {
        targetAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
        sourceAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
      },
      orderBy: [
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });

    return NextResponse.json(rules);
  } catch (err) {
    console.error('Error fetching transaction rules:', err);
    return NextResponse.json({ error: 'Failed to fetch transaction rules' }, { status: 500 });
  }
}

// POST /api/bookkeeping/rules - Create a new transaction rule
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(createTransactionRuleSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { matchType, matchText, targetAccountId, defaultMemo, sourceAccountId, priority } = validation.data;

    // Verify target account exists and belongs to company
    const targetAccount = await prisma.account.findFirst({
      where: { id: targetAccountId, companyId: companyId! },
    });
    if (!targetAccount) {
      return NextResponse.json({ error: 'Target account not found' }, { status: 404 });
    }

    // If sourceAccountId provided, verify it exists and is a bank/credit card
    if (sourceAccountId) {
      const sourceAccount = await prisma.account.findFirst({
        where: { id: sourceAccountId, companyId: companyId! },
      });
      if (!sourceAccount) {
        return NextResponse.json({ error: 'Source account not found' }, { status: 404 });
      }
      if (!['asset', 'credit_card'].includes(sourceAccount.type)) {
        return NextResponse.json({ error: 'Source account must be a bank or credit card account' }, { status: 400 });
      }
    }

    const rule = await prisma.transactionRule.create({
      data: {
        companyId: companyId!,
        matchType,
        matchText,
        targetAccountId,
        defaultMemo: defaultMemo || null,
        sourceAccountId: sourceAccountId || null,
        priority,
      },
      include: {
        targetAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
        sourceAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
      },
    });

    // Log audit entry
    await prisma.auditLog.create({
      data: {
        userId: session!.userId,
        companyId: companyId!,
        action: 'CREATE_TRANSACTION_RULE',
        entityType: 'TransactionRule',
        entityId: rule.id,
        metadata: JSON.stringify({
          matchType,
          matchText,
          targetAccountId,
          targetAccountName: targetAccount.name,
          priority,
        }),
      },
    });

    return NextResponse.json(rule, { status: 201 });
  } catch (err) {
    console.error('Error creating transaction rule:', err);
    return NextResponse.json({ error: 'Failed to create transaction rule' }, { status: 500 });
  }
}
