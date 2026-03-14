import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';

// POST /api/bookkeeping/year-end/[fiscalYear]/reopen
// Reopen a closed fiscal year for editing
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ fiscalYear: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
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

    // Void the closing entry if it exists
    if (closedPeriod.closingEntryId) {
      await prisma.journalEntry.update({
        where: { id: closedPeriod.closingEntryId },
        data: {
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: session!.userId,
          voidReason: `Period reopened: ${reason.trim()}`,
        },
      });
    }

    // Mark the period as open
    const updatedPeriod = await prisma.closedPeriod.update({
      where: { id: closedPeriod.id },
      data: {
        isOpen: true,
        reopenedAt: new Date(),
        reopenedBy: session!.userId,
        reopenReason: reason.trim(),
      },
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
