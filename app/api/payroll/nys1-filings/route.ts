import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { parseBusinessDate } from '@/lib/date-utils';

// GET /api/payroll/nys1-filings - List NYS-1 filings for the current company
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const filings = await prisma.nys1Filing.findMany({
      where: { companyId: companyId! },
      orderBy: { filedDate: 'desc' },
    });

    return NextResponse.json(filings);
  } catch (err) {
    console.error('Error listing NYS-1 filings:', err);
    return NextResponse.json({ error: 'Failed to list NYS-1 filings' }, { status: 500 });
  }
}

// POST /api/payroll/nys1-filings - Record a new NYS-1 filing
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('payroll');
    if (error) return error;

    const body = await request.json();
    const { filedDate, periodEndDate, amountRemitted, notes } = body;

    if (!filedDate || !periodEndDate || amountRemitted === undefined) {
      return NextResponse.json(
        { error: 'filedDate, periodEndDate, and amountRemitted are required' },
        { status: 400 }
      );
    }

    const filing = await prisma.nys1Filing.create({
      data: {
        companyId: companyId!,
        filedDate: parseBusinessDate(filedDate),
        periodEndDate: parseBusinessDate(periodEndDate),
        amountRemitted: parseFloat(amountRemitted),
        notes: notes || null,
      },
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'nys1.filed',
      entityType: 'Nys1Filing',
      entityId: filing.id,
      metadata: {
        filedDate,
        periodEndDate,
        amountRemitted: parseFloat(amountRemitted),
      },
    });

    return NextResponse.json(filing);
  } catch (err) {
    console.error('Error creating NYS-1 filing:', err);
    return NextResponse.json({ error: 'Failed to record NYS-1 filing' }, { status: 500 });
  }
}
