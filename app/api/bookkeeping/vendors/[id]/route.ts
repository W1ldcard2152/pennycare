import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { updateVendorSchema, validateRequest } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

// GET /api/bookkeeping/vendors/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;
    const { id } = await params;

    const vendor = await prisma.vendor.findFirst({
      where: { id, companyId: companyId! },
      include: {
        expenses: { orderBy: { date: 'desc' }, take: 20 },
        _count: { select: { expenses: true } },
      },
    });

    if (!vendor) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    return NextResponse.json(vendor);
  } catch (err) {
    console.error('Error fetching vendor:', err);
    return NextResponse.json({ error: 'Failed to fetch vendor' }, { status: 500 });
  }
}

// PATCH /api/bookkeeping/vendors/[id]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const validation = validateRequest(updateVendorSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const existing = await prisma.vendor.findFirst({ where: { id, companyId: companyId! } });
    if (!existing) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    const vendor = await prisma.vendor.update({
      where: { id },
      data: validation.data,
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'vendor.update',
      entityType: 'Vendor',
      entityId: vendor.id,
      metadata: { name: vendor.name, changes: Object.keys(validation.data) },
    });

    return NextResponse.json(vendor);
  } catch (err) {
    console.error('Error updating vendor:', err);
    return NextResponse.json({ error: 'Failed to update vendor' }, { status: 500 });
  }
}

// DELETE /api/bookkeeping/vendors/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const existing = await prisma.vendor.findFirst({
      where: { id, companyId: companyId! },
      include: { _count: { select: { expenses: true } } },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Vendor not found' }, { status: 404 });
    }

    if (existing._count.expenses > 0) {
      // Deactivate instead of delete
      await prisma.vendor.update({
        where: { id },
        data: { isActive: false },
      });

      await logAudit({
        companyId: companyId!,
        userId: session!.userId,
        action: 'vendor.deactivate',
        entityType: 'Vendor',
        entityId: id,
        metadata: { name: existing.name, expenseCount: existing._count.expenses },
      });

      return NextResponse.json({ success: true, deactivated: true, message: 'Vendor has expenses and was deactivated instead of deleted' });
    }

    await prisma.vendor.delete({ where: { id } });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'vendor.delete',
      entityType: 'Vendor',
      entityId: id,
      metadata: { name: existing.name },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting vendor:', err);
    return NextResponse.json({ error: 'Failed to delete vendor' }, { status: 500 });
  }
}
