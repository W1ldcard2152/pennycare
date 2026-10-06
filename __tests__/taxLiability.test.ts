import { describe, it, expect } from 'vitest';
import {
  SCOPE_ACCOUNTS,
  combinePeriodLiability,
  depositBreakdown,
  periodBounds,
  quarterOfBusinessDate,
  recentQuarters,
  suggestDepositPeriod,
  sumPaymentsByAccount,
} from '@/lib/tax-liability';

describe('periodBounds', () => {
  it('covers a quarter in UTC business-date bounds', () => {
    const q3 = periodBounds(2026, 3);
    expect(q3.start.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(q3.end.toISOString()).toBe('2026-09-30T23:59:59.999Z');
  });

  it('covers the whole year when quarter is null', () => {
    const y = periodBounds(2026, null);
    expect(y.start.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(y.end.toISOString()).toBe('2026-12-31T23:59:59.999Z');
  });
});

describe('quarterOfBusinessDate', () => {
  it('reads noon-UTC business dates in UTC, so July 1 is Q3', () => {
    expect(quarterOfBusinessDate(new Date('2026-07-01T12:00:00Z'))).toBe(3);
    expect(quarterOfBusinessDate(new Date('2026-06-30T12:00:00Z'))).toBe(2);
  });
});

describe('sumPaymentsByAccount', () => {
  it('maps deposit columns to the accounts they clear, Medicare + additional together', () => {
    expect(
      sumPaymentsByAccount([
        { federalIncomeTaxWithheld: 100, socialSecurityTax: 124, medicareTax: 29, additionalMedicareTax: 9 },
        { federalIncomeTaxWithheld: 50, stateIncomeTaxWithheld: 40 },
      ])
    ).toEqual({ '2110': 150, '2130': 124, '2140': 38, '2120': 40 });
  });
});

describe('combinePeriodLiability', () => {
  it('nets accruals against payments recorded for the period', () => {
    const l = combinePeriodLiability(2026, 3, SCOPE_ACCOUNTS.federal, { '2110': 300, '2130': 400 }, { '2110': 300, '2130': 100 });
    expect(l.accrued).toBe(700);
    expect(l.paid).toBe(400);
    expect(l.outstanding).toBe(300);
    expect(l.byAccount['2140']).toEqual({ accrued: 0, paid: 0, outstanding: 0 });
  });

  it('reports an overpaid period as a negative balance', () => {
    expect(combinePeriodLiability(2026, 2, SCOPE_ACCOUNTS.federal, { '2110': 100 }, { '2110': 150 }).outstanding).toBe(-50);
  });
});

describe('depositBreakdown', () => {
  it('pays each owed account and skips overpaid ones', () => {
    const l = combinePeriodLiability(
      2026,
      3,
      SCOPE_ACCOUNTS.federal,
      { '2110': 100, '2130': 200, '2140': 50 },
      { '2130': 250 }
    );
    const b = depositBreakdown(l);
    expect(b.federalIncomeTaxWithheld).toBe(100);
    expect(b.socialSecurityTax).toBe(0);
    expect(b.medicareTax).toBe(50);
    expect(b.total).toBe(150);
  });
});

describe('recentQuarters', () => {
  it('lists quarters oldest first, crossing the year boundary', () => {
    expect(recentQuarters(new Date(2026, 1, 10), 3)).toEqual([
      { year: 2025, quarter: 3 },
      { year: 2025, quarter: 4 },
      { year: 2026, quarter: 1 },
    ]);
  });
});

describe('suggestDepositPeriod', () => {
  const period = (quarter: number, outstanding: number) =>
    combinePeriodLiability(2026, quarter, ['2110'], { '2110': 1000 }, { '2110': 1000 - outstanding });

  it("picks the oldest quarter still owed — June's liability paid in July is Q2", () => {
    expect(suggestDepositPeriod([period(1, 0), period(2, 505.96), period(3, 1011.92)], { year: 2026, quarter: 3 })).toEqual({
      year: 2026,
      quarter: 2,
    });
  });

  it('falls back to the current quarter when everything is paid or overpaid', () => {
    expect(suggestDepositPeriod([period(2, -20), period(3, 0)], { year: 2026, quarter: 3 })).toEqual({
      year: 2026,
      quarter: 3,
    });
  });
});
