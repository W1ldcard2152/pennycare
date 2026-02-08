import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePayroll, PayrollInput, EmployeeDeductionInput } from '@/lib/payrollCalculations';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/payroll/preview - Generate payroll preview
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
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
      },
    });

    const preview = employees
      .map((employee) => {
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
            return null;
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

        return {
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          employeeNumber: employee.employeeNumber,
          position: employee.position,
          payType: employee.payType,
          hourlyRate: isSalaried ? null : employee.hourlyRate,
          annualSalary: isSalaried ? employee.annualSalary : null,
          regularHours: isSalaried ? null : regularHours,
          overtimeHours: isSalaried ? null : overtimeHours,
          grossPay: result.grossPay,
          netPay: result.netPay,
          totalDeductions: result.totalDeductions,
          details: result, // Include full calculation for detailed view
        };
      })
      .filter((p) => p !== null);

    return NextResponse.json(preview);
  } catch (error) {
    console.error('Error generating payroll preview:', error);
    return NextResponse.json(
      { error: 'Failed to generate payroll preview' },
      { status: 500 }
    );
  }
}
