import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import fs from 'fs';
import path from 'path';

// Get the backups directory path
function getBackupsDir(): string {
  return path.resolve(process.cwd(), 'backups');
}

// GET /api/admin/backup/[id]/download - Download a backup file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
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

    // Get the file path
    const backupsDir = getBackupsDir();
    const backupPath = path.join(backupsDir, backup.filename);

    // Check if file exists
    if (!fs.existsSync(backupPath)) {
      return NextResponse.json(
        { error: 'Backup file not found on disk' },
        { status: 404 }
      );
    }

    // Read the file
    const fileBuffer = fs.readFileSync(backupPath);

    // Return the file as a download
    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/x-sqlite3',
        'Content-Disposition': `attachment; filename="${backup.filename}"`,
        'Content-Length': String(fileBuffer.length),
      },
    });
  } catch (err) {
    console.error('Error downloading backup:', err);
    return NextResponse.json({ error: 'Failed to download backup' }, { status: 500 });
  }
}
