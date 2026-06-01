import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { getBackupsDir } from '@/lib/paths';
import { performBackup } from '@/lib/backupRunner';
import fs from 'fs';
import path from 'path';

// POST /api/admin/backup — user-initiated backup (clicks "Create Backup")
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const description = body.description || null;

    const result = await performBackup({
      companyId: companyId!,
      createdBy: session!.userId,
      description,
      source: 'manual',
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'backup.create',
      entityType: 'Backup',
      entityId: result.id,
      metadata: {
        filename: result.filename,
        fileSize: result.fileSize,
        description,
        source: 'manual',
        targets: result.targets.map((t) => ({ name: t.name, status: t.status })),
      },
    });

    return NextResponse.json(result);
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

    // Get the company's creation date so the UI can tier reminder urgency.
    // For never-backed-up companies, "days without a backup" is measured
    // from when the company file was first created.
    const company = await prisma.company.findUnique({
      where: { id: companyId! },
      select: { createdAt: true },
    });

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
        // 'system' is a synthetic createdBy for auto-backups — surface
        // it explicitly instead of "Unknown" so the user understands
        // why some backups have no author.
        createdByName: backup.createdBy === 'system'
          ? 'Automatic'
          : (userMap.get(backup.createdBy) || 'Unknown'),
        createdAt: backup.createdAt.toISOString(),
        exists,
      };
    });

    // Get last backup date for reminder
    const lastBackup = backups.length > 0 ? backups[0].createdAt : null;

    return NextResponse.json({
      backups: backupsWithStatus,
      lastBackupDate: lastBackup?.toISOString() || null,
      companyCreatedAt: company?.createdAt.toISOString() || null,
    });
  } catch (err) {
    console.error('Error listing backups:', err);
    return NextResponse.json({ error: 'Failed to list backups' }, { status: 500 });
  }
}
