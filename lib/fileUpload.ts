import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

export interface UploadedFile {
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
}

export async function saveEmployeeDocument(
  employeeId: string,
  file: File,
  employeeLastName: string,
  employeeFirstName: string,
  documentType?: string,
  documentDate?: string
): Promise<UploadedFile> {
  // Create folder name as Lastname_Firstname (sanitized)
  const folderName = `${employeeLastName}_${employeeFirstName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  const uploadsDir = path.join(process.cwd(), 'uploads', 'employees', folderName);

  // Create directory if it doesn't exist
  if (!existsSync(uploadsDir)) {
    await mkdir(uploadsDir, { recursive: true });
  }

  // Get file extension
  const fileExtension = path.extname(file.name);

  // Generate standardized filename
  // Format: Lastname_Firstname_DocumentType_MM-DD-YYYY.ext
  let fileName: string;
  if (documentType && documentDate) {
    const formattedDate = formatDateForFilename(documentDate);
    const sanitizedDocType = documentType.toUpperCase().replace(/[^a-zA-Z0-9_-]/g, '_');
    fileName = `${folderName}_${sanitizedDocType}_${formattedDate}${fileExtension}`;
  } else {
    // Fallback to old naming if no document type/date provided
    const timestamp = Date.now();
    const sanitizedFileName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    fileName = `${timestamp}_${sanitizedFileName}`;
  }

  const filePath = path.join(uploadsDir, fileName);

  // Convert File to Buffer and save
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  await writeFile(filePath, buffer);

  return {
    fileName: file.name,
    filePath: path.relative(process.cwd(), filePath),
    fileSize: file.size,
    mimeType: file.type,
  };
}

function formatDateForFilename(dateString: string): string {
  // Convert YYYY-MM-DD to MM-DD-YYYY
  const date = new Date(dateString);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  return `${month}-${day}-${year}`;
}

export function getDocumentPath(relativePath: string): string {
  return path.join(process.cwd(), relativePath);
}

// Allowed document types
export const ALLOWED_DOCUMENT_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function validateFile(file: File): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: 'File size exceeds 10MB limit' };
  }

  if (!ALLOWED_DOCUMENT_TYPES.includes(file.type)) {
    return { valid: false, error: 'File type not allowed. Please upload PDF, images, or Word documents.' };
  }

  return { valid: true };
}
