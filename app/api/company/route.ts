import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { encrypt, safeDecrypt } from '@/lib/encryption';
import { MIN_OVERTIME_MULTIPLIER } from '@/lib/payrollCalculations';

// GET /api/company - Get company settings for current company
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess('VIEWER');
    if (error) return error;

    const company = await prisma.company.findUnique({
      where: { id: companyId! },
    });

    if (!company) {
      return NextResponse.json(
        { error: 'Company not found' },
        { status: 404 }
      );
    }

    // Return decrypted bank info under plaintext field names alongside the
    // existing *Encrypted columns, so the settings UI can edit them directly.
    return NextResponse.json({
      ...company,
      bankRoutingNumber: safeDecrypt(company.bankRoutingNumberEncrypted),
      bankAccountNumber: safeDecrypt(company.bankAccountNumberEncrypted),
    });
  } catch (error) {
    console.error('Error fetching company:', error);
    return NextResponse.json(
      { error: 'Failed to fetch company settings' },
      { status: 500 }
    );
  }
}

// PUT /api/company - Update company settings for current company
export async function PUT(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('OWNER');
    if (error) return error;

    const data = await request.json();

    // Pull plaintext bank fields off the payload and convert to encrypted columns.
    // Strip the decrypted-only fields and the *Encrypted fields from the payload
    // so Prisma doesn't try to write them directly.
    const {
      bankRoutingNumber,
      bankAccountNumber,
      bankRoutingNumberEncrypted: _ignoreRouting,
      bankAccountNumberEncrypted: _ignoreAccount,
      // Payroll account mapping is validated and audited by /api/payroll/accounts.
      payrollWagesAccountId: _ignoreWages,
      payrollTaxExpenseAccountId: _ignoreTaxExpense,
      payrollTaxAdjustmentsAccountId: _ignoreTaxAdjustments,
      ...rest
    } = data;
    void _ignoreRouting;
    void _ignoreAccount;
    void _ignoreWages;
    void _ignoreTaxExpense;
    void _ignoreTaxAdjustments;

    // Overtime is labor law, not a preference: hours past 40 in a workweek are
    // paid at no less than 1.5x (FLSA / NY). A higher multiplier is allowed.
    if (
      rest.overtimeMultiplier !== undefined &&
      !(typeof rest.overtimeMultiplier === 'number' && rest.overtimeMultiplier >= MIN_OVERTIME_MULTIPLIER)
    ) {
      return NextResponse.json(
        { error: `Overtime multiplier must be at least ${MIN_OVERTIME_MULTIPLIER} (time and a half).` },
        { status: 400 }
      );
    }

    if (rest.nys1FilerDays !== undefined && rest.nys1FilerDays !== 3 && rest.nys1FilerDays !== 5) {
      return NextResponse.json({ error: 'NYS-1 filer status must be 3 or 5 business days.' }, { status: 400 });
    }

    const updateData: Record<string, unknown> = { ...rest };
    if (bankRoutingNumber !== undefined) {
      updateData.bankRoutingNumberEncrypted = bankRoutingNumber
        ? encrypt(bankRoutingNumber)
        : null;
    }
    if (bankAccountNumber !== undefined) {
      updateData.bankAccountNumberEncrypted = bankAccountNumber
        ? encrypt(bankAccountNumber)
        : null;
    }

    const company = await prisma.company.update({
      where: { id: companyId! },
      data: updateData,
    });

    return NextResponse.json(company);
  } catch (error) {
    console.error('Error updating company:', error);
    return NextResponse.json(
      { error: 'Failed to update company settings' },
      { status: 500 }
    );
  }
}
