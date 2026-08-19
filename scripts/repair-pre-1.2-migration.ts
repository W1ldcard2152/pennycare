/**
 * Pre-1.2.0 migration repair. Run BEFORE `npx prisma db push` applies the new
 * unique constraints. Safe to run repeatedly (idempotent) and safe on
 * production: it only renumbers the later-created duplicate(s) and never
 * touches amounts, lines, or status.
 *
 * What it does:
 *   1. JournalEntry: finds (companyId, entryNumber) duplicates, keeps the
 *      earliest-created entry, renumbers the rest from the company counter.
 *   2. Employee: finds (companyId, employeeNumber) duplicates and renumbers
 *      the later-created ones from the company employee counter.
 *   3. Legacy Transaction table: verifies it has 0 rows. If rows exist, the
 *      script exits non-zero — do NOT apply the schema (which drops the
 *      table) until those rows are understood.
 *   4. Roles: renames UserCompanyAccess.role values in place:
 *      owner→OWNER, admin→APPROVER, payroll→BOOKKEEPER, viewer→VIEWER.
 *
 * Run with: npx tsx scripts/repair-pre-1.2-migration.ts
 * Against a copy: DATABASE_URL="file:/path/to/copy.db" npx tsx scripts/repair-pre-1.2-migration.ts
 */
import { prisma } from '../lib/db';

async function repairJournalEntryNumbers(): Promise<number> {
  let totalRepaired = 0;
  const companies = await prisma.company.findMany({
    select: { id: true, companyName: true, nextJournalEntryNumber: true },
  });

  for (const company of companies) {
    const dupGroups = await prisma.journalEntry.groupBy({
      by: ['entryNumber'],
      where: { companyId: company.id },
      having: { entryNumber: { _count: { gt: 1 } } },
    });
    if (dupGroups.length === 0) continue;

    const maxRow = await prisma.journalEntry.aggregate({
      where: { companyId: company.id },
      _max: { entryNumber: true },
    });
    let next = Math.max(company.nextJournalEntryNumber, (maxRow._max.entryNumber ?? 0) + 1);

    await prisma.$transaction(async (tx) => {
      for (const group of dupGroups) {
        const entries = await tx.journalEntry.findMany({
          where: { companyId: company.id, entryNumber: group.entryNumber },
          orderBy: { createdAt: 'asc' },
          select: { id: true, entryNumber: true, memo: true, createdAt: true },
        });
        // Keep the earliest-created entry; renumber the rest
        for (const entry of entries.slice(1)) {
          const newNumber = next++;
          await tx.journalEntry.update({
            where: { id: entry.id },
            data: { entryNumber: newNumber },
          });
          totalRepaired++;
          console.log(
            `[${company.companyName}] JE #${group.entryNumber} (id=${entry.id}, ` +
              `created=${entry.createdAt.toISOString()}, memo="${entry.memo}") renumbered to #${newNumber}`
          );
        }
      }
      await tx.company.update({
        where: { id: company.id },
        data: { nextJournalEntryNumber: next },
      });
      console.log(`[${company.companyName}] nextJournalEntryNumber set to ${next}`);
    });
  }
  return totalRepaired;
}

async function repairEmployeeNumbers(): Promise<number> {
  let totalRepaired = 0;
  const companies = await prisma.company.findMany({
    select: { id: true, companyName: true, nextEmployeeNumber: true },
  });

  for (const company of companies) {
    const dupGroups = await prisma.employee.groupBy({
      by: ['employeeNumber'],
      where: { companyId: company.id },
      having: { employeeNumber: { _count: { gt: 1 } } },
    });
    if (dupGroups.length === 0) continue;

    const existing = new Set(
      (
        await prisma.employee.findMany({
          where: { companyId: company.id },
          select: { employeeNumber: true },
        })
      ).map((e) => e.employeeNumber)
    );
    let counter = company.nextEmployeeNumber;
    const freshNumber = () => {
      while (existing.has(String(counter))) counter++;
      const assigned = String(counter);
      existing.add(assigned);
      counter++;
      return assigned;
    };

    await prisma.$transaction(async (tx) => {
      for (const group of dupGroups) {
        const employees = await tx.employee.findMany({
          where: { companyId: company.id, employeeNumber: group.employeeNumber },
          orderBy: { createdAt: 'asc' },
          select: { id: true, firstName: true, lastName: true },
        });
        for (const employee of employees.slice(1)) {
          const newNumber = freshNumber();
          await tx.employee.update({
            where: { id: employee.id },
            data: { employeeNumber: newNumber },
          });
          totalRepaired++;
          console.log(
            `[${company.companyName}] Employee #${group.employeeNumber} ` +
              `(${employee.firstName} ${employee.lastName}) renumbered to #${newNumber}`
          );
        }
      }
      await tx.company.update({
        where: { id: company.id },
        data: { nextEmployeeNumber: counter },
      });
    });
  }
  return totalRepaired;
}

const ROLE_RENAMES: Array<[string, string]> = [
  ['owner', 'OWNER'],
  ['admin', 'APPROVER'],
  ['payroll', 'BOOKKEEPER'],
  ['viewer', 'VIEWER'],
];

async function migrateRoles(): Promise<number> {
  let total = 0;
  for (const [from, to] of ROLE_RENAMES) {
    const result = await prisma.userCompanyAccess.updateMany({
      where: { role: from },
      data: { role: to },
    });
    if (result.count > 0) {
      console.log(`Role '${from}' -> '${to}': ${result.count} row(s)`);
      total += result.count;
    }
  }
  const unknown = await prisma.userCompanyAccess.findMany({
    where: { role: { notIn: ['OWNER', 'APPROVER', 'BOOKKEEPER', 'VIEWER'] } },
    select: { id: true, role: true, userId: true, companyId: true },
  });
  for (const row of unknown) {
    console.warn(`WARNING: unknown role '${row.role}' on access ${row.id} — left untouched`);
  }
  return total;
}

async function checkLegacyTransactionTable(): Promise<boolean> {
  // The model may already be gone from the Prisma client after the schema
  // change lands, so query the table directly.
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ n: number | bigint }>>(
      'SELECT COUNT(*) AS n FROM "Transaction"'
    );
    const count = Number(rows[0]?.n ?? 0);
    if (count > 0) {
      console.error(
        `ABORT: legacy Transaction table has ${count} row(s). ` +
          'Do not apply the schema drop until these rows are reviewed.'
      );
      return false;
    }
    console.log('Legacy Transaction table: 0 rows — safe to drop.');
    return true;
  } catch {
    console.log('Legacy Transaction table not found — already dropped.');
    return true;
  }
}

async function main() {
  console.log(`Database: ${process.env.DATABASE_URL ?? '(from .env)'}`);
  const jeRepaired = await repairJournalEntryNumbers();
  const empRepaired = await repairEmployeeNumbers();
  const rolesMigrated = await migrateRoles();
  const transactionOk = await checkLegacyTransactionTable();

  console.log(
    `\nDone. Journal entries renumbered: ${jeRepaired}. Employees renumbered: ${empRepaired}. Roles migrated: ${rolesMigrated}.`
  );
  if (!transactionOk) process.exit(1);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
