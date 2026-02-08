import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/reports/employer-costs - Employer cost breakdown
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const period = searchParams.get('period');

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
      select: { companyName: true, legalBusinessName: true, fein: true },
    });

    const records = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payDate: { gte: dateStart, lte: dateEnd },
      },
      include: {
        employee: {
          select: { id: true, firstName: true, lastName: true, employeeNumber: true, position: true },
        },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    // Company-wide totals
    const costs = {
      employerSocialSecurity: 0,
      employerMedicare: 0,
      employerSUI: 0,
      employerFUTA: 0,
      employerWorkersComp: 0,
      totalEmployerCost: 0,
    };
    let grossPayroll = 0;

    // Per-employee
    const employeeMap: Record<string, {
      employee: { id: string; firstName: string; lastName: string; employeeNumber: string | null; position: string | null };
      grossPay: number;
      employerSocialSecurity: number;
      employerMedicare: number;
      employerSUI: number;
      employerFUTA: number;
      employerWorkersComp: number;
      totalEmployerCost: number;
    }> = {};

    // By pay date for trends
    const periodMap: Record<string, { payDate: string; grossPay: number; totalEmployerCost: number }> = {};

    for (const r of records) {
      grossPayroll += r.grossPay;
      costs.employerSocialSecurity += r.employerSocialSecurity || 0;
      costs.employerMedicare += r.employerMedicare || 0;
      costs.employerSUI += r.employerSUI || 0;
      costs.employerFUTA += r.employerFUTA || 0;
      costs.employerWorkersComp += r.employerWorkersComp || 0;
      costs.totalEmployerCost += r.totalEmployerCost || 0;

      const eid = r.employeeId;
      if (!employeeMap[eid]) {
        employeeMap[eid] = {
          employee: r.employee,
          grossPay: 0, employerSocialSecurity: 0, employerMedicare: 0,
          employerSUI: 0, employerFUTA: 0, employerWorkersComp: 0, totalEmployerCost: 0,
        };
      }
      const e = employeeMap[eid];
      e.grossPay += r.grossPay;
      e.employerSocialSecurity += r.employerSocialSecurity || 0;
      e.employerMedicare += r.employerMedicare || 0;
      e.employerSUI += r.employerSUI || 0;
      e.employerFUTA += r.employerFUTA || 0;
      e.employerWorkersComp += r.employerWorkersComp || 0;
      e.totalEmployerCost += r.totalEmployerCost || 0;

      const pdKey = r.payDate.toISOString().split('T')[0];
      if (!periodMap[pdKey]) {
        periodMap[pdKey] = { payDate: pdKey, grossPay: 0, totalEmployerCost: 0 };
      }
      periodMap[pdKey].grossPay += r.grossPay;
      periodMap[pdKey].totalEmployerCost += r.totalEmployerCost || 0;
    }

    const byEmployee = Object.values(employeeMap).sort((a, b) =>
      a.employee.lastName.localeCompare(b.employee.lastName)
    );
    const byPeriod = Object.values(periodMap).sort((a, b) => a.payDate.localeCompare(b.payDate));
    const burdenRate = grossPayroll > 0 ? (costs.totalEmployerCost / grossPayroll) * 100 : 0;

    return NextResponse.json({
      company,
      dateRange: {
        start: dateStart.toISOString().split('T')[0],
        end: dateEnd.toISOString().split('T')[0],
        period: period || 'quarter',
      },
      costs,
      grossPayroll,
      burdenRate: Math.round(burdenRate * 100) / 100,
      byEmployee,
      byPeriod,
      recordCount: records.length,
    });
  } catch (error) {
    console.error('Error fetching employer costs:', error);
    return NextResponse.json({ error: 'Failed to fetch employer costs' }, { status: 500 });
  }
}
