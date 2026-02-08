import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/payroll/register - Get payroll register for a specific pay period
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    if (!startDate || !endDate) {
      return NextResponse.json(
        { error: 'startDate and endDate are required' },
        { status: 400 }
      );
    }

    // Get company info for the report header
    const company = await prisma.company.findUnique({
      where: { id: companyId! },
      select: {
        companyName: true,
        legalBusinessName: true,
        address: true,
        city: true,
        state: true,
        zipCode: true,
        fein: true,
      },
    });

    // Get all payroll records for the specified pay period
    const records = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payPeriodStart: {
          gte: new Date(startDate),
        },
        payPeriodEnd: {
          lte: new Date(endDate),
        },
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
            hourlyRate: true,
            annualSalary: true,
          },
        },
      },
      orderBy: [
        { employee: { lastName: 'asc' } },
        { employee: { firstName: 'asc' } },
      ],
    });

    if (records.length === 0) {
      return NextResponse.json({
        company,
        payPeriod: {
          start: startDate,
          end: endDate,
        },
        records: [],
        totals: null,
        message: 'No payroll records found for this pay period',
      });
    }

    // Calculate totals
    const totals = {
      employeeCount: records.length,
      regularHours: 0,
      overtimeHours: 0,
      regularPay: 0,
      overtimePay: 0,
      otherEarnings: 0,
      grossPay: 0,
      preTax401k: 0,
      preTaxHealthIns: 0,
      preTaxDental: 0,
      preTaxVision: 0,
      preTaxHSA: 0,
      preTaxFSA: 0,
      preTaxOther: 0,
      totalPreTaxDeductions: 0,
      federalTax: 0,
      stateTax: 0,
      localTax: 0,
      socialSecurity: 0,
      medicare: 0,
      additionalMedicare: 0,
      nySDI: 0,
      nyPFL: 0,
      totalTaxWithholdings: 0,
      postTaxRoth401k: 0,
      garnishments: 0,
      childSupport: 0,
      loanRepayments: 0,
      postTaxOther: 0,
      totalPostTaxDeductions: 0,
      totalDeductions: 0,
      netPay: 0,
      employerSocialSecurity: 0,
      employerMedicare: 0,
      employerSUI: 0,
      employerFUTA: 0,
      totalEmployerCost: 0,
    };

    for (const record of records) {
      totals.regularHours += record.regularHours;
      totals.overtimeHours += record.overtimeHours || 0;
      totals.regularPay += record.regularPay;
      totals.overtimePay += record.overtimePay || 0;
      totals.otherEarnings += record.otherEarnings || 0;
      totals.grossPay += record.grossPay;
      totals.preTax401k += record.preTax401k || 0;
      totals.preTaxHealthIns += record.preTaxHealthIns || 0;
      totals.preTaxDental += record.preTaxDental || 0;
      totals.preTaxVision += record.preTaxVision || 0;
      totals.preTaxHSA += record.preTaxHSA || 0;
      totals.preTaxFSA += record.preTaxFSA || 0;
      totals.preTaxOther += record.preTaxOther || 0;
      totals.totalPreTaxDeductions += record.totalPreTaxDeductions || 0;
      totals.federalTax += record.federalTax;
      totals.stateTax += record.stateTax;
      totals.localTax += record.localTax || 0;
      totals.socialSecurity += record.socialSecurity;
      totals.medicare += record.medicare;
      totals.additionalMedicare += record.additionalMedicare || 0;
      totals.nySDI += record.nySDI || 0;
      totals.nyPFL += record.nyPFL || 0;
      totals.totalTaxWithholdings += record.totalTaxWithholdings || 0;
      totals.postTaxRoth401k += record.postTaxRoth401k || 0;
      totals.garnishments += record.garnishments || 0;
      totals.childSupport += record.childSupport || 0;
      totals.loanRepayments += record.loanRepayments || 0;
      totals.postTaxOther += record.postTaxOther || 0;
      totals.totalPostTaxDeductions += record.totalPostTaxDeductions || 0;
      totals.totalDeductions += record.totalDeductions;
      totals.netPay += record.netPay;
      totals.employerSocialSecurity += record.employerSocialSecurity || 0;
      totals.employerMedicare += record.employerMedicare || 0;
      totals.employerSUI += record.employerSUI || 0;
      totals.employerFUTA += record.employerFUTA || 0;
      totals.totalEmployerCost += record.totalEmployerCost || 0;
    }

    // Round all totals to 2 decimal places
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      if (typeof totals[key] === 'number' && key !== 'employeeCount') {
        (totals as Record<string, number>)[key] = Math.round(totals[key] * 100) / 100;
      }
    }

    // Get the actual pay date from records (should all be the same for a single pay period)
    const payDate = records[0]?.payDate;

    return NextResponse.json({
      company,
      payPeriod: {
        start: startDate,
        end: endDate,
        payDate,
      },
      records: records.map((r) => ({
        id: r.id,
        employee: r.employee,
        regularHours: r.regularHours,
        overtimeHours: r.overtimeHours,
        regularPay: r.regularPay,
        overtimePay: r.overtimePay,
        otherEarnings: r.otherEarnings,
        grossPay: r.grossPay,
        preTax401k: r.preTax401k,
        preTaxHealthIns: r.preTaxHealthIns,
        preTaxDental: r.preTaxDental,
        preTaxVision: r.preTaxVision,
        preTaxHSA: r.preTaxHSA,
        preTaxFSA: r.preTaxFSA,
        totalPreTaxDeductions: r.totalPreTaxDeductions,
        federalTax: r.federalTax,
        stateTax: r.stateTax,
        localTax: r.localTax,
        socialSecurity: r.socialSecurity,
        medicare: r.medicare,
        additionalMedicare: r.additionalMedicare,
        nySDI: r.nySDI,
        nyPFL: r.nyPFL,
        totalTaxWithholdings: r.totalTaxWithholdings,
        postTaxRoth401k: r.postTaxRoth401k,
        garnishments: r.garnishments,
        childSupport: r.childSupport,
        loanRepayments: r.loanRepayments,
        totalPostTaxDeductions: r.totalPostTaxDeductions,
        totalDeductions: r.totalDeductions,
        netPay: r.netPay,
        employerSocialSecurity: r.employerSocialSecurity,
        employerMedicare: r.employerMedicare,
        employerSUI: r.employerSUI,
        employerFUTA: r.employerFUTA,
        totalEmployerCost: r.totalEmployerCost,
        isPaid: r.isPaid,
        paymentMethod: r.paymentMethod,
        checkNumber: r.checkNumber,
      })),
      totals,
    });
  } catch (error) {
    console.error('Error fetching payroll register:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payroll register' },
      { status: 500 }
    );
  }
}
