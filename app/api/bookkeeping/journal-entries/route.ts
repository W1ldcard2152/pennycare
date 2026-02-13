import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createJournalEntrySchema, validateRequest } from '@/lib/validation';
import { createJournalEntry } from '@/lib/bookkeeping';
import { logAudit } from '@/lib/audit';

// GET /api/bookkeeping/journal-entries - List journal entries
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const source = searchParams.get('source');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    const where: Record<string, unknown> = { companyId: companyId! };
    if (startDate || endDate) {
      where.date = {};
      if (startDate) (where.date as Record<string, unknown>).gte = new Date(startDate);
      if (endDate) (where.date as Record<string, unknown>).lte = new Date(endDate);
    }
    if (source) where.source = source;

    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where,
        include: {
          lines: {
            include: {
              account: { select: { id: true, code: true, name: true, type: true } },
            },
          },
        },
        orderBy: [{ date: 'desc' }, { entryNumber: 'desc' }],
        take: limit,
        skip: offset,
      }),
      prisma.journalEntry.count({ where }),
    ]);

    return NextResponse.json({ entries, total, limit, offset });
  } catch (err) {
    console.error('Error fetching journal entries:', err);
    return NextResponse.json({ error: 'Failed to fetch journal entries' }, { status: 500 });
  }
}

// POST /api/bookkeeping/journal-entries - Create manual journal entry
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(createJournalEntrySchema, body);
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const { date, memo, referenceNumber, notes, lines } = validation.data;

    const entry = await createJournalEntry({
      companyId: companyId!,
      date: new Date(date),
      memo,
      referenceNumber: referenceNumber || undefined,
      source: 'manual',
      lines: lines.map((l) => ({
        accountId: l.accountId,
        description: l.description || undefined,
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      })),
      notes: notes || undefined,
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'journal_entry.create',
      entityType: 'JournalEntry',
      entityId: entry.id,
      metadata: {
        entryNumber: entry.entryNumber,
        memo,
        lineCount: lines.length,
      },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create journal entry';
    console.error('Error creating journal entry:', err);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
