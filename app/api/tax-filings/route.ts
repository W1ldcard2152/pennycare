import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { startOfDay, endOfDay } from '@/lib/date-utils';

// Returns true if there's payroll liability for a form-period and no deposits
// have been recorded against the matching authority. Used by the no-deposits
// guard to prevent silently marking a return filed while books still show
// the liability outstanding.
async function hasUnrecordedLiability(
  companyId: string,
  formType: string,
  year: number,
  quarter: number | null,
): Promise<boolean> {
  if (formType !== '941' && formType !== 'nys45') return false;
  if (!quarter || quarter < 1 || quarter > 4) return false;

  const startMonth = String((quarter - 1) * 3 + 1).padStart(2, '0');
  const endMonth = String(quarter * 3).padStart(2, '0');
  const lastDay = new Date(Date.UTC(year, quarter * 3, 0)).getUTCDate();
  const startStr = `${year}-${startMonth}-01`;
  const endStr = `${year}-${endMonth}-${String(lastDay).padStart(2, '0')}`;
  const periodStart = startOfDay(startStr);
  const periodEnd = endOfDay(endStr);

  const payrollCount = await prisma.payrollRecord.count({
    where: {
      companyId,
      status: 'active',
      payDate: { gte: periodStart, lte: periodEnd },
    },
  });
  if (payrollCount === 0) return false;

  const quarterStr = `Q${quarter}`;
  const matchingAuthorities =
    formType === '941'
      ? ['federal_941']
      : ['ny_withholding', 'ny_sui', 'ny_dbl_pfl'];

  const depositCount = await prisma.taxDeposit.count({
    where: {
      companyId,
      taxAuthority: { in: matchingAuthorities },
      taxPeriodYear: year,
      taxPeriodQuarter: quarterStr,
      status: 'recorded',
    },
  });
  return depositCount === 0;
}

// GET /api/tax-filings - List all filings for the company
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const filings = await prisma.taxFiling.findMany({
      where: { companyId: companyId! },
      orderBy: [{ year: 'desc' }, { quarter: 'desc' }, { formType: 'asc' }],
    });

    return NextResponse.json(filings);
  } catch (error) {
    console.error('Error fetching tax filings:', error);
    return NextResponse.json({ error: 'Failed to fetch tax filings' }, { status: 500 });
  }
}

// POST /api/tax-filings - Create or upsert a filing record.
//
// For 941 and NYS-45, applies a server-side guard: if the quarter has payroll
// liability AND zero recorded TaxDeposit rows for the matching authority, AND
// the client hasn't sent `acknowledgedNoDeposits: true`, the request is
// rejected with a 400 carrying a structured error so callers can surface a
// "books and filing will disagree" warning to the user. The guard applies
// to every caller of this endpoint — Settings UI, Tax Forms page, scripts,
// curl — so the protection can't be bypassed by changing entry point.
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('payroll');
    if (error) return error;

    const body = await request.json();
    const { formType, year, quarter, status, filedDate, confirmationNumber, notes } = body;
    const acknowledgedNoDeposits = body?.acknowledgedNoDeposits === true;

    if (!formType || !year) {
      return NextResponse.json({ error: 'formType and year are required' }, { status: 400 });
    }

    const validFormTypes = ['941', 'nys45', '940', 'w2'];
    if (!validFormTypes.includes(formType)) {
      return NextResponse.json({ error: `Invalid formType. Must be one of: ${validFormTypes.join(', ')}` }, { status: 400 });
    }

    // Find existing filing by compound key (using findFirst because quarter can be null)
    const parsedYear = parseInt(year);
    const parsedQuarter = quarter ? parseInt(quarter) : null;

    // Guard: applies only when marking filed (not when undoing/voiding).
    const isMarkingFiled = (status || 'filed') === 'filed';
    if (isMarkingFiled && !acknowledgedNoDeposits) {
      const needsWarning = await hasUnrecordedLiability(
        companyId!,
        formType,
        parsedYear,
        parsedQuarter,
      );
      if (needsWarning) {
        return NextResponse.json(
          {
            error: 'no_deposits_recorded',
            code: 'no_deposits_recorded',
            message:
              formType === '941'
                ? `Q${parsedQuarter} ${parsedYear} has payroll on the books but no federal 941 deposits recorded. Marking this filed will leave your books out of sync with the return. Record the deposit(s) first, or resubmit with acknowledgedNoDeposits=true.`
                : `Q${parsedQuarter} ${parsedYear} has payroll on the books but no NY tax deposits recorded. Marking this filed will leave your books out of sync with the return. Record the deposit(s) first, or resubmit with acknowledgedNoDeposits=true.`,
            formType,
            year: parsedYear,
            quarter: parsedQuarter,
          },
          { status: 400 }
        );
      }
    }

    const existing = await prisma.taxFiling.findFirst({
      where: { companyId: companyId!, formType, year: parsedYear, quarter: parsedQuarter },
    });

    const filing = existing
      ? await prisma.taxFiling.update({
          where: { id: existing.id },
          data: {
            status: status || 'filed',
            filedDate: filedDate ? new Date(filedDate) : new Date(),
            confirmationNumber: confirmationNumber || null,
            notes: notes || null,
          },
        })
      : await prisma.taxFiling.create({
          data: {
            companyId: companyId!,
            formType,
            year: parsedYear,
            quarter: parsedQuarter,
            status: status || 'filed',
            filedDate: filedDate ? new Date(filedDate) : new Date(),
            confirmationNumber: confirmationNumber || null,
            notes: notes || null,
          },
        });

    if (isMarkingFiled) {
      await logAudit({
        companyId: companyId!,
        userId: session!.userId,
        action: acknowledgedNoDeposits ? 'tax_filing.mark_filed_without_deposits' : 'tax_filing.create',
        entityType: 'TaxFiling',
        entityId: filing.id,
        metadata: {
          formType,
          year: parsedYear,
          quarter: parsedQuarter,
          ...(acknowledgedNoDeposits && { acknowledgedNoDeposits: true }),
        },
      });
    }

    return NextResponse.json(filing);
  } catch (error) {
    console.error('Error creating tax filing:', error);
    return NextResponse.json({ error: 'Failed to create tax filing' }, { status: 500 });
  }
}
