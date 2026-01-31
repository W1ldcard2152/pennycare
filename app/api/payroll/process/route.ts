import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePayroll, PayrollInput } from '@/lib/payrollCalculations';
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

    // Get all active hourly employees
    const employees = await prisma.employee.findMany({
      where: {
        companyId: companyId!,
        isActive: true,
        payType: 'hourly',
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
      },
    });

    const processedRecords = [];

    for (const employee of employees) {
      // Sum up time entries for the pay period
      const regularHours = employee.timeEntries.reduce(
        (sum, e) => sum + e.hoursWorked,
        0
      );
      const overtimeHours = employee.timeEntries.reduce(
        (sum, e) => sum + e.overtimeHours,
        0
      );

      // Skip if no hours
      if (regularHours === 0 && overtimeHours === 0) {
        continue;
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

      // Prepare calculation input
      const input: PayrollInput = {
        regularHours,
        overtimeHours,
        hourlyRate: employee.hourlyRate || 0,
        overtimeMultiplier: company.overtimeMultiplier,
        w4FilingStatus: employee.w4FilingStatus,
        w4Allowances: employee.w4Allowances,
        federalTaxesWithheld: employee.federalTaxesWithheld,
        stateTaxesWithheld: employee.stateTaxesWithheld,
        ytdGrossPay,
        ytdSocialSecurity,
        ytdMedicare,
        suiRate: company.suiRate || 0,
      };

      // Calculate payroll
      const result = calculatePayroll(input);

      // Create payroll record
      const payrollRecord = await prisma.payrollRecord.create({
        data: {
          companyId: companyId!,
          employeeId: employee.id,
          payPeriodStart: new Date(startDate),
          payPeriodEnd: new Date(endDate),
          payDate: new Date(payDate),
          regularHours,
          overtimeHours,
          regularPay: result.regularPay,
          overtimePay: result.overtimePay,
          grossPay: result.grossPay,
          federalTax: result.federalIncomeTax,
          stateTax: result.nyStateIncomeTax,
          socialSecurity: result.socialSecurity,
          medicare: result.medicare,
          otherDeductions: result.nySDI + result.nyPFL,
          totalDeductions: result.totalDeductions,
          netPay: result.netPay,
          isPaid: false,
        },
      });

      processedRecords.push({
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        payrollRecordId: payrollRecord.id,
        grossPay: result.grossPay,
        netPay: result.netPay,
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
