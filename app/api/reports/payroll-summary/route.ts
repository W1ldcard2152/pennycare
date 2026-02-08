import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/reports/payroll-summary - Aggregate payroll data by pay period
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const period = searchParams.get('period');

    // Calculate date range
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
      // Default to current quarter
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
        address: true,
        city: true,
        state: true,
        zipCode: true,
      },
    });

    const records = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payDate: { gte: dateStart, lte: dateEnd },
      },
      select: {
        payPeriodStart: true,
        payPeriodEnd: true,
        payDate: true,
        grossPay: true,
        regularHours: true,
        overtimeHours: true,
        totalPreTaxDeductions: true,
        totalTaxWithholdings: true,
        totalPostTaxDeductions: true,
        totalDeductions: true,
        netPay: true,
        totalEmployerCost: true,
      },
      orderBy: { payDate: 'asc' },
    });

    // Group by pay period
    const periodMap: Record<string, {
      payPeriodStart: string;
      payPeriodEnd: string;
      payDate: string;
      employeeCount: number;
      totalHours: number;
      overtimeHours: number;
      grossPay: number;
      totalPreTaxDeductions: number;
      totalTaxWithholdings: number;
      totalPostTaxDeductions: number;
      totalDeductions: number;
      netPay: number;
      totalEmployerCost: number;
    }> = {};

    for (const r of records) {
      const key = r.payPeriodStart.toISOString().split('T')[0];
      if (!periodMap[key]) {
        periodMap[key] = {
          payPeriodStart: key,
          payPeriodEnd: r.payPeriodEnd.toISOString().split('T')[0],
          payDate: r.payDate.toISOString().split('T')[0],
          employeeCount: 0,
          totalHours: 0,
          overtimeHours: 0,
          grossPay: 0,
          totalPreTaxDeductions: 0,
          totalTaxWithholdings: 0,
          totalPostTaxDeductions: 0,
          totalDeductions: 0,
          netPay: 0,
          totalEmployerCost: 0,
        };
      }
      const p = periodMap[key];
      p.employeeCount += 1;
      p.totalHours += r.regularHours + (r.overtimeHours || 0);
      p.overtimeHours += r.overtimeHours || 0;
      p.grossPay += r.grossPay;
      p.totalPreTaxDeductions += r.totalPreTaxDeductions || 0;
      p.totalTaxWithholdings += r.totalTaxWithholdings || 0;
      p.totalPostTaxDeductions += r.totalPostTaxDeductions || 0;
      p.totalDeductions += r.totalDeductions || 0;
      p.netPay += r.netPay;
      p.totalEmployerCost += r.totalEmployerCost || 0;
    }

    const periods = Object.values(periodMap).sort((a, b) => a.payPeriodStart.localeCompare(b.payPeriodStart));

    // Grand totals
    const grandTotals = periods.reduce(
      (acc, p) => {
        acc.employeeCount += p.employeeCount;
        acc.totalHours += p.totalHours;
        acc.overtimeHours += p.overtimeHours;
        acc.grossPay += p.grossPay;
        acc.totalPreTaxDeductions += p.totalPreTaxDeductions;
        acc.totalTaxWithholdings += p.totalTaxWithholdings;
        acc.totalPostTaxDeductions += p.totalPostTaxDeductions;
        acc.totalDeductions += p.totalDeductions;
        acc.netPay += p.netPay;
        acc.totalEmployerCost += p.totalEmployerCost;
        return acc;
      },
      {
        employeeCount: 0, totalHours: 0, overtimeHours: 0, grossPay: 0,
        totalPreTaxDeductions: 0, totalTaxWithholdings: 0, totalPostTaxDeductions: 0,
        totalDeductions: 0, netPay: 0, totalEmployerCost: 0,
      }
    );

    return NextResponse.json({
      company,
      dateRange: {
        start: dateStart.toISOString().split('T')[0],
        end: dateEnd.toISOString().split('T')[0],
        period: period || 'quarter',
      },
      periods,
      grandTotals,
      recordCount: records.length,
    });
  } catch (error) {
    console.error('Error fetching payroll summary:', error);
    return NextResponse.json({ error: 'Failed to fetch payroll summary' }, { status: 500 });
  }
}
