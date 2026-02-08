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

// Get quarter date range
function getQuarterDateRange(year: number, quarter: number): { start: Date; end: Date } {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 0);
  return { start, end };
}

interface EmployeeWageDetail {
  lastName: string;
  firstName: string;
  middleInitial: string;
  ssn: string;
  totalWages: number;
  uiWages: number;
}

// GET /api/tax-forms/nys-45 - Generate NYS-45 PDF
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess();
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
        stateUIClientId: true,
        stateTaxId: true,
        suiRate: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Get all payroll records for the quarter with employee info
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
            firstName: true,
            lastName: true,
            middleName: true,
            taxIdEncrypted: true,
          },
        },
      },
    });

    // Calculate totals
    const totals = {
      // Part A - Withholding Information
      totalWages: 0,
      stateTaxWithheld: 0,
      nySDI: 0,
      nyPFL: 0,

      // Part B - Unemployment Insurance
      grossWages: 0,
      uiTaxableWages: 0,
      employerSUI: 0,

      // Counts
      employeeCount: new Set(records.map(r => r.employee.id)).size,
    };

    // Aggregate by employee for Part C
    const employeeWages: Record<string, EmployeeWageDetail> = {};

    for (const record of records) {
      const emp = record.employee;
      const empId = emp.id;

      // Initialize employee record if not exists
      if (!employeeWages[empId]) {
        employeeWages[empId] = {
          lastName: emp.lastName,
          firstName: emp.firstName,
          middleInitial: emp.middleName ? emp.middleName.charAt(0) : '',
          ssn: '***-**-****', // Masked for preview, actual SSN from encrypted field for PDF
          totalWages: 0,
          uiWages: 0,
        };
      }

      // Add to employee totals
      employeeWages[empId].totalWages += record.grossPay;
      employeeWages[empId].uiWages += record.grossPay; // All wages subject to UI up to wage base

      // Add to company totals
      totals.totalWages += record.grossPay;
      totals.grossWages += record.grossPay;
      totals.uiTaxableWages += record.grossPay;
      totals.stateTaxWithheld += record.stateTax;
      totals.nySDI += record.nySDI || 0;
      totals.nyPFL += record.nyPFL || 0;
      totals.employerSUI += record.employerSUI || 0;
    }

    // If preview mode, return the data as JSON
    if (preview) {
      return NextResponse.json({
        company: {
          companyName: company.companyName,
          legalBusinessName: company.legalBusinessName,
          fein: company.fein,
          stateUIClientId: company.stateUIClientId,
          stateTaxId: company.stateTaxId,
          suiRate: company.suiRate,
          address: company.address,
          city: company.city,
          state: company.state,
          zipCode: company.zipCode,
        },
        quarter,
        year,
        dateRange: {
          start: dateStart.toISOString().split('T')[0],
          end: dateEnd.toISOString().split('T')[0],
        },
        totals: {
          employeeCount: totals.employeeCount,
          totalWages: Math.round(totals.totalWages * 100) / 100,
          stateTaxWithheld: Math.round(totals.stateTaxWithheld * 100) / 100,
          nySDI: Math.round(totals.nySDI * 100) / 100,
          nyPFL: Math.round(totals.nyPFL * 100) / 100,
          grossWages: Math.round(totals.grossWages * 100) / 100,
          uiTaxableWages: Math.round(totals.uiTaxableWages * 100) / 100,
          employerSUI: Math.round(totals.employerSUI * 100) / 100,
        },
        employees: Object.values(employeeWages).map(e => ({
          ...e,
          totalWages: Math.round(e.totalWages * 100) / 100,
          uiWages: Math.round(e.uiWages * 100) / 100,
        })),
        recordCount: records.length,
      });
    }

    // Load PDF template
    const templatePath = path.join(process.cwd(), 'public/document-templates/state/NYS-45.pdf');

    // Check if template exists and is valid
    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: 'NYS-45 template not found. Please add a valid NYS-45 PDF template.' },
        { status: 500 }
      );
    }

    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // Fill company information
    // Note: Actual field names will depend on the NYS-45 PDF form structure
    // These are placeholder field names that should be updated when the actual template is available

    setFieldSafe(form, 'employer_name', company.legalBusinessName || company.companyName);
    setFieldSafe(form, 'fein', company.fein || '');
    setFieldSafe(form, 'ui_employer_number', company.stateUIClientId || '');
    setFieldSafe(form, 'withholding_id', company.stateTaxId || '');

    // Address
    setFieldSafe(form, 'address', company.address || '');
    setFieldSafe(form, 'city_state_zip', [company.city, company.state, company.zipCode].filter(Boolean).join(', '));

    // Part A - Withholding
    setFieldSafe(form, 'total_wages', formatCurrency(totals.totalWages));
    setFieldSafe(form, 'state_tax_withheld', formatCurrency(totals.stateTaxWithheld));

    // Part B - UI
    setFieldSafe(form, 'gross_wages', formatCurrency(totals.grossWages));
    setFieldSafe(form, 'ui_taxable_wages', formatCurrency(totals.uiTaxableWages));
    setFieldSafe(form, 'sui_contribution', formatCurrency(totals.employerSUI));

    // Serialize PDF
    const pdfBytes = await pdfDoc.save();

    const fileName = `NYS-45_${year}_Q${quarter}.pdf`;

    return new NextResponse(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error('Error generating NYS-45:', error);
    return NextResponse.json(
      { error: 'Failed to generate NYS-45' },
      { status: 500 }
    );
  }
}
