import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';

// GET /api/payroll/[id] - Get a specific payroll record (pay stub data)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    const { id } = await params;

    const payrollRecord = await prisma.payrollRecord.findFirst({
      where: {
        id,
        companyId: companyId!,
      },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            middleName: true,
            employeeNumber: true,
            position: true,
            department: true,
            address: true,
            city: true,
            state: true,
            zipCode: true,
            payType: true,
            hourlyRate: true,
            annualSalary: true,
            hireDate: true,
            taxIdEncrypted: true,
          },
        },
        company: {
          select: {
            companyName: true,
            legalBusinessName: true,
            address: true,
            city: true,
            state: true,
            zipCode: true,
            phone: true,
            fein: true,
          },
        },
      },
    });

    if (!payrollRecord) {
      return NextResponse.json(
        { error: 'Payroll record not found' },
        { status: 404 }
      );
    }

    // Get previous payroll records for accurate YTD calculation
    const previousRecords = await prisma.payrollRecord.findMany({
      where: {
        employeeId: payrollRecord.employeeId,
        companyId: companyId!,
        payPeriodEnd: {
          lt: payrollRecord.payPeriodEnd,
        },
        payDate: {
          gte: new Date(new Date(payrollRecord.payDate).getFullYear(), 0, 1), // Start of year
        },
      },
      select: {
        grossPay: true,
        netPay: true,
        federalTax: true,
        stateTax: true,
        localTax: true,
        socialSecurity: true,
        medicare: true,
        additionalMedicare: true,
        nySDI: true,
        nyPFL: true,
        totalPreTaxDeductions: true,
        preTax401k: true,
        preTaxHealthIns: true,
        preTaxDental: true,
        preTaxVision: true,
        preTaxHSA: true,
        preTaxFSA: true,
        preTaxOther: true,
        postTaxRoth401k: true,
        garnishments: true,
        childSupport: true,
        loanRepayments: true,
        postTaxOther: true,
        regularHours: true,
        overtimeHours: true,
      },
    });

    // Calculate YTD totals (previous + current)
    const ytdTotals = {
      grossPay: previousRecords.reduce((sum, r) => sum + r.grossPay, 0) + payrollRecord.grossPay,
      netPay: previousRecords.reduce((sum, r) => sum + r.netPay, 0) + payrollRecord.netPay,
      federalTax: previousRecords.reduce((sum, r) => sum + r.federalTax, 0) + payrollRecord.federalTax,
      stateTax: previousRecords.reduce((sum, r) => sum + r.stateTax, 0) + payrollRecord.stateTax,
      localTax: previousRecords.reduce((sum, r) => sum + (r.localTax || 0), 0) + (payrollRecord.localTax || 0),
      socialSecurity: previousRecords.reduce((sum, r) => sum + r.socialSecurity, 0) + payrollRecord.socialSecurity,
      medicare: previousRecords.reduce((sum, r) => sum + r.medicare, 0) + payrollRecord.medicare,
      additionalMedicare: previousRecords.reduce((sum, r) => sum + (r.additionalMedicare || 0), 0) + (payrollRecord.additionalMedicare || 0),
      nySDI: previousRecords.reduce((sum, r) => sum + (r.nySDI || 0), 0) + (payrollRecord.nySDI || 0),
      nyPFL: previousRecords.reduce((sum, r) => sum + (r.nyPFL || 0), 0) + (payrollRecord.nyPFL || 0),
      preTax401k: previousRecords.reduce((sum, r) => sum + (r.preTax401k || 0), 0) + (payrollRecord.preTax401k || 0),
      preTaxHealthIns: previousRecords.reduce((sum, r) => sum + (r.preTaxHealthIns || 0), 0) + (payrollRecord.preTaxHealthIns || 0),
      preTaxDental: previousRecords.reduce((sum, r) => sum + (r.preTaxDental || 0), 0) + (payrollRecord.preTaxDental || 0),
      preTaxVision: previousRecords.reduce((sum, r) => sum + (r.preTaxVision || 0), 0) + (payrollRecord.preTaxVision || 0),
      preTaxHSA: previousRecords.reduce((sum, r) => sum + (r.preTaxHSA || 0), 0) + (payrollRecord.preTaxHSA || 0),
      preTaxFSA: previousRecords.reduce((sum, r) => sum + (r.preTaxFSA || 0), 0) + (payrollRecord.preTaxFSA || 0),
      postTaxRoth401k: previousRecords.reduce((sum, r) => sum + (r.postTaxRoth401k || 0), 0) + (payrollRecord.postTaxRoth401k || 0),
      garnishments: previousRecords.reduce((sum, r) => sum + (r.garnishments || 0), 0) + (payrollRecord.garnishments || 0),
      regularHours: previousRecords.reduce((sum, r) => sum + r.regularHours, 0) + payrollRecord.regularHours,
      overtimeHours: previousRecords.reduce((sum, r) => sum + (r.overtimeHours || 0), 0) + (payrollRecord.overtimeHours || 0),
    };

    // Mask SSN for display (show last 4 only)
    let ssnLast4 = null;
    if (payrollRecord.employee.taxIdEncrypted) {
      // Note: In production, you'd decrypt this properly
      // For now, we'll just indicate it exists
      ssnLast4 = '****';
    }

    return NextResponse.json({
      ...payrollRecord,
      employee: {
        ...payrollRecord.employee,
        ssnLast4,
        taxIdEncrypted: undefined, // Don't send encrypted data to client
      },
      ytdTotals,
    });
  } catch (error) {
    console.error('Error fetching payroll record:', error);
    return NextResponse.json(
      { error: 'Failed to fetch payroll record' },
      { status: 500 }
    );
  }
}
