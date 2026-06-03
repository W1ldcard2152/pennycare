// Core backup logic, callable by both the user-triggered endpoint and the
// Electron-initiated auto-backup endpoint. The logic is identical — copy
// the database file to %APPDATA%/PennyCare/backups, create a Backup DB
// record, mirror to every registered external target whose marker still
// verifies — only the caller's identity differs.
//
// Retention model (per agreement):
//   rolling — every 4h cadence; keep last 5, prune older
//   weekly  — promoted when >=7 days since the last weekly; keep last 12
//   monthly — promoted on the first backup of a new calendar month;
//             filename labels the month it REPRESENTS THE END OF
//             (Feb 1 backup → "cvbooks-EOM-2026-01-january.db");
//             kept forever, never overwritten on external targets
//
// Mirror to external targets is "local-is-master" for rolling/weekly
// (target mirrors local — overwrite on size mismatch, delete what's
// no longer local), and ADD-ONLY for monthly (once a monthly file lives
// on a USB, the app never touches it again — even if the local copy
// differs after some hypothetical drift).

import fs from 'fs';
import path from 'path';
import { prisma } from './db';
import { getDatabasePath, getBackupsDir } from './paths';
import { verifyTarget } from './backupTargets';

export type RetentionTier = 'rolling' | 'weekly' | 'monthly';

// Per-tier retention counts. Monthly = Infinity (kept forever).
const RETENTION_KEEP: Record<RetentionTier, number> = {
  rolling: 5,
  weekly: 12,
  monthly: Number.POSITIVE_INFINITY,
};

const WEEKLY_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

// Tmp files written during atomic copy. Matches both old (pennycare-) and
// new (cvbooks-) prefixes so we clean up after the rename window too.
const TMP_FILE_PATTERN = /^(cvbooks|pennycare)-.*\.db\.tmp$/;

// Final backup files: rolling/weekly use `backup-` prefix, monthly uses
// `EOM-`. We list and prune files matching either.
const BACKUP_FILE_PATTERN = /^(cvbooks|pennycare)-(backup|EOM)-.+\.db$/;

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];

export type TargetStatus =
  | 'copied'
  | 'folder_missing'
  | 'marker_missing'
  | 'marker_mismatch'
  | 'copy_failed';

export type TargetResult = {
  id: string;
  name: string;
  folderPath: string;
  status: TargetStatus;
  error?: string;
};

export interface BackupResult {
  id: string;
  filename: string;
  fileSize: number;
  createdAt: string;
  retentionTier: RetentionTier;
  targets: TargetResult[];
}

export interface PerformBackupInput {
  companyId: string;       // The company to attribute the Backup record to
  createdBy: string;       // userId or 'system' for auto-backups
  description: string | null;
  source: 'manual' | 'auto_on_open' | 'auto_on_quit' | 'auto_scheduled';
}

// ============================================
// FILENAME + TIER HELPERS (pure, easy to test)
// ============================================

function formatTimestamp(now: Date): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

/**
 * Build the backup filename for a given tier. Monthly snapshots are labeled
 * by the calendar month they represent the END of (so a Feb 1 backup is
 * "cvbooks-EOM-2026-01-january.db"). Year-month numeric prefix keeps the
 * directory sorted chronologically; month name keeps it human-readable for
 * an accountant browsing the USB drive.
 */
export function buildBackupFilename(tier: RetentionTier, now: Date): string {
  if (tier === 'monthly') {
    // The PREVIOUS month — for a Feb 1 backup, label as January.
    // setDate(0) rolls back to the last day of the previous month, which is
    // safe whether `now` is Feb 1 or any later date in February.
    const prevMonth = new Date(now);
    prevMonth.setDate(0);
    const year = prevMonth.getFullYear();
    const monthZeroIndexed = prevMonth.getMonth();
    const monthPadded = String(monthZeroIndexed + 1).padStart(2, '0');
    return `cvbooks-EOM-${year}-${monthPadded}-${MONTH_NAMES[monthZeroIndexed]}.db`;
  }

  const ts = formatTimestamp(now);
  if (tier === 'weekly') {
    return `cvbooks-backup-${ts}-weekly.db`;
  }
  return `cvbooks-backup-${ts}.db`;
}

export function parseTierFromFilename(name: string): RetentionTier | null {
  if (!BACKUP_FILE_PATTERN.test(name)) return null;
  if (name.includes('-EOM-')) return 'monthly';
  if (name.endsWith('-weekly.db')) return 'weekly';
  return 'rolling';
}

function sameCalendarMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
}

/**
 * Decide what tier the next backup should be. Look at the most recent
 * monthly/weekly markers globally (not per-company — the database file is
 * shared across all companies, so tier assignment is also global).
 *
 *   1. If no monthly exists yet, OR the latest monthly is in a different
 *      calendar month than `now` → monthly
 *   2. Else if no weekly-or-higher exists yet, OR the most recent weekly
 *      or monthly is >= 7 days old → weekly
 *   3. Else → rolling
 */
export async function classifyTier(now: Date): Promise<RetentionTier> {
  const latestMonthly = await prisma.backup.findFirst({
    where: { retentionTier: 'monthly' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (!latestMonthly || !sameCalendarMonth(latestMonthly.createdAt, now)) {
    return 'monthly';
  }

  const latestWeeklyOrAbove = await prisma.backup.findFirst({
    where: { retentionTier: { in: ['weekly', 'monthly'] } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  if (
    !latestWeeklyOrAbove ||
    now.getTime() - latestWeeklyOrAbove.createdAt.getTime() >= WEEKLY_COOLDOWN_MS
  ) {
    return 'weekly';
  }

  return 'rolling';
}

// ============================================
// FILESYSTEM HELPERS
// ============================================

interface DirFile { name: string; size: number; mtimeMs: number }

function listBackupFiles(dir: string): DirFile[] {
  if (!fs.existsSync(dir)) return [];
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return []; }

  const result: DirFile[] = [];
  for (const name of entries) {
    if (!BACKUP_FILE_PATTERN.test(name)) continue;
    try {
      const stat = fs.statSync(path.join(dir, name));
      result.push({ name, size: stat.size, mtimeMs: stat.mtimeMs });
    } catch {
      // Best-effort
    }
  }
  return result;
}

function copyFileAtomic(src: string, dest: string): void {
  const tmpPath = dest + '.tmp';
  if (fs.existsSync(tmpPath)) {
    try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
  }

  fs.copyFileSync(src, tmpPath);

  const srcSize = fs.statSync(src).size;
  const tmpSize = fs.statSync(tmpPath).size;
  if (srcSize !== tmpSize) {
    try { fs.unlinkSync(tmpPath); } catch { /* best-effort */ }
    throw new Error(
      `Backup size mismatch: source ${srcSize} bytes, copy ${tmpSize} bytes (likely truncated). Target file was not promoted.`,
    );
  }

  fs.renameSync(tmpPath, dest);
}

// Sweep orphaned .tmp files older than 5 minutes. Only touches files
// matching our backup tmp pattern, never unrelated files in the folder.
function cleanupStaleTmpFiles(dir: string): void {
  if (!fs.existsSync(dir)) return;
  let entries: string[];
  try { entries = fs.readdirSync(dir); } catch { return; }

  const ageThresholdMs = 5 * 60 * 1000;
  const now = Date.now();
  for (const entry of entries) {
    if (!TMP_FILE_PATTERN.test(entry)) continue;
    const fullPath = path.join(dir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs >= ageThresholdMs) {
        fs.unlinkSync(fullPath);
      }
    } catch {
      // Best-effort
    }
  }
}

// ============================================
// RETENTION
// ============================================

/**
 * Prune rolling and weekly Backup rows beyond their retention counts.
 * Monthly rows are never deleted automatically. For each row deleted,
 * the corresponding file in `backupsDir` is also removed.
 *
 * Iterates by tier rather than by company because the backup file itself
 * is shared across all companies — pruning is a global operation.
 */
async function pruneLocalBackups(backupsDir: string): Promise<void> {
  for (const tier of ['rolling', 'weekly'] as const) {
    const keep = RETENTION_KEEP[tier];
    if (!Number.isFinite(keep)) continue;

    const rows = await prisma.backup.findMany({
      where: { retentionTier: tier },
      orderBy: { createdAt: 'desc' },
    });

    const toDelete = rows.slice(keep);
    for (const row of toDelete) {
      const filePath = path.join(backupsDir, row.filename);
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch (err) {
        console.warn(`[backup-prune] could not delete ${filePath}:`, err);
      }
      try {
        await prisma.backup.delete({ where: { id: row.id } });
      } catch (err) {
        console.warn(`[backup-prune] could not delete row ${row.id}:`, err);
      }
    }
  }
}

// ============================================
// TARGET SYNC (the multi-target mirror logic)
// ============================================

/**
 * Bring an external target into agreement with the local backup directory.
 *
 *   - For files matching our backup pattern that are in `local` but not on
 *     `target`: copy them over (atomic).
 *   - For files in `local` AND `target` with the same name but different
 *     sizes: rolling/weekly → overwrite target (local is master); monthly →
 *     leave target alone (add-only safety per the agreement).
 *   - For files on `target` but not in `local`: rolling/weekly → delete
 *     from target (it was pruned locally); monthly → leave alone.
 *
 * Returns whether the new backup landed on the target this call so the
 * caller can update lastBackupAt only when there's something to commemorate.
 */
function syncTargetDirectoryWithLocal(
  localDir: string,
  targetDir: string,
  newBackupFilename: string,
): { newBackupCopied: boolean } {
  const localFiles = listBackupFiles(localDir);
  const localByName = new Map(localFiles.map((f) => [f.name, f]));

  const targetFiles = listBackupFiles(targetDir);
  const targetByName = new Map(targetFiles.map((f) => [f.name, f]));

  let newBackupCopied = false;

  // Local → target: copy missing, overwrite mismatched (except monthly).
  for (const [name, localFile] of localByName) {
    const tier = parseTierFromFilename(name);
    if (!tier) continue;
    const localPath = path.join(localDir, name);
    const targetPath = path.join(targetDir, name);
    const onTarget = targetByName.get(name);

    if (!onTarget) {
      copyFileAtomic(localPath, targetPath);
      if (name === newBackupFilename) newBackupCopied = true;
      continue;
    }

    if (tier === 'monthly') {
      // Add-only safety: never overwrite an existing monthly on the target.
      // If contents differ, that's the USB's history — we leave it alone.
      if (name === newBackupFilename) newBackupCopied = true; // already there
      continue;
    }

    if (onTarget.size !== localFile.size) {
      // Rolling/weekly: target should mirror local — overwrite.
      copyFileAtomic(localPath, targetPath);
    }
    if (name === newBackupFilename) newBackupCopied = true;
  }

  // Target → cleanup: delete rolling/weekly files that no longer exist
  // locally (they were pruned by retention). Never delete monthlies from
  // the target — they're the offsite archive even if we lost the local row.
  for (const [name] of targetByName) {
    if (localByName.has(name)) continue;
    const tier = parseTierFromFilename(name);
    if (!tier || tier === 'monthly') continue;
    try {
      fs.unlinkSync(path.join(targetDir, name));
    } catch (err) {
      console.warn(`[backup-sync] could not delete target file ${name}:`, err);
    }
  }

  return { newBackupCopied };
}

// ============================================
// MAIN ENTRY POINT
// ============================================

/**
 * Perform a backup end-to-end:
 *   1. Sweep orphaned .tmp files from a previous interrupted run.
 *   2. Decide what tier this backup should be (rolling/weekly/monthly).
 *   3. Build the appropriate filename.
 *   4. Flush WAL, copy the live SQLite file to %APPDATA%/PennyCare/backups.
 *   5. Create the Backup DB row with the chosen tier.
 *   6. Prune local rolling/weekly beyond retention (monthly is forever).
 *   7. For each registered external target whose marker verifies, run
 *      a diff-sync that backfills missing files (local → target),
 *      overwrites mismatched rolling/weekly files, and deletes
 *      rolling/weekly files that no longer exist locally. Monthly
 *      files on targets are strictly add-only.
 */
export async function performBackup(input: PerformBackupInput): Promise<BackupResult> {
  const dbPath = getDatabasePath();
  const backupsDir = getBackupsDir();

  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database file not found at ${dbPath}`);
  }

  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  cleanupStaleTmpFiles(backupsDir);

  const now = new Date();
  const tier = await classifyTier(now);
  const filename = buildBackupFilename(tier, now);
  const backupPath = path.join(backupsDir, filename);

  // Flush WAL before copy for consistency. Best-effort — a failure here
  // doesn't mean the backup is bad, just that we couldn't squeeze the last
  // few writes out of the journal.
  try {
    await prisma.$executeRaw`PRAGMA wal_checkpoint(TRUNCATE)`;
  } catch {
    // Non-fatal
  }

  // Atomic + size-verified copy. Failure here aborts the entire backup
  // (no Backup row, no target copies attempted) so we never record a
  // backup that doesn't exist on disk.
  copyFileAtomic(dbPath, backupPath);

  const fileSize = fs.statSync(backupPath).size;

  const backup = await prisma.backup.create({
    data: {
      companyId: input.companyId,
      filename,
      fileSize,
      description: input.description,
      createdBy: input.createdBy,
      retentionTier: tier,
    },
  });

  // Run local retention BEFORE syncing to targets so targets see the
  // already-pruned local set as the source of truth.
  await pruneLocalBackups(backupsDir);

  // Mirror to every registered target whose marker still verifies.
  const targets = await prisma.backupTarget.findMany({ orderBy: { createdAt: 'asc' } });
  const targetResults: TargetResult[] = [];

  for (const target of targets) {
    const verification = verifyTarget(target.folderPath, target.markerId);
    if (!verification.ok) {
      targetResults.push({
        id: target.id,
        name: target.name,
        folderPath: target.folderPath,
        status: verification.reason,
      });
      continue;
    }

    cleanupStaleTmpFiles(target.folderPath);

    try {
      const result = syncTargetDirectoryWithLocal(backupsDir, target.folderPath, filename);
      await prisma.backupTarget.update({
        where: { id: target.id },
        data: {
          lastSeenAt: now,
          ...(result.newBackupCopied ? { lastBackupAt: now } : {}),
        },
      });
      targetResults.push({
        id: target.id,
        name: target.name,
        folderPath: target.folderPath,
        status: 'copied',
      });
    } catch (err) {
      console.error(`Failed to sync backup target ${target.name}:`, err);
      // Still update lastSeenAt — the folder/marker were there, just hit
      // a snag during sync (probably a single-file write error).
      try {
        await prisma.backupTarget.update({
          where: { id: target.id },
          data: { lastSeenAt: now },
        });
      } catch { /* nested failure; ignore */ }
      targetResults.push({
        id: target.id,
        name: target.name,
        folderPath: target.folderPath,
        status: 'copy_failed',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    id: backup.id,
    filename: backup.filename,
    fileSize: backup.fileSize,
    createdAt: backup.createdAt.toISOString(),
    retentionTier: tier,
    targets: targetResults,
  };
}
