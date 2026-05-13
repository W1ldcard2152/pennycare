import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';

// GET /api/bookkeeping/tax-filings/[id]
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const { id } = await params;
    const filing = await prisma.taxFiling.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!filing) {
      return NextResponse.json({ error: 'Tax filing not found' }, { status: 404 });
    }
    return NextResponse.json(filing);
  } catch (err) {
    console.error('Error fetching tax filing:', err);
    return NextResponse.json({ error: 'Failed to fetch tax filing' }, { status: 500 });
  }
}

// DELETE /api/bookkeeping/tax-filings/[id] — voids the filing record. Use this
// for filings recorded in error; filing an amended return creates a new record
// with status='amended'.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const { id } = await params;
    const existing = await prisma.taxFiling.findFirst({
      where: { id, companyId: companyId! },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Tax filing not found' }, { status: 404 });
    }

    const updated = await prisma.taxFiling.update({
      where: { id },
      data: { status: 'voided' },
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'tax_filing.void',
      entityType: 'TaxFiling',
      entityId: id,
      metadata: {
        formType: existing.formType,
        year: existing.year,
        quarter: existing.quarter,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error voiding tax filing:', err);
    return NextResponse.json({ error: 'Failed to void tax filing' }, { status: 500 });
  }
}
