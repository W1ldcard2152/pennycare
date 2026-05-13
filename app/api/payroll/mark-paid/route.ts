import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { parseBusinessDate, formatDate } from '@/lib/date-utils';
import { round2 } from '@/lib/bookkeeping';
import { validateRequest } from '@/lib/validation';

const markPaidSchema = z.object({
  payrollRecordIds: z.array(z.string().min(1)).min(1, 'At least one payroll record is required'),
  paidDate: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'paidDate must be YYYY-MM-DD'),
  bankAccountId: z.string().min(1, 'bankAccountId is required'),
  paymentMethod: z.enum(['direct_deposit', 'check']),
  checkNumber: z.string().max(50).optional().nullable(),
});

// POST /api/payroll/mark-paid
//
// Marks one or more PayrollRecord rows as paid AND creates the journal entry
// that clears Net Pay Payable (2100) against the chosen bank account. The
// payroll-side JE (created by createPayrollJournalEntries during processing)
// already credited 2100; this entry debits 2100 and credits the bank, closing
// the loop on the books once the actual direct deposit / check is sent.
//
// One combined JE per call, summing net pay across the selected records.
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('payroll');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(markPaidSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }
    const { payrollRecordIds, paidDate, bankAccountId, paymentMethod, checkNumber } = validation.data;

    // Fetch the records and validate they're all eligible
    const records = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        id: { in: payrollRecordIds },
      },
      select: {
        id: true,
        netPay: true,
        isPaid: true,
        status: true,
        payDate: true,
        payPeriodStart: true,
        payPeriodEnd: true,
        employee: { select: { firstName: true, lastName: true } },
      },
    });

    if (records.length !== payrollRecordIds.length) {
      return NextResponse.json({ error: 'One or more payroll records not found' }, { status: 404 });
    }
    const alreadyPaid = records.filter((r) => r.isPaid);
    if (alreadyPaid.length > 0) {
      return NextResponse.json(
        {
          error: `Already paid: ${alreadyPaid.map((r) => `${r.employee.firstName} ${r.employee.lastName}`).join(', ')}`,
        },
        { status: 400 }
      );
    }
    const voided = records.filter((r) => r.status !== 'active');
    if (voided.length > 0) {
      return NextResponse.json(
        { error: 'Cannot mark voided or corrected payroll records as paid' },
        { status: 400 }
      );
    }

    // Look up the bank account and the Net Pay Payable account (2100).
    const [bankAccount, netPayAccount] = await Promise.all([
      prisma.account.findFirst({
        where: { id: bankAccountId, companyId: companyId!, type: 'asset' },
        select: { id: true, code: true, name: true },
      }),
      prisma.account.findFirst({
        where: { companyId: companyId!, code: '2100' },
        select: { id: true, code: true, name: true, type: true },
      }),
    ]);

    if (!bankAccount) {
      return NextResponse.json({ error: 'Bank account not found or is not an asset' }, { status: 400 });
    }
    if (!netPayAccount || netPayAccount.type !== 'liability') {
      return NextResponse.json(
        { error: 'Net Pay Payable account (code 2100) is missing or not a liability' },
        { status: 400 }
      );
    }

    const totalNetPay = round2(records.reduce((sum, r) => sum + r.netPay, 0));
    if (totalNetPay <= 0) {
      return NextResponse.json({ error: 'Total net pay is zero — nothing to record' }, { status: 400 });
    }

    const paidDateParsed = parseBusinessDate(paidDate);

    // Sort records by payDate for a clean memo
    const earliestPayDate = records.reduce((min, r) => (r.payDate < min ? r.payDate : min), records[0].payDate);
    const payDateStr = formatDate(earliestPayDate);
    const employeeCount = records.length;
    const memo =
      employeeCount === 1
        ? `Payroll paid: ${records[0].employee.firstName} ${records[0].employee.lastName} (${payDateStr})`
        : `Payroll paid: ${employeeCount} employees (${payDateStr})`;

    const result = await prisma.$transaction(async (tx) => {
      // Increment journal entry counter
      const company = await tx.company.update({
        where: { id: companyId! },
        data: { nextJournalEntryNumber: { increment: 1 } },
        select: { nextJournalEntryNumber: true },
      });
      const entryNumber = company.nextJournalEntryNumber - 1;

      // Create the JE: DR 2100 net pay payable, CR bank
      const entry = await tx.journalEntry.create({
        data: {
          companyId: companyId!,
          entryNumber,
          date: paidDateParsed,
          memo,
          source: 'payroll_payment',
          sourceId: null,
          lines: {
            create: [
              {
                accountId: netPayAccount.id,
                description: `Net pay payable cleared (${employeeCount} employee${employeeCount !== 1 ? 's' : ''})`,
                debit: totalNetPay,
                credit: 0,
              },
              {
                accountId: bankAccount.id,
                description: paymentMethod === 'check' ? `Check${checkNumber ? ` #${checkNumber}` : ''}` : 'Direct deposit',
                debit: 0,
                credit: totalNetPay,
              },
            ],
          },
        },
        select: { id: true, entryNumber: true },
      });

      // Mark each PayrollRecord as paid
      await tx.payrollRecord.updateMany({
        where: { id: { in: payrollRecordIds } },
        data: {
          isPaid: true,
          paidDate: paidDateParsed,
          paymentMethod,
          checkNumber: paymentMethod === 'check' ? (checkNumber ?? null) : null,
        },
      });

      return entry;
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'payroll.mark_paid',
      entityType: 'JournalEntry',
      entityId: result.id,
      metadata: {
        payrollRecordIds,
        totalNetPay,
        paidDate,
        paymentMethod,
        bankAccountId,
        journalEntryNumber: result.entryNumber,
      },
    });

    return NextResponse.json({
      success: true,
      journalEntryId: result.id,
      journalEntryNumber: result.entryNumber,
      totalNetPay,
      recordsMarkedPaid: records.length,
    });
  } catch (err) {
    console.error('Error marking payroll paid:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to mark payroll paid' },
      { status: 500 }
    );
  }
}
