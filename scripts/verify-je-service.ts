/**
 * Integration verification for the JE service against a REAL database — the
 * parts that can't be unit-tested without Prisma: numbering under concurrent
 * creates, segregation of duties, the draft lifecycle with audit snapshot, and
 * reversal end-to-end. Run against a COPY of the dev DB, never production:
 *
 *   Copy-Item prisma/prisma/pennycare.db tmp.db
 *   DATABASE_URL="file:/abs/tmp.db" npx tsx scripts/verify-je-service.ts
 *
 * Creates a throwaway company + users, exercises the flows, asserts, and
 * deletes everything it created (cascade) at the end.
 */
import { prisma } from '../lib/db';
import {
  createEntry,
  updateDraft,
  deleteDraft,
  transition,
  createReversingEntry,
  type Actor,
} from '../lib/journal-entry-service';
import { JE_STATUS } from '../lib/je-status';

let failures = 0;
function check(name: string, cond: boolean) {
  console.log(`${cond ? 'PASS' : 'FAIL'}: ${name}`);
  if (!cond) failures++;
}
async function expectThrow(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false);
  } catch {
    check(name, true);
  }
}

async function main() {
  const company = await prisma.company.create({
    data: { companyName: 'JE-Service Test Co', approvalMode: 'single_user' },
  });
  const preparer = await prisma.user.create({
    data: { email: `prep-${company.id}@test.local`, passwordHash: 'x', firstName: 'Prep', lastName: 'A' },
  });
  const approver = await prisma.user.create({
    data: { email: `appr-${company.id}@test.local`, passwordHash: 'x', firstName: 'Appr', lastName: 'B' },
  });
  for (const u of [preparer, approver]) {
    await prisma.userCompanyAccess.create({
      data: { userId: u.id, companyId: company.id, role: u === approver ? 'APPROVER' : 'BOOKKEEPER' },
    });
  }
  // Two accounts to post between
  const cash = await prisma.account.create({
    data: { companyId: company.id, code: 'T1000', name: 'Test Cash', type: 'asset', accountGroup: 'Cash' },
  });
  const rev = await prisma.account.create({
    data: { companyId: company.id, code: 'T4000', name: 'Test Revenue', type: 'revenue', accountGroup: 'Income' },
  });

  const prepActor: Actor = { userId: preparer.id, role: 'BOOKKEEPER' };
  const apprActor: Actor = { userId: approver.id, role: 'APPROVER' };

  const mkLines = (amount: number) => [
    { accountId: cash.id, debit: amount, credit: 0 },
    { accountId: rev.id, debit: 0, credit: amount },
  ];

  try {
    // 1. single_user mode → booked immediately, creator = approver
    const e1 = await createEntry(prepActor, {
      companyId: company.id, date: new Date(), memo: 'single-user book', lines: mkLines(100),
    });
    check('single_user entry books immediately', e1.status === JE_STATUS.BOOKED);
    check('single_user stamps creator as approver', e1.createdById === preparer.id && e1.approvedById === preparer.id);

    // 2. Numbering under concurrent creates — all distinct, no gaps-of-collision
    const concurrent = await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        createEntry(prepActor, { companyId: company.id, date: new Date(), memo: `c${i}`, lines: mkLines(10) })
      )
    );
    const numbers = concurrent.map((e) => e.entryNumber);
    check('concurrent creates get unique entry numbers', new Set(numbers).size === numbers.length);

    // 3. Draft lifecycle + audit snapshot
    const draft = await createEntry(prepActor, {
      companyId: company.id, date: new Date(), memo: 'draft', asDraft: true, lines: mkLines(50),
    });
    check('asDraft creates a draft', draft.status === JE_STATUS.DRAFT);
    const updated = await updateDraft(prepActor, draft.id, { memo: 'draft edited' });
    check('updateDraft edits a draft', updated.memo === 'draft edited');
    await deleteDraft(prepActor, draft.id);
    const gone = await prisma.journalEntry.findUnique({ where: { id: draft.id } });
    check('deleteDraft hard-deletes', gone === null);
    const auditSnap = await prisma.auditLog.findFirst({
      where: { entityId: draft.id, action: 'journal_entry.delete_draft' },
    });
    check('draft delete writes an audit row with beforeJson snapshot',
      !!auditSnap && !!auditSnap.beforeJson && JSON.parse(auditSnap.beforeJson).memo === 'draft edited');

    // 4. team mode → manual entry lands pending; SoD blocks self-approval
    await prisma.company.update({ where: { id: company.id }, data: { approvalMode: 'team' } });

    // With NO rules, the matrix default-denies to OWNER — an APPROVER can't book.
    const pendingNoRule = await createEntry(prepActor, {
      companyId: company.id, date: new Date(), memo: 'team pending (no rule)', lines: mkLines(75),
    });
    check('team-mode manual entry is pending', pendingNoRule.status === JE_STATUS.PENDING);
    await expectThrow('no-rule default-deny: APPROVER cannot book (needs OWNER)', () =>
      transition(apprActor, pendingNoRule.id, JE_STATUS.BOOKED));

    // Add a rule allowing APPROVER to book any manual entry, then it works.
    await prisma.approvalRule.create({
      data: { companyId: company.id, conditions: '{}', requiredRole: 'APPROVER', active: true },
    });
    const pending = await createEntry(prepActor, {
      companyId: company.id, date: new Date(), memo: 'team pending', lines: mkLines(75),
    });
    await expectThrow('SoD: creator cannot approve own entry', () =>
      transition({ userId: preparer.id, role: 'APPROVER' }, pending.id, JE_STATUS.BOOKED));
    const booked = await transition(apprActor, pending.id, JE_STATUS.BOOKED);
    check('with a matching rule, a different approver can book', booked.status === JE_STATUS.BOOKED && booked.approvedById === approver.id);
    // system entries still auto-book in team mode
    const sysEntry = await createEntry(prepActor, {
      companyId: company.id, date: new Date(), memo: 'system in team mode', source: 'expense', lines: mkLines(20),
    });
    check('system source auto-books even in team mode', sysEntry.status === JE_STATUS.BOOKED);
    await prisma.company.update({ where: { id: company.id }, data: { approvalMode: 'single_user' } });

    // 5. Reversal flips lines, books, links back
    const reversal = await createReversingEntry(apprActor, e1.id, { date: new Date() });
    check('reversal is booked', reversal.status === JE_STATUS.BOOKED);
    check('reversal links to original', reversal.reversesEntryId === e1.id);
    check('reversal source is "reversal"', reversal.source === 'reversal');
    const origCashLine = e1.lines.find((l) => l.accountId === cash.id)!;
    const revCashLine = reversal.lines.find((l) => l.accountId === cash.id)!;
    check('reversal flips debit↔credit penny-exact',
      revCashLine.debit === origCashLine.credit && revCashLine.credit === origCashLine.debit);

    // 5b. At most one live reversal — a second one, or voiding the reversed
    // original, would undo the entry twice
    await expectThrow('second reversal of the same entry rejected', () =>
      createReversingEntry(apprActor, e1.id, { date: new Date() }));
    await expectThrow('voiding an already-reversed original rejected', () =>
      transition(apprActor, e1.id, JE_STATUS.VOIDED, { reason: 'double undo' }));
    await transition(apprActor, reversal.id, JE_STATUS.VOIDED, { reason: 'undo reversal' });
    const reversal2 = await createReversingEntry(apprActor, e1.id, { date: new Date() });
    check('voiding the reversal frees the original to be reversed again',
      reversal2.status === JE_STATUS.BOOKED && reversal2.reversesEntryId === e1.id);

    // 6. Illegal transition rejected; booked entries immutable via updateDraft
    await expectThrow('illegal transition booked→pending rejected', () =>
      transition(apprActor, e1.id, JE_STATUS.PENDING));
    await expectThrow('updateDraft on booked entry rejected', () =>
      updateDraft(prepActor, e1.id, { memo: 'nope' }));

    // 7. Void requires APPROVER and a reason
    await expectThrow('BOOKKEEPER cannot void', () =>
      transition(prepActor, booked.id, JE_STATUS.VOIDED, { reason: 'x' }));
    const voided = await transition(apprActor, booked.id, JE_STATUS.VOIDED, { reason: 'test void' });
    check('APPROVER can void with reason', voided.status === JE_STATUS.VOIDED && voided.voidedBy === approver.id);
  } finally {
    // Cascade-delete the throwaway company; users are global, delete explicitly.
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.user.deleteMany({ where: { id: { in: [preparer.id, approver.id] } } });
  }

  console.log(`\n${failures === 0 ? 'ALL PASSED' : `${failures} FAILURE(S)`}`);
  if (failures > 0) process.exit(1);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
