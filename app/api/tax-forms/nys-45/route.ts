import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { prisma } from '@/lib/db';
import { listReturnPayments } from '@/lib/tax-filing-service';
import { PDFDocument } from 'pdf-lib';
import { formatDate } from '@/lib/date-utils';
import { loadNys45 } from '@/lib/tax-return-data';
import {
  changedKeys,
  currentReturn,
  resolveReturn,
  sanitizeOverrides,
  nys45ComputedValues,
  nys45LineDefs,
  nys45PartCKey,
} from '@/lib/tax-return-values';
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

    const loaded = await loadNys45(companyId!, year, quarter);
    if (!loaded) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const { company, dateStart, dateEnd, quarterRecords, form45, depositRows, depositTotals, filing } =
      loaded;
    const quarterRecordCount = quarterRecords.length;

    // The return as it stands: frozen at the filed values once filed,
    // otherwise the computed figures with any saved draft edits applied.
    const defs = nys45LineDefs(form45.partC.map((r) => r.employeeId));
    const computed = nys45ComputedValues(form45);
    const current = currentReturn(defs, computed, filing);
    // The page passes its unsaved edits so the PDF matches the screen.
    const overridesParam = searchParams.get('overrides');
    let v = current.values;
    if (overridesParam && !preview) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(overridesParam);
      } catch {
        parsed = null;
      }
      const sanitized = sanitizeOverrides(defs, parsed);
      if (!sanitized.ok) {
        return NextResponse.json({ error: sanitized.error }, { status: 400 });
      }
      v = resolveReturn(defs, computed, sanitized.overrides);
    }

    if (preview) {
      // Context only — NYS SDI and PFL are NOT reported on the NYS-45. They are
      // shown separately so nobody folds them into line 13.
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
          withholding: Math.round(depositTotals.withholding * 100) / 100,
          ui: Math.round(depositTotals.ui * 100) / 100,
          sdiPfl: Math.round(depositTotals.sdiPfl * 100) / 100,
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
              balanceDue: filing.balanceDue,
              adjustmentEntry: filing.adjustmentEntry,
              notes: filing.notes,
              payments: await listReturnPayments(prisma, companyId!, 'nys45', year, quarter),
            }
          : null,
        // Editable return — the page recomputes with lib/tax-return-values.
        editor: {
          computed,
          overrides: current.overrides,
          values: v,
          frozen: current.frozen,
          // Lines where payroll has moved since the return was filed.
          driftSinceFiling:
            current.frozen && current.savedComputed ? changedKeys(computed, current.savedComputed) : [],
        },
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

    const partC = form45.partC;
    const money = (key: string) => formatCurrency(v[key] ?? 0);
    // Optional lines are left blank rather than printed as 0.00.
    const moneyIfSet = (field: string, key: string) => {
      if ((v[key] ?? 0) !== 0) filler.text(field, money(key));
    };

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
    filler.text('no of emp a', String(v.countA));
    filler.text('no of emp b', String(v.countB));
    filler.text('no of emp c', String(v.countC));

    // --- Part A: lines 1-11 ---
    filler.text('line 1', money('line1'));
    filler.text('line 2', money('line2'));
    filler.text('line 3', money('line3'));
    // 4a is the rate, split across whole/decimal boxes.
    const ratePct = (v.line4aRate ?? 0).toFixed(3);
    filler.text('line 4 pct 1', ratePct.split('.')[0]);
    filler.text('line 4 pct 2', ratePct.split('.')[1] || '');
    filler.text('line 4', money('line4'));
    filler.text('line 5', money('line5'));
    filler.text('line 6', money('line6'));
    // Lines 7 and 9 carry prior-period under/overpayments — blank unless the
    // filer entered them. The amended-return columns (1a/1b...) are not used.
    moneyIfSet('line 7', 'line7');
    filler.text('line 8', money('line8'));
    moneyIfSet('line 9', 'line9');
    filler.text('line 10', money('line10'));
    moneyIfSet('line 11', 'line11');

    // --- Part B: lines 13-22 ---
    filler.text('line 13', money('line13'));
    moneyIfSet('line 14', 'line14');
    filler.text('line 15', money('line15'));
    moneyIfSet('line 16', 'line16');
    filler.text('line 17', money('line17'));
    moneyIfSet('line 18', 'line18');
    filler.text('line 19', money('line19'));
    filler.text('line 20', money('line20'));
    moneyIfSet('line 21', 'line21');
    filler.text('line 22', money('line22'));
    filler.text('line 24', money('line24'));

    // --- Part C: 5 rows per page ---
    const cell = (employeeId: string, col: 'f' | 'g' | 'h' | 'i' | 'j') =>
      v[nys45PartCKey(employeeId, col)] ?? 0;
    const pageRows = partC.slice(0, 5);
    pageRows.forEach((row, i) => {
      filler.text(`a_SSN.${i}`, ssnDigits(row.ssn));
      filler.text(`b_Last_name.${i}`, row.lastName);
      filler.text(`c_First_name.${i}`, row.firstName);
      filler.text(`d_MI.${i}`, row.middleInitial);
      filler.text(`e_Wage type.${i}`, row.wageType);
      filler.text(`f_Total_UI.${i}`, formatCurrency(cell(row.employeeId, 'f')));
      filler.text(`g_Gross_federal.${i}`, formatCurrency(cell(row.employeeId, 'g')));
      filler.text(`h_NYS_tax.${i}`, formatCurrency(cell(row.employeeId, 'h')));
      filler.text(`i_total_NYC_tax.${i}`, formatCurrency(cell(row.employeeId, 'i')));
      filler.text(`j_Yonkers_tax.${i}`, formatCurrency(cell(row.employeeId, 'j')));
    });

    // Column A totals = "totals from this page only"; B (line 23) = grand
    // totals across every Part C row.
    const total = (rows: typeof partC, col: 'f' | 'g' | 'h' | 'i' | 'j') =>
      Math.round(rows.reduce((s, r) => s + cell(r.employeeId, col), 0) * 100) / 100;

    filler.text('f_Total_UI_A', formatCurrency(total(pageRows, 'f')));
    filler.text('g_Gross_federal_A', formatCurrency(total(pageRows, 'g')));
    filler.text('h_NYS_tax_A', formatCurrency(total(pageRows, 'h')));
    filler.text('i_total_NYC_tax_A', formatCurrency(total(pageRows, 'i')));
    filler.text('j_Yonkers_tax_A', formatCurrency(total(pageRows, 'j')));

    filler.text('f_Total_UI_B', formatCurrency(total(partC, 'f')));
    filler.text('g_Gross_federal_B', formatCurrency(total(partC, 'g')));
    filler.text('h_NYS_tax_B', formatCurrency(total(partC, 'h')));
    filler.text('i_total_NYC_tax_B', formatCurrency(total(partC, 'i')));
    filler.text('j_Yonkers_tax_B', formatCurrency(total(partC, 'j')));

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
