import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { updateTransactionRuleSchema, validateRequest } from '@/lib/validation';

// GET /api/bookkeeping/rules/[id] - Get a single rule
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;
    const { id } = await params;

    const rule = await prisma.transactionRule.findFirst({
      where: { id, companyId: companyId! },
      include: {
        targetAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
        sourceAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
      },
    });

    if (!rule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    return NextResponse.json(rule);
  } catch (err) {
    console.error('Error fetching transaction rule:', err);
    return NextResponse.json({ error: 'Failed to fetch transaction rule' }, { status: 500 });
  }
}

// PATCH /api/bookkeeping/rules/[id] - Update a rule
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const validation = validateRequest(updateTransactionRuleSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    // Find existing rule
    const existingRule = await prisma.transactionRule.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!existingRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    const { matchType, matchText, targetAccountId, defaultMemo, sourceAccountId, priority, isActive } = validation.data;

    // If changing target account, verify it exists
    if (targetAccountId && targetAccountId !== existingRule.targetAccountId) {
      const targetAccount = await prisma.account.findFirst({
        where: { id: targetAccountId, companyId: companyId! },
      });
      if (!targetAccount) {
        return NextResponse.json({ error: 'Target account not found' }, { status: 404 });
      }
    }

    // If changing source account, verify it exists and is a bank/credit card
    if (sourceAccountId !== undefined && sourceAccountId !== existingRule.sourceAccountId) {
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
    }

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (matchType !== undefined) updateData.matchType = matchType;
    if (matchText !== undefined) updateData.matchText = matchText;
    if (targetAccountId !== undefined) updateData.targetAccountId = targetAccountId;
    if (defaultMemo !== undefined) updateData.defaultMemo = defaultMemo;
    if (sourceAccountId !== undefined) updateData.sourceAccountId = sourceAccountId;
    if (priority !== undefined) updateData.priority = priority;
    if (isActive !== undefined) updateData.isActive = isActive;

    const rule = await prisma.transactionRule.update({
      where: { id },
      data: updateData,
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
        action: 'UPDATE_TRANSACTION_RULE',
        entityType: 'TransactionRule',
        entityId: rule.id,
        metadata: JSON.stringify({
          changes: updateData,
        }),
      },
    });

    return NextResponse.json(rule);
  } catch (err) {
    console.error('Error updating transaction rule:', err);
    return NextResponse.json({ error: 'Failed to update transaction rule' }, { status: 500 });
  }
}

// DELETE /api/bookkeeping/rules/[id] - Delete a rule
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    // Find existing rule
    const existingRule = await prisma.transactionRule.findFirst({
      where: { id, companyId: companyId! },
      include: {
        targetAccount: {
          select: { name: true },
        },
      },
    });
    if (!existingRule) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }

    await prisma.transactionRule.delete({
      where: { id },
    });

    // Log audit entry
    await prisma.auditLog.create({
      data: {
        userId: session!.userId,
        companyId: companyId!,
        action: 'DELETE_TRANSACTION_RULE',
        entityType: 'TransactionRule',
        entityId: id,
        metadata: JSON.stringify({
          matchType: existingRule.matchType,
          matchText: existingRule.matchText,
          targetAccountName: existingRule.targetAccount.name,
        }),
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting transaction rule:', err);
    return NextResponse.json({ error: 'Failed to delete transaction rule' }, { status: 500 });
  }
}
