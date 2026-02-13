import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { saveEmployeeDocument, validateFile } from '@/lib/fileUpload';
import { requireCompanyAccess } from '@/lib/api-utils';

// POST /api/employees/[id]/documents - Upload document
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('admin');
    if (error) return error;

    const { id } = await params;

    // Verify employee belongs to this company
    const employee = await prisma.employee.findFirst({
      where: { id, companyId: companyId! },
      select: { id: true, firstName: true, lastName: true },
    });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const documentType = formData.get('documentType') as string;
    const documentDate = formData.get('documentDate') as string;
    const description = formData.get('description') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    if (!documentType) {
      return NextResponse.json({ error: 'Document type is required' }, { status: 400 });
    }

    if (!documentDate) {
      return NextResponse.json({ error: 'Document date is required' }, { status: 400 });
    }

    // Validate file
    const validation = validateFile(file);
    if (!validation.valid) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    // Save file to filesystem with standardized naming
    const uploadedFile = await saveEmployeeDocument(
      id,
      file,
      employee.lastName,
      employee.firstName,
      documentType,
      documentDate
    );

    // Save document metadata to database
    const document = await prisma.employeeDocument.create({
      data: {
        employeeId: id,
        documentType: documentType,
        fileName: uploadedFile.fileName,
        filePath: uploadedFile.filePath,
        fileSize: uploadedFile.fileSize,
        mimeType: uploadedFile.mimeType,
        description: description || documentDate,
      },
    });

    return NextResponse.json(document, { status: 201 });
  } catch (error) {
    console.error('Error uploading document:', error);
    return NextResponse.json(
      { error: 'Failed to upload document' },
      { status: 500 }
    );
  }
}

// GET /api/employees/[id]/documents - List employee documents
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { error, companyId } = await requireCompanyAccess('viewer');
    if (error) return error;

    const { id } = await params;

    // Verify employee belongs to this company
    const employee = await prisma.employee.findFirst({
      where: { id, companyId: companyId! },
      select: { id: true },
    });
    if (!employee) {
      return NextResponse.json({ error: 'Employee not found' }, { status: 404 });
    }

    const documents = await prisma.employeeDocument.findMany({
      where: { employeeId: id },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json(documents);
  } catch (error) {
    console.error('Error fetching documents:', error);
    return NextResponse.json(
      { error: 'Failed to fetch documents' },
      { status: 500 }
    );
  }
}
