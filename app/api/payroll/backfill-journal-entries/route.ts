import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { createPayrollJournalEntries } from '@/lib/bookkeeping';
import { formatDate } from '@/lib/date-utils';

// POST /api/payroll/backfill-journal-entries
//
// Scans the company's active PayrollRecord rows, finds any whose payroll batch
// doesn't yet have a corresponding source='payroll' journal entry, and creates
// them retroactively. Use after migrating from a setup where the books predate
// in-house payroll (e.g., switching from Paychex) — your historical payroll
// runs become reflected on the books with the right account assignments.
//
// Body (all optional):
//   { dryRun?: boolean, sinceDate?: 'YYYY-MM-DD' }
//
// Returns the list of pay dates processed and per-date results.
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const dryRun = body.dryRun === true;
    const sinceDate: string | undefined = body.sinceDate;

    // Find all active payroll records
    const where: { companyId: string; status: string; payDate?: { gte: Date } } = {
      companyId: companyId!,
      status: 'active',
    };
    if (sinceDate) {
      where.payDate = { gte: new Date(`${sinceDate}T00:00:00.000Z`) };
    }
    const records = await prisma.payrollRecord.findMany({
      where,
      orderBy: { payDate: 'asc' },
      select: {
        id: true,
        payDate: true,
        payPeriodStart: true,
        payPeriodEnd: true,
      },
    });

    // Find existing payroll journal entries for this company. The source IDs
    // are comma-separated record IDs, so we collect them as a set.
    const existingEntries = await prisma.journalEntry.findMany({
      where: { companyId: companyId!, source: 'payroll', status: 'posted' },
      select: { sourceId: true },
    });
    const alreadyCovered = new Set<string>();
    for (const e of existingEntries) {
      if (!e.sourceId) continue;
      for (const id of e.sourceId.split(',')) {
        alreadyCovered.add(id.trim());
      }
    }

    // Group uncovered records by (payDate, payPeriodStart, payPeriodEnd)
    const groups = new Map<
      string,
      { payDate: Date; payPeriodStart: Date; payPeriodEnd: Date; recordIds: string[] }
    >();
    for (const r of records) {
      if (alreadyCovered.has(r.id)) continue;
      const key = `${formatDate(r.payDate)}|${formatDate(r.payPeriodStart)}|${formatDate(r.payPeriodEnd)}`;
      const existing = groups.get(key);
      if (existing) {
        existing.recordIds.push(r.id);
      } else {
        groups.set(key, {
          payDate: r.payDate,
          payPeriodStart: r.payPeriodStart,
          payPeriodEnd: r.payPeriodEnd,
          recordIds: [r.id],
        });
      }
    }

    const results: Array<{
      payDate: string;
      recordCount: number;
      created: boolean;
      journalEntryId?: string;
      journalEntryNumber?: number;
      error?: string;
    }> = [];

    if (dryRun) {
      for (const [, group] of groups) {
        results.push({
          payDate: formatDate(group.payDate),
          recordCount: group.recordIds.length,
          created: false,
        });
      }
      return NextResponse.json({
        dryRun: true,
        totalRecordsScanned: records.length,
        alreadyCovered: alreadyCovered.size,
        groupsToBackfill: groups.size,
        results,
      });
    }

    for (const [, group] of groups) {
      const label = `${formatDate(group.payPeriodStart)} to ${formatDate(group.payPeriodEnd)}`;
      try {
        const je = await createPayrollJournalEntries(
          companyId!,
          group.recordIds,
          group.payDate,
          label,
        );
        if (je) {
          results.push({
            payDate: formatDate(group.payDate),
            recordCount: group.recordIds.length,
            created: true,
            journalEntryId: je.entryId,
            journalEntryNumber: je.entryNumber,
          });
        } else {
          results.push({
            payDate: formatDate(group.payDate),
            recordCount: group.recordIds.length,
            created: false,
            error: 'createPayrollJournalEntries returned null',
          });
        }
      } catch (err) {
        results.push({
          payDate: formatDate(group.payDate),
          recordCount: group.recordIds.length,
          created: false,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const createdCount = results.filter((r) => r.created).length;

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'payroll.backfill_journal_entries',
      entityType: 'PayrollRecord',
      entityId: 'batch',
      metadata: {
        groupsScanned: groups.size,
        journalEntriesCreated: createdCount,
        sinceDate: sinceDate || null,
      },
    });

    return NextResponse.json({
      totalRecordsScanned: records.length,
      alreadyCovered: alreadyCovered.size,
      groupsToBackfill: groups.size,
      journalEntriesCreated: createdCount,
      results,
    });
  } catch (err) {
    console.error('Error backfilling payroll journal entries:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to backfill journal entries' },
      { status: 500 }
    );
  }
}
