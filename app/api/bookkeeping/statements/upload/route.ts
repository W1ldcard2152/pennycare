import { NextRequest, NextResponse } from 'next/server';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { applyRules } from '@/lib/transaction-rules';
import { localToBusinessDate, formatDate } from '@/lib/date-utils';

interface BankCSVRow {
  'Account Number': string;
  'Post Date': string;
  Check: string;
  Description: string;
  Debit: string;
  Credit: string;
  Status: string;
  Balance: string;
}

interface ParsedTransaction {
  bankAccountNumber: string;
  postDate: Date;
  checkNumber: string | null;
  description: string;
  amount: number;
  isDebit: boolean;
}

// POST /api/bookkeeping/statements/upload
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('admin');
    if (error) return error;

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const sourceAccountId = formData.get('sourceAccountId') as string | null;
    const batchName = formData.get('batchName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    if (!sourceAccountId) {
      return NextResponse.json({ error: 'Source account ID is required' }, { status: 400 });
    }
    if (!batchName) {
      return NextResponse.json({ error: 'Batch name is required' }, { status: 400 });
    }

    // Verify the source account exists and belongs to this company
    const sourceAccount = await prisma.account.findFirst({
      where: { id: sourceAccountId, companyId: companyId! },
    });
    if (!sourceAccount) {
      return NextResponse.json({ error: 'Source account not found' }, { status: 404 });
    }

    // Validate that the source account is a bank or credit card
    const isBankAccount = sourceAccount.type === 'asset' && sourceAccount.accountGroup === 'Cash';
    const isCreditCard = sourceAccount.type === 'credit_card';
    if (!isBankAccount && !isCreditCard) {
      return NextResponse.json(
        { error: 'Source account must be a bank account (Cash group) or credit card' },
        { status: 400 }
      );
    }

    // Parse file — support CSV, XLS, and XLSX
    const fileName = file.name.toLowerCase();
    const isExcel = fileName.endsWith('.xls') || fileName.endsWith('.xlsx');

    let parseResult: Papa.ParseResult<BankCSVRow>;

    if (isExcel) {
      // Convert Excel to CSV-like rows
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const csvText = XLSX.utils.sheet_to_csv(sheet);
      parseResult = Papa.parse<BankCSVRow>(csvText, {
        header: true,
        skipEmptyLines: true,
      });
    } else {
      const csvText = await file.text();
      parseResult = Papa.parse<BankCSVRow>(csvText, {
        header: true,
        skipEmptyLines: true,
      });
    }

    if (parseResult.errors.length > 0) {
      return NextResponse.json(
        { error: 'File parsing error', details: parseResult.errors.slice(0, 5) },
        { status: 400 }
      );
    }

    // Parse and validate rows
    const transactions: ParsedTransaction[] = [];
    const parseErrors: string[] = [];

    for (let i = 0; i < parseResult.data.length; i++) {
      const row = parseResult.data[i];
      const rowNum = i + 2; // CSV row number (1-indexed, plus header)

      // Parse date (MM/DD/YYYY format) using timezone-safe business date
      const dateMatch = row['Post Date']?.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (!dateMatch) {
        parseErrors.push(`Row ${rowNum}: Invalid date format "${row['Post Date']}"`);
        continue;
      }
      const [, month, day, year] = dateMatch;
      // Use localToBusinessDate to create noon UTC date (timezone-safe)
      const postDate = localToBusinessDate(parseInt(month), parseInt(day), parseInt(year));
      if (isNaN(postDate.getTime())) {
        parseErrors.push(`Row ${rowNum}: Invalid date "${row['Post Date']}"`);
        continue;
      }

      // Parse amount (exactly one of Debit or Credit should be populated)
      const debitStr = row.Debit?.trim().replace(/[$,]/g, '') || '';
      const creditStr = row.Credit?.trim().replace(/[$,]/g, '') || '';
      const debitAmount = debitStr ? parseFloat(debitStr) : 0;
      const creditAmount = creditStr ? parseFloat(creditStr) : 0;

      if ((debitAmount > 0 && creditAmount > 0) || (debitAmount === 0 && creditAmount === 0)) {
        parseErrors.push(`Row ${rowNum}: Must have exactly one of Debit or Credit`);
        continue;
      }

      const isDebit = debitAmount > 0;
      const amount = Math.abs(isDebit ? debitAmount : creditAmount);

      if (amount <= 0) {
        parseErrors.push(`Row ${rowNum}: Amount must be positive`);
        continue;
      }

      const description = row.Description?.trim();
      if (!description) {
        parseErrors.push(`Row ${rowNum}: Description is required`);
        continue;
      }

      transactions.push({
        bankAccountNumber: row['Account Number']?.trim() || '',
        postDate,
        checkNumber: row.Check?.trim() || null,
        description,
        amount,
        isDebit,
      });
    }

    if (transactions.length === 0) {
      return NextResponse.json(
        { error: 'No valid transactions found in CSV', parseErrors },
        { status: 400 }
      );
    }

    // Check for duplicates
    const existingImports = await prisma.statementImport.findMany({
      where: {
        companyId: companyId!,
        sourceAccountId,
      },
      select: {
        postDate: true,
        description: true,
        amount: true,
        isDebit: true,
      },
    });

    // Use formatDate for duplicate detection to compare calendar dates consistently
    // This ensures dates stored at different times (midnight vs noon UTC) are treated as the same day
    const existingSet = new Set(
      existingImports.map((imp) =>
        `${formatDate(imp.postDate)}|${imp.description}|${imp.amount}|${imp.isDebit}`
      )
    );

    const newTransactions: ParsedTransaction[] = [];
    let duplicateCount = 0;

    for (const txn of transactions) {
      const key = `${formatDate(txn.postDate)}|${txn.description}|${txn.amount}|${txn.isDebit}`;
      if (existingSet.has(key)) {
        duplicateCount++;
      } else {
        newTransactions.push(txn);
        existingSet.add(key); // Also prevent duplicates within the same upload
      }
    }

    if (newTransactions.length === 0) {
      return NextResponse.json({
        imported: 0,
        duplicates: duplicateCount,
        matched: 0,
        unmatched: 0,
        batchName,
        message: 'All transactions already imported',
      });
    }

    // Apply rules to match transactions
    const ruleMatches = await applyRules(
      companyId!,
      sourceAccountId,
      newTransactions.map((t) => ({ description: t.description }))
    );

    // Create StatementImport records
    const importRecords = newTransactions.map((txn, index) => {
      const match = ruleMatches.get(index);
      return {
        companyId: companyId!,
        sourceAccountId,
        postDate: txn.postDate,
        description: txn.description,
        checkNumber: txn.checkNumber,
        amount: txn.amount,
        isDebit: txn.isDebit,
        bankAccountNumber: txn.bankAccountNumber,
        targetAccountId: match?.targetAccountId || null,
        matchedRuleId: match?.ruleId || null,
        memo: match?.memo || null,
        status: 'pending',
        importBatch: batchName,
      };
    });

    await prisma.statementImport.createMany({
      data: importRecords,
    });

    // Log audit entry
    await prisma.auditLog.create({
      data: {
        userId: session!.userId,
        companyId: companyId!,
        action: 'STATEMENT_IMPORT',
        entityType: 'StatementImport',
        entityId: batchName,
        metadata: JSON.stringify({
          sourceAccountId,
          sourceAccountName: sourceAccount.name,
          batchName,
          imported: newTransactions.length,
          duplicates: duplicateCount,
          matched: ruleMatches.size,
          unmatched: newTransactions.length - ruleMatches.size,
        }),
      },
    });

    return NextResponse.json({
      imported: newTransactions.length,
      duplicates: duplicateCount,
      matched: ruleMatches.size,
      unmatched: newTransactions.length - ruleMatches.size,
      batchName,
      errors: parseErrors.length > 0 ? parseErrors : undefined,
    });
  } catch (err) {
    console.error('Error uploading statement:', err);
    return NextResponse.json({ error: 'Failed to upload statement' }, { status: 500 });
  }
}
