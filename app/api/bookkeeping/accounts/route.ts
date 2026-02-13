import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createAccountSchema, validateRequest } from '@/lib/validation';

// GET /api/bookkeeping/accounts - List all accounts
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const accounts = await prisma.account.findMany({
      where: { companyId: companyId! },
      orderBy: { code: 'asc' },
    });

    return NextResponse.json(accounts);
  } catch (err) {
    console.error('Error fetching accounts:', err);
    return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
  }
}

// POST /api/bookkeeping/accounts - Create new account
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(createAccountSchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { code, name, type, subtype, description } = validation.data;

    // Check for duplicate code
    const existing = await prisma.account.findUnique({
      where: { companyId_code: { companyId: companyId!, code } },
    });
    if (existing) {
      return NextResponse.json({ error: `Account code "${code}" already exists` }, { status: 409 });
    }

    const account = await prisma.account.create({
      data: {
        companyId: companyId!,
        code,
        name,
        type,
        subtype: subtype || null,
        description: description || null,
      },
    });

    return NextResponse.json(account, { status: 201 });
  } catch (err) {
    console.error('Error creating account:', err);
    return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
  }
}
