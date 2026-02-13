import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// GET /api/analytics - All analytics data for a year
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const year = parseInt(searchParams.get('year') || '') || new Date().getFullYear();

    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year, 11, 31);

    const records = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payDate: { gte: yearStart, lte: yearEnd },
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { payDate: 'asc' },
    });

    // Active employees count
    const activeEmployees = await prisma.employee.count({
      where: { companyId: companyId!, isActive: true },
    });

    // Single pass aggregation
    const monthlyData: Record<number, {
      grossPay: number; netPay: number; employerCost: number; totalDeductions: number;
      overtimeHours: number; overtimePay: number;
    }> = {};

    let totalGross = 0, totalNet = 0, totalEmployerCost = 0;
    let totalHours = 0, totalOvertimeHours = 0;
    let totalFederal = 0, totalState = 0, totalLocal = 0, totalFICA = 0, totalSDI = 0, totalPFL = 0;
    let totalRegularPay = 0, totalOvertimePay = 0, totalOtherEarnings = 0;
    let totalRetirement = 0, totalHealth = 0, totalHsaFsa = 0;
    let totalGarnishments = 0, totalLoans = 0, totalOtherDed = 0;
    const payPeriodKeys = new Set<string>();

    for (const r of records) {
      const month = r.payDate.getMonth();
      payPeriodKeys.add(r.payPeriodStart.toISOString().split('T')[0]);

      if (!monthlyData[month]) {
        monthlyData[month] = { grossPay: 0, netPay: 0, employerCost: 0, totalDeductions: 0, overtimeHours: 0, overtimePay: 0 };
      }
      const m = monthlyData[month];
      m.grossPay += r.grossPay;
      m.netPay += r.netPay;
      m.employerCost += r.totalEmployerCost || 0;
      m.totalDeductions += r.totalDeductions || 0;
      m.overtimeHours += r.overtimeHours || 0;
      m.overtimePay += r.overtimePay || 0;

      // KPIs
      totalGross += r.grossPay;
      totalNet += r.netPay;
      totalEmployerCost += r.totalEmployerCost || 0;
      totalHours += r.regularHours + (r.overtimeHours || 0);
      totalOvertimeHours += r.overtimeHours || 0;

      // Tax breakdown
      totalFederal += r.federalTax;
      totalState += r.stateTax;
      totalLocal += r.localTax || 0;
      totalFICA += r.socialSecurity + r.medicare + (r.additionalMedicare || 0);
      totalSDI += r.nySDI || 0;
      totalPFL += r.nyPFL || 0;

      // Compensation mix
      totalRegularPay += r.regularPay;
      totalOvertimePay += r.overtimePay || 0;
      totalOtherEarnings += r.otherEarnings || 0;

      // Deduction distribution
      totalRetirement += (r.preTax401k || 0) + (r.postTaxRoth401k || 0);
      totalHealth += (r.preTaxHealthIns || 0) + (r.preTaxDental || 0) + (r.preTaxVision || 0);
      totalHsaFsa += (r.preTaxHSA || 0) + (r.preTaxFSA || 0);
      totalGarnishments += (r.garnishments || 0) + (r.childSupport || 0);
      totalLoans += r.loanRepayments || 0;
      totalOtherDed += (r.preTaxOther || 0) + (r.postTaxOther || 0);
    }

    const totalPayPeriods = payPeriodKeys.size;

    // Build monthly trend arrays
    const payrollTrend = [];
    const overtimeTrend = [];
    for (let i = 0; i < 12; i++) {
      const m = monthlyData[i];
      payrollTrend.push({
        month: MONTH_NAMES[i],
        grossPay: Math.round((m?.grossPay || 0) * 100) / 100,
        netPay: Math.round((m?.netPay || 0) * 100) / 100,
        employerCost: Math.round((m?.employerCost || 0) * 100) / 100,
        totalDeductions: Math.round((m?.totalDeductions || 0) * 100) / 100,
      });
      overtimeTrend.push({
        month: MONTH_NAMES[i],
        hours: Math.round((m?.overtimeHours || 0) * 100) / 100,
        cost: Math.round((m?.overtimePay || 0) * 100) / 100,
      });
    }

    return NextResponse.json({
      year,
      kpis: {
        totalPayrollYTD: Math.round(totalGross * 100) / 100,
        totalNetPayYTD: Math.round(totalNet * 100) / 100,
        avgPayrollPerPeriod: totalPayPeriods > 0 ? Math.round((totalGross / totalPayPeriods) * 100) / 100 : 0,
        totalEmployerCostYTD: Math.round(totalEmployerCost * 100) / 100,
        avgEmployeeCost: activeEmployees > 0 ? Math.round((totalEmployerCost / activeEmployees) * 100) / 100 : 0,
        totalHours: Math.round(totalHours * 100) / 100,
        totalOvertimeHours: Math.round(totalOvertimeHours * 100) / 100,
        overtimePercentage: totalHours > 0 ? Math.round((totalOvertimeHours / totalHours) * 10000) / 100 : 0,
        totalPayPeriods,
        activeEmployees,
      },
      payrollTrend,
      taxBreakdown: {
        federal: Math.round(totalFederal * 100) / 100,
        state: Math.round(totalState * 100) / 100,
        local: Math.round(totalLocal * 100) / 100,
        fica: Math.round(totalFICA * 100) / 100,
        sdi: Math.round(totalSDI * 100) / 100,
        pfl: Math.round(totalPFL * 100) / 100,
      },
      compensationMix: {
        regularPay: Math.round(totalRegularPay * 100) / 100,
        overtimePay: Math.round(totalOvertimePay * 100) / 100,
        otherEarnings: Math.round(totalOtherEarnings * 100) / 100,
      },
      deductionDistribution: {
        retirement: Math.round(totalRetirement * 100) / 100,
        healthInsurance: Math.round(totalHealth * 100) / 100,
        hsaFsa: Math.round(totalHsaFsa * 100) / 100,
        garnishments: Math.round(totalGarnishments * 100) / 100,
        loanRepayments: Math.round(totalLoans * 100) / 100,
        other: Math.round(totalOtherDed * 100) / 100,
      },
      overtimeTrend,
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json({ error: 'Failed to fetch analytics data' }, { status: 500 });
  }
}
