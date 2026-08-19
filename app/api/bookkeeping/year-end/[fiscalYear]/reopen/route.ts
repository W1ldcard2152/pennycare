import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { voidEntry } from '@/lib/journal-entry-service';
import { logAudit } from '@/lib/audit';

// POST /api/bookkeeping/year-end/[fiscalYear]/reopen
// Reopen a closed fiscal year for editing
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fiscalYear: string }> }
) {
  try {
    // Reopening a closed year voids the closing entry — OWNER only (1.2)
    const { error, companyId, session, role } = await requireCompanyAccess('OWNER');
    if (error) return error;

    const { fiscalYear: fiscalYearStr } = await params;
    const fiscalYear = parseInt(fiscalYearStr, 10);

    if (isNaN(fiscalYear)) {
      return NextResponse.json({ error: 'Invalid fiscal year' }, { status: 400 });
    }

    const body = await request.json();
    const { reason } = body;

    if (!reason || typeof reason !== 'string' || reason.trim().length < 10) {
      return NextResponse.json({ error: 'A reason (at least 10 characters) is required to reopen a closed period' }, { status: 400 });
    }

    // Find the closed period
    const closedPeriod = await prisma.closedPeriod.findUnique({
      where: { companyId_fiscalYear: { companyId: companyId!, fiscalYear } },
    });

    if (!closedPeriod) {
      return NextResponse.json({ error: `Fiscal year ${fiscalYear} is not closed` }, { status: 404 });
    }

    if (closedPeriod.isOpen) {
      return NextResponse.json({ error: `Fiscal year ${fiscalYear} is already open` }, { status: 400 });
    }

    // Reopen + void-closing-entry in one transaction. Order matters: the
    // closing entry is dated on periodEnd (inside the year being reopened), so
    // the period must be flagged open BEFORE voidEntry runs — otherwise its
    // closed-period guard would (correctly, for any other caller) refuse the
    // void. Reopening is the one operation that legitimately makes the period
    // editable again.
    const updatedPeriod = await prisma.$transaction(async (tx) => {
      const updated = await tx.closedPeriod.update({
        where: { id: closedPeriod.id },
        data: {
          isOpen: true,
          reopenedAt: new Date(),
          reopenedBy: session!.userId,
          reopenReason: reason.trim(),
        },
      });
      if (closedPeriod.closingEntryId) {
        await voidEntry(
          { userId: session!.userId, role: role! },
          closedPeriod.closingEntryId,
          `Period reopened: ${reason.trim()}`,
          tx
        );
      }
      return updated;
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'year_end.reopen',
      entityType: 'ClosedPeriod',
      entityId: closedPeriod.id,
      metadata: {
        fiscalYear,
        reason: reason.trim(),
        voidedClosingEntryId: closedPeriod.closingEntryId,
      },
    });

    return NextResponse.json({
      success: true,
      closedPeriod: updatedPeriod,
      message: `Fiscal year ${fiscalYear} has been reopened. You can now make changes to transactions in this period.`,
    });
  } catch (err) {
    console.error('Error reopening fiscal year:', err);
    return NextResponse.json({ error: 'Failed to reopen fiscal year' }, { status: 500 });
  }
}
