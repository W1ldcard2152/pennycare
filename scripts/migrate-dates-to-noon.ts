/**
 * Migration script to shift all business dates to noon UTC.
 *
 * Background:
 * Dates were previously stored at various UTC offsets (midnight UTC, 4am, 5am, etc.)
 * This caused timezone display issues where dates would shift when viewed in US timezones.
 *
 * Fix:
 * This script shifts all business dates to noon UTC (12:00:00.000Z) of the same UTC calendar day.
 * This ensures dates never shift when displayed in any US timezone.
 *
 * Examples:
 * - 2025-01-01T00:00:00.000Z → 2025-01-01T12:00:00.000Z
 * - 2025-01-01T05:00:00.000Z → 2025-01-01T12:00:00.000Z
 * - 2025-01-01T04:00:00.000Z → 2025-01-01T12:00:00.000Z
 */

import { prisma } from '../lib/db';

interface UpdateResult {
  table: string;
  field: string;
  updated: number;
  skipped: number;
  errors: string[];
}

function shiftToNoonUTC(date: Date): Date {
  // Extract UTC date components and set to noon UTC
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const day = date.getUTCDate();
  return new Date(Date.UTC(year, month, day, 12, 0, 0, 0));
}

function isAlreadyNoonUTC(date: Date): boolean {
  return date.getUTCHours() === 12 &&
         date.getUTCMinutes() === 0 &&
         date.getUTCSeconds() === 0 &&
         date.getUTCMilliseconds() === 0;
}

async function migrateJournalEntries(): Promise<UpdateResult> {
  const result: UpdateResult = { table: 'JournalEntry', field: 'date', updated: 0, skipped: 0, errors: [] };

  try {
    const entries = await prisma.journalEntry.findMany({
      select: { id: true, date: true }
    });

    for (const entry of entries) {
      if (isAlreadyNoonUTC(entry.date)) {
        result.skipped++;
        continue;
      }

      const newDate = shiftToNoonUTC(entry.date);
      await prisma.journalEntry.update({
        where: { id: entry.id },
        data: { date: newDate }
      });
      result.updated++;
    }
  } catch (err) {
    result.errors.push(String(err));
  }

  return result;
}

async function migrateEbaySales(): Promise<UpdateResult> {
  const result: UpdateResult = { table: 'EbaySale', field: 'orderDate', updated: 0, skipped: 0, errors: [] };

  try {
    const sales = await prisma.ebaySale.findMany({
      select: { id: true, orderDate: true }
    });

    for (const sale of sales) {
      if (isAlreadyNoonUTC(sale.orderDate)) {
        result.skipped++;
        continue;
      }

      const newDate = shiftToNoonUTC(sale.orderDate);
      await prisma.ebaySale.update({
        where: { id: sale.id },
        data: { orderDate: newDate }
      });
      result.updated++;
    }
  } catch (err) {
    result.errors.push(String(err));
  }

  return result;
}

async function migrateStatementImports(): Promise<UpdateResult> {
  const result: UpdateResult = { table: 'StatementImport', field: 'postDate', updated: 0, skipped: 0, errors: [] };

  try {
    const imports = await prisma.statementImport.findMany({
      select: { id: true, postDate: true }
    });

    for (const imp of imports) {
      if (isAlreadyNoonUTC(imp.postDate)) {
        result.skipped++;
        continue;
      }

      const newDate = shiftToNoonUTC(imp.postDate);
      await prisma.statementImport.update({
        where: { id: imp.id },
        data: { postDate: newDate }
      });
      result.updated++;
    }
  } catch (err) {
    result.errors.push(String(err));
  }

  return result;
}

// Note: Credit card imports use StatementImport model, handled above

async function migratePayrollRecords(): Promise<UpdateResult[]> {
  const results: UpdateResult[] = [];

  // payPeriodStart
  const startResult: UpdateResult = { table: 'PayrollRecord', field: 'payPeriodStart', updated: 0, skipped: 0, errors: [] };
  const endResult: UpdateResult = { table: 'PayrollRecord', field: 'payPeriodEnd', updated: 0, skipped: 0, errors: [] };
  const payDateResult: UpdateResult = { table: 'PayrollRecord', field: 'payDate', updated: 0, skipped: 0, errors: [] };

  try {
    const records = await prisma.payrollRecord.findMany({
      select: { id: true, payPeriodStart: true, payPeriodEnd: true, payDate: true }
    });

    for (const record of records) {
      const updates: { payPeriodStart?: Date; payPeriodEnd?: Date; payDate?: Date } = {};

      if (!isAlreadyNoonUTC(record.payPeriodStart)) {
        updates.payPeriodStart = shiftToNoonUTC(record.payPeriodStart);
        startResult.updated++;
      } else {
        startResult.skipped++;
      }

      if (!isAlreadyNoonUTC(record.payPeriodEnd)) {
        updates.payPeriodEnd = shiftToNoonUTC(record.payPeriodEnd);
        endResult.updated++;
      } else {
        endResult.skipped++;
      }

      if (!isAlreadyNoonUTC(record.payDate)) {
        updates.payDate = shiftToNoonUTC(record.payDate);
        payDateResult.updated++;
      } else {
        payDateResult.skipped++;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.payrollRecord.update({
          where: { id: record.id },
          data: updates
        });
      }
    }
  } catch (err) {
    startResult.errors.push(String(err));
  }

  results.push(startResult, endResult, payDateResult);
  return results;
}

async function migrateTimeEntries(): Promise<UpdateResult> {
  const result: UpdateResult = { table: 'TimeEntry', field: 'date', updated: 0, skipped: 0, errors: [] };

  try {
    const entries = await prisma.timeEntry.findMany({
      select: { id: true, date: true }
    });

    for (const entry of entries) {
      if (isAlreadyNoonUTC(entry.date)) {
        result.skipped++;
        continue;
      }

      const newDate = shiftToNoonUTC(entry.date);
      await prisma.timeEntry.update({
        where: { id: entry.id },
        data: { date: newDate }
      });
      result.updated++;
    }
  } catch (err) {
    result.errors.push(String(err));
  }

  return result;
}

async function migrateExpenses(): Promise<UpdateResult> {
  const result: UpdateResult = { table: 'Expense', field: 'date', updated: 0, skipped: 0, errors: [] };

  try {
    const expenses = await prisma.expense.findMany({
      select: { id: true, date: true }
    });

    for (const expense of expenses) {
      if (isAlreadyNoonUTC(expense.date)) {
        result.skipped++;
        continue;
      }

      const newDate = shiftToNoonUTC(expense.date);
      await prisma.expense.update({
        where: { id: expense.id },
        data: { date: newDate }
      });
      result.updated++;
    }
  } catch (err) {
    result.errors.push(String(err));
  }

  return result;
}

async function migrateEmployeeDates(): Promise<UpdateResult[]> {
  const results: UpdateResult[] = [];

  const hireDateResult: UpdateResult = { table: 'Employee', field: 'hireDate', updated: 0, skipped: 0, errors: [] };
  const dobResult: UpdateResult = { table: 'Employee', field: 'dateOfBirth', updated: 0, skipped: 0, errors: [] };
  const termResult: UpdateResult = { table: 'Employee', field: 'terminationDate', updated: 0, skipped: 0, errors: [] };

  try {
    const employees = await prisma.employee.findMany({
      select: { id: true, hireDate: true, dateOfBirth: true, terminationDate: true }
    });

    for (const emp of employees) {
      const updates: { hireDate?: Date; dateOfBirth?: Date; terminationDate?: Date } = {};

      if (!isAlreadyNoonUTC(emp.hireDate)) {
        updates.hireDate = shiftToNoonUTC(emp.hireDate);
        hireDateResult.updated++;
      } else {
        hireDateResult.skipped++;
      }

      if (emp.dateOfBirth && !isAlreadyNoonUTC(emp.dateOfBirth)) {
        updates.dateOfBirth = shiftToNoonUTC(emp.dateOfBirth);
        dobResult.updated++;
      } else if (emp.dateOfBirth) {
        dobResult.skipped++;
      }

      if (emp.terminationDate && !isAlreadyNoonUTC(emp.terminationDate)) {
        updates.terminationDate = shiftToNoonUTC(emp.terminationDate);
        termResult.updated++;
      } else if (emp.terminationDate) {
        termResult.skipped++;
      }

      if (Object.keys(updates).length > 0) {
        await prisma.employee.update({
          where: { id: emp.id },
          data: updates
        });
      }
    }
  } catch (err) {
    hireDateResult.errors.push(String(err));
  }

  results.push(hireDateResult, dobResult, termResult);
  return results;
}

async function main() {
  console.log('=== Date Migration to Noon UTC ===\n');
  console.log('This script will shift all business dates to noon UTC (12:00:00.000Z)');
  console.log('to prevent timezone display issues.\n');

  const allResults: UpdateResult[] = [];

  console.log('Migrating JournalEntry.date...');
  allResults.push(await migrateJournalEntries());

  console.log('Migrating EbaySale.orderDate...');
  allResults.push(await migrateEbaySales());

  console.log('Migrating StatementImport.postDate...');
  allResults.push(await migrateStatementImports());

  // Credit card imports use StatementImport, already migrated above

  console.log('Migrating PayrollRecord dates...');
  allResults.push(...await migratePayrollRecords());

  console.log('Migrating TimeEntry.date...');
  allResults.push(await migrateTimeEntries());

  console.log('Migrating Expense.date...');
  allResults.push(await migrateExpenses());

  console.log('Migrating Employee dates...');
  allResults.push(...await migrateEmployeeDates());

  console.log('\n=== Migration Results ===\n');

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  for (const result of allResults) {
    console.log(`${result.table}.${result.field}:`);
    console.log(`  Updated: ${result.updated}`);
    console.log(`  Skipped (already noon UTC): ${result.skipped}`);
    if (result.errors.length > 0) {
      console.log(`  Errors: ${result.errors.join(', ')}`);
    }
    console.log('');

    totalUpdated += result.updated;
    totalSkipped += result.skipped;
    totalErrors += result.errors.length;
  }

  console.log('=== Summary ===');
  console.log(`Total records updated: ${totalUpdated}`);
  console.log(`Total records skipped: ${totalSkipped}`);
  console.log(`Total errors: ${totalErrors}`);

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  prisma.$disconnect();
  process.exit(1);
});
