import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/reports/deductions - Deductions breakdown by type and employee
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
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
          select: { id: true, firstName: true, lastName: true, employeeNumber: true },
        },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });

    // Company-wide totals
    const preTaxDeductions = {
      preTax401k: 0, preTaxHealthIns: 0, preTaxDental: 0, preTaxVision: 0,
      preTaxHSA: 0, preTaxFSA: 0, preTaxOther: 0, total: 0,
    };
    const postTaxDeductions = {
      postTaxRoth401k: 0, garnishments: 0, childSupport: 0,
      loanRepayments: 0, postTaxOther: 0, total: 0,
    };

    // Per-employee breakdown
    const employeeMap: Record<string, {
      employee: { id: string; firstName: string; lastName: string; employeeNumber: string | null };
      preTax401k: number; preTaxHealthIns: number; preTaxDental: number; preTaxVision: number;
      preTaxHSA: number; preTaxFSA: number; preTaxOther: number; totalPreTax: number;
      postTaxRoth401k: number; garnishments: number; childSupport: number;
      loanRepayments: number; postTaxOther: number; totalPostTax: number;
      totalDeductions: number;
    }> = {};

    for (const r of records) {
      // Company totals
      preTaxDeductions.preTax401k += r.preTax401k || 0;
      preTaxDeductions.preTaxHealthIns += r.preTaxHealthIns || 0;
      preTaxDeductions.preTaxDental += r.preTaxDental || 0;
      preTaxDeductions.preTaxVision += r.preTaxVision || 0;
      preTaxDeductions.preTaxHSA += r.preTaxHSA || 0;
      preTaxDeductions.preTaxFSA += r.preTaxFSA || 0;
      preTaxDeductions.preTaxOther += r.preTaxOther || 0;
      postTaxDeductions.postTaxRoth401k += r.postTaxRoth401k || 0;
      postTaxDeductions.garnishments += r.garnishments || 0;
      postTaxDeductions.childSupport += r.childSupport || 0;
      postTaxDeductions.loanRepayments += r.loanRepayments || 0;
      postTaxDeductions.postTaxOther += r.postTaxOther || 0;

      // Per-employee
      const eid = r.employeeId;
      if (!employeeMap[eid]) {
        employeeMap[eid] = {
          employee: r.employee,
          preTax401k: 0, preTaxHealthIns: 0, preTaxDental: 0, preTaxVision: 0,
          preTaxHSA: 0, preTaxFSA: 0, preTaxOther: 0, totalPreTax: 0,
          postTaxRoth401k: 0, garnishments: 0, childSupport: 0,
          loanRepayments: 0, postTaxOther: 0, totalPostTax: 0,
          totalDeductions: 0,
        };
      }
      const e = employeeMap[eid];
      e.preTax401k += r.preTax401k || 0;
      e.preTaxHealthIns += r.preTaxHealthIns || 0;
      e.preTaxDental += r.preTaxDental || 0;
      e.preTaxVision += r.preTaxVision || 0;
      e.preTaxHSA += r.preTaxHSA || 0;
      e.preTaxFSA += r.preTaxFSA || 0;
      e.preTaxOther += r.preTaxOther || 0;
      e.postTaxRoth401k += r.postTaxRoth401k || 0;
      e.garnishments += r.garnishments || 0;
      e.childSupport += r.childSupport || 0;
      e.loanRepayments += r.loanRepayments || 0;
      e.postTaxOther += r.postTaxOther || 0;
    }

    // Compute totals
    preTaxDeductions.total = preTaxDeductions.preTax401k + preTaxDeductions.preTaxHealthIns +
      preTaxDeductions.preTaxDental + preTaxDeductions.preTaxVision +
      preTaxDeductions.preTaxHSA + preTaxDeductions.preTaxFSA + preTaxDeductions.preTaxOther;
    postTaxDeductions.total = postTaxDeductions.postTaxRoth401k + postTaxDeductions.garnishments +
      postTaxDeductions.childSupport + postTaxDeductions.loanRepayments + postTaxDeductions.postTaxOther;

    const byEmployee = Object.values(employeeMap).map(e => {
      e.totalPreTax = e.preTax401k + e.preTaxHealthIns + e.preTaxDental + e.preTaxVision +
        e.preTaxHSA + e.preTaxFSA + e.preTaxOther;
      e.totalPostTax = e.postTaxRoth401k + e.garnishments + e.childSupport +
        e.loanRepayments + e.postTaxOther;
      e.totalDeductions = e.totalPreTax + e.totalPostTax;
      return e;
    }).sort((a, b) => a.employee.lastName.localeCompare(b.employee.lastName));

    return NextResponse.json({
      company,
      dateRange: {
        start: dateStart.toISOString().split('T')[0],
        end: dateEnd.toISOString().split('T')[0],
        period: period || 'quarter',
      },
      preTaxDeductions,
      postTaxDeductions,
      grandTotal: preTaxDeductions.total + postTaxDeductions.total,
      byEmployee,
      recordCount: records.length,
    });
  } catch (error) {
    console.error('Error fetching deductions report:', error);
    return NextResponse.json({ error: 'Failed to fetch deductions report' }, { status: 500 });
  }
}
