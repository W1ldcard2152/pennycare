/**
 * Diagnostic: scan every journal entry for internal balance + floating-point storage issues.
 *
 * Run with:  npx tsx scripts/check-journal-balance.ts
 */
import { prisma } from '../lib/db';

const PRECISION_TOLERANCE = 0.001;

function hasMoreThanTwoDecimals(n: number): boolean {
  if (!Number.isFinite(n)) return false;
  // Multiply by 100, see whether the result is essentially an integer.
  const cents = n * 100;
  return Math.abs(cents - Math.round(cents)) > 1e-9;
}

function fmt(n: number): string {
  // Show extra precision so we can see the drift.
  return n.toFixed(6);
}

async function main() {
  console.log('Loading all posted journal entries with their lines...\n');

  const entries = await prisma.journalEntry.findMany({
    where: { status: 'posted' },
    select: {
      id: true,
      companyId: true,
      entryNumber: true,
      date: true,
      memo: true,
      source: true,
      lines: { select: { id: true, accountId: true, debit: true, credit: true } },
    },
    orderBy: [{ companyId: 'asc' }, { entryNumber: 'asc' }],
  });

  console.log(`Loaded ${entries.length} posted journal entries.\n`);

  // STEP 1: per-entry balance check
  const unbalanced: Array<{
    id: string;
    entryNumber: number;
    date: Date;
    memo: string;
    source: string;
    totalDebits: number;
    totalCredits: number;
    diff: number;
    lineCount: number;
  }> = [];

  let grandDebits = 0;
  let grandCredits = 0;

  for (const e of entries) {
    const totalDebits = e.lines.reduce((s, l) => s + l.debit, 0);
    const totalCredits = e.lines.reduce((s, l) => s + l.credit, 0);
    const diff = totalDebits - totalCredits;

    grandDebits += totalDebits;
    grandCredits += totalCredits;

    if (Math.abs(diff) > PRECISION_TOLERANCE) {
      unbalanced.push({
        id: e.id,
        entryNumber: e.entryNumber,
        date: e.date,
        memo: e.memo,
        source: e.source,
        totalDebits,
        totalCredits,
        diff,
        lineCount: e.lines.length,
      });
    }
  }

  console.log('================================================');
  console.log('STEP 1: PER-ENTRY BALANCE CHECK');
  console.log('================================================');
  if (unbalanced.length === 0) {
    console.log(`PASS — all ${entries.length} entries balance within ${PRECISION_TOLERANCE} tolerance.`);
  } else {
    console.log(`FAIL — ${unbalanced.length} entries are out of balance:\n`);
    for (const u of unbalanced) {
      console.log(
        `  JE #${u.entryNumber} (${u.id})  source=${u.source}  lines=${u.lineCount}\n` +
        `    date:    ${u.date.toISOString().slice(0, 10)}\n` +
        `    memo:    ${u.memo}\n` +
        `    debits:  ${fmt(u.totalDebits)}\n` +
        `    credits: ${fmt(u.totalCredits)}\n` +
        `    diff:    ${fmt(u.diff)}\n`,
      );
    }
  }

  // Grand totals across all entries (sanity)
  console.log(`\n  Grand totals across all posted entries:`);
  console.log(`    sum(debit)  = ${fmt(grandDebits)}`);
  console.log(`    sum(credit) = ${fmt(grandCredits)}`);
  console.log(`    diff        = ${fmt(grandDebits - grandCredits)}\n`);

  // STEP 2: per-line precision check
  console.log('================================================');
  console.log('STEP 2: FLOATING-POINT PRECISION CHECK');
  console.log('================================================');

  const allLines = await prisma.journalEntryLine.findMany({
    select: {
      id: true,
      journalEntryId: true,
      debit: true,
      credit: true,
      account: { select: { code: true, name: true } },
      journalEntry: { select: { entryNumber: true, memo: true, status: true } },
    },
  });

  const badPrecision = allLines.filter(
    (l) => hasMoreThanTwoDecimals(l.debit) || hasMoreThanTwoDecimals(l.credit),
  );

  if (badPrecision.length === 0) {
    console.log(`PASS — all ${allLines.length} lines store values cleanly at 2 decimal places.`);
  } else {
    console.log(`FAIL — ${badPrecision.length} lines store values with >2 decimal places:\n`);
    for (const l of badPrecision.slice(0, 50)) {
      const flagged =
        hasMoreThanTwoDecimals(l.debit) ? `debit=${fmt(l.debit)}` : `credit=${fmt(l.credit)}`;
      console.log(
        `  JE #${l.journalEntry.entryNumber} [${l.journalEntry.status}]` +
        `  acct ${l.account.code} ${l.account.name}  ${flagged}` +
        `  (line ${l.id})`,
      );
    }
    if (badPrecision.length > 50) {
      console.log(`  ...and ${badPrecision.length - 50} more.`);
    }
  }

  console.log('\nDone.');
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
