import { describe, it, expect } from 'vitest';
import {
  classifyUrgency,
  getQuarterlyDueDate,
  getAnnualDueDate,
  computeFilingDeadlines,
  computeDepositDeadlines,
  FiledRecord,
} from '@/lib/taxDeadlines';

describe('classifyUrgency', () => {
  it('returns "overdue" when deadline is in the past', () => {
    const today = new Date(2026, 1, 15);
    const deadline = new Date(2026, 1, 10);
    expect(classifyUrgency(deadline, today)).toBe('overdue');
  });

  it('returns "imminent" when deadline is within 3 days', () => {
    const today = new Date(2026, 1, 15);
    const deadline = new Date(2026, 1, 17);
    expect(classifyUrgency(deadline, today)).toBe('imminent');
  });

  it('returns "imminent" for same-day deadline', () => {
    const today = new Date(2026, 1, 15);
    const deadline = new Date(2026, 1, 15);
    expect(classifyUrgency(deadline, today)).toBe('imminent');
  });

  it('returns "this_week" when deadline is 4-7 days away', () => {
    const today = new Date(2026, 1, 15);
    const deadline = new Date(2026, 1, 20);
    expect(classifyUrgency(deadline, today)).toBe('this_week');
  });

  it('returns "upcoming" when deadline is more than 7 days away', () => {
    const today = new Date(2026, 1, 15);
    const deadline = new Date(2026, 2, 15);
    expect(classifyUrgency(deadline, today)).toBe('upcoming');
  });
});

describe('getQuarterlyDueDate', () => {
  it('returns April 30 for Q1', () => {
    const date = getQuarterlyDueDate(2026, 1);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(3); // April = month 3
    expect(date.getDate()).toBe(30);
  });

  it('returns July 31 for Q2', () => {
    const date = getQuarterlyDueDate(2026, 2);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(6);
    expect(date.getDate()).toBe(31);
  });

  it('returns October 31 for Q3', () => {
    const date = getQuarterlyDueDate(2026, 3);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(9);
    expect(date.getDate()).toBe(31);
  });

  it('returns January 31 of next year for Q4', () => {
    const date = getQuarterlyDueDate(2026, 4);
    expect(date.getFullYear()).toBe(2027);
    expect(date.getMonth()).toBe(0); // January
    expect(date.getDate()).toBe(31);
  });
});

describe('getAnnualDueDate', () => {
  it('returns January 31 of the following year', () => {
    const date = getAnnualDueDate(2025);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(0);
    expect(date.getDate()).toBe(31);
  });
});

describe('computeFilingDeadlines', () => {
  const today = new Date(2026, 3, 1); // April 1, 2026

  // Pay dates that cover every quarter / year that's expected to appear in
  // the test window (Q4 2025 → Q2 2026 + annuals for both years). Without
  // these, the new gating produces zero deadlines.
  const allPeriodsPayDates = [
    new Date(2025, 6, 15),  // Q3 2025
    new Date(2025, 11, 15), // Q4 2025 + year 2025
    new Date(2026, 0, 15),  // Q1 2026 + year 2026
    new Date(2026, 4, 15),  // Q2 2026
  ];

  it('generates quarterly deadlines for 941 and NYS-45', () => {
    const deadlines = computeFilingDeadlines(today, [], allPeriodsPayDates);
    const formTypes = [...new Set(deadlines.map((d) => d.formType))];
    expect(formTypes).toContain('941');
    expect(formTypes).toContain('nys45');
  });

  it('generates annual deadlines for 940 and W-2', () => {
    const deadlines = computeFilingDeadlines(today, [], allPeriodsPayDates);
    const formTypes = [...new Set(deadlines.map((d) => d.formType))];
    expect(formTypes).toContain('940');
    expect(formTypes).toContain('w2');
  });

  it('marks deadlines as filed when matching records exist', () => {
    const filedRecords: FiledRecord[] = [
      { formType: '941', year: 2026, quarter: 1, status: 'filed' },
    ];
    const deadlines = computeFilingDeadlines(today, filedRecords, allPeriodsPayDates);
    const q1_941 = deadlines.find((d) => d.id === '941-2026-Q1');
    expect(q1_941?.isFiled).toBe(true);
  });

  it('marks unfiled deadlines as not filed', () => {
    const deadlines = computeFilingDeadlines(today, [], allPeriodsPayDates);
    const q1_941 = deadlines.find((d) => d.id === '941-2026-Q1');
    expect(q1_941?.isFiled).toBe(false);
  });

  it('does not mark as filed if status is not "filed"', () => {
    const filedRecords: FiledRecord[] = [
      { formType: '941', year: 2026, quarter: 1, status: 'pending' },
    ];
    const deadlines = computeFilingDeadlines(today, filedRecords, allPeriodsPayDates);
    const q1_941 = deadlines.find((d) => d.id === '941-2026-Q1');
    expect(q1_941?.isFiled).toBe(false);
  });

  it('includes href links for each deadline', () => {
    const deadlines = computeFilingDeadlines(today, [], allPeriodsPayDates);
    deadlines.forEach((d) => {
      expect(d.href).toBeDefined();
      expect(d.href!.length).toBeGreaterThan(0);
    });
  });

  it('assigns correct urgency based on today date', () => {
    // Q1 2026 is due April 30 — 29 days from April 1 → "upcoming"
    const deadlines = computeFilingDeadlines(today, [], allPeriodsPayDates);
    const q1_941 = deadlines.find((d) => d.id === '941-2026-Q1');
    expect(q1_941?.urgency).toBe('upcoming');
  });

  it('only includes deadlines within the lookback/lookahead window', () => {
    const deadlines = computeFilingDeadlines(today, [], allPeriodsPayDates);
    // All deadlines should be within 90 days back and 180 days forward
    deadlines.forEach((d) => {
      expect(d.daysUntil).toBeGreaterThanOrEqual(-90);
      expect(d.daysUntil).toBeLessThanOrEqual(180);
    });
  });

  it('returns no filing deadlines when there is no payroll history', () => {
    // The whole point of the gate — a brand-new company with zero payroll
    // should not see any "Q1 941 overdue" warnings, ever.
    const deadlines = computeFilingDeadlines(today, [], []);
    expect(deadlines).toHaveLength(0);
  });

  it('omits quarterly deadlines for quarters with no payroll activity', () => {
    // Only Q2 2026 has payroll — Q1 2026's deadline should be absent
    // even though it's within the lookback window.
    const onlyQ2 = [new Date(2026, 4, 15)];
    const deadlines = computeFilingDeadlines(today, [], onlyQ2);
    expect(deadlines.find((d) => d.id === '941-2026-Q1')).toBeUndefined();
    expect(deadlines.find((d) => d.id === '941-2026-Q2')).toBeDefined();
    expect(deadlines.find((d) => d.id === 'nys45-2026-Q1')).toBeUndefined();
    expect(deadlines.find((d) => d.id === 'nys45-2026-Q2')).toBeDefined();
  });

  it('omits annual deadlines for years with no payroll activity', () => {
    // Only 2026 has payroll — the 2025 annual deadlines (940, W-2) should
    // be absent even though their Jan 31 2026 due date is in window.
    const only2026 = [new Date(2026, 0, 15)];
    const deadlines = computeFilingDeadlines(today, [], only2026);
    expect(deadlines.find((d) => d.id === '940-2025')).toBeUndefined();
    expect(deadlines.find((d) => d.id === 'w2-2025')).toBeUndefined();
  });

  it('treats payroll on the first day of a quarter as activity for that quarter', () => {
    // Boundary check: Jan 1 falls in Q1, not Q4 of the prior year.
    const jan1 = [new Date(2026, 0, 1)];
    const deadlines = computeFilingDeadlines(today, [], jan1);
    expect(deadlines.find((d) => d.id === '941-2026-Q1')).toBeDefined();
    expect(deadlines.find((d) => d.id === '941-2025-Q4')).toBeUndefined();
  });
});

describe('computeDepositDeadlines', () => {
  const today = new Date(2026, 1, 15); // Feb 15, 2026

  it('generates monthly deposit deadlines (15th of following month)', () => {
    const payDates = [new Date(2026, 0, 31)]; // Jan 31 payroll
    const deadlines = computeDepositDeadlines(today, payDates, 'monthly');
    expect(deadlines).toHaveLength(1);
    expect(deadlines[0].type).toBe('deposit');
    // Deposit for January should be due Feb 15
    expect(deadlines[0].deadline).toBe('2026-02-15');
  });

  it('generates semi-weekly deposit deadlines', () => {
    // A Wednesday payday → deposit by following Friday
    const payDates = [new Date(2026, 1, 11)]; // Wed Feb 11
    const deadlines = computeDepositDeadlines(today, payDates, 'semiweekly');
    expect(deadlines.length).toBeGreaterThanOrEqual(1);
    expect(deadlines[0].type).toBe('deposit');
  });

  it('filters out deposits outside the window', () => {
    // A pay date from 6 months ago should be excluded
    const payDates = [new Date(2025, 5, 15)]; // June 2025
    const deadlines = computeDepositDeadlines(today, payDates, 'monthly');
    expect(deadlines).toHaveLength(0);
  });

  it('groups multiple pay dates in same month for monthly schedule', () => {
    const payDates = [
      new Date(2026, 0, 15),
      new Date(2026, 0, 31),
    ]; // Two payrolls in January
    const deadlines = computeDepositDeadlines(today, payDates, 'monthly');
    // Should only create one deposit deadline for January
    expect(deadlines).toHaveLength(1);
  });

  it('returns empty array when no pay dates provided', () => {
    const deadlines = computeDepositDeadlines(today, [], 'monthly');
    expect(deadlines).toHaveLength(0);
  });

  describe('recorded-deposit matching', () => {
    // Today: May 28, 2026 — mirrors the live-build scenario where deposits
    // were already logged but the banner still showed them as overdue.
    const liveToday = new Date(2026, 4, 28);

    it('marks a semi-weekly deadline as filed when a deposit was made on the deadline date', () => {
      // Wed May 13 payday → deadline Wed May 20. Deposit recorded May 20.
      const payDates = [new Date(2026, 4, 13)];
      const deposits = [new Date(2026, 4, 20)];
      const deadlines = computeDepositDeadlines(liveToday, payDates, 'semiweekly', deposits);
      expect(deadlines.length).toBeGreaterThan(0);
      expect(deadlines.every((d) => d.isFiled)).toBe(true);
    });

    it('leaves a deadline unfiled when no deposit exists within the window', () => {
      const payDates = [new Date(2026, 4, 13)];
      const deadlines = computeDepositDeadlines(liveToday, payDates, 'semiweekly', []);
      expect(deadlines.length).toBeGreaterThan(0);
      expect(deadlines.every((d) => !d.isFiled)).toBe(true);
    });

    it('leaves a deadline unfiled when the deposit is outside the ±7 day tolerance', () => {
      // Payday May 13 → deadline May 20. Deposit on May 5 (15 days before) — too far.
      const payDates = [new Date(2026, 4, 13)];
      const deposits = [new Date(2026, 4, 5)];
      const deadlines = computeDepositDeadlines(liveToday, payDates, 'semiweekly', deposits);
      expect(deadlines.every((d) => !d.isFiled)).toBe(true);
    });

    it('matches deposits FIFO so one deposit only satisfies one deadline', () => {
      // Two paydays → two deadlines. Only one deposit. Earliest deadline gets it.
      const payDates = [new Date(2026, 4, 13), new Date(2026, 4, 20)];
      const deposits = [new Date(2026, 4, 20)]; // Could match either, but should go to earliest
      const deadlines = computeDepositDeadlines(liveToday, payDates, 'semiweekly', deposits);
      const sorted = [...deadlines].sort((a, b) => a.deadline.localeCompare(b.deadline));
      expect(sorted[0].isFiled).toBe(true);
      expect(sorted[1].isFiled).toBe(false);
    });

    it('matches multiple deposits to multiple deadlines in order', () => {
      // Live-build scenario: three paydays, three deposits, all paid on time
      const payDates = [
        new Date(2026, 4, 6),   // Wed May 6 → deadline May 13
        new Date(2026, 4, 13),  // Wed May 13 → deadline May 20
        new Date(2026, 4, 20),  // Wed May 20 → deadline May 27
      ];
      const deposits = [
        new Date(2026, 4, 13),
        new Date(2026, 4, 20),
        new Date(2026, 4, 27),
      ];
      const deadlines = computeDepositDeadlines(liveToday, payDates, 'semiweekly', deposits);
      expect(deadlines.every((d) => d.isFiled)).toBe(true);
    });

    it('marks a monthly deadline as filed when the deposit lands near the 15th', () => {
      // January payroll → deposit due Feb 15. Deposit on Feb 14 (1 day early).
      const payDates = [new Date(2026, 0, 31)];
      const deposits = [new Date(2026, 1, 14)];
      const deadlines = computeDepositDeadlines(today, payDates, 'monthly', deposits);
      expect(deadlines.length).toBe(1);
      expect(deadlines[0].isFiled).toBe(true);
    });
  });
});
