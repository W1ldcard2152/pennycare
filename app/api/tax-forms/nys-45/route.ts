import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { PDFDocument } from 'pdf-lib';
import { formatDate } from '@/lib/date-utils';
import { decrypt } from '@/lib/encryption';
import { buildNys45, quarterBounds, type Nys45EmployeeInput, type Nys45RecordInput } from '@/lib/nys45';
import { FormFiller } from '@/lib/pdf-form';
import fs from 'fs';
import path from 'path';

// Format currency for form fields (no $ sign, 2 decimal places)
function formatCurrency(amount: number): string {
  return amount.toFixed(2);
}

function maskSSN(ssn: string | null): string {
  if (!ssn) return '';
  const digits = ssn.replace(/\D/g, '');
  return digits.length === 9 ? `***-**-${digits.slice(5)}` : '***-**-****';
}

/**
 * Part C column (a) is a 9-character box — the hyphenated form is 11 and pdf-lib
 * rejects it outright, which used to leave every SSN on the return blank.
 */
function ssnDigits(ssn: string | null): string {
  if (!ssn) return '';
  return ssn.replace(/\D/g, '').slice(0, 9);
}

// GET /api/tax-forms/nys-45 - Generate NYS-45 PDF (or JSON preview)
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

    // Pull every ACTIVE record from Jan 1 through the end of the quarter. The
    // wage-base split on line 2 is "since January 1", so earlier quarters are
    // needed to know how much of each employee's base is already used up.
    // Voided and corrected records are excluded — they are not remuneration
    // paid, and including them overstates the return.
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
            firstName: true,
            lastName: true,
            middleName: true,
            taxIdEncrypted: true,
            unemploymentTaxability: true,
            hireDate: true,
            terminationDate: true,
            nycResident: true,
            yonkersResident: true,
            yonkersNonResident: true,
            ytdGrossPaySeed: true,
            ytdSeedAsOfDate: true,
          },
        },
      },
      orderBy: { payDate: 'asc' },
    });

    const employeeMap = new Map<string, Nys45EmployeeInput>();
    for (const r of records) {
      if (employeeMap.has(r.employee.id)) continue;
      let ssn: string | null = null;
      if (r.employee.taxIdEncrypted) {
        try {
          ssn = decrypt(r.employee.taxIdEncrypted) || null;
        } catch {
          ssn = null;
        }
      }
      employeeMap.set(r.employee.id, {
        id: r.employee.id,
        firstName: r.employee.firstName,
        lastName: r.employee.lastName,
        middleName: r.employee.middleName,
        ssn,
        unemploymentTaxability: r.employee.unemploymentTaxability,
        hireDate: r.employee.hireDate,
        terminationDate: r.employee.terminationDate,
        nycResident: r.employee.nycResident,
        yonkersResident: r.employee.yonkersResident,
        yonkersNonResident: r.employee.yonkersNonResident,
        ytdGrossPaySeed: r.employee.ytdGrossPaySeed,
        ytdSeedAsOfDate: r.employee.ytdSeedAsOfDate,
      });
    }

    const yearRecords: Nys45RecordInput[] = records.map((r) => ({
      employeeId: r.employee.id,
      payDate: r.payDate,
      payPeriodStart: r.payPeriodStart,
      payPeriodEnd: r.payPeriodEnd,
      grossPay: r.grossPay,
      taxableWages: r.taxableWages,
      stateTax: r.stateTax,
      localTax: r.localTax,
      employerSUI: r.employerSUI,
    }));

    const quarterStr = `Q${quarter}`;
    const [depositRows, filing] = await Promise.all([
      prisma.taxDeposit.findMany({
        where: {
          companyId: companyId!,
          taxAuthority: { in: ['ny_withholding', 'ny_sui', 'ny_dbl_pfl'] },
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
          taxAuthority: true,
          stateIncomeTaxWithheld: true,
          stateUnemploymentTax: true,
          stateDisabilityTax: true,
          statePaidFamilyLeaveTax: true,
        },
      }),
      prisma.taxFiling.findFirst({
        where: { companyId: companyId!, formType: 'nys45', year, quarter },
      }),
    ]);

    // Line 15 is specifically NYS-1 *withholding* payments. UI contributions are
    // remitted with the NYS-45 itself and belong to Part A, so they are tracked
    // separately rather than lumped into one "total deposits" figure.
    const withholdingDeposits = depositRows.reduce((s, d) => s + d.stateIncomeTaxWithheld, 0);
    const uiDeposits = depositRows.reduce((s, d) => s + d.stateUnemploymentTax, 0);
    const sdiPflDeposits = depositRows.reduce(
      (s, d) => s + d.stateDisabilityTax + d.statePaidFamilyLeaveTax,
      0
    );

    const form45 = buildNys45({
      year,
      quarter,
      uiRate: company.suiRate || 0,
      employees: [...employeeMap.values()],
      yearRecords,
      nys1Payments: withholdingDeposits,
    });

    // Records that actually fall inside the quarter — the year-to-date pull
    // above deliberately reaches back further.
    const quarterRecordCount = records.filter(
      (r) => r.payDate >= dateStart && r.payDate <= dateEnd
    ).length;

    if (preview) {
      // Context only — NYS SDI and PFL are NOT reported on the NYS-45. They are
      // shown separately so nobody folds them into line 13.
      const quarterRecords = records.filter((r) => r.payDate >= dateStart && r.payDate <= dateEnd);
      const nySDI = quarterRecords.reduce((s, r) => s + (r.nySDI || 0), 0);
      const nyPFL = quarterRecords.reduce((s, r) => s + (r.nyPFL || 0), 0);

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
          start: formatDate(dateStart),
          end: formatDate(dateEnd),
        },
        wageBase: form45.wageBase,
        wageBaseIsExact: form45.wageBaseIsExact,
        rsfRate: form45.rsfRate,
        partA: form45.partA,
        partB: form45.partB,
        partC: form45.partC.map((r) => ({ ...r, ssn: maskSSN(r.ssn), ssnOnFile: Boolean(r.ssn) })),
        warnings: form45.warnings,
        bookedSUI: form45.bookedSUI,
        deposits: depositRows.map((d) => ({
          id: d.id,
          depositDate: formatDate(d.depositDate),
          paymentMethod: d.paymentMethod,
          confirmationNumber: d.confirmationNumber,
          taxAuthority: d.taxAuthority,
          amount:
            Math.round(
              (d.stateIncomeTaxWithheld +
                d.stateUnemploymentTax +
                d.stateDisabilityTax +
                d.statePaidFamilyLeaveTax) *
                100
            ) / 100,
        })),
        depositTotals: {
          withholding: Math.round(withholdingDeposits * 100) / 100,
          ui: Math.round(uiDeposits * 100) / 100,
          sdiPfl: Math.round(sdiPflDeposits * 100) / 100,
        },
        notOnForm: {
          nySDI: Math.round(nySDI * 100) / 100,
          nyPFL: Math.round(nyPFL * 100) / 100,
        },
        filing: filing
          ? {
              id: filing.id,
              status: filing.status,
              filedDate: filing.filedDate ? formatDate(filing.filedDate) : null,
              confirmationNumber: filing.confirmationNumber,
              filingMethod: filing.filingMethod,
            }
          : null,
        recordCount: quarterRecordCount,
      });
    }

    // ------------------------------------------------------------------
    // PDF generation — field names below match the bundled NYS-45 (1/26).
    // ------------------------------------------------------------------
    const templatePath = path.join(process.cwd(), 'public/document-templates/state/NYS-45.pdf');

    if (!fs.existsSync(templatePath)) {
      return NextResponse.json(
        { error: 'NYS-45 template not found. Please add a valid NYS-45 PDF template.' },
        { status: 500 }
      );
    }

    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    const filler = new FormFiller(form);

    const { partA, partB, partC } = form45;

    // --- Header ---
    // UI registration and withholding ID are split across boxed segments, and
    // the boxes hold 7/1 and 10/2/1 characters respectively. Overflowing a box
    // does not truncate — pdf-lib rejects the whole write and the box comes out
    // empty — so each slice is sized to its box and filled left to right.
    const uiReg = (company.stateUIClientId || '').replace(/\D/g, '');
    filler.text('ui emp reg number 1', uiReg.slice(0, 7));
    filler.text('ui emp reg number 2', uiReg.slice(7, 8));
    const wtId = (company.stateTaxId || '').replace(/\s/g, '');
    filler.text('withholding id number 1', wtId.slice(0, 10));
    filler.text('withholding id number 2', wtId.slice(10, 12));
    filler.text('withholding id number 3', wtId.slice(12, 13));
    filler.text('year', String(year).slice(-2));
    filler.text('employer legal name', company.legalBusinessName || company.companyName);
    filler.text('Employer address', company.address || '');
    filler.text('Employer city name', company.city || '');
    filler.text('Employer state name', company.state || '');
    filler.text('Employer ZIP name', company.zipCode || '');
    filler.text('area code', (company.phone || '').replace(/\D/g, '').slice(0, 3));
    filler.text('telephone number', (company.phone || '').replace(/\D/g, '').slice(3));

    // --- Part A: number of employees (week containing the 12th) ---
    filler.text('no of emp a', String(partA.employeeCounts[0]));
    filler.text('no of emp b', String(partA.employeeCounts[1]));
    filler.text('no of emp c', String(partA.employeeCounts[2]));

    // --- Part A: lines 1-6 ---
    filler.text('line 1', formatCurrency(partA.line1TotalRemuneration));
    filler.text('line 2', formatCurrency(partA.line2ExcessRemuneration));
    filler.text('line 3', formatCurrency(partA.line3WagesSubjectToContribution));
    // 4a is the rate, split across whole/decimal boxes.
    const ratePct = partA.line4aUiRate.toFixed(3);
    filler.text('line 4 pct 1', ratePct.split('.')[0]);
    filler.text('line 4 pct 2', ratePct.split('.')[1] || '');
    filler.text('line 4', formatCurrency(partA.line4UiContributionsDue));
    filler.text('line 5', formatCurrency(partA.line5ReemploymentServiceFund));
    filler.text('line 6', formatCurrency(partA.line6Subtotal));
    // Lines 7-12 cover prior-period under/overpayments and refunds, which this
    // app does not track. Line 10 is therefore left for the filer.

    // --- Part B: lines 13-24 ---
    filler.text('line 13', formatCurrency(partB.line13TotalTaxWithheld));
    filler.text('line 15', formatCurrency(partB.line15Nys1Payments));
    filler.text('line 17', formatCurrency(partB.line17TotalPayments));
    filler.text('line 20', formatCurrency(partB.line20TotalWtDue));
    if (partB.line21TotalWtOverpaid > 0) {
      filler.text('line 21', formatCurrency(partB.line21TotalWtOverpaid));
    }
    // Line 14 (prior-quarter WT credit), line 16 (payments with prior NYS-45s)
    // and line 18 are not derivable from app data — left blank for the filer.
    filler.text('line 24', formatCurrency(partB.line24TotalAllTaxWithheld));

    // --- Part C: 5 rows per page ---
    const pageRows = partC.slice(0, 5);
    pageRows.forEach((row, i) => {
      filler.text(`a_SSN.${i}`, ssnDigits(row.ssn));
      filler.text(`b_Last_name.${i}`, row.lastName);
      filler.text(`c_First_name.${i}`, row.firstName);
      filler.text(`d_MI.${i}`, row.middleInitial);
      filler.text(`e_Wage type.${i}`, row.wageType);
      filler.text(`f_Total_UI.${i}`, formatCurrency(row.uiRemuneration));
      filler.text(`g_Gross_federal.${i}`, formatCurrency(row.grossFederalWages));
      filler.text(`h_NYS_tax.${i}`, formatCurrency(row.nysTaxWithheld));
      filler.text(`i_total_NYC_tax.${i}`, formatCurrency(row.nycTaxWithheld));
      filler.text(`j_Yonkers_tax.${i}`, formatCurrency(row.yonkersTaxWithheld));
    });

    // Column A totals = "totals from this page only"; B totals = grand totals.
    // With <=5 employees the single page is also the grand total.
    const pageTotal = (pick: (r: typeof partC[number]) => number) =>
      Math.round(pageRows.reduce((s, r) => s + pick(r), 0) * 100) / 100;

    filler.text('f_Total_UI_A', formatCurrency(pageTotal((r) => r.uiRemuneration)));
    filler.text('g_Gross_federal_A', formatCurrency(pageTotal((r) => r.grossFederalWages)));
    filler.text('h_NYS_tax_A', formatCurrency(pageTotal((r) => r.nysTaxWithheld)));
    filler.text('i_total_NYC_tax_A', formatCurrency(pageTotal((r) => r.nycTaxWithheld)));
    filler.text('j_Yonkers_tax_A', formatCurrency(pageTotal((r) => r.yonkersTaxWithheld)));

    filler.text('f_Total_UI_B', formatCurrency(partA.line1TotalRemuneration));
    filler.text('g_Gross_federal_B', formatCurrency(
      Math.round(partC.reduce((s, r) => s + r.grossFederalWages, 0) * 100) / 100
    ));
    filler.text('h_NYS_tax_B', formatCurrency(partB.nysTaxWithheld));
    filler.text('i_total_NYC_tax_B', formatCurrency(partB.nycTaxWithheld));
    filler.text('j_Yonkers_tax_B', formatCurrency(partB.yonkersTaxWithheld));

    filler.text('Page', '1');
    filler.text('Page_of', '1');

    // The quarter boxes on page 1 are printed artwork, not AcroForm widgets, so
    // they cannot be filled programmatically — the filer marks the quarter by
    // hand. Same for the seasonal-employer and amended-return boxes, which this
    // app has no data for.

    filler.report('NYS-45');
    if (filler.isTotalMismatch) {
      // Every write was rejected: this build's field names do not match the
      // bundled template. Serving the PDF would hand the filer a blank return
      // that looks legitimate.
      return NextResponse.json(
        {
          error:
            'NYS-45 template mismatch — no form fields could be filled. The bundled template does not match this version of the app.',
        },
        { status: 500 }
      );
    }

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
