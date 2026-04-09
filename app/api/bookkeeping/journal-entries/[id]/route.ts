import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { updateJournalEntrySchema, validateRequest } from '@/lib/validation';
import { validateJournalEntry, checkClosedPeriod } from '@/lib/bookkeeping';
import { logAudit } from '@/lib/audit';
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

// PUT /api/bookkeeping/journal-entries/[id] - Edit a journal entry
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json();
    const validation = validateRequest(updateJournalEntrySchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { date, memo, referenceNumber, notes, lines } = validation.data;

    // Validate debits = credits
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

    // Fetch the existing entry
    const existing = await prisma.journalEntry.findFirst({
      where: { id, companyId: companyId! },
      include: {
        lines: {
          include: {
            account: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Journal entry not found' }, { status: 404 });
    }

    if (existing.status === 'voided') {
      return NextResponse.json({ error: 'Cannot edit a voided journal entry' }, { status: 409 });
    }

    // Check closed period for both old and new dates
    const { isClosed, closedPeriod } = await checkClosedPeriod(companyId!, existing.date);
    if (isClosed) {
      return NextResponse.json({
        error: `Cannot edit: Fiscal year ${closedPeriod!.fiscalYear} is closed. Reopen the period to make changes.`,
      }, { status: 409 });
    }

    const newDate = parseBusinessDate(date);
    const { isClosed: newDateClosed, closedPeriod: newClosedPeriod } = await checkClosedPeriod(companyId!, newDate);
    if (newDateClosed) {
      return NextResponse.json({
        error: `Cannot move entry to closed fiscal year ${newClosedPeriod!.fiscalYear}. Reopen the period to make changes.`,
      }, { status: 409 });
    }

    // Check if any lines are reconciled
    const reconciledLines = existing.lines.filter(l => l.isReconciled);
    if (reconciledLines.length > 0) {
      const accountNames = [...new Set(reconciledLines.map(l => l.account.name))].join(', ');
      return NextResponse.json({
        error: 'Cannot edit: this entry contains reconciled transactions. Un-reconcile first.',
        accounts: accountNames,
      }, { status: 409 });
    }

    // Build audit metadata capturing what changed
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    if (existing.memo !== memo) changes.memo = { from: existing.memo, to: memo };
    if (existing.date.toISOString().split('T')[0] !== date) changes.date = { from: existing.date.toISOString().split('T')[0], to: date };
    if ((existing.referenceNumber || null) !== (referenceNumber || null)) changes.referenceNumber = { from: existing.referenceNumber, to: referenceNumber || null };
    if ((existing.notes || null) !== (notes || null)) changes.notes = { from: existing.notes, to: notes || null };

    // Track line changes for audit
    const oldLines = existing.lines.map(l => ({
      accountId: l.accountId,
      accountName: l.account.name,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    }));

    // Update in a transaction: delete old lines, create new ones
    const updated = await prisma.$transaction(async (tx) => {
      // Delete existing lines
      await tx.journalEntryLine.deleteMany({
        where: { journalEntryId: id },
      });

      // Update entry and create new lines
      return tx.journalEntry.update({
        where: { id },
        data: {
          date: newDate,
          memo,
          referenceNumber: referenceNumber || null,
          notes: notes || null,
          lines: {
            create: lineInputs.map((l) => ({
              accountId: l.accountId,
              description: l.description || null,
              debit: l.debit,
              credit: l.credit,
            })),
          },
        },
        include: {
          lines: {
            include: {
              account: { select: { id: true, code: true, name: true, type: true } },
            },
          },
        },
      });
    });

    const newLines = updated.lines.map(l => ({
      accountId: l.accountId,
      accountName: l.account.name,
      description: l.description,
      debit: l.debit,
      credit: l.credit,
    }));

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'journal_entry.edit',
      entityType: 'JournalEntry',
      entityId: id,
      metadata: {
        entryNumber: existing.entryNumber,
        changes,
        previousLines: oldLines,
        updatedLines: newLines,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update journal entry';
    console.error('Error updating journal entry:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
