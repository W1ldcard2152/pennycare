import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { parseBusinessDate } from '@/lib/date-utils';
import { createTaxFilingSchema, fileTaxReturnSchema, validateRequest } from '@/lib/validation';
import { describeFilingError, fileReturn } from '@/lib/tax-filing-service';

// Map "941" / "940" / "NYS-45" / "W-2" / "W-3" â†’ the existing TaxFiling.formType
// values used by the reminders banner ("941", "nys45", "940", "w2"). New form
// types added by this module map straight through where there's no legacy
// equivalent.
function normalizeFormType(input: string): string {
  switch (input) {
    case 'NYS-45':
      return 'nys45';
    case 'W-2':
      return 'w2';
    case 'W-3':
      return 'w3';
    default:
      return input;
  }
}

function quarterToInt(q: string | null | undefined): number | null {
  if (!q) return null;
  const num = parseInt(q.replace('Q', ''));
  return Number.isNaN(num) ? null : num;
}

// GET /api/bookkeeping/tax-filings
//   ?year=2026&formType=941
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('VIEWER');
    if (error) return error;

    const params = request.nextUrl.searchParams;
    const year = params.get('year');
    const formType = params.get('formType');

    const where: { companyId: string; year?: number; formType?: string } = {
      companyId: companyId!,
    };
    if (year) where.year = parseInt(year);
    if (formType) where.formType = normalizeFormType(formType);

    const filings = await prisma.taxFiling.findMany({
      where,
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }, { formType: 'asc' }],
    });

    return NextResponse.json(filings);
  } catch (err) {
    console.error('Error listing tax filings:', err);
    return NextResponse.json({ error: 'Failed to list tax filings' }, { status: 500 });
  }
}

// POST /api/bookkeeping/tax-filings â€” record a filed return.
// Upserts on (companyId, formType, year, quarter) so re-marking a filing as
// "filed" updates the existing row.
//
// Optional body flag `acknowledgedNoDeposits: true` indicates the user was
// warned that no deposit records exist for this period and chose to mark the
// form filed anyway. We surface that decision in the audit trail under a
// distinct action so divergences between books and filed returns can be found
// later.
//
// Quarterly 941 / NYS-45 filings carry the filer's line overrides and go
// through lib/tax-filing-service.ts, which saves the return as filed, trues
// the liability accounts up to it, and optionally records the payment.
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session, role } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;

    const rawBody = await request.json();
    const acknowledgedNoDeposits = rawBody?.acknowledgedNoDeposits === true;
    // Strip the flag before zod validation â€” it isn't part of the filing schema.
    const { acknowledgedNoDeposits: _ignore, ...bodyForValidation } = rawBody ?? {};
    void _ignore;

    if (
      (bodyForValidation.formType === '941' || bodyForValidation.formType === 'NYS-45') &&
      bodyForValidation.taxPeriodQuarter
    ) {
      const validation = validateRequest(fileTaxReturnSchema, bodyForValidation);
      if (!validation.success) {
        return NextResponse.json(
          { error: 'Validation failed', details: validation.errors },
          { status: 400 }
        );
      }
      const data = validation.data;
      try {
        const result = await fileReturn({ userId: session!.userId, role: role! }, companyId!, {
          formType: data.formType === 'NYS-45' ? 'nys45' : '941',
          year: data.taxPeriodYear,
          quarter: quarterToInt(data.taxPeriodQuarter)!,
          overrides: data.overrides,
          filedDate: data.filedDate,
          filingMethod: data.filingMethod,
          confirmationNumber: data.confirmationNumber ?? null,
          notes: data.notes ?? null,
          acknowledgedNoDeposits,
          payment: data.payment
            ? { ...data.payment, confirmationNumber: data.payment.confirmationNumber ?? null }
            : null,
        });
        return NextResponse.json(result);
      } catch (err) {
        const known = describeFilingError(err);
        if (known) return NextResponse.json({ error: known.message }, { status: known.status });
        throw err;
      }
    }

    const validation = validateRequest(createTaxFilingSchema, bodyForValidation);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }
    const data = validation.data;

    const formType = normalizeFormType(data.formType);
    const quarter = quarterToInt(data.taxPeriodQuarter);

    const existing = await prisma.taxFiling.findFirst({
      where: { companyId: companyId!, formType, year: data.taxPeriodYear, quarter },
    });

    const baseData = {
      status: 'filed',
      filedDate: parseBusinessDate(data.filedDate),
      filingMethod: data.filingMethod,
      confirmationNumber: data.confirmationNumber ?? null,
      totalLiability: data.totalLiability,
      totalDeposits: data.totalDeposits,
      balanceDue: data.balanceDue,
      notes: data.notes ?? null,
    };

    const filing = existing
      ? await prisma.taxFiling.update({ where: { id: existing.id }, data: baseData })
      : await prisma.taxFiling.create({
          data: {
            companyId: companyId!,
            formType,
            year: data.taxPeriodYear,
            quarter,
            ...baseData,
          },
        });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: acknowledgedNoDeposits ? 'tax_filing.mark_filed_without_deposits' : 'tax_filing.create',
      entityType: 'TaxFiling',
      entityId: filing.id,
      metadata: {
        formType,
        year: data.taxPeriodYear,
        quarter,
        totalLiability: data.totalLiability,
        totalDeposits: data.totalDeposits,
        balanceDue: data.balanceDue,
        ...(acknowledgedNoDeposits && { acknowledgedNoDeposits: true }),
      },
    });

    return NextResponse.json(filing);
  } catch (err) {
    console.error('Error creating tax filing:', err);
    return NextResponse.json({ error: 'Failed to create tax filing' }, { status: 500 });
  }
}
