import { describe, it, expect, vi } from 'vitest';

// nys1FilerDays is pure; keep the module's database client out of the test.
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { nys1FilerDays, NYS1_THREE_DAY_LOOKBACK_THRESHOLD } from '@/lib/nys1';

describe('nys1FilerDays — 3- or 5-day NYS-1 filer', () => {
  it('uses the $15,000 lookback threshold', () => {
    expect(NYS1_THREE_DAY_LOOKBACK_THRESHOLD).toBe(15000);
  });

  it('is a 3-day filer when the app’s own records reach $15,000, whatever the setting', () => {
    expect(nys1FilerDays(15000, 5)).toEqual({ days: 3, basis: 'lookback' });
    expect(nys1FilerDays(22000.5, 5)).toEqual({ days: 3, basis: 'lookback' });
  });

  it('falls back to the setting below $15,000 — records may be incomplete', () => {
    expect(nys1FilerDays(14999.99, 3)).toEqual({ days: 3, basis: 'setting' });
    expect(nys1FilerDays(0, 5)).toEqual({ days: 5, basis: 'setting' });
  });

  it('treats any setting other than 3 as the 5-day default', () => {
    expect(nys1FilerDays(0, 4)).toEqual({ days: 5, basis: 'setting' });
  });
});
