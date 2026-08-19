import { describe, it, expect } from 'vitest';
import {
  JE_STATUS,
  LEGAL_TRANSITIONS,
  isLegalTransition,
  isSystemSource,
  JE_SOURCES,
  type JeStatus,
} from '@/lib/je-status';
import { flipLines } from '@/lib/journal-entry-service';

describe('JE status constants', () => {
  it('keeps the stored BOOKED value as "posted" for 1.1 compatibility', () => {
    expect(JE_STATUS.BOOKED).toBe('posted');
    expect(JE_STATUS.DRAFT).toBe('draft');
    expect(JE_STATUS.PENDING).toBe('pending_approval');
    expect(JE_STATUS.REJECTED).toBe('rejected');
    expect(JE_STATUS.VOIDED).toBe('voided');
  });
});

describe('JE state machine — legal transitions', () => {
  const legal: Array<[JeStatus, JeStatus]> = [
    [JE_STATUS.DRAFT, JE_STATUS.PENDING],
    [JE_STATUS.PENDING, JE_STATUS.BOOKED],
    [JE_STATUS.PENDING, JE_STATUS.REJECTED],
    [JE_STATUS.REJECTED, JE_STATUS.DRAFT],
    [JE_STATUS.BOOKED, JE_STATUS.VOIDED],
  ];

  it.each(legal)('allows %s → %s', (from, to) => {
    expect(isLegalTransition(from, to)).toBe(true);
  });

  it('VOIDED is terminal (no outgoing transitions)', () => {
    expect(LEGAL_TRANSITIONS[JE_STATUS.VOIDED]).toEqual([]);
  });

  // Every pair NOT in the legal set must be rejected.
  const all = Object.values(JE_STATUS) as JeStatus[];
  const legalSet = new Set(legal.map(([f, t]) => `${f}>${t}`));
  const illegal = all.flatMap((f) => all.map((t) => [f, t] as [JeStatus, JeStatus]))
    .filter(([f, t]) => !legalSet.has(`${f}>${t}`));

  it.each(illegal)('rejects %s → %s', (from, to) => {
    expect(isLegalTransition(from, to)).toBe(false);
  });

  it('rejects no-op self transitions (e.g. posted → posted)', () => {
    expect(isLegalTransition(JE_STATUS.BOOKED, JE_STATUS.BOOKED)).toBe(false);
    expect(isLegalTransition(JE_STATUS.DRAFT, JE_STATUS.DRAFT)).toBe(false);
  });
});

describe('isSystemSource', () => {
  it('treats only "manual" as non-system', () => {
    expect(isSystemSource('manual')).toBe(false);
    for (const src of JE_SOURCES.filter((s) => s !== 'manual')) {
      expect(isSystemSource(src)).toBe(true);
    }
  });

  it('includes the new 1.2 sources', () => {
    expect(JE_SOURCES).toContain('reversal');
    expect(JE_SOURCES).toContain('reclassification');
    expect(JE_SOURCES).toContain('payroll_payment');
    expect(JE_SOURCES).toContain('tax_deposit');
  });
});

describe('flipLines (reversing-entry core)', () => {
  it('swaps debit and credit penny-exact', () => {
    const out = flipLines([
      { accountId: 'a', description: 'x', debit: 123.45, credit: 0 },
      { accountId: 'b', description: null, debit: 0, credit: 123.45 },
    ]);
    expect(out).toEqual([
      { accountId: 'a', description: 'x', debit: 0, credit: 123.45 },
      { accountId: 'b', description: undefined, debit: 123.45, credit: 0 },
    ]);
  });

  it('keeps the entry balanced after flipping', () => {
    const original = [
      { accountId: 'a', debit: 100, credit: 0 },
      { accountId: 'b', debit: 50, credit: 0 },
      { accountId: 'c', debit: 0, credit: 150 },
    ];
    const flipped = flipLines(original);
    const debits = flipped.reduce((s, l) => s + l.debit, 0);
    const credits = flipped.reduce((s, l) => s + l.credit, 0);
    expect(debits).toBe(credits);
    expect(debits).toBe(150);
  });

  it('does not mutate the input lines', () => {
    const input = [{ accountId: 'a', debit: 10, credit: 0 }];
    flipLines(input);
    expect(input[0]).toEqual({ accountId: 'a', debit: 10, credit: 0 });
  });
});
