import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import fs from 'fs';
import path from 'path';

// Get the database file path from DATABASE_URL
function getDatabasePath(): string {
  const dbUrl = process.env.DATABASE_URL || 'file:./prisma/pennycare.db';
  let dbPath = dbUrl.replace(/^file:/, '');
  if (dbPath.startsWith('./')) {
    dbPath = dbPath.substring(2);
  }

  const possiblePaths = [
    path.resolve(process.cwd(), dbPath),
    path.resolve(process.cwd(), 'prisma', dbPath),
    path.resolve(process.cwd(), 'dev.db'),
  ];

  for (const p of possiblePaths) {
    const normalized = path.normalize(p);
    if (fs.existsSync(normalized)) {
      return normalized;
    }
  }

  return path.normalize(possiblePaths[0]);
}

// Get the backups directory path
function getBackupsDir(): string {
  return path.resolve(process.cwd(), 'backups');
}

// Format filename timestamp
function formatTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day}-${hours}${minutes}${seconds}`;
}

// POST /api/admin/backup/clear-all-data - Clear all data from the database
export async function POST(request: NextRequest) {
  try {
    // Only owners can clear all data (most destructive operation)
    const { error, session, companyId } = await requireCompanyAccess('owner');
    if (error) return error;

    const body = await request.json().catch(() => ({}));
    const confirmText = body.confirmText;

    // Require typing "DELETE ALL DATA" to confirm
    if (confirmText !== 'DELETE ALL DATA') {
      return NextResponse.json(
        { error: 'Please type "DELETE ALL DATA" to confirm' },
        { status: 400 }
      );
    }

    const dbPath = getDatabasePath();
    const backupsDir = getBackupsDir();

    // Verify the database file exists
    if (!fs.existsSync(dbPath)) {
      return NextResponse.json(
        { error: 'Database file not found' },
        { status: 500 }
      );
    }

    // Create backups directory if it doesn't exist
    if (!fs.existsSync(backupsDir)) {
      fs.mkdirSync(backupsDir, { recursive: true });
    }

    // Create automatic backup before clearing data
    const timestamp = formatTimestamp();
    const autoBackupFilename = `pennycare-pre-clear-${timestamp}.db`;
    const autoBackupPath = path.join(backupsDir, autoBackupFilename);

    // Flush WAL before copy
    try {
      await prisma.$executeRaw`PRAGMA wal_checkpoint(TRUNCATE)`;
    } catch {
      // Continue even if this fails
    }

    fs.copyFileSync(dbPath, autoBackupPath);
    const backupStats = fs.statSync(autoBackupPath);

    // Get current user and company info to preserve
    const currentUserId = session!.userId;
    const currentCompanyId = companyId!;

    // Delete all data from tables EXCEPT User, Company, and UserCompanyAccess for current user
    // Disable foreign key checks temporarily for easier deletion
    await prisma.$executeRaw`PRAGMA foreign_keys = OFF`;

    // Tables to clear completely (all business data)
    const tablesToClear = [
      'ReconciledItem',
      'Reconciliation',
      'StatementImport',
      'TransactionRule',
      'EbaySale',
      'JournalEntryLine',
      'JournalEntry',
      'ClosedPeriod',
      'Transaction',
      'Account',
      'Expense',
      'Vendor',
      'TaxFiling',
      'PayrollRecord',
      'TimeEntry',
      'EmployeeDeduction',
      'EmployeeDocument',
      'EmergencyContact',
      'PaymentInfo',
      'Employee',
      'DocumentTemplate',
      'Backup',
      'AuditLog',
    ];

    try {
      // Clear all business data tables
      for (const table of tablesToClear) {
        try {
          await prisma.$executeRawUnsafe(`DELETE FROM "${table}"`);
          console.log(`Cleared table: ${table}`);
        } catch (tableErr) {
          console.error(`Failed to clear table ${table}:`, tableErr);
          throw tableErr;
        }
      }

      // Delete other users' company access (keep current user's access)
      await prisma.$executeRawUnsafe(
        `DELETE FROM "UserCompanyAccess" WHERE userId != ? OR companyId != ?`,
        currentUserId,
        currentCompanyId
      );
      console.log('Cleared UserCompanyAccess (kept current user)');

      // Delete other companies (keep current company)
      await prisma.$executeRawUnsafe(
        `DELETE FROM "Company" WHERE id != ?`,
        currentCompanyId
      );
      console.log('Cleared Company (kept current company)');

      // Delete other users (keep current user)
      await prisma.$executeRawUnsafe(
        `DELETE FROM "User" WHERE id != ?`,
        currentUserId
      );
      console.log('Cleared User (kept current user)');

      // Reset company counters
      await prisma.company.update({
        where: { id: currentCompanyId },
        data: {
          nextEmployeeNumber: 1,
          nextJournalEntryNumber: 1,
        },
      });
      console.log('Reset company counters');

    } finally {
      // Re-enable foreign key checks
      await prisma.$executeRaw`PRAGMA foreign_keys = ON`;
    }

    return NextResponse.json({
      success: true,
      message: 'All data has been cleared. Refresh the page to continue with a fresh start.',
      autoBackup: {
        filename: autoBackupFilename,
        fileSize: backupStats.size,
      },
    });
  } catch (err) {
    console.error('Error clearing all data:', err);
    const errorMessage = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json(
      { error: `Failed to clear all data: ${errorMessage}` },
      { status: 500 }
    );
  }
}
