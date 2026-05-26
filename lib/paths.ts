import path from 'path';

// PENNYCARE_DATA_DIR is set by the Electron main process. Absent → dev mode.
function isElectronMode(): boolean {
  return !!process.env.PENNYCARE_DATA_DIR;
}

export function getDataDir(): string {
  return process.env.PENNYCARE_DATA_DIR || process.cwd();
}

export function getDatabasePath(): string {
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
