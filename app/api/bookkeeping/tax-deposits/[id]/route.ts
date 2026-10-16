import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { voidEntry } from '@/lib/journal-entry-service';
import { JE_STATUS } from '@/lib/je-status';
import { changeTaxDepositPeriodSchema, validateRequest, voidTaxDepositSchema } from '@/lib/validation';

// GET /api/bookkeeping/tax-deposits/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('VIEWER');
    if (error) return error;

    const { id } = await params;
    const deposit = await prisma.taxDeposit.findFirst({
      where: { id, companyId: companyId! },
      include: {
        journalEntry: {
          include: {
            lines: {
              include: { account: { select: { code: true, name: true, type: true } } },
            },
          },
        },
      },
    });

    if (!deposit) {
      return NextResponse.json({ error: 'Tax deposit not found' }, { status: 404 });
    }

    return NextResponse.json(deposit);
  } catch (err) {
    console.error('Error fetching tax deposit:', err);
    return NextResponse.json({ error: 'Failed to fetch tax deposit' }, { status: 500 });
  }
}

// PATCH /api/bookkeeping/tax-deposits/[id] — change the tax period a deposit
// pays for. Body: { taxPeriodYear, taxPeriodQuarter }.
//
// The period decides which quarter's liability the payment counts against
// (lib/tax-liability.ts, and line 13 / line 15 on the returns), so a deposit
// recorded under the wrong quarter makes one quarter look unpaid and another
// overpaid. Only the TaxDeposit row changes: its journal entry is dated when
// the money moved and stays as booked (its memo keeps the original period).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;

    const { id } = await params;
    const existing = await prisma.taxDeposit.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Tax deposit not found' }, { status: 404 });
    }
    if (existing.status !== 'recorded') {
      return NextResponse.json({ error: 'Only recorded deposits can be changed' }, { status: 400 });
    }

    const validation = validateRequest(changeTaxDepositPeriodSchema, await request.json().catch(() => ({})));
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }
    const { taxPeriodYear, taxPeriodQuarter } = validation.data;

    const updated = await prisma.taxDeposit.update({
      where: { id },
      data: { taxPeriodYear, taxPeriodQuarter },
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'tax_deposit.change_period',
      entityType: 'TaxDeposit',
      entityId: id,
      before: { taxPeriodYear: existing.taxPeriodYear, taxPeriodQuarter: existing.taxPeriodQuarter },
      after: { taxPeriodYear, taxPeriodQuarter },
      metadata: { taxAuthority: existing.taxAuthority, totalAmount: existing.totalAmount },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error changing tax deposit period:', err);
    return NextResponse.json({ error: 'Failed to change tax deposit period' }, { status: 500 });
  }
}

// DELETE /api/bookkeeping/tax-deposits/[id] — voids the deposit and its
// linked journal entry. Audit trail preserved; no actual rows deleted.
// Body: { reason: string }  (required)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('APPROVER');
    if (error) return error;

    const { id } = await params;
    const existing = await prisma.taxDeposit.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Tax deposit not found' }, { status: 404 });
    }
    if (existing.status === 'voided') {
      return NextResponse.json({ error: 'Tax deposit is already voided' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const validation = validateRequest(voidTaxDepositSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }
    const { reason } = validation.data;

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.taxDeposit.update({
        where: { id },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: session!.userId,
          voidReason: reason,
        },
      });

      // An entry voided on its own (from the journal entry page, before 1.2.3)
      // left the deposit counted as paid. Voiding it again is an illegal
      // voided → voided transition that would roll this back, so skip it.
      const entry = existing.journalEntryId
        ? await tx.journalEntry.findUnique({
            where: { id: existing.journalEntryId },
            select: { status: true },
          })
        : null;
      const entryAlreadyVoided = entry?.status === JE_STATUS.VOIDED;
      if (existing.journalEntryId && !entryAlreadyVoided) {
        // Void via the JE service (closed-period + reconciled guards, tier-1
        // audit) on the same transaction as the deposit void.
        await voidEntry(
          { userId: session!.userId, role: role! },
          existing.journalEntryId,
          `Tax deposit voided: ${reason}`,
          tx
        );
      }

      return { updated, entryAlreadyVoided };
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'tax_deposit.void',
      entityType: 'TaxDeposit',
      entityId: id,
      metadata: {
        taxAuthority: existing.taxAuthority,
        totalAmount: existing.totalAmount,
        journalEntryId: existing.journalEntryId,
        entryAlreadyVoided: result.entryAlreadyVoided,
        reason,
      },
    });

    return NextResponse.json(result.updated);
  } catch (err) {
    console.error('Error voiding tax deposit:', err);
    return NextResponse.json({ error: 'Failed to void tax deposit' }, { status: 500 });
  }
}
