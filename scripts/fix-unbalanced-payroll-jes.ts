/**
 * One-shot data fix: rebalance the two payroll JEs (#340, #341) whose credits
 * were a penny short due to sum-of-rounded vs round-of-sum drift in
 * createPayrollJournalEntries. The self-heal branch in that function would
 * have absorbed the diff into the 2100 Payroll Liabilities credit if
 * validateJournalEntry had flagged the entry as invalid — but with the prior
 * `> 0.01` tolerance, exactly-$0.01 imbalances passed.
 *
 * This script makes the same correction retroactively: bump the 2100
 * credit by +$0.01 on each affected entry, then log an audit entry per JE
 * with the before/after values and an explanation of why.
 *
 * Run with:  npx tsx scripts/fix-unbalanced-payroll-jes.ts
 *
 * Idempotent: re-running after a successful fix is a no-op (each entry is
 * re-validated before patching, and balanced entries are skipped).
 */
import { prisma } from '../lib/db';
import { logAudit } from '../lib/audit';

const TARGET_ENTRY_IDS = [
  'cmoupkjqd0007nvgoi545z5hf', // JE #340
  'cmovwmjlk0007nvswfeai80ks', // JE #341
];

const PAYROLL_LIABILITIES_CODE = '2100';
const SYSTEM_USER_ID = 'system'; // audit log marker for automated correction

async function main() {
  for (const entryId of TARGET_ENTRY_IDS) {
    console.log(`\n--- Processing ${entryId} ---`);

    const entry = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      include: {
        lines: { include: { account: { select: { code: true, name: true } } } },
      },
    });

    if (!entry) {
      console.log(`  Not found — skipping.`);
      continue;
    }

    const debitCents = entry.lines.reduce((s, l) => s + Math.round(l.debit * 100), 0);
    const creditCents = entry.lines.reduce((s, l) => s + Math.round(l.credit * 100), 0);
    const diffCents = debitCents - creditCents;

    console.log(`  JE #${entry.entryNumber} ${entry.memo}`);
    console.log(`  Current: debits=${(debitCents / 100).toFixed(2)} credits=${(creditCents / 100).toFixed(2)} diff=${(diffCents / 100).toFixed(2)}`);

    if (diffCents === 0) {
      console.log(`  Already balanced — nothing to do.`);
      continue;
    }

    // We expect the existing imbalance to be exactly +$0.01 (debits > credits).
    // Anything else means the script is being asked to fix something it wasn't
    // designed for — bail rather than mask a different problem.
    if (diffCents !== 1) {
      console.log(`  Refusing to patch: expected diff=+1 cent, got ${diffCents}. Investigate manually.`);
      continue;
    }

    // Find the 2100 Payroll Liabilities credit line — that's where the
    // self-heal branch in createPayrollJournalEntries would have absorbed
    // the drift if it had fired at creation time.
    const targetLine = entry.lines.find(
      (l) => l.account.code === PAYROLL_LIABILITIES_CODE && l.credit > 0,
    );

    if (!targetLine) {
      console.log(`  No ${PAYROLL_LIABILITIES_CODE} credit line found — cannot patch. Skipping.`);
      continue;
    }

    const oldCredit = targetLine.credit;
    const newCredit = Math.round((oldCredit + diffCents / 100) * 100) / 100;

    console.log(`  Patching line ${targetLine.id} (${targetLine.account.code} ${targetLine.account.name})`);
    console.log(`    credit: ${oldCredit.toFixed(2)} -> ${newCredit.toFixed(2)}`);

    await prisma.$transaction(async (tx) => {
      await tx.journalEntryLine.update({
        where: { id: targetLine.id },
        data: { credit: newCredit },
      });
      // Touch the parent so updatedAt reflects the correction.
      await tx.journalEntry.update({
        where: { id: entry.id },
        data: { updatedAt: new Date() },
      });
    });

    await logAudit({
      companyId: entry.companyId,
      userId: SYSTEM_USER_ID,
      action: 'journal_entry.rebalance_correction',
      entityType: 'JournalEntry',
      entityId: entry.id,
      changes: {
        [`line_${targetLine.id}.credit`]: { old: oldCredit, new: newCredit },
      },
      metadata: {
        entryNumber: entry.entryNumber,
        memo: entry.memo,
        source: entry.source,
        accountCode: targetLine.account.code,
        accountName: targetLine.account.name,
        diffApplied: diffCents / 100,
        reason:
          'Payroll JE was off by $0.01 due to sum-of-rounded vs round-of-sum ' +
          'drift in createPayrollJournalEntries. The self-heal branch did not ' +
          'fire because validateJournalEntry tolerated diffs <= $0.01. ' +
          'Validation has since been tightened to penny-exact. This correction ' +
          'absorbs the drift into the 2100 Payroll Liabilities credit, matching ' +
          'what the self-heal would have done at creation time.',
        scriptRun: 'scripts/fix-unbalanced-payroll-jes.ts',
      },
    });

    // Re-verify
    const after = await prisma.journalEntry.findUnique({
      where: { id: entryId },
      select: { lines: { select: { debit: true, credit: true } } },
    });
    const d2 = after!.lines.reduce((s, l) => s + Math.round(l.debit * 100), 0);
    const c2 = after!.lines.reduce((s, l) => s + Math.round(l.credit * 100), 0);
    console.log(`  After:   debits=${(d2 / 100).toFixed(2)} credits=${(c2 / 100).toFixed(2)} diff=${((d2 - c2) / 100).toFixed(2)}`);
  }

  await prisma.$disconnect();
  console.log('\nDone.');
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
