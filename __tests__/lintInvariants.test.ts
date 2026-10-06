import { describe, it, expect } from 'vitest';
import { findViolations } from '../scripts/lint-invariants.mjs';

const lines = (src: string) =>
  (findViolations(src) as Array<{ line: number }>).map((v) => v.line);

describe('JE-write invariant lint', () => {
  it('catches direct writes on the conventional client names', () => {
    expect(lines('await prisma.journalEntry.update({})')).toEqual([1]);
    expect(lines('await tx.journalEntryLine.deleteMany({})')).toEqual([1]);
  });

  it('catches writes on any client identifier', () => {
    expect(lines('await t.journalEntry.create({})')).toEqual([1]);
    expect(lines('await trx.journalEntryLine.updateMany({})')).toEqual([1]);
    expect(lines("await tx['journalEntry'].upsert({})")).toEqual([1]);
  });

  it('catches a write chained across lines, reported at the model line', () => {
    const src = 'const x = 1;\nawait tx\n  .journalEntry\n  .update({})';
    expect(lines(src)).toEqual([3]);
  });

  it('catches nested relation writes from another model', () => {
    const src = 'tx.taxDeposit.create({\n  data: {\n    journalEntry: { create: {} },\n  },\n});';
    expect(lines(src)).toEqual([3]);
    expect(lines('company.update({ data: { journalEntries: { deleteMany: {} } } })')).toEqual([1]);
  });

  it('catches raw SQL writes', () => {
    expect(lines('await prisma.$executeRaw`UPDATE "JournalEntry" SET status = 1`')).toEqual([1]);
    expect(lines("await db.$executeRawUnsafe('DELETE FROM JournalEntryLine')")).toEqual([1]);
  });

  it('allows reads and relation links', () => {
    const src = [
      'await prisma.journalEntry.findMany({})',
      'await tx.journalEntryLine.findFirst({})',
      'await prisma.journalEntry.count({})',
      'await tx.ebaySale.update({ data: { journalEntry: { connect: { id } } } })',
      'await prisma.$queryRaw`SELECT * FROM JournalEntry`',
    ].join('\n');
    expect(lines(src)).toEqual([]);
  });
});
