import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { PDFDocument } from 'pdf-lib';
import { formatDate } from '@/lib/date-utils';
import {
  buildForm941,
  quarterBounds,
  line1ReferenceDate,
  type Form941EmployeeInput,
  type Form941RecordInput,
} from '@/lib/form941';
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

/**
 * IRS money lines are two separate boxes: whole dollars and cents. Writing
 * "1234.56" into a single field puts the whole string in one box — which is how
 * the pre-1.3 implementation silently produced a wrong return.
 */
function setMoney(
  form: ReturnType<PDFDocument['getForm']>,
  dollarsField: string,
  centsField: string,
  amount: number
) {
  const negative = amount < 0;
  const cents = Math.round(Math.abs(amount) * 100);
  const dollars = Math.floor(cents / 100);
  setFieldSafe(form, dollarsField, `${negative ? '-' : ''}${dollars}`);
  setFieldSafe(form, centsField, String(cents % 100).padStart(2, '0'));
}

function quarterToString(q: number): string {
  return `Q${q}`;
}

// GET /api/tax-forms/941 - Generate Form 941 PDF
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('BOOKKEEPER');
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

    const { start: dateStart, end: dateEnd } = quarterBounds(year, quarter);
    const dateStartStr = formatDate(dateStart);
    const dateEndStr = formatDate(dateEnd);

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
        federalDepositSchedule: true,
      },
    });

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Pull every ACTIVE record from Jan 1 through the end of the quarter. The
    // Social Security cap and the additional-Medicare threshold are year-to-date,
    // so earlier quarters are needed even though they are not reported. Voided
    // and corrected records are excluded — they are not wages paid.
    const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
    const records = await prisma.payrollRecord.findMany({
      where: {
        companyId: companyId!,
        status: 'active',
        payDate: { gte: yearStart, lte: dateEnd },
      },
      include: {
        employee: {
          select: {
            id: true,
            socialSecurityTaxability: true,
            medicareTaxability: true,
            hireDate: true,
            terminationDate: true,
            ytdGrossPaySeed: true,
            ytdSeedAsOfDate: true,
          },
        },
      },
      orderBy: { payDate: 'asc' },
    });

    const employeeMap = new Map<string, Form941EmployeeInput>();
    for (const r of records) {
      if (employeeMap.has(r.employee.id)) continue;
      employeeMap.set(r.employee.id, {
        id: r.employee.id,
        socialSecurityTaxability: r.employee.socialSecurityTaxability,
        medicareTaxability: r.employee.medicareTaxability,
        hireDate: r.employee.hireDate,
        terminationDate: r.employee.terminationDate,
        ytdGrossPaySeed: r.employee.ytdGrossPaySeed,
        ytdSeedAsOfDate: r.employee.ytdSeedAsOfDate,
      });
    }

    const yearRecords: Form941RecordInput[] = records.map((r) => ({
      employeeId: r.employee.id,
      payDate: r.payDate,
      payPeriodStart: r.payPeriodStart,
      payPeriodEnd: r.payPeriodEnd,
      grossPay: r.grossPay,
      taxableWages: r.taxableWages,
      federalTax: r.federalTax,
      socialSecurity: r.socialSecurity,
      employerSocialSecurity: r.employerSocialSecurity,
      medicare: r.medicare,
      employerMedicare: r.employerMedicare,
      additionalMedicare: r.additionalMedicare,
    }));

    const quarterRecords = records.filter((r) => r.payDate >= dateStart && r.payDate <= dateEnd);
    const quarterRecordCount = quarterRecords.length;
    // Distinct employees paid in the quarter. This is NOT line 1 (which counts
    // only the pay period including the 12th of the third month) — it is the
    // summary tile figure.
    const employeesPaidInQuarter = new Set(quarterRecords.map((r) => r.employee.id)).size;

    // Line 13 â€” Total deposits made for this quarter against federal_941.
    // Sum the recorded deposits (excluding voided ones).
    const quarterStr = quarterToString(quarter);
    const depositRows = await prisma.taxDeposit.findMany({
      where: {
        companyId: companyId!,
        taxAuthority: 'federal_941',
        taxPeriodYear: year,
        taxPeriodQuarter: quarterStr,
        status: 'recorded',
      },
      orderBy: { depositDate: 'asc' },
      select: {
        id: true,
        depositDate: true,
        paymentMethod: true,
        confirmationNumber: true,
        federalIncomeTaxWithheld: true,
        socialSecurityTax: true,
        medicareTax: true,
        additionalMedicareTax: true,
      },
    });
    const totalDeposits = depositRows.reduce(
      (s, d) =>
        s +
        d.federalIncomeTaxWithheld +
        d.socialSecurityTax +
        d.medicareTax +
        d.additionalMedicareTax,
      0
    );

    // Only the two schedules the form recognises count; anything else (including
    // a legacy empty string) is treated as unset so line 16 is left blank rather
    // than guessed at.
    const depositSchedule =
      company.federalDepositSchedule === 'monthly' ||
      company.federalDepositSchedule === 'semiweekly'
        ? company.federalDepositSchedule
        : null;

    const form941 = buildForm941({
      year,
      quarter,
      employees: [...employeeMap.values()],
      yearRecords,
      totalDeposits,
      depositSchedule,
    });
    const { lines } = form941;

    // Filing status â€” has the user marked this quarter's 941 as filed?
    const filing = await prisma.taxFiling.findFirst({
      where: {
        companyId: companyId!,
        formType: '941',
        year,
        quarter,
      },
    });

    // If preview mode, return the data as JSON
    if (preview) {
      return NextResponse.json({
        company,
        quarter,
        year,
        dateRange: {
          start: dateStartStr,
          end: dateEndStr,
        },
        lines,
        socialSecurityWageBase: form941.socialSecurityWageBase,
        wageBaseIsExact: form941.wageBaseIsExact,
        warnings: form941.warnings,
        booked: form941.booked,
        line16: form941.line16,
        monthlyLiabilities: form941.monthlyLiabilities,
        monthlyTotal: form941.monthlyTotal,
        // Retained for callers still reading the old shape (dashboard tiles).
        totals: {
          employeeCount: lines.line1EmployeeCount,
          totalWages: lines.line2Wages,
          federalTaxWithheld: lines.line3FederalTaxWithheld,
          socialSecurityWages: lines.line5aSocialSecurityWages,
          socialSecurityTax: lines.line5aTax,
          medicareWages: lines.line5cMedicareWages,
          medicareTax: lines.line5cTax,
          additionalMedicareWages: lines.line5dAdditionalMedicareWages,
          additionalMedicareTax: lines.line5dTax,
          totalTaxesBeforeAdjustments: lines.line6TotalBeforeAdjustments,
          totalTaxesAfterAdjustments: lines.line10TotalAfterAdjustments,
          totalDeposits: lines.line13TotalDeposits,
          balanceDue: lines.line14BalanceDue,
          overpayment: lines.line15Overpayment,
        },
        deposits: depositRows.map((d) => ({
          id: d.id,
          depositDate: formatDate(d.depositDate),
          paymentMethod: d.paymentMethod,
          confirmationNumber: d.confirmationNumber,
          amount: Math.round(
            (d.federalIncomeTaxWithheld +
              d.socialSecurityTax +
              d.medicareTax +
              d.additionalMedicareTax) *
              100
          ) / 100,
        })),
        scheduleB: {
          dailyLiabilities: form941.dailyLiabilities,
          total: form941.monthlyTotal,
          // Schedule B and Part 2 line 16 must both equal line 12.
          matchesLine12: Math.abs(form941.monthlyTotal - lines.line12TotalAfterCredits) < 0.01,
        },
        filing: filing
          ? {
              id: filing.id,
              status: filing.status,
              filedDate: filing.filedDate ? formatDate(filing.filedDate) : null,
              confirmationNumber: filing.confirmationNumber,
              filingMethod: filing.filingMethod,
              totalLiability: filing.totalLiability,
              totalDeposits: filing.totalDeposits,
              balanceDue: filing.balanceDue,
            }
          : null,
        recordCount: quarterRecordCount,
        employeesPaidInQuarter,
        line1ReferenceDate: formatDate(line1ReferenceDate(year, quarter)),
      });
    }

    // Load PDF template
    const templatePath = path.join(process.cwd(), 'public/document-templates/federal/941.pdf');
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();

    // ------------------------------------------------------------------
    // Field names below were mapped by correlating each widget's rectangle
    // against the template's own text. Do not adjust them from the IRS line
    // numbering alone: the entity block consumes f1_1..f1_11, so the Part 1
    // body starts at f1_12, and every money line is a DOLLARS box plus a
    // separate CENTS box.
    // ------------------------------------------------------------------
    const P1 = 'topmostSubform[0].Page1[0]';
    const ENTITY = `${P1}.Header[0].EntityArea[0]`;

    // EIN is split: two-digit prefix, then the remaining seven.
    const einDigits = (company.fein || '').replace(/\D/g, '');
    setFieldSafe(form, `${ENTITY}.f1_1[0]`, einDigits.slice(0, 2));
    setFieldSafe(form, `${ENTITY}.f1_2[0]`, einDigits.slice(2, 9));

    setFieldSafe(form, `${ENTITY}.f1_3[0]`, company.legalBusinessName || company.companyName);
    // Trade name only when it actually differs from the legal name.
    if (company.legalBusinessName && company.companyName !== company.legalBusinessName) {
      setFieldSafe(form, `${ENTITY}.f1_4[0]`, company.companyName);
    }
    setFieldSafe(form, `${ENTITY}.f1_5[0]`, company.address || '');
    setFieldSafe(form, `${ENTITY}.f1_6[0]`, company.city || '');
    setFieldSafe(form, `${ENTITY}.f1_7[0]`, company.state || '');
    setFieldSafe(form, `${ENTITY}.f1_8[0]`, company.zipCode || '');

    // Report for this quarter (c1_1[0..3] = Q1..Q4).
    checkFieldSafe(form, `${P1}.Header[0].ReportForQuarter[0].c1_1[${quarter - 1}]`, true);

    // --- Part 1 ---
    setFieldSafe(form, `${P1}.f1_12[0]`, String(lines.line1EmployeeCount));
    setMoney(form, `${P1}.f1_13[0]`, `${P1}.f1_14[0]`, lines.line2Wages);
    setMoney(form, `${P1}.f1_15[0]`, `${P1}.f1_16[0]`, lines.line3FederalTaxWithheld);

    // Line 4 — check only when nothing is subject to SS or Medicare.
    if (lines.line5aSocialSecurityWages === 0 && lines.line5cMedicareWages === 0) {
      checkFieldSafe(form, `${P1}.c1_2[0]`, true);
    }

    // Line 5a (cols 1 and 2), 5b tips, 5c Medicare, 5d additional Medicare.
    setMoney(form, `${P1}.f1_17[0]`, `${P1}.f1_18[0]`, lines.line5aSocialSecurityWages);
    setMoney(form, `${P1}.f1_19[0]`, `${P1}.f1_20[0]`, lines.line5aTax);
    setMoney(form, `${P1}.f1_21[0]`, `${P1}.f1_22[0]`, lines.line5bTipsWages);
    setMoney(form, `${P1}.f1_23[0]`, `${P1}.f1_24[0]`, lines.line5bTax);
    setMoney(form, `${P1}.f1_25[0]`, `${P1}.f1_26[0]`, lines.line5cMedicareWages);
    setMoney(form, `${P1}.f1_27[0]`, `${P1}.f1_28[0]`, lines.line5cTax);
    if (lines.line5dAdditionalMedicareWages > 0) {
      setMoney(form, `${P1}.f1_29[0]`, `${P1}.f1_30[0]`, lines.line5dAdditionalMedicareWages);
      setMoney(form, `${P1}.f1_31[0]`, `${P1}.f1_32[0]`, lines.line5dTax);
    }

    setMoney(form, `${P1}.f1_33[0]`, `${P1}.f1_34[0]`, lines.line5eTotal);
    setMoney(form, `${P1}.f1_35[0]`, `${P1}.f1_36[0]`, lines.line5fSection3121q);
    setMoney(form, `${P1}.f1_37[0]`, `${P1}.f1_38[0]`, lines.line6TotalBeforeAdjustments);
    setMoney(form, `${P1}.f1_39[0]`, `${P1}.f1_40[0]`, lines.line7FractionsOfCents);
    setMoney(form, `${P1}.f1_41[0]`, `${P1}.f1_42[0]`, lines.line8SickPay);
    setMoney(form, `${P1}.f1_43[0]`, `${P1}.f1_44[0]`, lines.line9TipsAndGroupLife);
    setMoney(form, `${P1}.f1_45[0]`, `${P1}.f1_46[0]`, lines.line10TotalAfterAdjustments);
    setMoney(form, `${P1}.f1_47[0]`, `${P1}.f1_48[0]`, lines.line11NonrefundableCredits);
    setMoney(form, `${P1}.f1_49[0]`, `${P1}.f1_50[0]`, lines.line12TotalAfterCredits);
    setMoney(form, `${P1}.f1_51[0]`, `${P1}.f1_52[0]`, lines.line13TotalDeposits);
    setMoney(form, `${P1}.f1_53[0]`, `${P1}.f1_54[0]`, lines.line14BalanceDue);
    setMoney(form, `${P1}.f1_55[0]`, `${P1}.f1_56[0]`, lines.line15Overpayment);

    // --- Page 2 header + Part 2 monthly liabilities ---
    const P2 = 'topmostSubform[0].Page2[0]';
    setFieldSafe(form, `${P2}.Name_ReadOrder[0].f1_3[0]`, company.legalBusinessName || company.companyName);
    setFieldSafe(form, `${P2}.EIN_Number[0].f1_1[0]`, einDigits.slice(0, 2));
    setFieldSafe(form, `${P2}.EIN_Number[0].f1_2[0]`, einDigits.slice(2, 9));

    // Line 16 — driven by Company.federalDepositSchedule. c2_1[0] is the
    // under-$2,500 box (a filer determination that also depends on the prior
    // quarter, so never auto-marked), [1] is monthly, [2] is semiweekly.
    // A semiweekly depositor leaves the monthly amounts blank and attaches
    // Schedule B; filling them anyway would contradict the checked box.
    if (form941.line16.selection === 'monthly') {
      checkFieldSafe(form, `${P2}.c2_1[1]`, true);
      const [m1, m2, m3] = form941.monthlyLiabilities;
      setMoney(form, `${P2}.f2_1[0]`, `${P2}.f2_2[0]`, m1.liability);
      setMoney(form, `${P2}.f2_3[0]`, `${P2}.f2_4[0]`, m2.liability);
      setMoney(form, `${P2}.f2_5[0]`, `${P2}.f2_6[0]`, m3.liability);
      setMoney(form, `${P2}.f2_7[0]`, `${P2}.f2_8[0]`, form941.monthlyTotal);
    } else if (form941.line16.selection === 'semiweekly') {
      checkFieldSafe(form, `${P2}.c2_1[2]`, true);
    }

    // Parts 3, 4 and 5 (business status, third-party designee, signature) are
    // filer declarations, not derived data, and are left blank on purpose.

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
