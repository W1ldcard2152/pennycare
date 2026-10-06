/**
 * Data loading for the quarterly returns. Fetches the Prisma rows each builder
 * needs and runs it, so the form routes (preview + PDF) and the filing service
 * (lib/tax-filing-service.ts) compute the return from exactly the same inputs.
 */

import { prisma } from './db';
import { decrypt } from './encryption';
import {
  buildNys45,
  quarterBounds,
  type Nys45EmployeeInput,
  type Nys45RecordInput,
} from './nys45';
import { buildForm941, type Form941EmployeeInput, type Form941RecordInput } from './form941';

const NY_AUTHORITIES = ['ny_withholding', 'ny_sui', 'ny_dbl_pfl'];

export async function loadNys45(companyId: string, year: number, quarter: number) {
  const { start: dateStart, end: dateEnd } = quarterBounds(year, quarter);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      companyName: true,
      legalBusinessName: true,
      fein: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      phone: true,
      stateUIClientId: true,
      stateTaxId: true,
      suiRate: true,
    },
  });
  if (!company) return null;

  // Pull every ACTIVE record from Jan 1 through the end of the quarter. The
  // wage-base split on line 2 is "since January 1", so earlier quarters are
  // needed to know how much of each employee's base is already used up.
  // Voided and corrected records are excluded — they are not remuneration
  // paid, and including them overstates the return.
  const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const records = await prisma.payrollRecord.findMany({
    where: {
      companyId,
      status: 'active',
      payDate: { gte: yearStart, lte: dateEnd },
    },
    include: {
      employee: {
        select: {
          id: true,
          firstName: true,
          lastName: true,
          middleName: true,
          taxIdEncrypted: true,
          unemploymentTaxability: true,
          hireDate: true,
          terminationDate: true,
          nycResident: true,
          yonkersResident: true,
          yonkersNonResident: true,
          ytdGrossPaySeed: true,
          ytdSeedAsOfDate: true,
        },
      },
    },
    orderBy: { payDate: 'asc' },
  });

  const employeeMap = new Map<string, Nys45EmployeeInput>();
  for (const r of records) {
    if (employeeMap.has(r.employee.id)) continue;
    let ssn: string | null = null;
    if (r.employee.taxIdEncrypted) {
      try {
        ssn = decrypt(r.employee.taxIdEncrypted) || null;
      } catch {
        ssn = null;
      }
    }
    employeeMap.set(r.employee.id, {
      id: r.employee.id,
      firstName: r.employee.firstName,
      lastName: r.employee.lastName,
      middleName: r.employee.middleName,
      ssn,
      unemploymentTaxability: r.employee.unemploymentTaxability,
      hireDate: r.employee.hireDate,
      terminationDate: r.employee.terminationDate,
      nycResident: r.employee.nycResident,
      yonkersResident: r.employee.yonkersResident,
      yonkersNonResident: r.employee.yonkersNonResident,
      ytdGrossPaySeed: r.employee.ytdGrossPaySeed,
      ytdSeedAsOfDate: r.employee.ytdSeedAsOfDate,
    });
  }

  const yearRecords: Nys45RecordInput[] = records.map((r) => ({
    employeeId: r.employee.id,
    payDate: r.payDate,
    payPeriodStart: r.payPeriodStart,
    payPeriodEnd: r.payPeriodEnd,
    grossPay: r.grossPay,
    taxableWages: r.taxableWages,
    stateTax: r.stateTax,
    localTax: r.localTax,
    employerSUI: r.employerSUI,
    employerRSF: r.employerRSF,
  }));

  const [depositRows, filing] = await Promise.all([
    prisma.taxDeposit.findMany({
      where: {
        companyId,
        taxAuthority: { in: NY_AUTHORITIES },
        taxPeriodYear: year,
        taxPeriodQuarter: `Q${quarter}`,
        status: 'recorded',
      },
      orderBy: { depositDate: 'asc' },
      select: {
        id: true,
        depositDate: true,
        paymentMethod: true,
        confirmationNumber: true,
        taxAuthority: true,
        formReference: true,
        stateIncomeTaxWithheld: true,
        stateUnemploymentTax: true,
        stateDisabilityTax: true,
        statePaidFamilyLeaveTax: true,
      },
    }),
    prisma.taxFiling.findFirst({
      where: { companyId, formType: 'nys45', year, quarter },
      include: { adjustmentEntry: { select: { id: true, entryNumber: true, status: true } } },
    }),
  ]);

  // Line 15 is specifically NYS-1 *withholding* payments made during the
  // quarter. Withholding remitted with the NYS-45 itself (recorded when the
  // return is filed) is line 20, not line 15 — counting it here would make the
  // return claim it twice. UI contributions are remitted with the NYS-45 and
  // belong to Part A, so they are tracked separately.
  const nys1Payments = depositRows
    .filter((d) => d.formReference !== 'NYS-45')
    .reduce((s, d) => s + d.stateIncomeTaxWithheld, 0);
  const withholdingDeposits = depositRows.reduce((s, d) => s + d.stateIncomeTaxWithheld, 0);
  const uiDeposits = depositRows.reduce((s, d) => s + d.stateUnemploymentTax, 0);
  const sdiPflDeposits = depositRows.reduce(
    (s, d) => s + d.stateDisabilityTax + d.statePaidFamilyLeaveTax,
    0
  );

  const form45 = buildNys45({
    year,
    quarter,
    uiRate: company.suiRate || 0,
    employees: [...employeeMap.values()],
    yearRecords,
    nys1Payments,
  });

  // Records that actually fall inside the quarter — the year-to-date pull
  // above deliberately reaches back further.
  const quarterRecords = records.filter((r) => r.payDate >= dateStart && r.payDate <= dateEnd);

  return {
    company,
    dateStart,
    dateEnd,
    quarterRecords,
    form45,
    depositRows,
    depositTotals: { withholding: withholdingDeposits, ui: uiDeposits, sdiPfl: sdiPflDeposits },
    filing,
  };
}

export async function loadForm941(companyId: string, year: number, quarter: number) {
  const { start: dateStart, end: dateEnd } = quarterBounds(year, quarter);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      companyName: true,
      legalBusinessName: true,
      fein: true,
      address: true,
      city: true,
      state: true,
      zipCode: true,
      phone: true,
      federalDepositSchedule: true,
    },
  });
  if (!company) return null;

  // Pull every ACTIVE record from Jan 1 through the end of the quarter. The
  // Social Security cap and the additional-Medicare threshold are year-to-date,
  // so earlier quarters are needed even though they are not reported. Voided
  // and corrected records are excluded — they are not wages paid.
  const yearStart = new Date(Date.UTC(year, 0, 1, 0, 0, 0, 0));
  const records = await prisma.payrollRecord.findMany({
    where: {
      companyId,
      status: 'active',
      payDate: { gte: yearStart, lte: dateEnd },
    },
    include: {
      employee: {
        select: {
          id: true,
          socialSecurityTaxability: true,
          medicareTaxability: true,
          hireDate: true,
          terminationDate: true,
          ytdGrossPaySeed: true,
          ytdSeedAsOfDate: true,
        },
      },
    },
    orderBy: { payDate: 'asc' },
  });

  const employeeMap = new Map<string, Form941EmployeeInput>();
  for (const r of records) {
    if (employeeMap.has(r.employee.id)) continue;
    employeeMap.set(r.employee.id, {
      id: r.employee.id,
      socialSecurityTaxability: r.employee.socialSecurityTaxability,
      medicareTaxability: r.employee.medicareTaxability,
      hireDate: r.employee.hireDate,
      terminationDate: r.employee.terminationDate,
      ytdGrossPaySeed: r.employee.ytdGrossPaySeed,
      ytdSeedAsOfDate: r.employee.ytdSeedAsOfDate,
    });
  }

  const yearRecords: Form941RecordInput[] = records.map((r) => ({
    employeeId: r.employee.id,
    payDate: r.payDate,
    payPeriodStart: r.payPeriodStart,
    payPeriodEnd: r.payPeriodEnd,
    grossPay: r.grossPay,
    taxableWages: r.taxableWages,
    section125Deductions: r.preTaxHealthIns + r.preTaxDental + r.preTaxVision + r.preTaxHSA + r.preTaxFSA,
    federalTax: r.federalTax,
    socialSecurity: r.socialSecurity,
    employerSocialSecurity: r.employerSocialSecurity,
    medicare: r.medicare,
    employerMedicare: r.employerMedicare,
    additionalMedicare: r.additionalMedicare,
  }));

  const quarterRecords = records.filter((r) => r.payDate >= dateStart && r.payDate <= dateEnd);

  // Line 13 — total deposits made for this quarter against federal_941.
  const [depositRows, filing] = await Promise.all([
    prisma.taxDeposit.findMany({
      where: {
        companyId,
        taxAuthority: 'federal_941',
        taxPeriodYear: year,
        taxPeriodQuarter: `Q${quarter}`,
        status: 'recorded',
      },
      orderBy: { depositDate: 'asc' },
      select: {
        id: true,
        depositDate: true,
        paymentMethod: true,
        confirmationNumber: true,
        federalIncomeTaxWithheld: true,
        socialSecurityTax: true,
        medicareTax: true,
        additionalMedicareTax: true,
      },
    }),
    prisma.taxFiling.findFirst({
      where: { companyId, formType: '941', year, quarter },
      include: { adjustmentEntry: { select: { id: true, entryNumber: true, status: true } } },
    }),
  ]);

  const recordedDeposits = {
    federalIncomeTax: depositRows.reduce((s, d) => s + d.federalIncomeTaxWithheld, 0),
    socialSecurity: depositRows.reduce((s, d) => s + d.socialSecurityTax, 0),
    medicare: depositRows.reduce((s, d) => s + d.medicareTax + d.additionalMedicareTax, 0),
  };
  const totalDeposits =
    recordedDeposits.federalIncomeTax + recordedDeposits.socialSecurity + recordedDeposits.medicare;

  // Only the two schedules the form recognises count; anything else (including
  // a legacy empty string) is treated as unset so line 16 is left blank rather
  // than guessed at.
  const depositSchedule =
    company.federalDepositSchedule === 'monthly' || company.federalDepositSchedule === 'semiweekly'
      ? company.federalDepositSchedule
      : null;

  const form941 = buildForm941({
    year,
    quarter,
    employees: [...employeeMap.values()],
    yearRecords,
    totalDeposits,
    depositSchedule,
  });

  return {
    company,
    dateStart,
    dateEnd,
    quarterRecords,
    form941,
    depositRows,
    recordedDeposits,
    filing,
  };
}
