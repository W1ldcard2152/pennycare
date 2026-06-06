/**
 * Scan every company for posted payroll journal entries that are off by a
 * sub-penny amount (caused by sum-of-rounded vs round-of-sum drift across
 * per-employee tax/deduction aggregations) and patch each one by absorbing
 * the diff into the wage expense debit (6010 preferred, 6000 fallback).
 *
 * This is a thin CLI wrapper around `repairUnbalancedPayrollJournals` —
 * the same function the admin UI button calls. Use this script when running
 * a one-off repair against a live database from the command line.
 *
 * Idempotent: re-running after a successful fix is a no-op.
 *
 * Run against the dev DB:
 *   npx tsx scripts/fix-unbalanced-payroll-jes.ts
 *
 * Run against an Electron live DB (%APPDATA%/CV Books/pennycare.db):
 *   DATABASE_URL="file:C:/Users/<you>/AppData/Roaming/CV Books/pennycare.db" \
 *     npx tsx scripts/fix-unbalanced-payroll-jes.ts
 *
 * Refuses to patch entries in closed fiscal periods (reopen the period first)
 * and entries off by more than 5¢ (real imbalance, not drift — investigate).
 */
import { prisma } from '../lib/db';
import { repairUnbalancedPayrollJournals } from '../lib/bookkeeping';

const SYSTEM_USER_ID = 'system';

async function main() {
  const companies = await prisma.company.findMany({
    select: { id: true, companyName: true },
    orderBy: { companyName: 'asc' },
  });

  console.log(`Scanning ${companies.length} compan${companies.length === 1 ? 'y' : 'ies'} for unbalanced payroll JEs...\n`);

  let totalScanned = 0;
  let totalPatched = 0;
  let totalSkipped = 0;

  for (const company of companies) {
    const summary = await repairUnbalancedPayrollJournals(company.id, SYSTEM_USER_ID);
    totalScanned += summary.scanned;
    totalPatched += summary.patched;
    totalSkipped += summary.skipped;

    if (summary.results.length === 0) {
      console.log(`  ${company.companyName}: ${summary.scanned} payroll JEs, all balanced.`);
      continue;
    }

    console.log(`  ${company.companyName}: ${summary.scanned} scanned, ${summary.patched} patched, ${summary.skipped} skipped`);
    for (const r of summary.results) {
      const diffStr = `${r.diffCents > 0 ? '+' : ''}${(r.diffCents / 100).toFixed(2)}`;
      if (r.status === 'patched') {
        console.log(
          `    JE #${r.entryNumber} (${r.date}) diff=${diffStr}: ` +
          `${r.patchedAccountCode} debit ${r.oldDebit!.toFixed(2)} -> ${r.newDebit!.toFixed(2)}`,
        );
      } else if (r.status === 'skipped_closed_period') {
        console.log(`    JE #${r.entryNumber} (${r.date}) diff=${diffStr}: SKIPPED (closed period — reopen to fix)`);
      } else if (r.status === 'skipped_too_large') {
        console.log(`    JE #${r.entryNumber} (${r.date}) diff=${diffStr}: SKIPPED (>5¢ — investigate manually)`);
      } else if (r.status === 'skipped_no_wage_line') {
        console.log(`    JE #${r.entryNumber} (${r.date}) diff=${diffStr}: SKIPPED (no 6000/6010 debit line)`);
      }
    }
  }

  console.log(`\nTotals: ${totalScanned} scanned, ${totalPatched} patched, ${totalSkipped} skipped.`);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
