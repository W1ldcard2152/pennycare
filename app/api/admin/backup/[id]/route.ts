import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import fs from 'fs';
import path from 'path';

// Get the backups directory path
function getBackupsDir(): string {
  return path.resolve(process.cwd(), 'backups');
}

// DELETE /api/admin/backup/[id] - Delete a backup
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const { id } = await params;

    // Get the backup record
    const backup = await prisma.backup.findUnique({
      where: { id },
    });

    if (!backup) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    // Verify it belongs to this company
    if (backup.companyId !== companyId) {
      return NextResponse.json({ error: 'Backup not found' }, { status: 404 });
    }

    // Delete the file from disk if it exists
    const backupsDir = getBackupsDir();
    const backupPath = path.join(backupsDir, backup.filename);
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }

    // Delete the database record
    await prisma.backup.delete({
      where: { id },
    });

    // Log audit
    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'backup.delete',
      entityType: 'Backup',
      entityId: id,
      metadata: { filename: backup.filename },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting backup:', err);
    return NextResponse.json({ error: 'Failed to delete backup' }, { status: 500 });
  }
}
