/**
 * Integration verification for filing editable returns (lib/tax-filing-service.ts)
 * against a REAL database: the adjusting entry, payment recording, re-filing,
 * role guard, unfile, and draft rules. Run against a COPY of the dev DB, never
 * production:
 *
 *   Copy-Item prisma/prisma/pennycare.db tmp.db
 *   DATABASE_URL="file:/abs/tmp.db" npx tsx scripts/verify-tax-filing.ts
 *
 * Creates a throwaway company with one employee and three Q2 2026 payroll
 * runs (booked through the real payroll → JE bridge), exercises the flows,
 * asserts, and deletes the company (cascade) at the end.
 */
import { prisma } from '../lib/db';
import { createPayrollJournalEntries } from '../lib/bookkeeping';
import { JE_STATUS } from '../lib/je-status';
import type { Actor } from '../lib/journal-entry-service';
import {
  fileReturn,
  getQuarterAccruals,
  previewFiling,
  saveReturnDraft,
  withdrawFiling,
} from '../lib/tax-filing-service';
import { parseSavedReturn } from '../lib/tax-return-values';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${!cond && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!cond) failures++;
}
async function expectThrow(name: string, fn: () => Promise<unknown>, match?: RegExp) {
  try {
    await fn();
    check(name, false, 'did not throw');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    check(name, !match || match.test(msg), msg);
  }
}
const r2 = (n: number) => Math.round(n * 100) / 100;

async function entryStatus(id: string | null) {
  if (!id) return null;
  return (await prisma.journalEntry.findUnique({ where: { id }, select: { status: true } }))?.status ?? null;
}

async function main() {
  const company = await prisma.company.create({
    data: {
      companyName: 'Tax-Filing Test Co',
      approvalMode: 'single_user',
      suiRate: 1.625,
      federalDepositSchedule: 'monthly',
    },
  });
  const userIds: string[] = [];
  try {
    const owner = await prisma.user.create({
      data: { email: `owner-${company.id}@test.local`, passwordHash: 'x', firstName: 'Own', lastName: 'Er' },
    });
    const clerk = await prisma.user.create({
      data: { email: `clerk-${company.id}@test.local`, passwordHash: 'x', firstName: 'Cle', lastName: 'Rk' },
    });
    userIds.push(owner.id, clerk.id);
    await prisma.userCompanyAccess.create({ data: { userId: owner.id, companyId: company.id, role: 'OWNER' } });
    await prisma.userCompanyAccess.create({ data: { userId: clerk.id, companyId: company.id, role: 'BOOKKEEPER' } });
    const ownerActor: Actor = { userId: owner.id, role: 'OWNER' };
    const clerkActor: Actor = { userId: clerk.id, role: 'BOOKKEEPER' };

    const bank = await prisma.account.create({
      data: { companyId: company.id, code: '1010', name: 'Checking', type: 'asset', accountGroup: 'Cash' },
    });
    const employee = await prisma.employee.create({
      data: {
        companyId: company.id,
        firstName: 'Pat',
        lastName: 'Kelly',
        employeeNumber: 'E1',
        position: 'Tech',
        employmentType: 'full-time',
        payType: 'hourly',
        hireDate: new Date('2020-01-01T12:00:00Z'),
      },
    });

    // Three pay runs. SUI 1.625% of 1000 = 16.25; RSF (0.075%) is NOT booked by
    // payroll, so the NYS-45 always trues up line 5.
    for (const iso of ['2026-04-10', '2026-05-08', '2026-06-12']) {
      const payDate = new Date(`${iso}T12:00:00Z`);
      const rec = await prisma.payrollRecord.create({
        data: {
          companyId: company.id,
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
      await createPayrollJournalEntries(company.id, [rec.id], payDate, iso, ownerActor);
    }

    // ---- NYS-45 ------------------------------------------------------------
    const nys = { formType: 'nys45' as const, year: 2026, quarter: 2 };
    const base = await previewFiling(company.id, 'nys45', 2026, 2, {});
    check('computed line 6 = 48.75 UI + 2.25 RSF', base.values.line6 === 51, base.values.line6);
    const sui0 = base.adjustments.find((a) => a.code === '2160')!;
    check('unedited NYS-45 trues up only the unbooked RSF', sui0.booked === 48.75 && sui0.amount === 2.25, sui0);
    check('withholding already matches', base.adjustments.find((a) => a.code === '2120')!.amount === 0);

    // NY's calculator said UI is $1.10 higher than CV Books computed.
    const ny = { line6: 52.1 };
    const filed = await fileReturn(ownerActor, company.id, {
      ...nys,
      overrides: ny,
      filedDate: '2026-07-20',
      filingMethod: 'NY Online Services',
      confirmationNumber: 'NY-1',
      notes: null,
      payment: {
        bankAccountId: bank.id,
        depositDate: '2026-07-20',
        paymentMethod: 'NY Online Services',
        confirmationNumber: null,
        components: {
          ...base.payment.components,
          stateUnemploymentTax: 52.1,
        },
      },
    });
    const adj1 = await prisma.journalEntry.findUnique({
      where: { id: filed.adjustmentEntry!.id },
      include: { lines: { include: { account: true } } },
    });
    check('adjusting entry booked', adj1?.status === JE_STATUS.BOOKED);
    check('adjusting entry dated last day of quarter', adj1?.date.toISOString() === '2026-06-30T12:00:00.000Z', adj1?.date);
    check('adjusting entry source', adj1?.source === 'tax_filing_adjustment' && adj1.sourceId === filed.filing.id);
    const line = (code: string) => adj1!.lines.find((l) => l.account.code === code);
    check('2160 credited 3.35 (52.10 filed − 48.75 accrued)', line('2160')?.credit === 3.35, line('2160'));
    check('6020 Payroll Tax Adjustments debited 3.35', line('6020')?.debit === 3.35, line('6020'));
    const acc1 = await getQuarterAccruals(prisma, company.id, 'nys45', 2026, 2);
    check('2160 quarter accrual now equals filed line 8', acc1['2160'] === 52.1, acc1);

    const deposit = await prisma.taxDeposit.findUnique({ where: { id: filed.deposit!.id } });
    check('payment recorded as NYS-45 deposit', deposit?.formReference === 'NYS-45' && deposit.journalEntryId !== null);
    check('payment = line 10 + line 20', deposit?.totalAmount === r2(52.1 + base.values.line20), deposit?.totalAmount);
    const suiLines = await prisma.journalEntryLine.findMany({
      where: { account: { companyId: company.id, code: '2160' }, journalEntry: { status: JE_STATUS.BOOKED } },
    });
    check('2160 nets to zero after payment', r2(suiLines.reduce((s, l) => s + l.credit - l.debit, 0)) === 0);

    const saved = parseSavedReturn((await prisma.taxFiling.findUnique({ where: { id: filed.filing.id } }))!.formDataJson);
    check('filed values frozen with overrides', saved?.values.line6 === 52.1 && saved?.overrides.line6 === 52.1);

    // Drafts are refused once filed.
    await expectThrow('save draft on a filed return is refused', () =>
      saveReturnDraft(ownerActor, company.id, 'nys45', 2026, 2, {}), /already filed/);

    // A bookkeeper cannot re-file once an adjusting entry exists (void needs APPROVER).
    await expectThrow('bookkeeper cannot re-file over an adjusting entry', () =>
      fileReturn(clerkActor, company.id, { ...nys, overrides: { line6: 53 }, filedDate: '2026-07-21', filingMethod: 'Other', confirmationNumber: null, notes: null }),
      /APPROVER/);
    check('failed re-file rolled back — first entry still booked', (await entryStatus(adj1!.id)) === JE_STATUS.BOOKED);

    // Re-file with a different figure: old entry voided, new one replaces it.
    const refiled = await fileReturn(ownerActor, company.id, {
      ...nys, overrides: { line6: 50 }, filedDate: '2026-07-21', filingMethod: 'Other', confirmationNumber: null, notes: null,
    });
    check('re-file voids the earlier adjusting entry', (await entryStatus(adj1!.id)) === JE_STATUS.VOIDED);
    const adj2 = await prisma.journalEntry.findUnique({
      where: { id: refiled.adjustmentEntry!.id },
      include: { lines: { include: { account: true } } },
    });
    check('re-file credits 2160 1.25 (50.00 filed − 48.75 accrued)', adj2?.lines.find((l) => l.account.code === '2160')?.credit === 1.25, adj2?.lines.map((l) => [l.account.code, l.debit, l.credit]));
    const refileAudit = await prisma.auditLog.findFirst({ where: { companyId: company.id, action: 'tax_filing.refile' } });
    check('re-file audited', refileAudit !== null);

    // Unfile: entry voided, edits kept as a draft, payment untouched.
    await withdrawFiling(ownerActor, company.id, filed.filing.id, 'unfile');
    const afterUnfile = await prisma.taxFiling.findUnique({ where: { id: filed.filing.id } });
    check('unfile voids the adjusting entry', (await entryStatus(adj2!.id)) === JE_STATUS.VOIDED);
    check('unfile keeps edits as a pending draft', afterUnfile?.status === 'pending' && afterUnfile.formDataJson !== null && afterUnfile.adjustmentEntryId === null);
    check('unfile leaves the payment alone', (await prisma.taxDeposit.findUnique({ where: { id: deposit!.id } }))?.status === 'recorded');
    await saveReturnDraft(clerkActor, company.id, 'nys45', 2026, 2, { line6: 49 });
    check('draft save works once unfiled', parseSavedReturn((await prisma.taxFiling.findUnique({ where: { id: filed.filing.id } }))!.formDataJson)?.overrides.line6 === 49);
    const relook = await previewFiling(company.id, 'nys45', 2026, 2, {});
    check('payment with return is not counted as an NYS-1 payment (line 15)', relook.values.line15 === 0, relook.values.line15);

    // ---- Form 941 -----------------------------------------------------------
    const fed = await previewFiling(company.id, '941', 2026, 2, {});
    check('unedited 941 needs no adjusting entry', fed.adjustments.every((a) => a.amount === 0), fed.adjustments);
    const fedFiled = await fileReturn(clerkActor, company.id, {
      formType: '941', year: 2026, quarter: 2, overrides: {}, filedDate: '2026-07-25',
      filingMethod: 'IRS e-file', confirmationNumber: null, notes: null, acknowledgedNoDeposits: true,
    });
    check('bookkeeper can file when nothing needs voiding', fedFiled.filing.status === 'filed' && fedFiled.adjustmentEntry === null);
    await expectThrow('bad override key rejected', () =>
      previewFiling(company.id, '941', 2026, 2, { line99: 1 }), /Unknown line/);
    const fedEdit = await previewFiling(company.id, '941', 2026, 2, { line3: 299 });
    check('941 line 3 edit trues 2110', fedEdit.adjustments.find((a) => a.code === '2110')?.amount === -1, fedEdit.adjustments);

    // Void (recorded in error) keeps the row, marks it voided.
    await withdrawFiling(ownerActor, company.id, fedFiled.filing.id, 'void');
    check('void marks the filing voided', (await prisma.taxFiling.findUnique({ where: { id: fedFiled.filing.id } }))?.status === 'voided');
  } finally {
    await prisma.auditLog.deleteMany({ where: { companyId: company.id } });
    await prisma.company.delete({ where: { id: company.id } });
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
