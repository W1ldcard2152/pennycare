/**
 * Integration verification for payroll account resolution (lib/payroll-accounts.ts)
 * against a REAL database. Run against a COPY of the dev DB, never production:
 *
 *   Copy-Item prisma/prisma/pennycare.db tmp.db
 *   DATABASE_URL="file:/abs/tmp.db" npx tsx scripts/verify-payroll-accounts.ts
 *
 * Creates throwaway companies, exercises the cases, deletes them (cascade).
 */
import { prisma } from '../lib/db';
import { createPayrollJournalEntries, ensurePayrollAccounts } from '../lib/bookkeeping';
import type { Actor } from '../lib/journal-entry-service';
import {
  PayrollAccountError,
  describePayrollExpenseAccounts,
  resolvePayrollExpenseAccounts,
} from '../lib/payroll-accounts';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${!cond && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!cond) failures++;
}

const companyIds: string[] = [];
const userIds: string[] = [];

async function setup(name: string, accounts: Array<{ code: string; name: string; type: string }>) {
  const company = await prisma.company.create({ data: { companyName: name, approvalMode: 'single_user' } });
  companyIds.push(company.id);
  const owner = await prisma.user.create({
    data: { email: `owner-${company.id}@test.local`, passwordHash: 'x', firstName: 'Own', lastName: 'Er' },
  });
  userIds.push(owner.id);
  await prisma.userCompanyAccess.create({ data: { userId: owner.id, companyId: company.id, role: 'OWNER' } });
  for (const a of accounts) {
    await prisma.account.create({ data: { companyId: company.id, ...a, accountGroup: 'test' } });
  }
  const actor: Actor = { userId: owner.id, role: 'OWNER' };
  return { company, actor };
}

async function payrollRecord(companyId: string) {
  const employee = await prisma.employee.create({
    data: {
      companyId,
      firstName: 'Pat',
      lastName: 'Kelly',
      employeeNumber: 'E1',
      position: 'Tech',
      employmentType: 'full-time',
      payType: 'hourly',
      hireDate: new Date('2020-01-01T12:00:00Z'),
    },
  });
  const payDate = new Date('2026-05-08T12:00:00Z');
  return prisma.payrollRecord.create({
    data: {
      companyId,
      employeeId: employee.id,
      payPeriodStart: payDate,
      payPeriodEnd: payDate,
      payDate,
      regularHours: 40,
      regularPay: 1000,
      grossPay: 1000,
      taxableWages: 1000,
      federalTax: 100,
      socialSecurity: 62,
      employerSocialSecurity: 62,
      medicare: 14.5,
      employerMedicare: 14.5,
      stateTax: 40,
      employerSUI: 16.25,
      totalDeductions: 216.5,
      netPay: 783.5,
    },
  });
}

async function main() {
  try {
    // ---- A chart where 6000 is Shop Supplies (the live Phoenix case) -------
    const { company: a, actor: aActor } = await setup('PA Shop Supplies Co', [
      { code: '6000', name: 'Shop Supplies', type: 'expense' },
      { code: '6010', name: 'Employer Payroll Tax Expense', type: 'expense' },
      { code: '6100', name: 'Payroll Expenses-Employee Wages', type: 'expense' },
    ]);
    const recA = await payrollRecord(a.id);
    const described = await describePayrollExpenseAccounts(a.id);
    check('6000 Shop Supplies is reported as a problem for wages',
      described.find((r) => r.role === 'wages')?.status === 'problem', described);
    check('6010 Employer Payroll Tax Expense is accepted as the standard account',
      described.find((r) => r.role === 'employerTaxes')?.status === 'standard', described);
    let refused: unknown = null;
    try {
      await createPayrollJournalEntries(a.id, [recA.id], recA.payDate, 'test', aActor);
    } catch (e) {
      refused = e;
    }
    check('payroll refuses to post wages to Shop Supplies',
      refused instanceof PayrollAccountError && /Shop Supplies/.test((refused as Error).message), String(refused));
    check('no journal entry was created', (await prisma.journalEntry.count({ where: { companyId: a.id } })) === 0);

    const wages6100 = await prisma.account.findFirst({ where: { companyId: a.id, code: '6100' } });
    await prisma.company.update({ where: { id: a.id }, data: { payrollWagesAccountId: wages6100!.id } });
    const je = await createPayrollJournalEntries(a.id, [recA.id], recA.payDate, 'test', aActor);
    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: je!.entryId },
      include: { account: { select: { code: true } } },
    });
    const debitTo = (code: string) => lines.find((l) => l.account.code === code)?.debit ?? 0;
    check('mapped: gross wages post to 6100', debitTo('6100') === 1000, lines.map((l) => [l.account.code, l.debit, l.credit]));
    check('employer taxes post to 6010', debitTo('6010') > 0);
    check('nothing posts to 6000 Shop Supplies', !lines.some((l) => l.account.code === '6000'));

    // ---- A fresh chart: standard accounts are created ----------------------
    const { company: b, actor: bActor } = await setup('PA Fresh Co', []);
    const recB = await payrollRecord(b.id);
    await createPayrollJournalEntries(b.id, [recB.id], recB.payDate, 'test', bActor);
    const created = await prisma.account.findMany({ where: { companyId: b.id, code: { in: ['6000', '6010'] } } });
    check('fresh chart: 6000 and 6010 created from the catalog',
      created.length === 2 && created.some((x) => x.name === 'Wages & Salaries'), created.map((x) => [x.code, x.name]));

    // ---- 6020 already used for something else ------------------------------
    const { company: c } = await setup('PA Workers Comp Co', [
      { code: '6020', name: 'Workers Comp Expense', type: 'expense' },
      { code: '6021', name: 'Something Else', type: 'expense' },
    ]);
    const adj1 = await resolvePayrollExpenseAccounts(c.id, ['taxAdjustments']);
    const adjAcct = await prisma.account.findUnique({ where: { id: adj1.taxAdjustments } });
    check('Payroll Tax Adjustments created at the next free code, not on Workers Comp',
      adjAcct?.code === '6022' && adjAcct.name === 'Payroll Tax Adjustments', adjAcct);
    const adj2 = await resolvePayrollExpenseAccounts(c.id, ['taxAdjustments']);
    check('second use finds it by name instead of creating another', adj2.taxAdjustments === adj1.taxAdjustments);

    // ---- A liability code held by a non-liability ---------------------------
    const { company: d } = await setup('PA Asset At 2110 Co', [{ code: '2110', name: 'Petty Cash', type: 'asset' }]);
    let liabilityRefused: unknown = null;
    try {
      await ensurePayrollAccounts(d.id, ['2100', '2110']);
    } catch (e) {
      liabilityRefused = e;
    }
    check('payroll liability code held by an asset is refused',
      liabilityRefused instanceof PayrollAccountError && /Petty Cash/.test((liabilityRefused as Error).message), String(liabilityRefused));
  } finally {
    for (const id of companyIds) {
      await prisma.auditLog.deleteMany({ where: { companyId: id } });
      await prisma.company.delete({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  }

  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
