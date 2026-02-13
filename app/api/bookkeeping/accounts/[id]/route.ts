import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { updateAccountSchema, validateRequest } from '@/lib/validation';

// GET /api/bookkeeping/accounts/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;
    const { id } = await params;

    const account = await prisma.account.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    return NextResponse.json(account);
  } catch (err) {
    console.error('Error fetching account:', err);
    return NextResponse.json({ error: 'Failed to fetch account' }, { status: 500 });
  }
}

// PATCH /api/bookkeeping/accounts/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const validation = validateRequest(updateAccountSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const existing = await prisma.account.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    const account = await prisma.account.update({
      where: { id },
      data: validation.data,
    });

    return NextResponse.json(account);
  } catch (err) {
    console.error('Error updating account:', err);
    return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
  }
}

// DELETE /api/bookkeeping/accounts/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const existing = await prisma.account.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }

    // Check if account has any journal entry lines
    const lineCount = await prisma.journalEntryLine.count({
      where: { accountId: id },
    });
    if (lineCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete account "${existing.name}" — it has ${lineCount} journal entry line(s). Deactivate it instead.` },
        { status: 409 }
      );
    }

    // Also check old-style transactions
    const txCount = await prisma.transaction.count({
      where: {
        OR: [
          { debitAccountId: id },
          { creditAccountId: id },
        ],
      },
    });
    if (txCount > 0) {
      return NextResponse.json(
        { error: `Cannot delete account "${existing.name}" — it has ${txCount} transaction(s). Deactivate it instead.` },
        { status: 409 }
      );
    }

    await prisma.account.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting account:', err);
    return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
  }
}
