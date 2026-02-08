import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePayroll, PayrollInput, EmployeeDeductionInput } from '@/lib/payrollCalculations';
import { requireCompanyAccess } from '@/lib/api-utils';

// POST /api/payroll/process - Process and save payroll
export async function POST(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { startDate, endDate, payDate } = await request.json();

    if (!startDate || !endDate || !payDate) {
      return NextResponse.json(
        { error: 'startDate, endDate, and payDate are required' },
        { status: 400 }
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
              gte: new Date(startDate),
              lte: new Date(endDate),
            },
          },
        },
        payrollRecords: {
          where: {
            payPeriodEnd: {
              lt: new Date(startDate),
            },
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

    const processedRecords = [];

    for (const employee of employees) {
      const isSalaried = employee.payType === 'salary';

      // For hourly employees, sum up time entries
      let regularHours = 0;
      let overtimeHours = 0;
      let hourlyRate = employee.hourlyRate || 0;

      if (isSalaried) {
        // Salaried employees: Calculate weekly pay as annualSalary / 52
        // Use 40 hours as standard week, rate = weekly salary / 40
        const weeklyPay = (employee.annualSalary || 0) / 52;
        regularHours = 40; // Standard work week
        hourlyRate = weeklyPay / 40;
        overtimeHours = 0; // Salaried employees typically don't get OT
      } else {
        // Hourly employees: Use time entries
        regularHours = employee.timeEntries.reduce(
          (sum, e) => sum + e.hoursWorked,
          0
        );
        overtimeHours = employee.timeEntries.reduce(
          (sum, e) => sum + e.overtimeHours,
          0
        );

        // Skip hourly employees with no hours
        if (regularHours === 0 && overtimeHours === 0) {
          continue;
        }
      }

      // Calculate YTD totals for wage base limits
      const ytdGrossPay = employee.payrollRecords.reduce(
        (sum, r) => sum + r.grossPay,
        0
      );
      const ytdSocialSecurity = employee.payrollRecords.reduce(
        (sum, r) => sum + r.socialSecurity,
        0
      );
      const ytdMedicare = employee.payrollRecords.reduce(
        (sum, r) => sum + r.medicare,
        0
      );
      const ytdFederalTax = employee.payrollRecords.reduce(
        (sum, r) => sum + r.federalTax,
        0
      );
      const ytdStateTax = employee.payrollRecords.reduce(
        (sum, r) => sum + r.stateTax,
        0
      );
      const ytdNetPay = employee.payrollRecords.reduce(
        (sum, r) => sum + r.netPay,
        0
      );

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

      // Create payroll record with detailed breakdown
      const payrollRecord = await prisma.payrollRecord.create({
        data: {
          companyId: companyId!,
          employeeId: employee.id,
          payPeriodStart: new Date(startDate),
          payPeriodEnd: new Date(endDate),
          payDate: new Date(payDate),

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
          employerWorkersComp: 0, // TODO: Calculate based on class code
          employerHealthIns: 0, // TODO: Add employer portion
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
        },
      });

      // Update YTD amounts on employee deductions
      for (const deduction of employee.deductions) {
        const deductionResult = [...result.preTaxDeductions, ...result.postTaxDeductions]
          .find((d) => d.type === deduction.deductionType);
        if (deductionResult) {
          await prisma.employeeDeduction.update({
            where: { id: deduction.id },
            data: {
              ytdAmount: deduction.ytdAmount + deductionResult.amount,
            },
          });
        }
      }

      processedRecords.push({
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        payrollRecordId: payrollRecord.id,
        grossPay: result.grossPay,
        netPay: result.netPay,
        details: result,
      });
    }

    return NextResponse.json({
      success: true,
      recordsProcessed: processedRecords.length,
      records: processedRecords,
    });
  } catch (error) {
    console.error('Error processing payroll:', error);
    return NextResponse.json(
      { error: 'Failed to process payroll' },
      { status: 500 }
    );
  }
}
