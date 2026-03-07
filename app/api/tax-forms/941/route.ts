import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import path from 'path';

function setFieldSafe(form: ReturnType<PDFDocument['getForm']>, fieldName: string, value: string) {
  try {
    const field = form.getTextField(fieldName);
    field.setText(value);
  } catch {
    // Field not found or not a text field - skip silently
  }
}

function checkFieldSafe(form: ReturnType<PDFDocument['getForm']>, fieldName: string, checked: boolean = true) {
  try {
    const field = form.getCheckBox(fieldName);
    if (checked) {
      field.check();
    } else {
      field.uncheck();
    }
  } catch {
    // Field not found or not a checkbox - skip silently
  }
}

// Format currency for form fields (no $ sign, 2 decimal places)
function formatCurrency(amount: number): string {
  return amount.toFixed(2);
}

// Format EIN with dash (XX-XXXXXXX)
function formatEIN(ein: string): string {
  const digits = ein.replace(/\D/g, '');
  if (digits.length >= 9) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
  }
  return ein;
}

// Get quarter date range
function getQuarterDateRange(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0); // Last day of quarter
  return { start, end };
}

// GET /api/tax-forms/941 - Generate Form 941 PDF
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('payroll');
    if (error) return error;

    const searchParams = request.nextUrl.searchParams;
    const yearParam = searchParams.get('year');
    const quarterParam = searchParams.get('quarter');
    const preview = searchParams.get('preview') === 'true';

    const year = yearParam ? parseInt(yearParam) : new Date().getFullYear();
    const quarter = quarterParam ? parseInt(quarterParam) : Math.floor(new Date().getMonth() / 3) + 1;

    if (quarter < 1 || quarter > 4) {
      return NextResponse.json({ error: 'Quarter must be between 1 and 4' }, { status: 400 });
    }

    const { start: dateStart, end: dateEnd } = getQuarterDateRange(year, quarter);

    // Get company info
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
        phone: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Get all payroll records for the quarter
    const records = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        payDate: {
          gte: dateStart,
          lte: dateEnd,
        },
      },
      include: {
        employee: {
          select: {
            id: true,
          },
        },
      },
    });

    // Calculate totals
    const totals = {
      // Count unique employees
      employeeCount: new Set(records.map(r => r.employee.id)).size,
      // Line 2: Total wages
      totalWages: 0,
      // Line 3: Federal income tax withheld
      federalTaxWithheld: 0,
      // Line 5a: Taxable Social Security wages (and employer match)
      socialSecurityWages: 0,
      socialSecurityTax: 0, // Employee + Employer portion
      // Line 5c: Taxable Medicare wages
      medicareWages: 0,
      medicareTax: 0, // Employee + Employer portion
      // Line 5d: Additional Medicare
      additionalMedicareWages: 0,
      additionalMedicareTax: 0,
      // Line 6: Total taxes before adjustments
      totalTaxesBeforeAdjustments: 0,
      // Line 10: Total taxes after adjustments
      totalTaxesAfterAdjustments: 0,
    };

    for (const record of records) {
      totals.totalWages += record.grossPay;
      totals.federalTaxWithheld += record.federalTax;

      // Social Security
      totals.socialSecurityWages += record.grossPay; // All gross pay is subject to SS up to wage base
      totals.socialSecurityTax += record.socialSecurity + (record.employerSocialSecurity || 0);

      // Medicare
      totals.medicareWages += record.grossPay;
      totals.medicareTax += record.medicare + (record.employerMedicare || 0);

      // Additional Medicare (wages over $200k)
      if (record.additionalMedicare && record.additionalMedicare > 0) {
        totals.additionalMedicareWages += record.grossPay; // Simplified - actual calculation is more complex
        totals.additionalMedicareTax += record.additionalMedicare;
      }
    }

    // Calculate Line 6 (total taxes before adjustments)
    totals.totalTaxesBeforeAdjustments =
      totals.federalTaxWithheld +
      totals.socialSecurityTax +
      totals.medicareTax +
      totals.additionalMedicareTax;

    // Line 10 (no adjustments in this implementation)
    totals.totalTaxesAfterAdjustments = totals.totalTaxesBeforeAdjustments;

    // If preview mode, return the data as JSON
    if (preview) {
      return NextResponse.json({
        company,
        quarter,
        year,
        dateRange: {
          start: dateStart.toISOString().split('T')[0],
          end: dateEnd.toISOString().split('T')[0],
        },
        totals: {
          employeeCount: totals.employeeCount,
          totalWages: Math.round(totals.totalWages * 100) / 100,
          federalTaxWithheld: Math.round(totals.federalTaxWithheld * 100) / 100,
          socialSecurityWages: Math.round(totals.socialSecurityWages * 100) / 100,
          socialSecurityTax: Math.round(totals.socialSecurityTax * 100) / 100,
          medicareWages: Math.round(totals.medicareWages * 100) / 100,
          medicareTax: Math.round(totals.medicareTax * 100) / 100,
          additionalMedicareWages: Math.round(totals.additionalMedicareWages * 100) / 100,
          additionalMedicareTax: Math.round(totals.additionalMedicareTax * 100) / 100,
          totalTaxesBeforeAdjustments: Math.round(totals.totalTaxesBeforeAdjustments * 100) / 100,
          totalTaxesAfterAdjustments: Math.round(totals.totalTaxesAfterAdjustments * 100) / 100,
        },
        recordCount: records.length,
      });
    }

    // Load PDF template
    const templatePath = path.join(process.cwd(), 'public/document-templates/federal/941.pdf');
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Fill company information
    if (company.fein) {
      setFieldSafe(form, 'topmostSubform[0].Page1[0].EntityArea[0].f1_1[0]', formatEIN(company.fein));
    }
    setFieldSafe(form, 'topmostSubform[0].Page1[0].EntityArea[0].f1_2[0]', company.legalBusinessName || company.companyName);
    setFieldSafe(form, 'topmostSubform[0].Page1[0].EntityArea[0].f1_3[0]', company.companyName);

    // Address
    const addressLine = company.address || '';
    const cityStateZip = [company.city, company.state, company.zipCode].filter(Boolean).join(', ');
    setFieldSafe(form, 'topmostSubform[0].Page1[0].EntityArea[0].f1_4[0]', addressLine);
    setFieldSafe(form, 'topmostSubform[0].Page1[0].EntityArea[0].f1_5[0]', cityStateZip);

    // Quarter checkbox (1, 2, 3, or 4)
    checkFieldSafe(form, `topmostSubform[0].Page1[0].EntityArea[0].c1_1[${quarter - 1}]`, true);

    // Part 1 - Line 1: Number of employees
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_6[0]', String(totals.employeeCount));

    // Line 2: Wages, tips, and other compensation
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_7[0]', formatCurrency(totals.totalWages));

    // Line 3: Federal income tax withheld
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_8[0]', formatCurrency(totals.federalTaxWithheld));

    // Line 5a column 1: Taxable social security wages
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_10[0]', formatCurrency(totals.socialSecurityWages));
    // Line 5a column 2: Tax (12.4% rate - column 1 × 0.124)
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_11[0]', formatCurrency(totals.socialSecurityTax));

    // Line 5c column 1: Taxable Medicare wages
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_14[0]', formatCurrency(totals.medicareWages));
    // Line 5c column 2: Tax (2.9% rate - column 1 × 0.029)
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_15[0]', formatCurrency(totals.medicareTax));

    // Line 5d column 1: Taxable wages for additional Medicare
    if (totals.additionalMedicareTax > 0) {
      setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_16[0]', formatCurrency(totals.additionalMedicareWages));
      // Line 5d column 2: Tax (0.9% rate - column 1 × 0.009)
      setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_17[0]', formatCurrency(totals.additionalMedicareTax));
    }

    // Line 5e: Total social security and Medicare taxes
    const line5eTotal = totals.socialSecurityTax + totals.medicareTax + totals.additionalMedicareTax;
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_18[0]', formatCurrency(line5eTotal));

    // Line 6: Total taxes before adjustments (line 3 + line 5e)
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_19[0]', formatCurrency(totals.totalTaxesBeforeAdjustments));

    // Line 10: Total taxes after adjustments (same as line 6 if no adjustments)
    setFieldSafe(form, 'topmostSubform[0].Page1[0].f1_23[0]', formatCurrency(totals.totalTaxesAfterAdjustments));

    // Serialize PDF
    const pdfBytes = await pdfDoc.save();

    const fileName = `Form_941_${year}_Q${quarter}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error generating Form 941:', error);
    return NextResponse.json(
      { error: 'Failed to generate Form 941' },
      { status: 500 }
    );
  }
}
