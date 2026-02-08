import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/reports/employee-earnings - Per-employee earnings for a date range
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const period = searchParams.get('period');
    const employeeId = searchParams.get('employeeId');

    let dateStart: Date;
    let dateEnd: Date;
    const now = new Date();

    if (startDate && endDate) {
      dateStart = new Date(startDate);
      dateEnd = new Date(endDate);
    } else if (period === 'month') {
      dateStart = new Date(now.getFullYear(), now.getMonth(), 1);
      dateEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else if (period === 'year') {
      dateStart = new Date(now.getFullYear(), 0, 1);
      dateEnd = new Date(now.getFullYear(), 11, 31);
    } else {
      const quarter = Math.floor(now.getMonth() / 3);
      dateStart = new Date(now.getFullYear(), quarter * 3, 1);
      dateEnd = new Date(now.getFullYear(), quarter * 3 + 3, 0);
    }

    const company = await prisma.company.findUnique({
      where: { id: companyId! },
      select: {
        companyName: true,
        legalBusinessName: true,
        fein: true,
      },
    });

    const records = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payDate: { gte: dateStart, lte: dateEnd },
        ...(employeeId ? { employeeId } : {}),
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            employeeNumber: true,
            position: true,
            department: true,
            payType: true,
          },
        },
      },
      orderBy: [
        { employee: { lastName: 'asc' } },
        { payDate: 'asc' },
      ],
    });

    // Group by employee
    const employeeMap: Record<string, {
      employee: { id: string; firstName: string; lastName: string; employeeNumber: string | null; position: string | null; department: string | null; payType: string };
      periodsWorked: number;
      totalRegularHours: number;
      totalOvertimeHours: number;
      totalRegularPay: number;
      totalOvertimePay: number;
      totalGrossPay: number;
      totalPreTaxDeductions: number;
      totalFederalTax: number;
      totalStateTax: number;
      totalLocalTax: number;
      totalSocialSecurity: number;
      totalMedicare: number;
      totalTaxWithholdings: number;
      totalPostTaxDeductions: number;
      totalDeductions: number;
      totalNetPay: number;
      ytdGrossPay: number;
      ytdNetPay: number;
    }> = {};

    for (const r of records) {
      const eid = r.employeeId;
      if (!employeeMap[eid]) {
        employeeMap[eid] = {
          employee: r.employee,
          periodsWorked: 0,
          totalRegularHours: 0,
          totalOvertimeHours: 0,
          totalRegularPay: 0,
          totalOvertimePay: 0,
          totalGrossPay: 0,
          totalPreTaxDeductions: 0,
          totalFederalTax: 0,
          totalStateTax: 0,
          totalLocalTax: 0,
          totalSocialSecurity: 0,
          totalMedicare: 0,
          totalTaxWithholdings: 0,
          totalPostTaxDeductions: 0,
          totalDeductions: 0,
          totalNetPay: 0,
          ytdGrossPay: 0,
          ytdNetPay: 0,
        };
      }
      const e = employeeMap[eid];
      e.periodsWorked += 1;
      e.totalRegularHours += r.regularHours;
      e.totalOvertimeHours += r.overtimeHours || 0;
      e.totalRegularPay += r.regularPay;
      e.totalOvertimePay += r.overtimePay || 0;
      e.totalGrossPay += r.grossPay;
      e.totalPreTaxDeductions += r.totalPreTaxDeductions || 0;
      e.totalFederalTax += r.federalTax;
      e.totalStateTax += r.stateTax;
      e.totalLocalTax += r.localTax || 0;
      e.totalSocialSecurity += r.socialSecurity;
      e.totalMedicare += r.medicare;
      e.totalTaxWithholdings += r.totalTaxWithholdings || 0;
      e.totalPostTaxDeductions += r.totalPostTaxDeductions || 0;
      e.totalDeductions += r.totalDeductions || 0;
      e.totalNetPay += r.netPay;
      // Keep the most recent YTD values
      e.ytdGrossPay = r.ytdGrossPay || 0;
      e.ytdNetPay = r.ytdNetPay || 0;
    }

    const employees = Object.values(employeeMap).sort((a, b) =>
      a.employee.lastName.localeCompare(b.employee.lastName)
    );

    const grandTotals = employees.reduce(
      (acc, e) => {
        acc.totalRegularHours += e.totalRegularHours;
        acc.totalOvertimeHours += e.totalOvertimeHours;
        acc.totalGrossPay += e.totalGrossPay;
        acc.totalPreTaxDeductions += e.totalPreTaxDeductions;
        acc.totalTaxWithholdings += e.totalTaxWithholdings;
        acc.totalPostTaxDeductions += e.totalPostTaxDeductions;
        acc.totalDeductions += e.totalDeductions;
        acc.totalNetPay += e.totalNetPay;
        return acc;
      },
      {
        totalRegularHours: 0, totalOvertimeHours: 0, totalGrossPay: 0,
        totalPreTaxDeductions: 0, totalTaxWithholdings: 0, totalPostTaxDeductions: 0,
        totalDeductions: 0, totalNetPay: 0,
      }
    );

    return NextResponse.json({
      company,
      dateRange: {
        start: dateStart.toISOString().split('T')[0],
        end: dateEnd.toISOString().split('T')[0],
        period: period || 'quarter',
      },
      employees,
      grandTotals,
      recordCount: records.length,
    });
  } catch (error) {
    console.error('Error fetching employee earnings:', error);
    return NextResponse.json({ error: 'Failed to fetch employee earnings' }, { status: 500 });
  }
}
