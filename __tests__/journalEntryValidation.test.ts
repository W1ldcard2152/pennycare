import { describe, it, expect } from 'vitest';
import { validateJournalEntry } from '@/lib/bookkeeping';

// Behavioral coverage for the integer-cents balance check that was tightened
// in response to the JE #340/#341 incident. The previous `> 0.01` tolerance
// let single-penny payroll-aggregation drift slip past validation and bypass
// the in-flight self-heal. These tests pin the current behavior so a future
// well-intentioned "loosen the tolerance" doesn't regress us.

describe('validateJournalEntry', () => {
  it('accepts an entry that balances to the penny', () => {
    const result = validateJournalEntry([
      { accountId: 'a', debit: 100.5, credit: 0 },
      { accountId: 'b', debit: 0, credit: 100.5 },
    ]);
    expect(result.valid).toBe(true);
  });

  it('rejects a 1-cent imbalance (no soft tolerance)', () => {
    const result = validateJournalEntry([
      { accountId: 'a', debit: 100.51, credit: 0 },
      { accountId: 'b', debit: 0, credit: 100.5 },
    ]);
    expect(result.valid).toBe(false);
  });

  it('compares in integer cents — floating-point sums that look unequal balance', () => {
    // 0.1 + 0.2 = 0.30000000000000004 in IEEE 754, but rounded to cents
    // both sides total 30¢. The validator must agree.
    const result = validateJournalEntry([
      { accountId: 'a', debit: 0.1, credit: 0 },
      { accountId: 'b', debit: 0.2, credit: 0 },
      { accountId: 'c', debit: 0, credit: 0.3 },
    ]);
    expect(result.valid).toBe(true);
  });

  it('rejects an entry with fewer than 2 lines', () => {
    const result = validateJournalEntry([{ accountId: 'a', debit: 10, credit: 0 }]);
    expect(result.valid).toBe(false);
  });
});
