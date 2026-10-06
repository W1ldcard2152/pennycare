import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePayroll } from '@/lib/payrollCalculations';
import {
  buildPayrollInput,
  deductionColumns,
  deductionYtdUpdates,
  payrollEmployeeInclude,
} from '@/lib/payroll-input';
import { requireCompanyAccess } from '@/lib/api-utils';
import { processPayrollSchema, validateRequest } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import { createPayrollJournalEntries } from '@/lib/bookkeeping';
import { parseBusinessDate, startOfDay, endOfDay } from '@/lib/date-utils';

// Thrown by the in-transaction duplicate-period re-check so the catch can map
// it to a 409 (the pre-transaction check returns 409 too).
class DuplicatePayrollError extends Error {
  constructor() {
    super('Payroll has already been processed for this period. Void the existing records first if you need to reprocess.');
    this.name = 'DuplicatePayrollError';
  }
}

// POST /api/payroll/process - Process and save payroll
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;
    const actor = { userId: session!.userId, role: role! };

    const body = await request.json();

    // Validate input
    const validation = validateRequest(processPayrollSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    const { startDate, endDate, payDate } = validation.data;

    // Use timezone-safe date handling
    const periodStart = parseBusinessDate(startDate);
    const periodEnd = parseBusinessDate(endDate);
    const payDateParsed = parseBusinessDate(payDate);

    // Check for existing active payroll records in this period to prevent duplicates
    const existingRecords = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payPeriodStart: periodStart,
        payPeriodEnd: periodEnd,
        status: 'active',
      },
      select: { id: true },
    });

    if (existingRecords.length > 0) {
      return NextResponse.json(
        { error: 'Payroll has already been processed for this period. Void the existing records first if you need to reprocess.' },
        { status: 409 }
      );
    }

    // Get company settings
    const company = await prisma.company.findUnique({
      where: { id: companyId! },
    });
    if (!company) {
      return NextResponse.json(
        { error: 'Company settings not found. Please configure in Settings.' },
        { status: 400 }
      );
    }

    // Get all active employees with their deductions
    const employees = await prisma.employee.findMany({
      where: {
        companyId: companyId!,
        isActive: true,
      },
      include: payrollEmployeeInclude({
        from: startOfDay(startDate),
        to: endOfDay(endDate),
        periodStart,
      }),
    });

    // Phase 1 — pure calculation, no DB writes. Builds the data we'll persist
    // so the actual writes can all happen inside one transaction below.
    type PreparedRecord = {
      employee: (typeof employees)[number];
      recordData: Parameters<typeof prisma.payrollRecord.create>[0]['data'];
      deductionUpdates: Array<{ id: string; ytdAmount: number; ytdYear: number }>;
      summary: { grossPay: number; netPay: number };
    };
    const prepared: PreparedRecord[] = [];
    const taxYear = payDateParsed.getUTCFullYear();

    for (const employee of employees) {
      // Input (hours, YTD window by pay date, seeds, deductions) comes from the
      // shared builder — identical to what the preview showed.
      const built = buildPayrollInput(employee, company, payDateParsed);
      if (built.skip) continue;

      const result = calculatePayroll(built.input);
      const { ytd } = built;

      // Build payroll record data (persisted in the transaction below)
      const recordData = {
          companyId: companyId!,
          employeeId: employee.id,
          createdById: actor.userId,
          payPeriodStart: periodStart,
          payPeriodEnd: periodEnd,
          payDate: payDateParsed,

          // Earnings
          regularHours: built.regularHours,
          overtimeHours: built.overtimeHours,
          regularPay: result.regularPay,
          overtimePay: result.overtimePay,
          otherEarnings: 0,
          grossPay: result.grossPay,

          // Pre-tax and post-tax deductions, by type
          ...deductionColumns(result),
          totalPreTaxDeductions: result.totalPreTaxDeductions,
          totalPostTaxDeductions: result.totalPostTaxDeductions,

          // Taxable wages
          taxableWages: result.taxableWages,

          // Tax withholdings
          federalTax: result.federalIncomeTax,
          stateTax: result.stateIncomeTax,
          localTax: result.localTax,
          socialSecurity: result.socialSecurityEmployee,
          medicare: result.medicareEmployee,
          additionalMedicare: result.additionalMedicare,
          nySDI: result.nySDI,
          nyPFL: result.nyPFL,
          totalTaxWithholdings: result.totalTaxWithholdings,

          // Totals
          totalDeductions: result.totalDeductions,
          netPay: result.netPay,

          // Employer costs
          employerSocialSecurity: result.socialSecurityEmployer,
          employerMedicare: result.medicareEmployer,
          employerSUI: result.suiEmployer,
          employerFUTA: result.futaEmployer,
          employerWorkersComp: 0,
          employerHealthIns: 0,
          totalEmployerCost: result.totalEmployerCost,

          // YTD totals (including this payroll)
          ytdGrossPay: ytd.grossPay + result.grossPay,
          ytdFederalTax: ytd.federalTax + result.federalIncomeTax,
          ytdStateTax: ytd.stateTax + result.stateIncomeTax,
          ytdSocialSecurity: ytd.socialSecurity + result.socialSecurityEmployee,
          ytdMedicare: ytd.medicare + result.medicareEmployee,
          ytdNetPay: ytd.netPay + result.netPay,

          // Payment info
          paymentMethod: employee.paymentInfo?.paymentMethod || 'check',
          isPaid: false,
          status: 'active',
      };

      prepared.push({
        employee,
        recordData,
        deductionUpdates: deductionYtdUpdates(employee.deductions, result, taxYear),
        summary: { grossPay: result.grossPay, netPay: result.netPay },
      });
    }

    // Phase 2 — persist everything atomically. Records, deduction-YTD updates,
    // and the payroll journal entry all commit together (1.2 fix): a crash or
    // a JE failure mid-run rolls the whole payroll back rather than leaving
    // records with no books entry, or a partial run. The duplicate-period
    // guard is re-checked INSIDE the transaction to close the read-then-write
    // race against a concurrent processor.
    const { processedRecords, payrollRecordIds } = await prisma.$transaction(async (tx) => {
      const dup = await tx.payrollRecord.findFirst({
        where: {
          companyId: companyId!,
          payPeriodStart: periodStart,
          payPeriodEnd: periodEnd,
          status: 'active',
        },
        select: { id: true },
      });
      if (dup) {
        throw new DuplicatePayrollError();
      }

      const processedRecords: Array<{
        employeeId: string;
        employeeName: string;
        payrollRecordId: string;
        grossPay: number;
        netPay: number;
        details: typeof prepared[number]['recordData'];
      }> = [];

      for (const p of prepared) {
        const payrollRecord = await tx.payrollRecord.create({ data: p.recordData });
        for (const upd of p.deductionUpdates) {
          await tx.employeeDeduction.update({
            where: { id: upd.id },
            data: { ytdAmount: upd.ytdAmount, ytdYear: upd.ytdYear },
          });
        }
        processedRecords.push({
          employeeId: p.employee.id,
          employeeName: `${p.employee.firstName} ${p.employee.lastName}`,
          payrollRecordId: payrollRecord.id,
          grossPay: p.summary.grossPay,
          netPay: p.summary.netPay,
          details: p.recordData,
        });
      }

      const payrollRecordIds = processedRecords.map((r) => r.payrollRecordId);

      // Create the payroll journal entry on the same transaction. A null
      // return (or a throw) here aborts the whole run — payroll must never
      // be saved without its books entry.
      if (payrollRecordIds.length > 0) {
        const periodLabel = `${startDate} to ${endDate}`;
        const journalResult = await createPayrollJournalEntries(
          companyId!,
          payrollRecordIds,
          payDateParsed,
          periodLabel,
          actor,
          tx,
        );
        if (!journalResult) {
          throw new Error(
            'Could not create the payroll journal entry (chart of accounts may be missing required payroll accounts). Payroll was not saved.'
          );
        }
      }

      return { processedRecords, payrollRecordIds };
    }, { timeout: 30000 });

    // Audit logs are tier-2 (fire-and-forget) and written AFTER the commit so a
    // rolled-back run leaves no orphan audit rows.
    for (const r of processedRecords) {
      await logAudit({
        companyId: companyId!,
        userId: session!.userId,
        action: 'payroll.employee_processed',
        entityType: 'PayrollRecord',
        entityId: r.payrollRecordId,
        metadata: {
          employeeId: r.employeeId,
          employeeName: r.employeeName,
          payPeriod: `${startDate} to ${endDate}`,
          grossPay: r.grossPay,
          netPay: r.netPay,
        },
      });
    }

    if (processedRecords.length > 0) {
      const totalGross = processedRecords.reduce((s, r) => s + r.grossPay, 0);
      const totalNet = processedRecords.reduce((s, r) => s + r.netPay, 0);
      await logAudit({
        companyId: companyId!,
        userId: session!.userId,
        action: 'payroll.process',
        entityType: 'PayrollRecord',
        entityId: payrollRecordIds[0],
        metadata: {
          count: processedRecords.length,
          payPeriod: `${startDate} to ${endDate}`,
          totalGross,
          totalNet,
          payrollRecordIds,
        },
      });
    }

    return NextResponse.json({
      success: true,
      recordsProcessed: processedRecords.length,
      records: processedRecords,
    });
  } catch (error) {
    if (error instanceof DuplicatePayrollError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error('Error processing payroll:', error);
    const message = error instanceof Error ? error.message : 'Failed to process payroll';
    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
