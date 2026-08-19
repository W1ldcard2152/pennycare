import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { updateJournalEntrySchema, validateRequest } from '@/lib/validation';
import { validateJournalEntry } from '@/lib/bookkeeping';
import { updateDraft, deleteDraft, JournalEntryStateError } from '@/lib/journal-entry-service';
import { JE_STATUS } from '@/lib/je-status';
import { parseBusinessDate } from '@/lib/date-utils';

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

// PUT /api/bookkeeping/journal-entries/[id] - Edit a DRAFT journal entry only.
// Booked ('posted') entries are immutable in 1.2 — corrections are reversing
// entries (POST .../reverse). A PUT against a booked entry returns 409.
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const validation = validateRequest(updateJournalEntrySchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { date, memo, referenceNumber, notes, lines } = validation.data;

    const lineInputs = lines.map((l) => ({
      accountId: l.accountId,
      description: l.description || undefined,
      debit: Number(l.debit) || 0,
      credit: Number(l.credit) || 0,
    }));
    const entryValidation = validateJournalEntry(lineInputs);
    if (!entryValidation.valid) {
      return NextResponse.json({ error: entryValidation.error }, { status: 400 });
    }

    // Company-scope + status gate before handing to the service. A non-draft
    // status gets a 409 that points the UI at the reverse action.
    const existing = await prisma.journalEntry.findFirst({
      where: { id, companyId: companyId! },
      select: { status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }
    if (existing.status !== JE_STATUS.DRAFT) {
      return NextResponse.json(
        {
          error:
            'Only draft entries can be edited. This entry is booked — create a reversing entry to correct it.',
          status: existing.status,
        },
        { status: 409 }
      );
    }

    const updated = await updateDraft(
      { userId: session!.userId, role: role! },
      id,
      {
        date: parseBusinessDate(date),
        memo,
        referenceNumber: referenceNumber || null,
        notes: notes || null,
        lines: lineInputs,
      }
    );

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof JournalEntryStateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : 'Failed to update journal entry';
    console.error('Error updating journal entry:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

// DELETE /api/bookkeeping/journal-entries/[id] - Hard-delete a DRAFT entry.
// Booked entries are never deleted (void or reverse instead).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;
    const { id } = await params;

    const existing = await prisma.journalEntry.findFirst({
      where: { id, companyId: companyId! },
      select: { status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    const result = await deleteDraft({ userId: session!.userId, role: role! }, id);
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof JournalEntryStateError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error('Error deleting journal entry:', err);
    return NextResponse.json({ error: 'Failed to delete journal entry' }, { status: 500 });
  }
}
