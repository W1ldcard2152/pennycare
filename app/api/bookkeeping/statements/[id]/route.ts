import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { updateStatementImportSchema, validateRequest } from '@/lib/validation';

// GET /api/bookkeeping/statements/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;
    const { id } = await params;

    const statementImport = await prisma.statementImport.findFirst({
      where: { id, companyId: companyId! },
      include: {
        sourceAccount: {
          select: { id: true, code: true, name: true, type: true, accountGroup: true },
        },
        targetAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
        matchedRule: {
          select: { id: true, matchType: true, matchText: true, defaultMemo: true },
        },
        journalEntry: {
          select: { id: true, entryNumber: true, date: true, memo: true },
        },
      },
    });

    if (!statementImport) {
      return NextResponse.json({ error: 'Statement import not found' }, { status: 404 });
    }

    return NextResponse.json(statementImport);
  } catch (err) {
    console.error('Error fetching statement import:', err);
    return NextResponse.json({ error: 'Failed to fetch statement import' }, { status: 500 });
  }
}

// PATCH /api/bookkeeping/statements/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const validation = validateRequest(updateStatementImportSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const existing = await prisma.statementImport.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Statement import not found' }, { status: 404 });
    }

    // Cannot update if already booked
    if (existing.status === 'booked') {
      return NextResponse.json({ error: 'Cannot update a booked transaction' }, { status: 409 });
    }

    // If setting targetAccountId, verify it exists and belongs to this company
    if (validation.data.targetAccountId) {
      const targetAccount = await prisma.account.findFirst({
        where: { id: validation.data.targetAccountId, companyId: companyId! },
      });
      if (!targetAccount) {
        return NextResponse.json({ error: 'Target account not found' }, { status: 404 });
      }
    }

    const updated = await prisma.statementImport.update({
      where: { id },
      data: {
        targetAccountId: validation.data.targetAccountId !== undefined
          ? validation.data.targetAccountId
          : undefined,
        memo: validation.data.memo !== undefined
          ? validation.data.memo
          : undefined,
        status: validation.data.status !== undefined
          ? validation.data.status
          : undefined,
        // If matchedRuleId is explicitly provided, use it; otherwise clear it when changing target
        matchedRuleId: validation.data.matchedRuleId !== undefined
          ? validation.data.matchedRuleId
          : (validation.data.targetAccountId !== undefined ? null : undefined),
      },
      include: {
        sourceAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
        targetAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating statement import:', err);
    return NextResponse.json({ error: 'Failed to update statement import' }, { status: 500 });
  }
}

// DELETE /api/bookkeeping/statements/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const existing = await prisma.statementImport.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Statement import not found' }, { status: 404 });
    }

    // Cannot delete if booked (must void the journal entry first)
    if (existing.status === 'booked') {
      return NextResponse.json(
        { error: 'Cannot delete a booked transaction. Void the journal entry first.' },
        { status: 409 }
      );
    }

    await prisma.statementImport.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting statement import:', err);
    return NextResponse.json({ error: 'Failed to delete statement import' }, { status: 500 });
  }
}
