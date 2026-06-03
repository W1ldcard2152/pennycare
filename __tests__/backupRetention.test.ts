import { describe, it, expect } from 'vitest';
import { buildBackupFilename, parseTierFromFilename } from '@/lib/backupRunner';

describe('buildBackupFilename', () => {
  it('builds rolling filename with full timestamp', () => {
    const now = new Date(2026, 1, 15, 10, 30, 22); // Feb 15, 2026 10:30:22
    const name = buildBackupFilename('rolling', now);
    expect(name).toBe('cvbooks-backup-2026-02-15-103022.db');
  });

  it('builds weekly filename with -weekly suffix', () => {
    const now = new Date(2026, 1, 15, 10, 30, 22);
    const name = buildBackupFilename('weekly', now);
    expect(name).toBe('cvbooks-backup-2026-02-15-103022-weekly.db');
  });

  it('builds monthly filename labeled by the PREVIOUS calendar month', () => {
    // A Feb 1 backup represents the END of January
    const feb1 = new Date(2026, 1, 1, 0, 0, 5);
    expect(buildBackupFilename('monthly', feb1)).toBe('cvbooks-EOM-2026-01-january.db');
  });

  it('handles year boundary — Jan 1 backup labels as previous December', () => {
    const jan1 = new Date(2026, 0, 1, 8, 0, 0);
    expect(buildBackupFilename('monthly', jan1)).toBe('cvbooks-EOM-2025-12-december.db');
  });

  it('still uses previous-month label if monthly fires mid-month (gap scenario)', () => {
    // If the app wasn't used until Feb 15 and that's the first monthly,
    // it still labels as January (best approximation of EOM-Jan state)
    const feb15 = new Date(2026, 1, 15, 14, 0, 0);
    expect(buildBackupFilename('monthly', feb15)).toBe('cvbooks-EOM-2026-01-january.db');
  });

  it('zero-pads single-digit month numbers', () => {
    const oct1 = new Date(2026, 9, 1); // first of October → September label
    expect(buildBackupFilename('monthly', oct1)).toBe('cvbooks-EOM-2026-09-september.db');
  });
});

describe('parseTierFromFilename', () => {
  it('recognizes rolling backups (new prefix)', () => {
    expect(parseTierFromFilename('cvbooks-backup-2026-02-15-103022.db')).toBe('rolling');
  });

  it('recognizes weekly backups by -weekly suffix', () => {
    expect(parseTierFromFilename('cvbooks-backup-2026-02-15-103022-weekly.db')).toBe('weekly');
  });

  it('recognizes monthly backups by -EOM- segment', () => {
    expect(parseTierFromFilename('cvbooks-EOM-2026-01-january.db')).toBe('monthly');
  });

  it('accepts the legacy pennycare- prefix during the rename window', () => {
    expect(parseTierFromFilename('pennycare-backup-2026-02-15-103022.db')).toBe('rolling');
    expect(parseTierFromFilename('pennycare-backup-2026-02-15-103022-weekly.db')).toBe('weekly');
    expect(parseTierFromFilename('pennycare-EOM-2026-01-january.db')).toBe('monthly');
  });

  it('rejects unrelated files (cleanup safety)', () => {
    expect(parseTierFromFilename('random-file.db')).toBeNull();
    expect(parseTierFromFilename('cvbooks-backup-2026-02-15.txt')).toBeNull();
    expect(parseTierFromFilename('.pennycare-backup-target.json')).toBeNull();
    expect(parseTierFromFilename('something.tmp')).toBeNull();
  });

  it('rejects in-progress .tmp files (so they are never treated as tier-classified)', () => {
    // .tmp files match a different pattern in cleanupStaleTmpFiles and
    // should not be classified as final backups.
    expect(parseTierFromFilename('cvbooks-backup-2026-02-15-103022.db.tmp')).toBeNull();
    expect(parseTierFromFilename('cvbooks-EOM-2026-01-january.db.tmp')).toBeNull();
  });
});

describe('round-trip: build then parse produces the same tier', () => {
  const now = new Date(2026, 1, 1, 8, 30, 0);
  it.each(['rolling', 'weekly', 'monthly'] as const)('tier %s', (tier) => {
    const filename = buildBackupFilename(tier, now);
    expect(parseTierFromFilename(filename)).toBe(tier);
  });
});
