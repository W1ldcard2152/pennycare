import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { performBackup } from '@/lib/backupRunner';
import { logAudit } from '@/lib/audit';

// POST /api/admin/backup/auto
//
// Localhost-only, called by the Electron main process for scheduled and
// on-quit backups. Bypasses user authentication entirely — instead, it
// requires the x-internal-secret header to match INTERNAL_BACKUP_SECRET,
// which the Electron main process generates on first launch and stores
// in %APPDATA%/PennyCare/.env. Only the main process knows the secret,
// and the endpoint refuses non-loopback callers as a belt-and-braces
// check in case the dev server is bound to a non-localhost interface.
//
// Body: { source: 'auto_on_open' | 'auto_on_quit' | 'auto_scheduled' }
export async function POST(request: NextRequest) {
  try {
    const expectedSecret = process.env.INTERNAL_BACKUP_SECRET;
    if (!expectedSecret) {
      return NextResponse.json(
        { error: 'INTERNAL_BACKUP_SECRET is not configured. Auto-backup is disabled.' },
        { status: 503 },
      );
    }

    const providedSecret = request.headers.get('x-internal-secret');
    if (providedSecret !== expectedSecret) {
      // Don't leak whether the secret was missing vs. wrong; just refuse.
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Belt-and-braces: refuse if the request didn't come from localhost.
    // Electron main process always hits 127.0.0.1; anything else means
    // the dev server may be exposed and someone got hold of the secret.
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor && !forwardedFor.startsWith('127.0.0.1') && !forwardedFor.startsWith('::1')) {
      return NextResponse.json({ error: 'Auto-backup is localhost-only' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const source = (body?.source as string) || 'auto_scheduled';
    const validSources = ['auto_on_open', 'auto_on_quit', 'auto_scheduled'];
    if (!validSources.includes(source)) {
      return NextResponse.json({ error: 'Invalid source' }, { status: 400 });
    }

    // Cooldown-gated sources (on_open and the periodic scheduled tick)
    // skip if a backup happened in the last 4 hours, so reopening the app
    // or hitting the 4h timer right after a manual backup doesn't pile
    // duplicates on each other. On-quit ignores the cooldown — that
    // backup is the one we care most about (most recent edits) and the
    // user is leaving the app, so a redundant write is harmless.
    if (source === 'auto_on_open' || source === 'auto_scheduled') {
      const lastBackup = await prisma.backup.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });
      const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
      if (lastBackup && Date.now() - lastBackup.createdAt.getTime() < FOUR_HOURS_MS) {
        return NextResponse.json({
          skipped: true,
          reason: 'recent_backup_exists',
          lastBackupAt: lastBackup.createdAt.toISOString(),
        });
      }
    }

    // Pick any company to attribute the Backup record to. The backup
    // file is a full database snapshot regardless — companyId here is
    // just a foreign key requirement on the row, not a scoping choice.
    const anyCompany = await prisma.company.findFirst({
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (!anyCompany) {
      return NextResponse.json(
        { error: 'No company exists yet; nothing to back up.' },
        { status: 400 },
      );
    }

    const sourceLabel: Record<string, string> = {
      auto_on_open: 'Auto-backup (app startup)',
      auto_on_quit: 'Auto-backup (app close)',
      auto_scheduled: 'Auto-backup (scheduled)',
    };

    const result = await performBackup({
      companyId: anyCompany.id,
      createdBy: 'system',
      description: sourceLabel[source as keyof typeof sourceLabel],
      source: source as 'auto_on_open' | 'auto_on_quit' | 'auto_scheduled',
    });

    await logAudit({
      companyId: anyCompany.id,
      userId: 'system',
      action: 'backup.create',
      entityType: 'Backup',
      entityId: result.id,
      metadata: {
        filename: result.filename,
        fileSize: result.fileSize,
        source,
        targets: result.targets.map((t) => ({ name: t.name, status: t.status })),
      },
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Error in auto-backup:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Auto-backup failed: ${errorMessage}` }, { status: 500 });
  }
}
