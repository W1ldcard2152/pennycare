import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import fs from 'fs';
import path from 'path';

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

// Format filename timestamp: YYYY-MM-DD-HHmmss
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

// POST /api/admin/backup - Create a new backup
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const description = body.description || null;

    const dbPath = getDatabasePath();
    const backupsDir = getBackupsDir();

    console.log('Database path:', dbPath);
    console.log('Backups directory:', backupsDir);

    // Verify the database file exists
    if (!fs.existsSync(dbPath)) {
      console.error('Database file not found at:', dbPath);
      return NextResponse.json(
        { error: `Database file not found at: ${dbPath}` },
        { status: 500 }
      );
    }

    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // Generate filename
    const timestamp = formatTimestamp();
    const filename = `pennycare-backup-${timestamp}.db`;
    const backupPath = path.join(backupsDir, filename);

    // Optional: Flush WAL before copy for extra safety
    try {
      await prisma.$executeRaw`PRAGMA wal_checkpoint(TRUNCATE)`;
    } catch {
      // Not critical if this fails - continue with backup
    }

    // Copy the database file
    fs.copyFileSync(dbPath, backupPath);

    // Get file size
    const stats = fs.statSync(backupPath);
    const fileSize = stats.size;

    // Create backup record
    const backup = await prisma.backup.create({
      data: {
        companyId: companyId!,
        filename,
        fileSize,
        description,
        createdBy: session!.userId,
      },
    });

    // Log audit
    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'backup.create',
      entityType: 'Backup',
      entityId: backup.id,
      metadata: { filename, fileSize, description },
    });

    return NextResponse.json({
      id: backup.id,
      filename: backup.filename,
      fileSize: backup.fileSize,
      createdAt: backup.createdAt.toISOString(),
    });
  } catch (err) {
    console.error('Error creating backup:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to create backup: ${errorMessage}` }, { status: 500 });
  }
}

// GET /api/admin/backup - List all backups
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;

    const backupsDir = getBackupsDir();

    // Get all backup records
    const backups = await prisma.backup.findMany({
      where: { companyId: companyId! },
      orderBy: { createdAt: 'desc' },
    });

    // Get user info for each backup
    const userIds = [...new Set(backups.map((b) => b.createdBy))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = new Map(users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]));

    // Check if each backup file still exists on disk
    const backupsWithStatus = backups.map((backup) => {
      const backupPath = path.join(backupsDir, backup.filename);
      const exists = fs.existsSync(backupPath);
      return {
        id: backup.id,
        filename: backup.filename,
        fileSize: backup.fileSize,
        description: backup.description,
        createdBy: backup.createdBy,
        createdByName: userMap.get(backup.createdBy) || 'Unknown',
        createdAt: backup.createdAt.toISOString(),
        exists,
      };
    });

    // Get last backup date for reminder
    const lastBackup = backups.length > 0 ? backups[0].createdAt : null;

    return NextResponse.json({
      backups: backupsWithStatus,
      lastBackupDate: lastBackup?.toISOString() || null,
    });
  } catch (err) {
    console.error('Error listing backups:', err);
    return NextResponse.json({ error: 'Failed to list backups' }, { status: 500 });
  }
}
