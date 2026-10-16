import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { voidEntry, JournalEntryStateError } from '@/lib/journal-entry-service';

// POST /api/bookkeeping/journal-entries/[id]/void
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('APPROVER');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const reason = body.reason;
    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json({ error: 'A reason is required to void a journal entry' }, { status: 400 });
    }

    // Company-scope the lookup (the service works by id alone).
    const entry = await prisma.journalEntry.findFirst({
      where: { id, companyId: companyId! },
      select: { id: true, taxDeposit: { select: { status: true } } },
    });
    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    // Voiding a deposit's entry alone left the deposit counted as paid on Tax
    // Liability and the 941 / NYS-45. The deposit void voids both together.
    if (entry.taxDeposit?.status === 'recorded') {
      return NextResponse.json(
        { error: 'This entry records a tax deposit. Void the deposit on the Tax Deposits page instead, so the payment is removed from the quarter along with the entry.' },
        { status: 409 }
      );
    }

    // Void via the service. The closed-period and reconciled-line guards live
    // there now. We still clear any in-progress reconciliation "cleared items"
    // first (those mark lines without setting isReconciled, so they'd escape
    // the service's reconciled-line guard) — in the same transaction.
    const updated = await prisma.$transaction(async (tx) => {
      const lines = await tx.journalEntryLine.findMany({
        where: { journalEntryId: id },
        select: { id: true },
      });
      const lineIds = lines.map((l) => l.id);
      if (lineIds.length > 0) {
        await tx.reconciledItem.deleteMany({ where: { journalEntryLineId: { in: lineIds } } });
      }
      return voidEntry({ userId: session!.userId, role: role! }, id, reason.trim(), tx);
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof JournalEntryStateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('Error voiding journal entry:', err);
    return NextResponse.json({ error: 'Failed to void journal entry' }, { status: 500 });
  }
}
