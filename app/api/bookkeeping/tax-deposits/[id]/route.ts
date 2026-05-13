import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { validateRequest, voidTaxDepositSchema } from '@/lib/validation';

// GET /api/bookkeeping/tax-deposits/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
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

// DELETE /api/bookkeeping/tax-deposits/[id] — voids the deposit and its
// linked journal entry. Audit trail preserved; no actual rows deleted.
// Body: { reason: string }  (required)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
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

      if (existing.journalEntryId) {
        await tx.journalEntry.update({
          where: { id: existing.journalEntryId },
          data: {
            status: 'voided',
            voidedAt: new Date(),
            voidedBy: session!.userId,
            voidReason: `Tax deposit voided: ${reason}`,
          },
        });
      }

      return updated;
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
        reason,
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Error voiding tax deposit:', err);
    return NextResponse.json({ error: 'Failed to void tax deposit' }, { status: 500 });
  }
}
