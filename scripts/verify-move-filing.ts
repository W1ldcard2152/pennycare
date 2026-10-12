/**
 * Integration verification for moving a filed return to another quarter
 * (moveFiling in lib/tax-filing-service.ts) against a REAL database. Run
 * against a COPY of the dev DB, never production:
 *
 *   Copy-Item prisma/prisma/pennycare.db tmp.db
 *   DATABASE_URL="file:/abs/tmp.db" npx tsx scripts/verify-move-filing.ts
 *
 * Creates a throwaway company with Q2 and Q3 2026 payroll (Q3 twice Q2),
 * exercises the moves, asserts, and deletes the company at the end.
 */
import { prisma } from '../lib/db';
import { createPayrollJournalEntries } from '../lib/bookkeeping';
import { JE_STATUS } from '../lib/je-status';
import type { Actor } from '../lib/journal-entry-service';
import { fileReturn, getQuarterAccruals, moveFiling, previewFiling, saveReturnDraft } from '../lib/tax-filing-service';

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
async function entryStatus(id: string | null) {
  if (!id) return null;
  return (await prisma.journalEntry.findUnique({ where: { id }, select: { status: true } }))?.status ?? null;
}
const filingIn = (companyId: string, year: number, quarter: number) =>
  prisma.taxFiling.findFirst({ where: { companyId, formType: '941', year, quarter } });
const fileInput = (quarter: number, overrides: Record<string, number> = {}) => ({
  formType: '941' as const, year: 2026, quarter, overrides,
  filedDate: '2026-10-05', filingMethod: 'IRS e-file', confirmationNumber: `CONF-Q${quarter}`, notes: null,
  acknowledgedNoDeposits: true,
});

async function main() {
  const company = await prisma.company.create({
    data: { companyName: 'Move-Filing Test Co', approvalMode: 'single_user', suiRate: 1.625, federalDepositSchedule: 'monthly' },
  });
  const userIds: string[] = [];
  try {
    const owner = await prisma.user.create({ data: { email: `owner-${company.id}@test.local`, passwordHash: 'x', firstName: 'Own', lastName: 'Er' } });
    const clerk = await prisma.user.create({ data: { email: `clerk-${company.id}@test.local`, passwordHash: 'x', firstName: 'Cle', lastName: 'Rk' } });
    userIds.push(owner.id, clerk.id);
    await prisma.userCompanyAccess.create({ data: { userId: owner.id, companyId: company.id, role: 'OWNER' } });
    await prisma.userCompanyAccess.create({ data: { userId: clerk.id, companyId: company.id, role: 'BOOKKEEPER' } });
    const ownerActor: Actor = { userId: owner.id, role: 'OWNER' };
    const clerkActor: Actor = { userId: clerk.id, role: 'BOOKKEEPER' };

    const employee = await prisma.employee.create({
      data: {
        companyId: company.id, firstName: 'Pat', lastName: 'Kelly', employeeNumber: 'E1', position: 'Tech',
        employmentType: 'full-time', payType: 'hourly', hireDate: new Date('2020-01-01T12:00:00Z'),
      },
    });
    // Q2: three $1,000 runs. Q3: three $2,000 runs (all tax figures doubled).
    const runs: Array<[string, number]> = [
      ['2026-04-10', 1], ['2026-05-08', 1], ['2026-06-12', 1],
      ['2026-07-10', 2], ['2026-08-07', 2], ['2026-09-11', 2],
    ];
    for (const [iso, k] of runs) {
      const payDate = new Date(`${iso}T12:00:00Z`);
      const rec = await prisma.payrollRecord.create({
        data: {
          companyId: company.id, employeeId: employee.id, payPeriodStart: payDate, payPeriodEnd: payDate, payDate,
          regularHours: 40, regularPay: 1000 * k, grossPay: 1000 * k, taxableWages: 1000 * k,
          federalTax: 100 * k, socialSecurity: 62 * k, employerSocialSecurity: 62 * k,
          medicare: 14.5 * k, employerMedicare: 14.5 * k, stateTax: 40 * k, employerSUI: 16.25 * k,
          totalDeductions: 216.5 * k, netPay: 783.5 * k,
        },
      });
      await createPayrollJournalEntries(company.id, [rec.id], payDate, iso, ownerActor);
    }

    // ---- 1. A return filed under Q2 that belongs in Q3 ------------------------
    const q3 = await previewFiling(company.id, '941', 2026, 3, {});
    check('Q3 computed federal withholding is 600', q3.values.line3 === 600, q3.values.line3);
    // Recorded under Q2, but with the Q3 figures typed in — the Q3 return.
    const wrong = await fileReturn(ownerActor, company.id, fileInput(2, { line3: 600 }));
    const q2Entry = wrong.adjustmentEntry?.id ?? null;
    check('filing under Q2 posted an adjusting entry there', q2Entry !== null);

    await expectThrow('a Bookkeeper cannot move a filing with an adjusting entry', () =>
      moveFiling(clerkActor, company.id, wrong.filing.id, { year: 2026, quarter: 3 }), /APPROVER/);
    check('failed move rolled back — still recorded for Q2', (await prisma.taxFiling.findUnique({ where: { id: wrong.filing.id } }))?.quarter === 2);

    const moved = await moveFiling(ownerActor, company.id, wrong.filing.id, { year: 2026, quarter: 3 });
    const after = await prisma.taxFiling.findUnique({ where: { id: wrong.filing.id } });
    check('filing now recorded for Q3', after?.quarter === 3 && after.year === 2026);
    check('filed date and confirmation number kept', after?.confirmationNumber === 'CONF-Q2' && after.status === 'filed');
    check('Q2 adjusting entry voided', (await entryStatus(q2Entry)) === JE_STATUS.VOIDED);
    check('Q2 no longer has a filing', (await filingIn(company.id, 2026, 2)) === null);
    const newEntry = await prisma.journalEntry.findUnique({ where: { id: after!.adjustmentEntryId ?? '' } });
    check('Q3 adjustment (if any) is dated the last day of Q3',
      after?.adjustmentEntryId === null || newEntry?.date.toISOString() === '2026-09-30T12:00:00.000Z', newEntry?.date);
    const q3Acc = await getQuarterAccruals(prisma, company.id, '941', 2026, 3);
    check('Q3 federal withholding (2110) stands at the filed 600', q3Acc['2110'] === 600, q3Acc);
    check('a Q3 return with Q3 figures shows no payroll mismatch on line 3',
      !moved.moved[0].differsFromPayroll.includes('line3'), moved.moved[0].differsFromPayroll);

    // ---- 2. Occupied target: refuse, then swap --------------------------------
    // Now record the Q2 return under Q2, with a typed difference so it posts an entry.
    const q2Real = await fileReturn(ownerActor, company.id, fileInput(2, { line3: 301 }));
    await expectThrow('moving into a quarter that has a filed return is refused', () =>
      moveFiling(ownerActor, company.id, wrong.filing.id, { year: 2026, quarter: 2 }), /swap/i);
    const swapped = await moveFiling(ownerActor, company.id, wrong.filing.id, { year: 2026, quarter: 2, swap: true });
    const a = await prisma.taxFiling.findUnique({ where: { id: wrong.filing.id } });
    const b = await prisma.taxFiling.findUnique({ where: { id: q2Real.filing.id } });
    check('swap: the two filings traded quarters', swapped.swapped && a?.quarter === 2 && b?.quarter === 3, { a: a?.quarter, b: b?.quarter });
    check('swap: the old Q2 entry was voided', (await entryStatus(q2Real.adjustmentEntry?.id ?? null)) === JE_STATUS.VOIDED);
    const accQ2 = await getQuarterAccruals(prisma, company.id, '941', 2026, 2);
    const accQ3 = await getQuarterAccruals(prisma, company.id, '941', 2026, 3);
    check('swap: each quarter trued to the return now recorded for it', accQ2['2110'] === 600 && accQ3['2110'] === 301, { accQ2, accQ3 });
    check('swap: a mismatch is flagged when the figures don\'t fit the quarter',
      swapped.moved.every((m) => m.differsFromPayroll.includes('line3')), swapped.moved.map((m) => m.differsFromPayroll));

    // ---- 3. Status-only (1.1.1-era) filing; draft in the target replaced -----
    const legacy = await prisma.taxFiling.create({
      data: { companyId: company.id, formType: '941', year: 2025, quarter: 4, status: 'filed', filedDate: new Date('2026-01-30T12:00:00Z') },
    });
    await saveReturnDraft(ownerActor, company.id, '941', 2026, 1, { line3: 5 });
    const draft = await filingIn(company.id, 2026, 1);
    check('a draft sits in Q1 2026', draft?.status === 'pending');
    const legacyMoved = await moveFiling(clerkActor, company.id, legacy.id, { year: 2026, quarter: 1 });
    const legacyAfter = await prisma.taxFiling.findUnique({ where: { id: legacy.id } });
    check('a Bookkeeper can move a status-only filing (no entry to void)', legacyAfter?.year === 2026 && legacyAfter.quarter === 1);
    check('status-only move posts no adjusting entry', legacyMoved.moved[0].adjustmentEntry === null && legacyAfter?.adjustmentEntryId === null);
    check('the Q1 draft was replaced', (await prisma.taxFiling.findUnique({ where: { id: draft!.id } })) === null);

    // ---- 4. Guards ------------------------------------------------------------
    await expectThrow('moving to the same quarter is refused', () =>
      moveFiling(ownerActor, company.id, legacy.id, { year: 2026, quarter: 1 }), /already recorded/);
    await saveReturnDraft(ownerActor, company.id, '941', 2026, 4, {});
    const pending = await filingIn(company.id, 2026, 4);
    await expectThrow('a draft (not filed) cannot be moved', () =>
      moveFiling(ownerActor, company.id, pending!.id, { year: 2026, quarter: 3, swap: true }), /Only a filed return/);
    const audits = await prisma.auditLog.count({ where: { companyId: company.id, action: 'tax_filing.move' } });
    check('every moved filing is audited (1 + 2 swapped + 1 legacy)', audits === 4, audits);
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
