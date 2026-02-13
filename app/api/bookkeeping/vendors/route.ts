import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createVendorSchema, validateRequest } from '@/lib/validation';

// GET /api/bookkeeping/vendors
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const vendors = await prisma.vendor.findMany({
      where: { companyId: companyId! },
      include: {
        _count: { select: { expenses: true } },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json(vendors);
  } catch (err) {
    console.error('Error fetching vendors:', err);
    return NextResponse.json({ error: 'Failed to fetch vendors' }, { status: 500 });
  }
}

// POST /api/bookkeeping/vendors
export async function POST(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(createVendorSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const data = validation.data;
    const vendor = await prisma.vendor.create({
      data: {
        companyId: companyId!,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        address: data.address || null,
        city: data.city || null,
        state: data.state || null,
        zipCode: data.zipCode || null,
        taxId: data.taxId || null,
        notes: data.notes || null,
      },
    });

    return NextResponse.json(vendor, { status: 201 });
  } catch (err) {
    console.error('Error creating vendor:', err);
    return NextResponse.json({ error: 'Failed to create vendor' }, { status: 500 });
  }
}
