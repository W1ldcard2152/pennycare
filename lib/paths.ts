import path from 'path';

// PENNYCARE_DATA_DIR is set by the Electron main process. Absent → dev mode.
function isElectronMode(): boolean {
  return !!process.env.PENNYCARE_DATA_DIR;
}

export function getDataDir(): string {
  return process.env.PENNYCARE_DATA_DIR || process.cwd();
}

/**
 * Returns the absolute path to the active SQLite database file by parsing
 * DATABASE_URL. This is the single source of truth — Prisma resolves the
 * same env var, so the backup code can never disagree with where the live
 * database actually lives.
 *
 * Prisma's file: URL convention:
 *   - `file:/abs/path.db` or `file:C:/abs/path.db` → absolute
 *   - `file:./rel/path.db` or `file:rel/path.db`  → relative to the
 *     `prisma/` directory (where schema.prisma lives), NOT to the
 *     project root or process.cwd()
 *
 * In Electron mode the main process sets DATABASE_URL to an absolute
 * file: URL pointing at `%APPDATA%/PennyCare/<dbname>`, so the same
 * parser handles both cases.
 */
export function getDatabasePath(): string {
  const url = process.env.DATABASE_URL;
  if (url && url.startsWith('file:')) {
    const raw = url.slice('file:'.length);
    if (path.isAbsolute(raw)) {
      return raw;
    }
    // Relative paths resolve against the prisma/ directory in dev,
    // against the data dir directly in Electron (main process always
    // sets an absolute URL there, but defend against future drift).
    const base = isElectronMode() ? getDataDir() : path.join(getDataDir(), 'prisma');
    return path.resolve(base, raw);
  }

  // Last-resort fallback if DATABASE_URL isn't set or doesn't use file:
  // — keeps the function usable in odd contexts (e.g. unit tests).
  if (isElectronMode()) {
    return path.join(getDataDir(), 'pennycare.db');
  }
  return path.join(getDataDir(), 'prisma', 'pennycare.db');
}

export function getUploadsDir(): string {
  return path.join(getDataDir(), 'uploads');
}

export function getBackupsDir(): string {
  return path.join(getDataDir(), 'backups');
}

// Company-uploaded document templates. System templates ship in public/document-templates
// and are read-only; company templates are user data and must live outside the install dir.
export function getCompanyTemplatesDir(companyId?: string): string {
  const base = path.join(getDataDir(), 'document-templates', 'company');
  return companyId ? path.join(base, companyId) : base;
}
