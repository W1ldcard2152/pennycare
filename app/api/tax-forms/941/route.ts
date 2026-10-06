import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { PDFDocument } from 'pdf-lib';
import { formatDate } from '@/lib/date-utils';
import { line1ReferenceDate } from '@/lib/form941';
import { loadForm941 } from '@/lib/tax-return-data';
import {
  FORM941_LINE_DEFS,
  changedKeys,
  currentReturn,
  resolveReturn,
  sanitizeOverrides,
  form941ComputedValues,
} from '@/lib/tax-return-values';
import { FormFiller } from '@/lib/pdf-form';
import fs from 'fs';
import path from 'path';

/**
 * IRS money lines are two separate boxes: whole dollars and cents. Writing
 * "1234.56" into a single field puts the whole string in one box — which is how
 * the pre-1.3 implementation silently produced a wrong return.
 */
function setMoney(
  filler: FormFiller,
  dollarsField: string,
  centsField: string,
  amount: number
) {
  const negative = amount < 0;
  const cents = Math.round(Math.abs(amount) * 100);
  const dollars = Math.floor(cents / 100);
  filler.text(dollarsField, `${negative ? '-' : ''}${dollars}`);
  filler.text(centsField, String(cents % 100).padStart(2, '0'));
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

    const loaded = await loadForm941(companyId!, year, quarter);
    if (!loaded) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }
    const { company, dateStart, dateEnd, quarterRecords, form941, depositRows, filing } = loaded;
    const { lines } = form941;
    const quarterRecordCount = quarterRecords.length;
    // Distinct employees paid in the quarter. This is NOT line 1 (which counts
    // only the pay period including the 12th of the third month) — it is the
    // summary tile figure.
    const employeesPaidInQuarter = new Set(quarterRecords.map((r) => r.employee.id)).size;

    // The return as it stands: frozen at the filed values once filed,
    // otherwise the computed figures with any saved draft edits applied.
    const computed = form941ComputedValues(form941);
    const current = currentReturn(FORM941_LINE_DEFS, computed, filing);
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
      const sanitized = sanitizeOverrides(FORM941_LINE_DEFS, parsed);
      if (!sanitized.ok) {
        return NextResponse.json({ error: sanitized.error }, { status: 400 });
      }
      v = resolveReturn(FORM941_LINE_DEFS, computed, sanitized.overrides);
    }

    // If preview mode, return the data as JSON
    if (preview) {
      return NextResponse.json({
        company,
        quarter,
        year,
        dateRange: {
          start: formatDate(dateStart),
          end: formatDate(dateEnd),
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
              adjustmentEntry: filing.adjustmentEntry,
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
        employeesPaidInQuarter,
        line1ReferenceDate: formatDate(line1ReferenceDate(year, quarter)),
      });
    }

    // Load PDF template
    const templatePath = path.join(process.cwd(), 'public/document-templates/federal/941.pdf');
    const templateBytes = fs.readFileSync(templatePath);
    const pdfDoc = await PDFDocument.load(templateBytes);
    const form = pdfDoc.getForm();
    const filler = new FormFiller(form);

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
    filler.text(`${ENTITY}.f1_1[0]`, einDigits.slice(0, 2));
    filler.text(`${ENTITY}.f1_2[0]`, einDigits.slice(2, 9));

    filler.text(`${ENTITY}.f1_3[0]`, company.legalBusinessName || company.companyName);
    // Trade name only when it actually differs from the legal name.
    if (company.legalBusinessName && company.companyName !== company.legalBusinessName) {
      filler.text(`${ENTITY}.f1_4[0]`, company.companyName);
    }
    filler.text(`${ENTITY}.f1_5[0]`, company.address || '');
    filler.text(`${ENTITY}.f1_6[0]`, company.city || '');
    filler.text(`${ENTITY}.f1_7[0]`, company.state || '');
    filler.text(`${ENTITY}.f1_8[0]`, company.zipCode || '');

    // Report for this quarter (c1_1[0..3] = Q1..Q4).
    filler.check(`${P1}.Header[0].ReportForQuarter[0].c1_1[${quarter - 1}]`, true);

    // --- Part 1 --- (values as filed / as edited — see currentReturn)
    const money = (dollarsField: string, centsField: string, key: string) =>
      setMoney(filler, `${P1}.${dollarsField}`, `${P1}.${centsField}`, v[key] ?? 0);
    filler.text(`${P1}.f1_12[0]`, String(v.line1));
    money('f1_13[0]', 'f1_14[0]', 'line2');
    money('f1_15[0]', 'f1_16[0]', 'line3');

    // Line 4 — check only when nothing is subject to SS or Medicare.
    if (v.line5aWages === 0 && v.line5cWages === 0) {
      filler.check(`${P1}.c1_2[0]`, true);
    }

    // Line 5a (cols 1 and 2), 5b tips, 5c Medicare, 5d additional Medicare.
    money('f1_17[0]', 'f1_18[0]', 'line5aWages');
    money('f1_19[0]', 'f1_20[0]', 'line5aTax');
    money('f1_21[0]', 'f1_22[0]', 'line5bWages');
    money('f1_23[0]', 'f1_24[0]', 'line5bTax');
    money('f1_25[0]', 'f1_26[0]', 'line5cWages');
    money('f1_27[0]', 'f1_28[0]', 'line5cTax');
    if (v.line5dWages > 0 || v.line5dTax > 0) {
      money('f1_29[0]', 'f1_30[0]', 'line5dWages');
      money('f1_31[0]', 'f1_32[0]', 'line5dTax');
    }

    money('f1_33[0]', 'f1_34[0]', 'line5e');
    money('f1_35[0]', 'f1_36[0]', 'line5f');
    money('f1_37[0]', 'f1_38[0]', 'line6');
    money('f1_39[0]', 'f1_40[0]', 'line7');
    money('f1_41[0]', 'f1_42[0]', 'line8');
    money('f1_43[0]', 'f1_44[0]', 'line9');
    money('f1_45[0]', 'f1_46[0]', 'line10');
    money('f1_47[0]', 'f1_48[0]', 'line11');
    money('f1_49[0]', 'f1_50[0]', 'line12');
    money('f1_51[0]', 'f1_52[0]', 'line13');
    money('f1_53[0]', 'f1_54[0]', 'line14');
    money('f1_55[0]', 'f1_56[0]', 'line15');

    // --- Page 2 header + Part 2 monthly liabilities ---
    const P2 = 'topmostSubform[0].Page2[0]';
    filler.text(`${P2}.Name_ReadOrder[0].f1_3[0]`, company.legalBusinessName || company.companyName);
    filler.text(`${P2}.EIN_Number[0].f1_1[0]`, einDigits.slice(0, 2));
    filler.text(`${P2}.EIN_Number[0].f1_2[0]`, einDigits.slice(2, 9));

    // Line 16 — driven by Company.federalDepositSchedule. c2_1[0] is the
    // under-$2,500 box (a filer determination that also depends on the prior
    // quarter, so never auto-marked), [1] is monthly, [2] is semiweekly.
    // A semiweekly depositor leaves the monthly amounts blank and attaches
    // Schedule B; filling them anyway would contradict the checked box.
    if (form941.line16.selection === 'monthly') {
      filler.check(`${P2}.c2_1[1]`, true);
      setMoney(filler, `${P2}.f2_1[0]`, `${P2}.f2_2[0]`, v.month1);
      setMoney(filler, `${P2}.f2_3[0]`, `${P2}.f2_4[0]`, v.month2);
      setMoney(filler, `${P2}.f2_5[0]`, `${P2}.f2_6[0]`, v.month3);
      setMoney(filler, `${P2}.f2_7[0]`, `${P2}.f2_8[0]`, v.monthTotal);
    } else if (form941.line16.selection === 'semiweekly') {
      filler.check(`${P2}.c2_1[2]`, true);
    }

    // Parts 3, 4 and 5 (business status, third-party designee, signature) are
    // filer declarations, not derived data, and are left blank on purpose.

    filler.report('Form 941');
    if (filler.isTotalMismatch) {
      // Every write was rejected: this build's field names do not match the
      // bundled template. Serving the PDF would hand the filer a blank return
      // that looks legitimate.
      return NextResponse.json(
        {
          error:
            'Form 941 template mismatch — no form fields could be filled. The bundled template does not match this version of the app.',
        },
        { status: 500 }
      );
    }

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
