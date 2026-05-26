import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { getDataDir } from '@/lib/paths';

const CONTENT_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

// GET /api/document-templates/[id]/file - Serve a company-uploaded template file.
// Company templates live in the data dir (outside the read-only install location),
// so they cannot be served by Next.js static file handling like system templates.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const { id } = await params;

    const template = await prisma.documentTemplate.findUnique({
      where: { id },
    });

    if (!template) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // System templates are served as static assets, not through this route.
    if (template.isSystemTemplate) {
      return NextResponse.json(
        { error: 'System templates are served directly from /document-templates/' },
        { status: 400 }
      );
    }

    // Company-scoped access check
    if (template.companyId !== companyId) {
      return NextResponse.json({ error: 'Template not found' }, { status: 404 });
    }

    // Resolve the file path against the data dir and verify it stays within bounds
    const dataDir = path.resolve(getDataDir());
    const filePath = path.resolve(dataDir, template.filePath);
    if (!filePath.startsWith(dataDir)) {
      return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
    }

    const fileBuffer = await readFile(filePath);
    const ext = template.fileName.split('.').pop()?.toLowerCase() || '';
    const contentType = CONTENT_TYPES[ext] || 'application/octet-stream';

    return new NextResponse(fileBuffer, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    console.error('Error serving template file:', err);
    return NextResponse.json({ error: 'Template file not found' }, { status: 404 });
  }
}
