import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/bookkeeping/statements/pending
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const batchName = searchParams.get('batchName');
    const sourceAccountId = searchParams.get('sourceAccountId');
    const status = searchParams.get('status') || 'pending';

    const whereClause: Record<string, unknown> = {
      companyId: companyId!,
    };

    if (batchName) {
      whereClause.importBatch = batchName;
    }
    if (sourceAccountId) {
      whereClause.sourceAccountId = sourceAccountId;
    }
    if (status !== 'all') {
      whereClause.status = status;
    }

    const imports = await prisma.statementImport.findMany({
      where: whereClause,
      include: {
        sourceAccount: {
          select: { id: true, code: true, name: true, type: true, accountGroup: true },
        },
        targetAccount: {
          select: { id: true, code: true, name: true, type: true },
        },
        matchedRule: {
          select: { id: true, matchType: true, matchText: true },
        },
        journalEntry: {
          select: { id: true, entryNumber: true },
        },
      },
      orderBy: [{ postDate: 'desc' }, { createdAt: 'desc' }],
    });

    return NextResponse.json(imports);
  } catch (err) {
    console.error('Error fetching pending statements:', err);
    return NextResponse.json({ error: 'Failed to fetch pending statements' }, { status: 500 });
  }
}
