/**
 * Integration verification for booking NY RSF in payroll against a REAL
 * database: the calculator's RSF lands on the PayrollRecord, the payroll JE
 * carries it in 6010 and 2160, and an unedited NYS-45 then needs no 2160
 * true-up. Run against a COPY of the dev DB, never production:
 *
 *   Copy-Item prisma/prisma/pennycare.db tmp.db
 *   DATABASE_URL="file:/abs/tmp.db" npx tsx scripts/verify-payroll-rsf.ts
 *
 * Creates a throwaway company with one employee and three Q2 2026 pay runs,
 * asserts, and deletes the company (cascade) at the end.
 */
import { prisma } from '../lib/db';
import { createPayrollJournalEntries } from '../lib/bookkeeping';
import { calculatePayroll } from '../lib/payrollCalculations';
import type { Actor } from '../lib/journal-entry-service';
import { previewFiling } from '../lib/tax-filing-service';

let failures = 0;
function check(name: string, cond: boolean, detail?: unknown) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}${!cond && detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`);
  if (!cond) failures++;
}

async function main() {
  const company = await prisma.company.create({
    data: { companyName: 'RSF Test Co', approvalMode: 'single_user', suiRate: 1.625, federalDepositSchedule: 'monthly' },
  });
  const userIds: string[] = [];
  try {
    const owner = await prisma.user.create({
      data: { email: `owner-${company.id}@test.local`, passwordHash: 'x', firstName: 'Own', lastName: 'Er' },
    });
    userIds.push(owner.id);
    await prisma.userCompanyAccess.create({ data: { userId: owner.id, companyId: company.id, role: 'OWNER' } });
    const actor: Actor = { userId: owner.id, role: 'OWNER' };

    const employee = await prisma.employee.create({
      data: {
        companyId: company.id, firstName: 'Pat', lastName: 'Kelly', employeeNumber: 'E1', position: 'Tech',
        employmentType: 'full-time', payType: 'hourly', hireDate: new Date('2020-01-01T12:00:00Z'),
        stateFilingStatus: 'single', stateAllowances: 0,
      },
    });

    // $1,000 week: SUI 1.625% = 16.25, RSF 0.075% = 0.75.
    const result = calculatePayroll({
      regularHours: 40, overtimeHours: 0, hourlyRate: 25, overtimeMultiplier: 1.5,
      w4FilingStatus: 'single', w4Allowances: 0, stateFilingStatus: 'single', stateAllowances: 0,
      taxYear: 2026, ytdGrossPay: 0, ytdSocialSecurity: 0, ytdMedicare: 0, suiRate: 1.625,
    });
    check('calculator RSF on a $1,000 week is $0.75', result.nyRSFEmployer === 0.75, result.nyRSFEmployer);

    const entryIds: string[] = [];
    for (const iso of ['2026-04-10', '2026-05-08', '2026-06-12']) {
      const payDate = new Date(`${iso}T12:00:00Z`);
      const rec = await prisma.payrollRecord.create({
        data: {
          companyId: company.id, employeeId: employee.id,
          payPeriodStart: payDate, payPeriodEnd: payDate, payDate,
          regularHours: 40, regularPay: result.regularPay, grossPay: result.grossPay, taxableWages: result.taxableWages,
          federalTax: result.federalIncomeTax, stateTax: result.stateIncomeTax,
          socialSecurity: result.socialSecurityEmployee, medicare: result.medicareEmployee,
          nySDI: result.nySDI, nyPFL: result.nyPFL, totalTaxWithholdings: result.totalTaxWithholdings,
          totalDeductions: result.totalDeductions, netPay: result.netPay,
          employerSocialSecurity: result.socialSecurityEmployer, employerMedicare: result.medicareEmployer,
          employerSUI: result.suiEmployer, employerRSF: result.nyRSFEmployer, employerFUTA: result.futaEmployer,
          totalEmployerCost: result.totalEmployerCost,
        },
      });
      const je = await createPayrollJournalEntries(company.id, [rec.id], payDate, iso, actor);
      entryIds.push(je!.entryId);
    }

    const je = await prisma.journalEntry.findUnique({
      where: { id: entryIds[0] },
      include: { lines: { include: { account: true } } },
    });
    const line = (code: string) => je!.lines.find((l) => l.account.code === code);
    check('2160 credited SUI + RSF (17.00)', line('2160')?.credit === 17, line('2160'));
    check('2160 line labelled SUI + RSF', line('2160')?.description === 'SUI + RSF', line('2160')?.description);
    const employerTaxes = result.socialSecurityEmployer + result.medicareEmployer + result.futaEmployer + 16.25 + 0.75;
    check('6010 includes RSF', Math.abs((line('6010')?.debit ?? 0) - employerTaxes) <= 0.01, { debit: line('6010')?.debit, employerTaxes });
    const debits = je!.lines.reduce((s, l) => s + l.debit, 0);
    const credits = je!.lines.reduce((s, l) => s + l.credit, 0);
    check('payroll JE balances', Math.abs(debits - credits) < 0.005, { debits, credits });

    // Quarter: 3 × $1,000 subject wages → line 4 48.75, line 5 2.25, line 6 51.00
    const nys = await previewFiling(company.id, 'nys45', 2026, 2, {});
    check('NYS-45 line 6 = 48.75 UI + 2.25 RSF', nys.values.line6 === 51, nys.values.line6);
    const sui = nys.adjustments.find((a) => a.code === '2160')!;
    check('2160 already booked at the filed figure — no true-up', sui.booked === 51 && sui.amount === 0, sui);
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
