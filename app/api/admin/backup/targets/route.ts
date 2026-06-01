import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { logAudit } from '@/lib/audit';
import {
  newMarkerId,
  readMarker,
  writeMarker,
  verifyTarget,
  validateCandidateFolder,
  MarkerFile,
} from '@/lib/backupTargets';

// Shape returned to the UI for each target. Verification runs at request
// time so the UI can show live status dots.
interface BackupTargetView {
  id: string;
  name: string;
  folderPath: string;
  createdAt: string;
  lastSeenAt: string | null;
  lastBackupAt: string | null;
  status: 'connected' | 'folder_missing' | 'marker_missing' | 'marker_mismatch';
}

// GET /api/admin/backup/targets — list registered targets with live status
export async function GET() {
  try {
    const { error } = await requireCompanyAccess('admin');
    if (error) return error;

    // Using $queryRaw for forward-compat — the Prisma client may not have
    // regenerated yet on dev machines after the schema change. Switch to
    // prisma.backupTarget.findMany() once everyone's regenerated.
    const targets = await prisma.backupTarget.findMany({
      orderBy: { createdAt: 'asc' },
    });

    const view: BackupTargetView[] = targets.map((t) => {
      const verification = verifyTarget(t.folderPath, t.markerId);
      return {
        id: t.id,
        name: t.name,
        folderPath: t.folderPath,
        createdAt: t.createdAt.toISOString(),
        lastSeenAt: t.lastSeenAt?.toISOString() || null,
        lastBackupAt: t.lastBackupAt?.toISOString() || null,
        status: verification.ok ? 'connected' : verification.reason,
      };
    });

    return NextResponse.json({ targets: view });
  } catch (err) {
    console.error('Error listing backup targets:', err);
    return NextResponse.json({ error: 'Failed to list backup targets' }, { status: 500 });
  }
}

// POST /api/admin/backup/targets — register a new target.
// Body: { folderPath: string, name: string }
// Behavior:
//   1. Validate the folder exists and is writable.
//   2. If it already has a marker for a different (still-registered) target,
//      reject — the user picked a folder that's already in use.
//   3. If it has a marker that we don't know about, take it over (overwrite).
//   4. Write a fresh marker and create the DB record.
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const folderPath: string = body?.folderPath?.trim?.() || '';
    const name: string = body?.name?.trim?.() || '';

    if (!name) {
      return NextResponse.json({ error: 'Target name is required' }, { status: 400 });
    }
    if (name.length > 80) {
      return NextResponse.json({ error: 'Target name must be 80 characters or less' }, { status: 400 });
    }

    const validation = validateCandidateFolder(folderPath);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Disallow registering the same path twice.
    const duplicate = await prisma.backupTarget.findFirst({
      where: { folderPath },
    });
    if (duplicate) {
      return NextResponse.json(
        { error: `This folder is already registered as "${duplicate.name}".` },
        { status: 409 },
      );
    }

    // If a marker already exists at this path, check whether it belongs to a
    // target we know about — that means another DB thinks it owns this folder.
    // Possible if the user moved their database and the marker stuck around.
    // We allow overwriting: the user explicitly picked this folder, intent is clear.
    const existingMarker = readMarker(folderPath);
    if (existingMarker) {
      const stillRegistered = await prisma.backupTarget.findUnique({
        where: { markerId: existingMarker.id },
      });
      if (stillRegistered) {
        return NextResponse.json(
          { error: `This folder is already registered as "${stillRegistered.name}". Remove it first if you want to re-register.` },
          { status: 409 },
        );
      }
    }

    const markerId = newMarkerId();
    const marker: MarkerFile = {
      id: markerId,
      name,
      appName: 'PennyCare',
      registeredAt: new Date().toISOString(),
      version: 1,
    };

    try {
      writeMarker(folderPath, marker);
    } catch (err) {
      return NextResponse.json(
        { error: `Could not write marker file to folder: ${err instanceof Error ? err.message : String(err)}` },
        { status: 500 },
      );
    }

    const target = await prisma.backupTarget.create({
      data: {
        name,
        folderPath,
        markerId,
        createdBy: session!.userId,
        lastSeenAt: new Date(),
      },
    });

    await logAudit({
      // BackupTarget is app-scoped; we still need to attribute the audit
      // somewhere, so use the company the user was acting under.
      companyId: companyId!,
      userId: session!.userId,
      action: 'backup_target.register',
      entityType: 'BackupTarget',
      entityId: target.id,
      metadata: { folderPath, name },
    });

    return NextResponse.json(target, { status: 201 });
  } catch (err) {
    console.error('Error registering backup target:', err);
    return NextResponse.json({ error: 'Failed to register backup target' }, { status: 500 });
  }
}
