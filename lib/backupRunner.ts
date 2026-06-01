// Core backup logic, callable by both the user-triggered endpoint and the
// Electron-initiated auto-backup endpoint. The logic is identical — copy
// the database file to %APPDATA%/PennyCare/backups, create a Backup DB
// record, mirror to every registered external target whose marker still
// verifies — only the caller's identity differs.

import fs from 'fs';
import path from 'path';
import { prisma } from './db';
import { getDatabasePath, getBackupsDir } from './paths';
import { verifyTarget } from './backupTargets';

export type TargetResult = {
  id: string;
  name: string;
  folderPath: string;
  status: 'copied' | 'folder_missing' | 'marker_missing' | 'marker_mismatch' | 'copy_failed';
  error?: string;
};

export interface BackupResult {
  id: string;
  filename: string;
  fileSize: number;
  createdAt: string;
  targets: TargetResult[];
}

export interface PerformBackupInput {
  companyId: string;       // The company to attribute the Backup record to
  createdBy: string;       // userId or 'system' for auto-backups
  description: string | null;
  // Source label for the description prefix when nothing else is given.
  // 'manual' | 'auto_on_open' | 'auto_on_quit' | 'auto_scheduled'
  source: 'manual' | 'auto_on_open' | 'auto_on_quit' | 'auto_scheduled';
}

function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

// Copy a file atomically: write to `<dest>.tmp` first, verify byte count,
// then rename to the final name. If anything goes wrong (interrupted process,
// USB unplugged mid-write, target disk full) the destination filename never
// exists — we either get a valid backup or no backup, never a half-written
// file that looks valid to SQLite. The orphaned .tmp is cleaned up the next
// time a backup runs into the same directory.
//
// The size check catches the most common failure mode (interrupted copy
// leaves a truncated file) without paying for a full SQLite integrity
// check, which would require opening the database.
function copyFileAtomic(src: string, dest: string): void {
  const tmpPath = dest + '.tmp';
  // If a previous attempt left a .tmp here, blow it away before retrying.
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

  // Atomic on NTFS and POSIX filesystems for files on the same volume.
  fs.renameSync(tmpPath, dest);
}

// Sweep orphaned .tmp files from a directory. Called at the start of every
// backup so a previous interrupted run doesn't leak files. We only delete
// .tmp files matching our naming convention (don't touch unrelated files)
// and only ones at least 5 minutes old (avoid racing with a parallel backup
// from a second app window — unlikely but cheap to guard against).
function cleanupStaleTmpFiles(dir: string): void {
  if (!fs.existsSync(dir)) return;
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return; // Directory not readable; not our problem
  }

  const ageThresholdMs = 5 * 60 * 1000;
  const now = Date.now();
  for (const entry of entries) {
    if (!entry.startsWith('pennycare-backup-')) continue;
    if (!entry.endsWith('.tmp')) continue;
    const fullPath = path.join(dir, entry);
    try {
      const stat = fs.statSync(fullPath);
      if (now - stat.mtimeMs >= ageThresholdMs) {
        fs.unlinkSync(fullPath);
      }
    } catch {
      // Best-effort cleanup; failure here doesn't affect the new backup
    }
  }
}

/**
 * Perform a backup end-to-end:
 *   1. Copy the live SQLite file to %APPDATA%/PennyCare/backups (always).
 *   2. Create a Backup row in the database.
 *   3. For each registered external target, verify the marker file then
 *      copy a duplicate there. Per-target failures don't fail the overall
 *      backup — the primary copy is what matters.
 * Returns the Backup record and per-target outcomes.
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

  // Sweep orphaned .tmp files from a previous interrupted backup (process
  // killed mid-copy, USB unplugged, etc.). Done before writing the new
  // backup so the cleanup doesn't fight with the new file.
  cleanupStaleTmpFiles(backupsDir);

  // Flush WAL before copy for consistency. Best-effort — a failure here
  // doesn't mean the backup is bad, just that we couldn't squeeze the last
  // few writes out of the journal.
  try {
    await prisma.$executeRaw`PRAGMA wal_checkpoint(TRUNCATE)`;
  } catch {
    // Non-fatal
  }

  const timestamp = formatTimestamp();
  const filename = `pennycare-backup-${timestamp}.db`;
  const backupPath = path.join(backupsDir, filename);

  // Atomic + size-verified copy. Failure here aborts the entire backup
  // (no Backup row, no target copies attempted) so we never record a
  // backup that doesn't exist on disk.
  copyFileAtomic(dbPath, backupPath);

  const stats = fs.statSync(backupPath);
  const fileSize = stats.size;

  const backup = await prisma.backup.create({
    data: {
      companyId: input.companyId,
      filename,
      fileSize,
      description: input.description,
      createdBy: input.createdBy,
    },
  });

  // Mirror to every registered target whose marker still verifies.
  const targets = await prisma.backupTarget.findMany({ orderBy: { createdAt: 'asc' } });
  const targetResults: TargetResult[] = [];
  const now = new Date();

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

    // Sweep any old .tmp files in the target folder before writing —
    // catches leftovers from a USB that was unplugged mid-copy last time.
    cleanupStaleTmpFiles(target.folderPath);

    try {
      const destPath = path.join(target.folderPath, filename);
      // Atomic + size-verified — same safety net as the local copy.
      // A USB unplug mid-write leaves a .tmp orphan, never a corrupt .db.
      copyFileAtomic(backupPath, destPath);
      await prisma.backupTarget.update({
        where: { id: target.id },
        data: { lastSeenAt: now, lastBackupAt: now },
      });
      targetResults.push({
        id: target.id,
        name: target.name,
        folderPath: target.folderPath,
        status: 'copied',
      });
    } catch (err) {
      console.error(`Failed to copy backup to target ${target.name}:`, err);
      await prisma.backupTarget.update({
        where: { id: target.id },
        data: { lastSeenAt: now },
      });
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
    targets: targetResults,
  };
}
