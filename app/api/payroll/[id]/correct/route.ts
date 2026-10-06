import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePayroll } from '@/lib/payrollCalculations';
import {
  buildPayrollInput,
  deductionColumns,
  deductionYtdUpdates,
  payrollEmployeeInclude,
  planDeductionReversal,
  reverseDeductionYtd,
} from '@/lib/payroll-input';
import { requireCompanyAccess } from '@/lib/api-utils';
import { correctPayrollSchema, validateRequest } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

// POST /api/payroll/[id]/correct - Void and reprocess a payroll record
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('APPROVER');
    if (error) return error;

    const { id } = await params;
    const body = await request.json();

    // Validate
    const validation = validateRequest(correctPayrollSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    const { reason } = validation.data;

    // Fetch the original record
    const original = await prisma.payrollRecord.findFirst({
      where: { id, companyId: companyId! },
      include: { employee: { select: { firstName: true, lastName: true } } },
    });

    if (!original) {
      return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 });
    }

    if (original.status !== 'active') {
      return NextResponse.json(
        { error: `Cannot correct a record that is already ${original.status}` },
        { status: 400 }
      );
    }

    // Recalculate using current employee data. All reads happen BEFORE any
    // writes so the void→reverse-YTD→create→re-apply sequence can run in one
    // transaction (1.2 fix: a crash mid-correction no longer leaves the
    // original corrected with no replacement, or a half-applied YTD).
    const company = await prisma.company.findUnique({ where: { id: companyId! } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: original.employeeId },
      include: payrollEmployeeInclude({
        from: original.payPeriodStart,
        to: original.payPeriodEnd,
        periodStart: original.payPeriodStart,
      }),
    });

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    // Same input builder as preview/process, on the original pay date. The
    // deduction YTD on file still includes the original record's amounts;
    // the transaction below reverses those before applying the new ones, so
    // the builder sees deductions with the original backed out (same plan
    // reverseDeductionYtd applies — oldest deduction first).
    const taxYear = original.payDate.getUTCFullYear();
    const oldestFirst = [...employee.deductions].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const takeById = planDeductionReversal(oldestFirst, original);
    const deductionsBeforeOriginal = oldestFirst.map((d) => ({ ...d, ytdAmount: d.ytdAmount - (takeById.get(d.id) || 0) }));
    const built = buildPayrollInput({ ...employee, deductions: deductionsBeforeOriginal }, company, original.payDate);
    const result = calculatePayroll(built.input);
    const { ytd } = built;

    // Void original + reverse original YTD + create correction + apply new YTD,
    // all in one transaction.
    const correctionRecord = await prisma.$transaction(async (tx) => {
      await tx.payrollRecord.update({
        where: { id },
        data: {
          status: 'corrected',
          voidedAt: new Date(),
          voidedBy: session!.userId,
          voidReason: `Corrected: ${reason}`,
        },
      });

      // Reverse YTD deduction amounts from the original
      await reverseDeductionYtd(tx, original);

      const correctionRecord = await tx.payrollRecord.create({
      data: {
        companyId: companyId!,
        employeeId: employee.id,
        createdById: session!.userId,
        payPeriodStart: original.payPeriodStart,
        payPeriodEnd: original.payPeriodEnd,
        payDate: original.payDate,
        regularHours: built.regularHours,
        overtimeHours: built.overtimeHours,
        regularPay: result.regularPay,
        overtimePay: result.overtimePay,
        otherEarnings: 0,
        grossPay: result.grossPay,
        ...deductionColumns(result),
        totalPreTaxDeductions: result.totalPreTaxDeductions,
        totalPostTaxDeductions: result.totalPostTaxDeductions,
        taxableWages: result.taxableWages,
        federalTax: result.federalIncomeTax,
        stateTax: result.stateIncomeTax,
        localTax: result.localTax,
        socialSecurity: result.socialSecurityEmployee,
        medicare: result.medicareEmployee,
        additionalMedicare: result.additionalMedicare,
        nySDI: result.nySDI,
        nyPFL: result.nyPFL,
        totalTaxWithholdings: result.totalTaxWithholdings,
        totalDeductions: result.totalDeductions,
        netPay: result.netPay,
        employerSocialSecurity: result.socialSecurityEmployer,
        employerMedicare: result.medicareEmployer,
        employerSUI: result.suiEmployer,
        employerRSF: result.nyRSFEmployer,
        employerFUTA: result.futaEmployer,
        employerWorkersComp: 0,
        employerHealthIns: 0,
        totalEmployerCost: result.totalEmployerCost,
        ytdGrossPay: ytd.grossPay + result.grossPay,
        ytdFederalTax: ytd.federalTax + result.federalIncomeTax,
        ytdStateTax: ytd.stateTax + result.stateIncomeTax,
        ytdSocialSecurity: ytd.socialSecurity + result.socialSecurityEmployee,
        ytdMedicare: ytd.medicare + result.medicareEmployee,
        ytdNetPay: ytd.netPay + result.netPay,
        paymentMethod: employee.paymentInfo?.paymentMethod || 'check',
        isPaid: false,
        status: 'active',
        originalRecordId: id,
        notes: `Correction of record ${id}: ${reason}`,
      },
      });

      // Apply the correction's deductions on top of the reversed YTD. Re-read
      // inside the transaction: reverseDeductionYtd just changed these rows.
      const current = await tx.employeeDeduction.findMany({
        where: { employeeId: employee.id, isActive: true },
        select: { id: true, ytdAmount: true, ytdYear: true },
      });
      for (const upd of deductionYtdUpdates(current, result, taxYear)) {
        await tx.employeeDeduction.update({
          where: { id: upd.id },
          data: { ytdAmount: upd.ytdAmount, ytdYear: upd.ytdYear },
        });
      }

      return correctionRecord;
    }, { timeout: 20000 });

    // Audit logs
    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'payroll.correct',
      entityType: 'PayrollRecord',
      entityId: id,
      metadata: {
        reason,
        originalRecordId: id,
        correctionRecordId: correctionRecord.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        originalGrossPay: original.grossPay,
        correctedGrossPay: result.grossPay,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Payroll record corrected successfully',
      voidedRecord: { id, status: 'corrected' },
      correctionRecord,
    });
  } catch (error) {
    console.error('Error correcting payroll record:', error);
    return NextResponse.json(
      { error: 'Failed to correct payroll record' },
      { status: 500 }
    );
  }
}
