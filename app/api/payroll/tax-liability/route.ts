import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { getForm941DueDate, getNYS45DueDate, getNextDepositDate } from '@/lib/taxDeadlines';
import { startOfDay, endOfDay, formatDate } from '@/lib/date-utils';

// GET /api/payroll/tax-liability - Get tax liability summary for a date range
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const period = searchParams.get('period'); // 'quarter', 'month', 'year', 'custom'

    // Calculate date range based on period if not explicitly provided
    // Use timezone-safe date handling
    let dateStart: Date;
    let dateEnd: Date;
    const now = new Date();

    if (startDate && endDate) {
      dateStart = startOfDay(startDate);
      dateEnd = endOfDay(endDate);
    } else if (period === 'quarter') {
      // Current quarter
      const quarter = Math.floor(now.getMonth() / 3);
      const startMonth = String(quarter * 3 + 1).padStart(2, '0');
      const endMonth = String(quarter * 3 + 3).padStart(2, '0');
      const lastDay = new Date(now.getFullYear(), quarter * 3 + 3, 0).getDate();
      dateStart = startOfDay(`${now.getFullYear()}-${startMonth}-01`);
      dateEnd = endOfDay(`${now.getFullYear()}-${endMonth}-${lastDay}`);
    } else if (period === 'month') {
      // Current month
      const month = String(now.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      dateStart = startOfDay(`${now.getFullYear()}-${month}-01`);
      dateEnd = endOfDay(`${now.getFullYear()}-${month}-${lastDay}`);
    } else if (period === 'year') {
      // Current year
      dateStart = startOfDay(`${now.getFullYear()}-01-01`);
      dateEnd = endOfDay(`${now.getFullYear()}-12-31`);
    } else {
      // Default to current quarter
      const quarter = Math.floor(now.getMonth() / 3);
      const startMonth = String(quarter * 3 + 1).padStart(2, '0');
      const endMonth = String(quarter * 3 + 3).padStart(2, '0');
      const lastDay = new Date(now.getFullYear(), quarter * 3 + 3, 0).getDate();
      dateStart = startOfDay(`${now.getFullYear()}-${startMonth}-01`);
      dateEnd = endOfDay(`${now.getFullYear()}-${endMonth}-${lastDay}`);
    }

    // Get company info
    const company = await prisma.company.findUnique({
      where: { id: companyId! },
      select: {
        companyName: true,
        legalBusinessName: true,
        fein: true,
        stateUIClientId: true,
        stateTaxId: true,
      },
    });

    // Get all payroll records for the date range
    const records = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payDate: {
          gte: dateStart,
          lte: dateEnd,
        },
      },
      orderBy: {
        payDate: 'asc',
      },
      select: {
        id: true,
        payDate: true,
        payPeriodStart: true,
        payPeriodEnd: true,
        grossPay: true,
        federalTax: true,
        stateTax: true,
        localTax: true,
        socialSecurity: true,
        medicare: true,
        additionalMedicare: true,
        nySDI: true,
        nyPFL: true,
        employerSocialSecurity: true,
        employerMedicare: true,
        employerSUI: true,
        employerFUTA: true,
      },
    });

    // Calculate totals
    const totals = {
      grossWages: 0,
      // Employee withholdings
      federalTax: 0,
      stateTax: 0,
      localTax: 0,
      socialSecurityEmployee: 0,
      medicareEmployee: 0,
      additionalMedicare: 0,
      nySDI: 0,
      nyPFL: 0,
      totalEmployeeWithholdings: 0,
      // Employer taxes
      socialSecurityEmployer: 0,
      medicareEmployer: 0,
      employerSUI: 0,
      employerFUTA: 0,
      totalEmployerTaxes: 0,
      // Combined totals
      totalFICA: 0, // Employee + Employer SS + Medicare
      total941Liability: 0, // Federal income tax + FICA (for Form 941)
      totalStateLiability: 0, // State income tax + SDI + PFL + SUI
    };

    // Group by pay date for detailed breakdown
    const byPayDate: Record<string, {
      payDate: string;
      payPeriodStart: string;
      payPeriodEnd: string;
      grossWages: number;
      federalTax: number;
      stateTax: number;
      localTax: number;
      socialSecurityEmployee: number;
      medicareEmployee: number;
      additionalMedicare: number;
      nySDI: number;
      nyPFL: number;
      socialSecurityEmployer: number;
      medicareEmployer: number;
      employerSUI: number;
      employerFUTA: number;
    }> = {};

    for (const record of records) {
      // Use formatDate for consistent date string extraction
      const payDateKey = formatDate(record.payDate);

      if (!byPayDate[payDateKey]) {
        byPayDate[payDateKey] = {
          payDate: payDateKey,
          payPeriodStart: formatDate(record.payPeriodStart),
          payPeriodEnd: formatDate(record.payPeriodEnd),
          grossWages: 0,
          federalTax: 0,
          stateTax: 0,
          localTax: 0,
          socialSecurityEmployee: 0,
          medicareEmployee: 0,
          additionalMedicare: 0,
          nySDI: 0,
          nyPFL: 0,
          socialSecurityEmployer: 0,
          medicareEmployer: 0,
          employerSUI: 0,
          employerFUTA: 0,
        };
      }

      const pd = byPayDate[payDateKey];
      pd.grossWages += record.grossPay;
      pd.federalTax += record.federalTax;
      pd.stateTax += record.stateTax;
      pd.localTax += record.localTax || 0;
      pd.socialSecurityEmployee += record.socialSecurity;
      pd.medicareEmployee += record.medicare;
      pd.additionalMedicare += record.additionalMedicare || 0;
      pd.nySDI += record.nySDI || 0;
      pd.nyPFL += record.nyPFL || 0;
      pd.socialSecurityEmployer += record.employerSocialSecurity || 0;
      pd.medicareEmployer += record.employerMedicare || 0;
      pd.employerSUI += record.employerSUI || 0;
      pd.employerFUTA += record.employerFUTA || 0;

      // Add to totals
      totals.grossWages += record.grossPay;
      totals.federalTax += record.federalTax;
      totals.stateTax += record.stateTax;
      totals.localTax += record.localTax || 0;
      totals.socialSecurityEmployee += record.socialSecurity;
      totals.medicareEmployee += record.medicare;
      totals.additionalMedicare += record.additionalMedicare || 0;
      totals.nySDI += record.nySDI || 0;
      totals.nyPFL += record.nyPFL || 0;
      totals.socialSecurityEmployer += record.employerSocialSecurity || 0;
      totals.medicareEmployer += record.employerMedicare || 0;
      totals.employerSUI += record.employerSUI || 0;
      totals.employerFUTA += record.employerFUTA || 0;
    }

    // Calculate summary totals
    totals.totalEmployeeWithholdings =
      totals.federalTax +
      totals.stateTax +
      totals.localTax +
      totals.socialSecurityEmployee +
      totals.medicareEmployee +
      totals.additionalMedicare +
      totals.nySDI +
      totals.nyPFL;

    totals.totalEmployerTaxes =
      totals.socialSecurityEmployer +
      totals.medicareEmployer +
      totals.employerSUI +
      totals.employerFUTA;

    // Total FICA (Social Security + Medicare, both employee and employer)
    totals.totalFICA =
      totals.socialSecurityEmployee +
      totals.medicareEmployee +
      totals.additionalMedicare +
      totals.socialSecurityEmployer +
      totals.medicareEmployer;

    // Form 941 Liability (Federal income tax + all FICA)
    totals.total941Liability = totals.federalTax + totals.totalFICA;

    // NYS Liability (State tax + SDI + PFL + SUI)
    totals.totalStateLiability =
      totals.stateTax +
      totals.localTax +
      totals.nySDI +
      totals.nyPFL +
      totals.employerSUI;

    // Round all totals
    for (const key of Object.keys(totals) as (keyof typeof totals)[]) {
      totals[key] = Math.round(totals[key] * 100) / 100;
    }

    // Determine deposit schedule info
    // Semi-weekly depositors: deposit by Wed (for Sat-Tue payrolls) or Fri (for Wed-Fri payrolls)
    // Monthly depositors: deposit by 15th of following month
    const depositInfo = {
      schedule: totals.total941Liability > 50000 ? 'Semi-Weekly' : 'Monthly',
      nextDepositDue: getNextDepositDate(totals.total941Liability > 50000),
      form941DueDate: getForm941DueDate(dateEnd),
      nys45DueDate: getNYS45DueDate(dateEnd),
    };

    return NextResponse.json({
      company,
      dateRange: {
        start: formatDate(dateStart),
        end: formatDate(dateEnd),
        period: period || 'quarter',
      },
      totals,
      byPayDate: Object.values(byPayDate).sort((a, b) => a.payDate.localeCompare(b.payDate)),
      depositInfo,
      recordCount: records.length,
    });
  } catch (error) {
    console.error('Error fetching tax liability:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tax liability data' },
      { status: 500 }
    );
  }
}
