import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calculatePayroll } from '@/lib/payrollCalculations';
import { buildPayrollInput, payrollEmployeeInclude } from '@/lib/payroll-input';
import { requireCompanyAccess } from '@/lib/api-utils';
import { parseBusinessDate, startOfDay, endOfDay } from '@/lib/date-utils';

// GET /api/payroll/preview - Generate payroll preview
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    // The pay date picks the tax year / YTD window. Defaults to the period end,
    // which is what Run Payroll submits when processing.
    const payDate = searchParams.get('payDate') || endDate;

    if (!startDate || !endDate || !payDate) {
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

    // Same employee load as /api/payroll/process, so preview and process
    // compute identical numbers (preview used to count voided records in YTD).
    const employees = await prisma.employee.findMany({
      where: {
        companyId: companyId!,
        isActive: true,
      },
      include: payrollEmployeeInclude({
        from: startOfDay(startDate),
        to: endOfDay(endDate),
        periodStart: parseBusinessDate(startDate),
      }),
    });

    const payDateParsed = parseBusinessDate(payDate);

    const preview = employees
      .map((employee) => {
        const isSalaried = employee.payType === 'salary';
        const built = buildPayrollInput(employee, company, payDateParsed);
        if (built.skip) return null;

        const result = calculatePayroll(built.input);
        result.warnings = [...built.warnings, ...result.warnings];

        return {
          employeeId: employee.id,
          employeeName: `${employee.firstName} ${employee.lastName}`,
          employeeNumber: employee.employeeNumber,
          position: employee.position,
          payType: employee.payType,
          hourlyRate: isSalaried ? null : employee.hourlyRate,
          annualSalary: isSalaried ? employee.annualSalary : null,
          regularHours: isSalaried ? null : built.regularHours,
          overtimeHours: isSalaried ? null : built.overtimeHours,
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
