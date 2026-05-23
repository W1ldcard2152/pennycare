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
//
// Refuses to delete an account that's referenced from anywhere — journal
// entry lines, transactions, transaction rules, statement imports,
// reconciliations, or the company's eBay account-config pointers. Each
// reference type returns a specific 409 so the user knows exactly what's
// blocking. The advice is consistent: deactivate (isActive=false) instead
// of deleting, which keeps history intact.
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

    const conflict = (msg: string) =>
      NextResponse.json({ error: msg }, { status: 409 });

    // Journal entry lines (modern double-entry)
    const lineCount = await prisma.journalEntryLine.count({ where: { accountId: id } });
    if (lineCount > 0) {
      return conflict(
        `Cannot delete "${existing.name}" — it has ${lineCount} journal entry line${lineCount !== 1 ? 's' : ''}. Deactivate it instead.`
      );
    }

    // Old-style transactions
    const txCount = await prisma.transaction.count({
      where: { OR: [{ debitAccountId: id }, { creditAccountId: id }] },
    });
    if (txCount > 0) {
      return conflict(
        `Cannot delete "${existing.name}" — it has ${txCount} transaction${txCount !== 1 ? 's' : ''}. Deactivate it instead.`
      );
    }

    // Transaction rules (categorization rules pointing at this account)
    const ruleCount = await prisma.transactionRule.count({
      where: { OR: [{ targetAccountId: id }, { sourceAccountId: id }] },
    });
    if (ruleCount > 0) {
      return conflict(
        `Cannot delete "${existing.name}" — it's referenced by ${ruleCount} transaction rule${ruleCount !== 1 ? 's' : ''}. Delete or repoint those rules first (Books → Transaction Rules).`
      );
    }

    // Statement imports (pending or booked staging rows referencing the account)
    const stmtCount = await prisma.statementImport.count({
      where: { OR: [{ sourceAccountId: id }, { targetAccountId: id }] },
    });
    if (stmtCount > 0) {
      return conflict(
        `Cannot delete "${existing.name}" — ${stmtCount} statement-import row${stmtCount !== 1 ? 's' : ''} reference${stmtCount === 1 ? 's' : ''} it. Resolve or skip those imports first.`
      );
    }

    // Reconciliations
    const reconCount = await prisma.reconciliation.count({ where: { accountId: id } });
    if (reconCount > 0) {
      return conflict(
        `Cannot delete "${existing.name}" — it has ${reconCount} reconciliation${reconCount !== 1 ? 's' : ''}. Deactivate it instead so the history is preserved.`
      );
    }

    // Company config pointers (eBay flow)
    const company = await prisma.company.findUnique({
      where: { id: companyId! },
      select: {
        ebayPendingPayoutsAccountId: true,
        ebaySalesAccountId: true,
        ebayFeesAccountId: true,
      },
    });
    const ebayUses: string[] = [];
    if (company?.ebayPendingPayoutsAccountId === id) ebayUses.push('eBay Pending Payouts');
    if (company?.ebaySalesAccountId === id) ebayUses.push('eBay Sales');
    if (company?.ebayFeesAccountId === id) ebayUses.push('eBay Fees');
    if (ebayUses.length > 0) {
      return conflict(
        `Cannot delete "${existing.name}" — it's configured as the ${ebayUses.join(', ')} account in Settings. Change the configuration first, then retry.`
      );
    }

    await prisma.account.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting account:', err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Failed to delete account: ${err.message}`
            : 'Failed to delete account',
      },
      { status: 500 }
    );
  }
}
