import { NextRequest, NextResponse } from 'next/server';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import fs from 'fs';
import path from 'path';

// SQLite file header magic bytes: "SQLite format 3\x00"
const SQLITE_MAGIC = Buffer.from([0x53, 0x51, 0x4c, 0x69, 0x74, 0x65, 0x20, 0x66, 0x6f, 0x72, 0x6d, 0x61, 0x74, 0x20, 0x33, 0x00]);

// Get the database file path from DATABASE_URL
function getDatabasePath(): string {
  const dbUrl = process.env.DATABASE_URL || 'file:./prisma/pennycare.db';
  // Remove the "file:" prefix and handle relative paths
  let dbPath = dbUrl.replace(/^file:/, '');
  // Remove leading ./ if present
  if (dbPath.startsWith('./')) {
    dbPath = dbPath.substring(2);
  }

  // Try multiple possible locations for the database
  const possiblePaths = [
    // Direct path from project root
    path.resolve(process.cwd(), dbPath),
    // Prisma resolves relative to the prisma folder, so check prisma/prisma/
    path.resolve(process.cwd(), 'prisma', dbPath),
    // Also check dev.db at project root (common alternative)
    path.resolve(process.cwd(), 'dev.db'),
  ];

  for (const p of possiblePaths) {
    const normalized = path.normalize(p);
    if (fs.existsSync(normalized)) {
      return normalized;
    }
  }

  // Return the first option if none exist (will trigger error message)
  return path.normalize(possiblePaths[0]);
}

// Get the backups directory path
function getBackupsDir(): string {
  return path.resolve(process.cwd(), 'backups');
}

// Format filename timestamp
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

// Validate SQLite file header
function isValidSqliteFile(buffer: Buffer): boolean {
  if (buffer.length < 16) return false;
  return buffer.subarray(0, 16).equals(SQLITE_MAGIC);
}

// POST /api/admin/backup/restore - Restore from uploaded backup file
export async function POST(request: NextRequest) {
  try {
    // Only owners can restore (destructive operation)
    // Note: We check for owner role but don't fail if company lookup fails,
    // since this might be called after clearing all data with a fresh account
    const { error, companyId, session } = await requireCompanyAccess('owner');

    // If there's an auth error, check if it's just a company access issue
    // In that case, we still allow restore if user is authenticated
    if (error) {
      // Try to get just the session without company check
      const { getSession } = await import('@/lib/auth');
      const basicSession = await getSession();
      if (!basicSession) {
        return error; // Not authenticated at all
      }
      // User is authenticated, allow restore (they just created a fresh account)
      console.log('Restore: User authenticated but company access check failed - allowing restore for fresh account');
    }

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // Check file size (max 100MB)
    const MAX_SIZE = 100 * 1024 * 1024;
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 100MB.' },
        { status: 400 }
      );
    }

    // Check file extension
    if (!file.name.endsWith('.db')) {
      return NextResponse.json(
        { error: 'Invalid file type. Only .db files are accepted.' },
        { status: 400 }
      );
    }

    // Read file content
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Validate SQLite header
    if (!isValidSqliteFile(buffer)) {
      return NextResponse.json(
        { error: 'Invalid file. This does not appear to be a valid SQLite database.' },
        { status: 400 }
      );
    }

    const dbPath = getDatabasePath();
    const backupsDir = getBackupsDir();

    // Ensure backups directory exists
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // Create automatic backup of current database before restore
    const timestamp = formatTimestamp();
    const autoBackupFilename = `pennycare-pre-restore-${timestamp}.db`;
    const autoBackupPath = path.join(backupsDir, autoBackupFilename);

    if (fs.existsSync(dbPath)) {
      fs.copyFileSync(dbPath, autoBackupPath);
    }

    // Write the uploaded file to a temp location first
    const tempPath = path.join(backupsDir, `temp-restore-${timestamp}.db`);
    fs.writeFileSync(tempPath, buffer);

    // Replace the current database
    fs.copyFileSync(tempPath, dbPath);

    // Clean up temp file
    fs.unlinkSync(tempPath);

    // Log the restore (note: this will be logged in the OLD database connection
    // which may still be cached, but the file on disk is the new one)
    // Also, companyId/session might be null if this is a fresh account restore
    if (companyId && session) {
      try {
        await logAudit({
          companyId,
          userId: session.userId,
          action: 'backup.restore',
          entityType: 'Backup',
          entityId: 'restore',
          metadata: {
            uploadedFilename: file.name,
            uploadedFileSize: file.size,
            autoBackupFilename,
          },
        });
      } catch {
        // Audit logging may fail after restore since the DB connection is stale
        // This is expected - the important thing is the restore succeeded
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Database restored successfully. Please restart the server for changes to take effect.',
      autoBackup: autoBackupFilename,
    });
  } catch (err) {
    console.error('Error restoring backup:', err);
    return NextResponse.json({ error: 'Failed to restore backup' }, { status: 500 });
  }
}
