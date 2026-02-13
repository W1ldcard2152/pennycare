import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePayroll, PayrollInput, EmployeeDeductionInput } from '@/lib/payrollCalculations';
import { requireCompanyAccess } from '@/lib/api-utils';
import { correctPayrollSchema, validateRequest } from '@/lib/validation';
import { logAudit } from '@/lib/audit';

// POST /api/payroll/[id]/correct - Void and reprocess a payroll record
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
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

    // Step 1: Void the original record (mark as "corrected" instead of "voided" for clarity)
    await prisma.payrollRecord.update({
      where: { id },
      data: {
        status: 'corrected',
        voidedAt: new Date(),
        voidedBy: session!.userId,
        voidReason: `Corrected: ${reason}`,
      },
    });

    // Reverse YTD deduction amounts from the original
    const deductionTypes = new Map<string, number>();
    if (original.preTax401k > 0) deductionTypes.set('401k', original.preTax401k);
    if (original.preTaxHealthIns > 0) deductionTypes.set('health_insurance', original.preTaxHealthIns);
    if (original.preTaxDental > 0) deductionTypes.set('dental', original.preTaxDental);
    if (original.preTaxVision > 0) deductionTypes.set('vision', original.preTaxVision);
    if (original.preTaxHSA > 0) deductionTypes.set('hsa', original.preTaxHSA);
    if (original.preTaxFSA > 0) deductionTypes.set('fsa', original.preTaxFSA);
    if (original.postTaxRoth401k > 0) deductionTypes.set('401k_roth', original.postTaxRoth401k);
    if (original.garnishments > 0) deductionTypes.set('garnishment', original.garnishments);
    if (original.childSupport > 0) deductionTypes.set('child_support', original.childSupport);
    if (original.loanRepayments > 0) deductionTypes.set('loan_repayment', original.loanRepayments);

    for (const [deductionType, amount] of deductionTypes) {
      const employeeDeductions = await prisma.employeeDeduction.findMany({
        where: { employeeId: original.employeeId, deductionType, isActive: true },
      });
      for (const ded of employeeDeductions) {
        await prisma.employeeDeduction.update({
          where: { id: ded.id },
          data: { ytdAmount: Math.max(0, ded.ytdAmount - amount) },
        });
      }
    }

    // Step 2: Recalculate using current employee data
    const company = await prisma.company.findUnique({ where: { id: companyId! } });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 400 });
    }

    const employee = await prisma.employee.findUnique({
      where: { id: original.employeeId },
      include: {
        timeEntries: {
          where: {
            date: {
              gte: original.payPeriodStart,
              lte: original.payPeriodEnd,
            },
          },
        },
        payrollRecords: {
          where: {
            payPeriodEnd: { lt: original.payPeriodStart },
            status: 'active',
          },
          orderBy: { payPeriodEnd: 'desc' },
        },
        deductions: { where: { isActive: true } },
        paymentInfo: true,
      },
    });

    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    const isSalaried = employee.payType === 'salary';
    let regularHours = 0;
    let overtimeHours = 0;
    let hourlyRate = employee.hourlyRate || 0;

    if (isSalaried) {
      const weeklyPay = (employee.annualSalary || 0) / 52;
      regularHours = 40;
      hourlyRate = weeklyPay / 40;
    } else {
      regularHours = employee.timeEntries.reduce((sum, e) => sum + e.hoursWorked, 0);
      overtimeHours = employee.timeEntries.reduce((sum, e) => sum + e.overtimeHours, 0);
    }

    const ytdGrossPay = employee.payrollRecords.reduce((sum, r) => sum + r.grossPay, 0);
    const ytdSocialSecurity = employee.payrollRecords.reduce((sum, r) => sum + r.socialSecurity, 0);
    const ytdMedicare = employee.payrollRecords.reduce((sum, r) => sum + r.medicare, 0);
    const ytdFederalTax = employee.payrollRecords.reduce((sum, r) => sum + r.federalTax, 0);
    const ytdStateTax = employee.payrollRecords.reduce((sum, r) => sum + r.stateTax, 0);
    const ytdNetPay = employee.payrollRecords.reduce((sum, r) => sum + r.netPay, 0);

    const deductions: EmployeeDeductionInput[] = employee.deductions.map((d) => ({
      deductionType: d.deductionType,
      name: d.name,
      amountType: d.amountType as 'fixed' | 'percentage',
      amount: d.amount,
      preTax: d.preTax,
      annualLimit: d.annualLimit,
      ytdAmount: d.ytdAmount,
    }));

    const input: PayrollInput = {
      regularHours,
      overtimeHours,
      hourlyRate,
      overtimeMultiplier: company.overtimeMultiplier,
      w4FilingStatus: employee.w4FilingStatus,
      w4Allowances: employee.w4Allowances,
      federalTaxesWithheld: employee.federalTaxesWithheld,
      stateTaxesWithheld: employee.stateTaxesWithheld,
      nycResident: employee.nycResident || false,
      yonkersResident: employee.yonkersResident || false,
      ytdGrossPay,
      ytdSocialSecurity,
      ytdMedicare,
      suiRate: company.suiRate || 0,
      futaRate: company.futaRate || 0.6,
      deductions,
    };

    const result = calculatePayroll(input);

    // Create the correction record
    const preTax401k = result.preTaxDeductions.filter((d) => d.type === '401k').reduce((s, d) => s + d.amount, 0);
    const preTaxHealthIns = result.preTaxDeductions.filter((d) => d.type === 'health_insurance').reduce((s, d) => s + d.amount, 0);
    const preTaxDental = result.preTaxDeductions.filter((d) => d.type === 'dental').reduce((s, d) => s + d.amount, 0);
    const preTaxVision = result.preTaxDeductions.filter((d) => d.type === 'vision').reduce((s, d) => s + d.amount, 0);
    const preTaxHSA = result.preTaxDeductions.filter((d) => d.type === 'hsa').reduce((s, d) => s + d.amount, 0);
    const preTaxFSA = result.preTaxDeductions.filter((d) => d.type === 'fsa').reduce((s, d) => s + d.amount, 0);
    const preTaxOther = result.preTaxDeductions.filter((d) => !['401k', 'health_insurance', 'dental', 'vision', 'hsa', 'fsa'].includes(d.type)).reduce((s, d) => s + d.amount, 0);
    const postTaxRoth401k = result.postTaxDeductions.filter((d) => d.type === '401k_roth').reduce((s, d) => s + d.amount, 0);
    const garnishments = result.postTaxDeductions.filter((d) => d.type === 'garnishment').reduce((s, d) => s + d.amount, 0);
    const childSupport = result.postTaxDeductions.filter((d) => d.type === 'child_support').reduce((s, d) => s + d.amount, 0);
    const loanRepayments = result.postTaxDeductions.filter((d) => d.type === 'loan_repayment').reduce((s, d) => s + d.amount, 0);
    const postTaxOther = result.postTaxDeductions.filter((d) => !['401k_roth', 'garnishment', 'child_support', 'loan_repayment'].includes(d.type)).reduce((s, d) => s + d.amount, 0);

    const correctionRecord = await prisma.payrollRecord.create({
      data: {
        companyId: companyId!,
        employeeId: employee.id,
        payPeriodStart: original.payPeriodStart,
        payPeriodEnd: original.payPeriodEnd,
        payDate: original.payDate,
        regularHours,
        overtimeHours,
        regularPay: result.regularPay,
        overtimePay: result.overtimePay,
        otherEarnings: 0,
        grossPay: result.grossPay,
        preTax401k, preTaxHealthIns, preTaxDental, preTaxVision, preTaxHSA, preTaxFSA, preTaxOther,
        totalPreTaxDeductions: result.totalPreTaxDeductions,
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
        postTaxRoth401k, garnishments, childSupport, loanRepayments, postTaxOther,
        totalPostTaxDeductions: result.totalPostTaxDeductions,
        totalDeductions: result.totalDeductions,
        netPay: result.netPay,
        employerSocialSecurity: result.socialSecurityEmployer,
        employerMedicare: result.medicareEmployer,
        employerSUI: result.suiEmployer,
        employerFUTA: result.futaEmployer,
        employerWorkersComp: 0,
        employerHealthIns: 0,
        totalEmployerCost: result.totalEmployerCost,
        ytdGrossPay: ytdGrossPay + result.grossPay,
        ytdFederalTax: ytdFederalTax + result.federalIncomeTax,
        ytdStateTax: ytdStateTax + result.stateIncomeTax,
        ytdSocialSecurity: ytdSocialSecurity + result.socialSecurityEmployee,
        ytdMedicare: ytdMedicare + result.medicareEmployee,
        ytdNetPay: ytdNetPay + result.netPay,
        paymentMethod: employee.paymentInfo?.paymentMethod || 'check',
        isPaid: false,
        status: 'active',
        originalRecordId: id,
        notes: `Correction of record ${id}: ${reason}`,
      },
    });

    // Update YTD amounts on employee deductions for the new record
    for (const ded of employee.deductions) {
      const deductionResult = [...result.preTaxDeductions, ...result.postTaxDeductions]
        .find((d) => d.type === ded.deductionType);
      if (deductionResult) {
        await prisma.employeeDeduction.update({
          where: { id: ded.id },
          data: { ytdAmount: ded.ytdAmount + deductionResult.amount },
        });
      }
    }

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
