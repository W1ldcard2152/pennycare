import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import { deleteMarker } from '@/lib/backupTargets';

// PATCH /api/admin/backup/targets/[id] — rename a target
// Body: { name: string }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const name: string = body?.name?.trim?.() || '';

    if (!name) {
      return NextResponse.json({ error: 'Target name is required' }, { status: 400 });
    }
    if (name.length > 80) {
      return NextResponse.json({ error: 'Target name must be 80 characters or less' }, { status: 400 });
    }

    const target = await prisma.backupTarget.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: 'Backup target not found' }, { status: 404 });
    }

    const updated = await prisma.backupTarget.update({
      where: { id },
      data: { name },
    });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'backup_target.rename',
      entityType: 'BackupTarget',
      entityId: id,
      metadata: { from: target.name, to: name },
    });

    return NextResponse.json(updated);
  } catch (err) {
    console.error('Error updating backup target:', err);
    return NextResponse.json({ error: 'Failed to update backup target' }, { status: 500 });
  }
}

// DELETE /api/admin/backup/targets/[id] — unregister a target.
// Removes the marker file from the folder so the same folder can be
// re-registered later, but does NOT delete existing backup files there
// (those are still valid backups the user might want).
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;
    const { id } = await params;

    const target = await prisma.backupTarget.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: 'Backup target not found' }, { status: 404 });
    }

    // Best-effort marker cleanup. Even if the marker is gone (folder
    // unplugged), we still want to drop the DB record.
    deleteMarker(target.folderPath);

    await prisma.backupTarget.delete({ where: { id } });

    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'backup_target.unregister',
      entityType: 'BackupTarget',
      entityId: id,
      metadata: { name: target.name, folderPath: target.folderPath },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('Error deleting backup target:', err);
    return NextResponse.json({ error: 'Failed to delete backup target' }, { status: 500 });
  }
}
