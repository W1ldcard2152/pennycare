import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

// GET /api/document-templates - List all available templates
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    // Get system templates (available to all) + company-specific templates
    const templates = await prisma.documentTemplate.findMany({
      where: {
        OR: [
          { isSystemTemplate: true },
          { companyId: companyId! },
        ],
        isActive: true,
      },
      orderBy: [
        { category: 'asc' },
        { name: 'asc' },
      ],
    });

    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching document templates:', error);
    return NextResponse.json(
      { error: 'Failed to fetch document templates' },
      { status: 500 }
    );
  }
}

// POST /api/document-templates - Upload a new template
export async function POST(request: NextRequest) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentTypeId = formData.get('documentTypeId') as string;
    const name = formData.get('name') as string;
    const category = formData.get('category') as string;
    const description = formData.get('description') as string | null;

    if (!file || !documentTypeId || !name || !category) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate file type
    if (!file.type.includes('pdf') && !file.type.includes('word') && !file.type.includes('document')) {
      return NextResponse.json(
        { error: 'Only PDF and Word documents are allowed' },
        { status: 400 }
      );
    }

    // Create company templates directory
    const templatesDir = path.join(process.cwd(), 'public', 'document-templates', 'company', companyId!);
    if (!existsSync(templatesDir)) {
      await mkdir(templatesDir, { recursive: true });
    }

    // Generate filename
    const fileExtension = path.extname(file.name);
    const sanitizedName = name.replace(/[^a-zA-Z0-9-]/g, '_');
    const timestamp = Date.now();
    const fileName = `${sanitizedName}_${timestamp}${fileExtension}`;
    const filePath = path.join(templatesDir, fileName);

    // Save file
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    await writeFile(filePath, buffer);

    // Save template metadata to database
    const relativePath = path.relative(path.join(process.cwd(), 'public'), filePath).replace(/\\/g, '/');
    const template = await prisma.documentTemplate.create({
      data: {
        companyId: companyId!,
        documentTypeId,
        name,
        fileName,
        filePath: relativePath,
        fileSize: file.size,
        category,
        description,
        isSystemTemplate: false,
        isActive: true,
      },
    });

    return NextResponse.json(template, { status: 201 });
  } catch (error) {
    console.error('Error uploading template:', error);
    return NextResponse.json(
      { error: 'Failed to upload template' },
      { status: 500 }
    );
  }
}
