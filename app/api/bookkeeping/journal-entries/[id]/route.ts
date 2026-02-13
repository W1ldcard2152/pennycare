import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/bookkeeping/journal-entries/[id]
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;
    const { id } = await params;

    const entry = await prisma.journalEntry.findFirst({
      where: { id, companyId: companyId! },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true, type: true } },
          },
        },
      },
    });

    if (!entry) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    return NextResponse.json(entry);
  } catch (err) {
    console.error('Error fetching journal entry:', err);
    return NextResponse.json({ error: 'Failed to fetch journal entry' }, { status: 500 });
  }
}
