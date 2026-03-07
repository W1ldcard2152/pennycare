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

  it('generates quarterly deadlines for 941 and NYS-45', () => {
    const deadlines = computeFilingDeadlines(today, []);
    const formTypes = [...new Set(deadlines.map((d) => d.formType))];
    expect(formTypes).toContain('941');
    expect(formTypes).toContain('nys45');
  });

  it('generates annual deadlines for 940 and W-2', () => {
    const deadlines = computeFilingDeadlines(today, []);
    const formTypes = [...new Set(deadlines.map((d) => d.formType))];
    expect(formTypes).toContain('940');
    expect(formTypes).toContain('w2');
  });

  it('marks deadlines as filed when matching records exist', () => {
    const filedRecords: FiledRecord[] = [
      { formType: '941', year: 2026, quarter: 1, status: 'filed' },
    ];
    const deadlines = computeFilingDeadlines(today, filedRecords);
    const q1_941 = deadlines.find((d) => d.id === '941-2026-Q1');
    expect(q1_941?.isFiled).toBe(true);
  });

  it('marks unfiled deadlines as not filed', () => {
    const deadlines = computeFilingDeadlines(today, []);
    const q1_941 = deadlines.find((d) => d.id === '941-2026-Q1');
    expect(q1_941?.isFiled).toBe(false);
  });

  it('does not mark as filed if status is not "filed"', () => {
    const filedRecords: FiledRecord[] = [
      { formType: '941', year: 2026, quarter: 1, status: 'pending' },
    ];
    const deadlines = computeFilingDeadlines(today, filedRecords);
    const q1_941 = deadlines.find((d) => d.id === '941-2026-Q1');
    expect(q1_941?.isFiled).toBe(false);
  });

  it('includes href links for each deadline', () => {
    const deadlines = computeFilingDeadlines(today, []);
    deadlines.forEach((d) => {
      expect(d.href).toBeDefined();
      expect(d.href!.length).toBeGreaterThan(0);
    });
  });

  it('assigns correct urgency based on today date', () => {
    // Q1 2026 is due April 30 — 29 days from April 1 → "upcoming"
    const deadlines = computeFilingDeadlines(today, []);
    const q1_941 = deadlines.find((d) => d.id === '941-2026-Q1');
    expect(q1_941?.urgency).toBe('upcoming');
  });

  it('only includes deadlines within the lookback/lookahead window', () => {
    const deadlines = computeFilingDeadlines(today, []);
    // All deadlines should be within 90 days back and 180 days forward
    deadlines.forEach((d) => {
      expect(d.daysUntil).toBeGreaterThanOrEqual(-90);
      expect(d.daysUntil).toBeLessThanOrEqual(180);
    });
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
});
