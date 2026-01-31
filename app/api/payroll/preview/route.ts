import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePayroll, PayrollInput } from '@/lib/payrollCalculations';
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

    const preview = employees
      .map((employee) => {
        // Sum up time entries for the week
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
          return null;
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

        return {
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          regularHours,
          overtimeHours,
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
