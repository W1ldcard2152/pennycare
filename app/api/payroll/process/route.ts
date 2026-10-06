import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePayroll, PayrollInput, EmployeeDeductionInput } from '@/lib/payrollCalculations';
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
      include: {
        timeEntries: {
          where: {
            date: {
              gte: startOfDay(startDate),
              lte: endOfDay(endDate),
            },
          },
        },
        payrollRecords: {
          where: {
            payPeriodEnd: {
              lt: periodStart,
            },
            status: 'active',
          },
          orderBy: {
            payPeriodEnd: 'desc',
          },
        },
        deductions: {
          where: {
            isActive: true,
          },
        },
        paymentInfo: true,
      },
    });

    // Phase 1 — pure calculation, no DB writes. Builds the data we'll persist
    // so the actual writes can all happen inside one transaction below.
    type PreparedRecord = {
      employee: (typeof employees)[number];
      recordData: Parameters<typeof prisma.payrollRecord.create>[0]['data'];
      deductionUpdates: Array<{ id: string; ytdAmount: number }>;
      summary: { grossPay: number; netPay: number };
    };
    const prepared: PreparedRecord[] = [];

    for (const employee of employees) {
      const isSalaried = employee.payType === 'salary';

      // For hourly employees, sum up time entries
      let regularHours = 0;
      let overtimeHours = 0;
      let hourlyRate = employee.hourlyRate || 0;

      if (isSalaried) {
        const weeklyPay = (employee.annualSalary || 0) / 52;
        regularHours = 40;
        hourlyRate = weeklyPay / 40;
        overtimeHours = 0;
      } else {
        regularHours = employee.timeEntries.reduce(
          (sum, e) => sum + e.hoursWorked,
          0
        );
        overtimeHours = employee.timeEntries.reduce(
          (sum, e) => sum + e.overtimeHours,
          0
        );

        if (regularHours === 0 && overtimeHours === 0) {
          continue;
        }
      }

      // Calculate YTD totals â€” see preview route for cutoff rationale.
      const yearStart = new Date(Date.UTC(new Date(startDate).getUTCFullYear(), 0, 1));
      const seedAsOf = employee.ytdSeedAsOfDate;
      const cutoff = seedAsOf && seedAsOf > yearStart ? seedAsOf : yearStart;
      const ytdRecords = employee.payrollRecords.filter(
        (r) => r.payPeriodEnd > cutoff
      );
      const ytdGrossPay =
        (employee.ytdGrossPaySeed || 0) +
        ytdRecords.reduce((sum, r) => sum + r.grossPay, 0);
      const ytdSocialSecurity =
        (employee.ytdSocialSecuritySeed || 0) +
        ytdRecords.reduce((sum, r) => sum + r.socialSecurity, 0);
      const ytdMedicare =
        (employee.ytdMedicareSeed || 0) +
        ytdRecords.reduce((sum, r) => sum + r.medicare, 0);
      const ytdFederalTax =
        (employee.ytdFederalIncomeTaxSeed || 0) +
        ytdRecords.reduce((sum, r) => sum + r.federalTax, 0);
      const ytdStateTax =
        (employee.ytdStateIncomeTaxSeed || 0) +
        ytdRecords.reduce((sum, r) => sum + r.stateTax, 0);
      const ytdNetPay = ytdRecords.reduce((sum, r) => sum + r.netPay, 0);

      // Map employee deductions to calculation input format
      const deductions: EmployeeDeductionInput[] = employee.deductions.map((d) => ({
        deductionType: d.deductionType,
        name: d.name,
        amountType: d.amountType as 'fixed' | 'percentage',
        amount: d.amount,
        preTax: d.preTax,
        annualLimit: d.annualLimit,
        ytdAmount: d.ytdAmount,
      }));

      // Prepare calculation input
      const input: PayrollInput = {
        regularHours,
        overtimeHours,
        hourlyRate,
        overtimeMultiplier: company.overtimeMultiplier,
        w4FormType: employee.w4FormType,
        w4FilingStatus: employee.w4FilingStatus,
        w4Allowances: employee.w4Allowances,
        additionalWithholding: employee.additionalWithholding,
        federalTaxability: employee.federalTaxability,
        stateTaxability: employee.stateTaxability,
        socialSecurityTaxability: employee.socialSecurityTaxability,
        medicareTaxability: employee.medicareTaxability,
        unemploymentTaxability: employee.unemploymentTaxability,
        disabilityTaxability: employee.disabilityTaxability,
        paidFamilyLeaveTaxability: employee.paidFamilyLeaveTaxability,
        nycResident: employee.nycResident || false,
        yonkersResident: employee.yonkersResident || false,
        taxYear: yearStart.getUTCFullYear(),
        ytdGrossPay,
        ytdSocialSecurity,
        ytdMedicare,
        suiRate: company.suiRate || 0,
        futaRate: company.futaRate || 0.6,
        deductions,
      };

      // Calculate payroll
      const result = calculatePayroll(input);

      // Sum up pre-tax deductions by type for storage
      const preTax401k = result.preTaxDeductions
        .filter((d) => d.type === '401k')
        .reduce((sum, d) => sum + d.amount, 0);
      const preTaxHealthIns = result.preTaxDeductions
        .filter((d) => d.type === 'health_insurance')
        .reduce((sum, d) => sum + d.amount, 0);
      const preTaxDental = result.preTaxDeductions
        .filter((d) => d.type === 'dental')
        .reduce((sum, d) => sum + d.amount, 0);
      const preTaxVision = result.preTaxDeductions
        .filter((d) => d.type === 'vision')
        .reduce((sum, d) => sum + d.amount, 0);
      const preTaxHSA = result.preTaxDeductions
        .filter((d) => d.type === 'hsa')
        .reduce((sum, d) => sum + d.amount, 0);
      const preTaxFSA = result.preTaxDeductions
        .filter((d) => d.type === 'fsa')
        .reduce((sum, d) => sum + d.amount, 0);
      const preTaxOther = result.preTaxDeductions
        .filter((d) => !['401k', 'health_insurance', 'dental', 'vision', 'hsa', 'fsa'].includes(d.type))
        .reduce((sum, d) => sum + d.amount, 0);

      // Sum up post-tax deductions by type
      const postTaxRoth401k = result.postTaxDeductions
        .filter((d) => d.type === '401k_roth')
        .reduce((sum, d) => sum + d.amount, 0);
      const garnishments = result.postTaxDeductions
        .filter((d) => d.type === 'garnishment')
        .reduce((sum, d) => sum + d.amount, 0);
      const childSupport = result.postTaxDeductions
        .filter((d) => d.type === 'child_support')
        .reduce((sum, d) => sum + d.amount, 0);
      const loanRepayments = result.postTaxDeductions
        .filter((d) => d.type === 'loan_repayment')
        .reduce((sum, d) => sum + d.amount, 0);
      const postTaxOther = result.postTaxDeductions
        .filter((d) => !['401k_roth', 'garnishment', 'child_support', 'loan_repayment'].includes(d.type))
        .reduce((sum, d) => sum + d.amount, 0);

      // Build payroll record data (persisted in the transaction below)
      const recordData = {
          companyId: companyId!,
          employeeId: employee.id,
          createdById: actor.userId,
          payPeriodStart: periodStart,
          payPeriodEnd: periodEnd,
          payDate: payDateParsed,

          // Earnings
          regularHours,
          overtimeHours,
          regularPay: result.regularPay,
          overtimePay: result.overtimePay,
          otherEarnings: 0,
          grossPay: result.grossPay,

          // Pre-tax deductions
          preTax401k,
          preTaxHealthIns,
          preTaxDental,
          preTaxVision,
          preTaxHSA,
          preTaxFSA,
          preTaxOther,
          totalPreTaxDeductions: result.totalPreTaxDeductions,

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

          // Post-tax deductions
          postTaxRoth401k,
          garnishments,
          childSupport,
          loanRepayments,
          postTaxOther,
          totalPostTaxDeductions: result.totalPostTaxDeductions,

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
          ytdGrossPay: ytdGrossPay + result.grossPay,
          ytdFederalTax: ytdFederalTax + result.federalIncomeTax,
          ytdStateTax: ytdStateTax + result.stateIncomeTax,
          ytdSocialSecurity: ytdSocialSecurity + result.socialSecurityEmployee,
          ytdMedicare: ytdMedicare + result.medicareEmployee,
          ytdNetPay: ytdNetPay + result.netPay,

          // Payment info
          paymentMethod: employee.paymentInfo?.paymentMethod || 'check',
          isPaid: false,
          status: 'active',
      };

      const deductionUpdates: Array<{ id: string; ytdAmount: number }> = [];
      for (const deduction of employee.deductions) {
        const deductionResult = [...result.preTaxDeductions, ...result.postTaxDeductions]
          .find((d) => d.type === deduction.deductionType);
        if (deductionResult) {
          deductionUpdates.push({
            id: deduction.id,
            ytdAmount: deduction.ytdAmount + deductionResult.amount,
          });
        }
      }

      prepared.push({
        employee,
        recordData,
        deductionUpdates,
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
            data: { ytdAmount: upd.ytdAmount },
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
