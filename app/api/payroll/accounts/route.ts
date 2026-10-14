import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { validateRequest } from '@/lib/validation';
import { logAudit } from '@/lib/audit';
import {
  PAYROLL_EXPENSE_ROLES,
  PAYROLL_EXPENSE_ROLE_KEYS,
  describePayrollExpenseAccounts,
  validatePayrollAccountChoice,
} from '@/lib/payroll-accounts';

// GET /api/payroll/accounts — the expense accounts payroll posts to, how each
// was resolved (Settings choice / standard code / to be created / problem),
// and the active expense accounts that can be chosen.
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess('BOOKKEEPER');
    if (error) return error;

    const [company, resolutions, expenseAccounts] = await Promise.all([
      prisma.company.findUnique({
        where: { id: companyId! },
        select: { payrollWagesAccountId: true, payrollTaxExpenseAccountId: true, payrollTaxAdjustmentsAccountId: true },
      }),
      describePayrollExpenseAccounts(companyId!),
      prisma.account.findMany({
        where: { companyId: companyId!, type: 'expense', isActive: true },
        select: { id: true, code: true, name: true },
        orderBy: { code: 'asc' },
      }),
    ]);

    return NextResponse.json({
      roles: resolutions.map((r) => {
        const def = PAYROLL_EXPENSE_ROLES[r.role];
        return { ...r, label: def.label, standardCode: def.code, chosenAccountId: company?.[def.field] ?? null };
      }),
      expenseAccounts,
    });
  } catch (err) {
    console.error('Error loading payroll accounts:', err);
    return NextResponse.json({ error: 'Failed to load payroll accounts' }, { status: 500 });
  }
}

const choiceSchema = z.string().min(1).nullable().optional();
const payrollAccountsSchema = z.object({
  wages: choiceSchema,
  employerTaxes: choiceSchema,
  taxAdjustments: choiceSchema,
});

// PUT /api/payroll/accounts — choose the account for each role; null goes back
// to the standard code. Only affects entries posted from now on.
export async function PUT(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('APPROVER');
    if (error) return error;

    const validation = validateRequest(payrollAccountsSchema, await request.json());
    if (!validation.success) {
      return NextResponse.json({ error: 'Validation failed', details: validation.errors }, { status: 400 });
    }

    const data: Record<string, string | null> = {};
    for (const role of PAYROLL_EXPENSE_ROLE_KEYS) {
      const choice = validation.data[role];
      if (choice === undefined) continue;
      const problem = await validatePayrollAccountChoice(companyId!, choice);
      if (problem) {
        return NextResponse.json({ error: `${PAYROLL_EXPENSE_ROLES[role].label}: ${problem}` }, { status: 400 });
      }
      data[PAYROLL_EXPENSE_ROLES[role].field] = choice;
    }

    const select = { payrollWagesAccountId: true, payrollTaxExpenseAccountId: true, payrollTaxAdjustmentsAccountId: true };
    const before = await prisma.company.findUnique({ where: { id: companyId! }, select });
    const after = await prisma.company.update({ where: { id: companyId! }, data, select });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'company.payroll_accounts',
      entityType: 'Company',
      entityId: companyId!,
      before,
      after,
    });

    return NextResponse.json(after);
  } catch (err) {
    console.error('Error saving payroll accounts:', err);
    return NextResponse.json({ error: 'Failed to save payroll accounts' }, { status: 500 });
  }
}
