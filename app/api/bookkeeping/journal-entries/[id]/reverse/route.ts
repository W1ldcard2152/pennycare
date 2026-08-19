import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createReversingEntry, JournalEntryStateError } from '@/lib/journal-entry-service';
import { parseBusinessDate } from '@/lib/date-utils';

// POST /api/bookkeeping/journal-entries/[id]/reverse
// Creates a reversing entry (all lines flipped) for a BOOKED entry. This is
// the correction mechanism for booked entries, which are immutable in 1.2.
// Body: { date: 'YYYY-MM-DD', memo?: string }  (date required)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('APPROVER');
    if (error) return error;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const dateStr = body.date;
    if (!dateStr || typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      return NextResponse.json({ error: 'A reversal date (YYYY-MM-DD) is required' }, { status: 400 });
    }
    const memo = typeof body.memo === 'string' ? body.memo : undefined;

    // Company-scope the source entry.
    const source = await prisma.journalEntry.findFirst({
      where: { id, companyId: companyId! },
      select: { id: true },
    });
    if (!source) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    const reversal = await createReversingEntry(
      { userId: session!.userId, role: role! },
      id,
      { date: parseBusinessDate(dateStr), memo }
    );

    return NextResponse.json(reversal, { status: 201 });
  } catch (err) {
    if (err instanceof JournalEntryStateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'Failed to reverse journal entry';
    console.error('Error reversing journal entry:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
