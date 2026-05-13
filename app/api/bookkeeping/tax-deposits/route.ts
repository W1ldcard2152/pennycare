import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { createTaxDepositJournalEntry } from '@/lib/bookkeeping';
import { parseBusinessDate } from '@/lib/date-utils';
import { createTaxDepositSchema, validateRequest } from '@/lib/validation';

// GET /api/bookkeeping/tax-deposits
//   ?year=2026
//   &quarter=Q2
//   &authority=federal_941
// Lists tax deposits for the company, most recent first. All filters optional.
export async function GET(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const params = request.nextUrl.searchParams;
    const year = params.get('year');
    const quarter = params.get('quarter');
    const authority = params.get('authority');

    const where: {
      companyId: string;
      taxPeriodYear?: number;
      taxPeriodQuarter?: string | null;
      taxAuthority?: string;
    } = { companyId: companyId! };
    if (year) where.taxPeriodYear = parseInt(year);
    if (quarter) where.taxPeriodQuarter = quarter;
    if (authority) where.taxAuthority = authority;

    const deposits = await prisma.taxDeposit.findMany({
      where,
      orderBy: { depositDate: 'desc' },
      include: {
        journalEntry: {
          select: { id: true, entryNumber: true, date: true, status: true },
        },
      },
    });

    return NextResponse.json(deposits);
  } catch (err) {
    console.error('Error listing tax deposits:', err);
    return NextResponse.json({ error: 'Failed to list tax deposits' }, { status: 500 });
  }
}

// POST /api/bookkeeping/tax-deposits — record a new deposit + create the
// matching journal entry that clears the corresponding liability accounts.
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('payroll');
    if (error) return error;

    const body = await request.json();
    const validation = validateRequest(createTaxDepositSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }
    const data = validation.data;

    // Verify the bank account exists and is an asset on this company's books.
    const bank = await prisma.account.findFirst({
      where: { id: data.bankAccountId, companyId: companyId!, type: 'asset' },
      select: { id: true },
    });
    if (!bank) {
      return NextResponse.json(
        { error: 'Bank account not found or is not an asset account' },
        { status: 400 }
      );
    }

    const depositDate = parseBusinessDate(data.depositDate);

    const deposit = await prisma.$transaction(async (tx) => {
      // Step 1 — create the TaxDeposit row (no journal entry link yet)
      const created = await tx.taxDeposit.create({
        data: {
          companyId: companyId!,
          taxAuthority: data.taxAuthority,
          formReference: data.formReference,
          taxPeriodYear: data.taxPeriodYear,
          taxPeriodQuarter: data.taxPeriodQuarter ?? null,
          depositDate,
          paymentMethod: data.paymentMethod,
          confirmationNumber: data.confirmationNumber ?? null,
          federalIncomeTaxWithheld: data.federalIncomeTaxWithheld,
          socialSecurityTax: data.socialSecurityTax,
          medicareTax: data.medicareTax,
          additionalMedicareTax: data.additionalMedicareTax,
          stateIncomeTaxWithheld: data.stateIncomeTaxWithheld,
          stateUnemploymentTax: data.stateUnemploymentTax,
          stateDisabilityTax: data.stateDisabilityTax,
          statePaidFamilyLeaveTax: data.statePaidFamilyLeaveTax,
          totalAmount: data.totalAmount,
          notes: data.notes ?? null,
          createdBy: session!.userId,
        },
      });

      // Step 2 — create the matching journal entry
      const { journalEntryId } = await createTaxDepositJournalEntry(
        tx,
        companyId!,
        created.id,
        {
          taxAuthority: created.taxAuthority,
          depositDate: created.depositDate,
          formReference: created.formReference,
          taxPeriodYear: created.taxPeriodYear,
          taxPeriodQuarter: created.taxPeriodQuarter,
          federalIncomeTaxWithheld: created.federalIncomeTaxWithheld,
          socialSecurityTax: created.socialSecurityTax,
          medicareTax: created.medicareTax,
          additionalMedicareTax: created.additionalMedicareTax,
          stateIncomeTaxWithheld: created.stateIncomeTaxWithheld,
          stateUnemploymentTax: created.stateUnemploymentTax,
          stateDisabilityTax: created.stateDisabilityTax,
          statePaidFamilyLeaveTax: created.statePaidFamilyLeaveTax,
          totalAmount: created.totalAmount,
        },
        data.bankAccountId,
      );

      // Step 3 — link the journal entry back onto the deposit
      return tx.taxDeposit.update({
        where: { id: created.id },
        data: { journalEntryId },
        include: {
          journalEntry: {
            select: { id: true, entryNumber: true, date: true },
          },
        },
      });
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'tax_deposit.create',
      entityType: 'TaxDeposit',
      entityId: deposit.id,
      metadata: {
        taxAuthority: deposit.taxAuthority,
        formReference: deposit.formReference,
        taxPeriodYear: deposit.taxPeriodYear,
        taxPeriodQuarter: deposit.taxPeriodQuarter,
        totalAmount: deposit.totalAmount,
        journalEntryId: deposit.journalEntryId,
      },
    });

    return NextResponse.json(deposit);
  } catch (err) {
    console.error('Error creating tax deposit:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create tax deposit' },
      { status: 500 }
    );
  }
}
