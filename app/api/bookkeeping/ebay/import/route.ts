import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { createJournalEntry } from '@/lib/bookkeeping';
import { logAudit } from '@/lib/audit';
import Papa from 'papaparse';

// Column name variations we might encounter in eBay CSVs
const COLUMN_MAPPINGS: Record<string, string[]> = {
  orderDate: ['Order creation date', 'Order Creation Date', 'order creation date', 'Order date', 'order date'],
  orderNumber: ['Order number', 'Order Number', 'order number'],
  itemId: ['Item ID', 'Item id', 'item id', 'ItemID'],
  itemTitle: ['Item title', 'Item Title', 'item title'],
  buyerName: ['Buyer name', 'Buyer Name', 'buyer name'],
  shipToCity: ['Ship to city', 'Ship To City', 'ship to city'],
  shipToState: ['Ship to state', 'Ship To State', 'ship to state'],
  shipToZip: ['Ship to zip', 'Ship To Zip', 'ship to zip'],
  shipToCountry: ['Ship to country', 'Ship To Country', 'ship to country'],
  quantity: ['Quantity', 'quantity', 'Qty'],
  itemPrice: ['Item price', 'Item Price', 'item price'],
  itemSubtotal: ['Item subtotal', 'Item Subtotal', 'item subtotal'],
  shippingAmount: ['Shipping and handling', 'Shipping And Handling', 'shipping and handling', 'Shipping'],
  discountAmount: ['Discount', 'discount'],
  grossAmount: ['Gross amount', 'Gross Amount', 'gross amount'],
  // Core Final Value Fees
  feeFixed: ['Final Value Fee - fixed', 'Final Value Fee - Fixed', 'FVF Fixed'],
  feeVariable: ['Final Value Fee - variable', 'Final Value Fee - Variable', 'FVF Variable'],
  // Other fee columns (all come as negative numbers or --)
  belowStandardFee: ['Below standard performance fee', 'Below Standard Performance Fee'],
  itemNotAsDescribedFee: ['Very high "item not as described" fee', 'Very high item not as described fee', "Very high 'item not as described' fee"],
  internationalFee: ['International fee', 'International Fee'],
  depositProcessingFee: ['Deposit processing fee', 'Deposit Processing Fee'],
  regulatoryFee: ['Regulatory operating fee', 'Regulatory Operating Fee'],
  promotedListingFee: ['Promoted Listing Standard fee', 'Promoted Listing Standard Fee', 'Promoted listing fee'],
  paymentDisputeFee: ['Payment Dispute Fee', 'Payment dispute fee'],
  // Expense columns (costs deducted by eBay)
  shippingLabels: ['Shipping labels', 'Shipping Labels'],
  expenses: ['Expenses', 'expenses'],
  // Refunds (stored separately, not in totalFees)
  refunds: ['Refunds', 'refunds'],
  // Tax
  ebayCollectedTax: ['eBay collected tax', 'eBay Collected Tax', 'ebay collected tax'],
};

function findColumn(row: Record<string, string>, fieldName: string): string | undefined {
  const variations = COLUMN_MAPPINGS[fieldName];
  if (!variations) return undefined;
  for (const colName of variations) {
    if (row[colName] !== undefined) {
      return row[colName];
    }
  }
  return undefined;
}

function parseDate(dateStr: string): Date | null {
  if (!dateStr || dateStr === '--') return null;

  // Try various formats
  // Format: "1-Jan-25" or "01-Jan-2025"
  const monthNames = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const match = dateStr.match(/^(\d{1,2})-([a-zA-Z]{3})-(\d{2,4})$/);
  if (match) {
    const day = parseInt(match[1], 10);
    const monthIdx = monthNames.indexOf(match[2].toLowerCase());
    let year = parseInt(match[3], 10);
    if (year < 100) {
      year += 2000; // Assume 20xx for two-digit years
    }
    if (monthIdx !== -1) {
      return new Date(year, monthIdx, day);
    }
  }

  // Try standard date parsing
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

function parseAmount(amountStr: string | undefined): number {
  if (!amountStr || amountStr === '--' || amountStr === '') return 0;
  // Remove currency symbols and commas
  const cleaned = amountStr.replace(/[$,]/g, '').trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function parseAbsAmount(amountStr: string | undefined): number {
  // eBay fees come as negative numbers, store as positive
  return Math.abs(parseAmount(amountStr));
}

interface ParsedEbaySale {
  orderDate: Date;
  orderNumber: string;
  itemId: string;
  itemTitle: string;
  buyerName: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  shipToZip: string | null;
  shipToCountry: string | null;
  quantity: number;
  itemPrice: number;
  itemSubtotal: number;
  shippingAmount: number;
  discountAmount: number;
  grossAmount: number;
  feeFixed: number;
  feeVariable: number;
  otherFees: number;
  shippingLabelFees: number;
  totalFees: number;
  netAmount: number;
  refundAmount: number;
  ebayCollectedTax: number;
}

interface ParseError {
  row: number;
  message: string;
}

function parseRow(row: Record<string, string>, rowIndex: number): { sale: ParsedEbaySale | null; error: ParseError | null } {
  const orderDateStr = findColumn(row, 'orderDate');
  const orderNumber = findColumn(row, 'orderNumber');
  const itemId = findColumn(row, 'itemId');
  const itemTitle = findColumn(row, 'itemTitle');

  // Required fields validation
  if (!orderDateStr || !orderNumber || !itemId || !itemTitle) {
    return {
      sale: null,
      error: { row: rowIndex, message: 'Missing required fields (order date, order number, item ID, or item title)' },
    };
  }

  const orderDate = parseDate(orderDateStr);
  if (!orderDate) {
    return {
      sale: null,
      error: { row: rowIndex, message: `Invalid date format: "${orderDateStr}"` },
    };
  }

  const itemPrice = parseAmount(findColumn(row, 'itemPrice'));
  const itemSubtotal = parseAmount(findColumn(row, 'itemSubtotal'));
  const shippingAmount = parseAmount(findColumn(row, 'shippingAmount'));
  const discountAmount = parseAbsAmount(findColumn(row, 'discountAmount'));
  const grossAmount = parseAmount(findColumn(row, 'grossAmount'));
  const quantity = parseInt(findColumn(row, 'quantity') || '1', 10) || 1;
  const ebayCollectedTax = parseAmount(findColumn(row, 'ebayCollectedTax'));

  // Core Final Value Fees
  const feeFixed = parseAbsAmount(findColumn(row, 'feeFixed'));
  const feeVariable = parseAbsAmount(findColumn(row, 'feeVariable'));

  // Other fee columns (all stored as positive values)
  const belowStandardFee = parseAbsAmount(findColumn(row, 'belowStandardFee'));
  const itemNotAsDescribedFee = parseAbsAmount(findColumn(row, 'itemNotAsDescribedFee'));
  const internationalFee = parseAbsAmount(findColumn(row, 'internationalFee'));
  const depositProcessingFee = parseAbsAmount(findColumn(row, 'depositProcessingFee'));
  const regulatoryFee = parseAbsAmount(findColumn(row, 'regulatoryFee'));
  const promotedListingFee = parseAbsAmount(findColumn(row, 'promotedListingFee'));
  const paymentDisputeFee = parseAbsAmount(findColumn(row, 'paymentDisputeFee'));

  // Sum of all other fees (excluding fixed/variable FVF)
  const otherFees = belowStandardFee + itemNotAsDescribedFee + internationalFee +
    depositProcessingFee + regulatoryFee + promotedListingFee + paymentDisputeFee;

  // Shipping labels and expenses (costs deducted by eBay)
  const shippingLabels = parseAbsAmount(findColumn(row, 'shippingLabels'));
  const expenses = parseAbsAmount(findColumn(row, 'expenses'));
  const shippingLabelFees = shippingLabels + expenses;

  // Refunds (stored separately, not included in totalFees)
  const refundAmount = parseAbsAmount(findColumn(row, 'refunds'));

  // Total fees = all fees + shipping labels/expenses
  const totalFees = feeFixed + feeVariable + otherFees + shippingLabelFees;
  const netAmount = grossAmount - totalFees;

  return {
    sale: {
      orderDate,
      orderNumber: orderNumber.trim(),
      itemId: itemId.trim(),
      itemTitle: itemTitle.trim(),
      buyerName: findColumn(row, 'buyerName')?.trim() || null,
      shipToCity: findColumn(row, 'shipToCity')?.trim() || null,
      shipToState: findColumn(row, 'shipToState')?.trim() || null,
      shipToZip: findColumn(row, 'shipToZip')?.trim() || null,
      shipToCountry: findColumn(row, 'shipToCountry')?.trim() || null,
      quantity,
      itemPrice,
      itemSubtotal,
      shippingAmount,
      discountAmount,
      grossAmount,
      feeFixed,
      feeVariable,
      otherFees,
      shippingLabelFees,
      totalFees,
      netAmount,
      refundAmount,
      ebayCollectedTax,
    },
    error: null,
  };
}

// POST /api/bookkeeping/ebay/import - Import eBay CSV
export async function POST(request: NextRequest) {
  try {
    const { error, companyId, session } = await requireCompanyAccess('payroll');
    if (error) return error;

    // Parse multipart form data
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const batchName = formData.get('batchName') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    if (!batchName || batchName.trim() === '') {
      return NextResponse.json({ error: 'Batch name is required' }, { status: 400 });
    }

    const trimmedBatchName = batchName.trim();

    // Read file content
    const fileContent = await file.text();

    // Detect delimiter (tab or comma)
    const firstLine = fileContent.split('\n')[0];
    const delimiter = firstLine.includes('\t') ? '\t' : ',';

    // Parse CSV using papaparse
    const parseResult = Papa.parse<Record<string, string>>(fileContent, {
      header: true,
      delimiter,
      skipEmptyLines: true,
    });

    if (parseResult.errors.length > 0) {
      const parseErrors = parseResult.errors.slice(0, 5).map((e) => `Row ${e.row}: ${e.message}`);
      return NextResponse.json(
        { error: 'CSV parsing failed', details: parseErrors },
        { status: 400 }
      );
    }

    const rows = parseResult.data;
    if (rows.length === 0) {
      return NextResponse.json({ error: 'CSV file is empty' }, { status: 400 });
    }

    // Parse all rows
    const parsedSales: ParsedEbaySale[] = [];
    const parseErrors: ParseError[] = [];

    for (let i = 0; i < rows.length; i++) {
      const { sale, error: parseError } = parseRow(rows[i], i + 2); // +2 because row 1 is header, and we're 0-indexed
      if (parseError) {
        parseErrors.push(parseError);
      } else if (sale) {
        parsedSales.push(sale);
      }
    }

    if (parsedSales.length === 0) {
      return NextResponse.json(
        { error: 'No valid sales found in CSV', parseErrors },
        { status: 400 }
      );
    }

    // Check for existing duplicates
    const duplicateKeys = parsedSales.map((s) => ({
      companyId: companyId!,
      orderNumber: s.orderNumber,
      itemId: s.itemId,
    }));

    const existingSales = await prisma.ebaySale.findMany({
      where: {
        companyId: companyId!,
        OR: duplicateKeys.map((k) => ({
          orderNumber: k.orderNumber,
          itemId: k.itemId,
        })),
      },
      select: { orderNumber: true, itemId: true },
    });

    const existingSet = new Set(existingSales.map((s) => `${s.orderNumber}|${s.itemId}`));
    const newSales = parsedSales.filter((s) => !existingSet.has(`${s.orderNumber}|${s.itemId}`));
    const skippedDuplicates = parsedSales.filter((s) => existingSet.has(`${s.orderNumber}|${s.itemId}`));

    if (newSales.length === 0) {
      return NextResponse.json({
        success: true,
        imported: 0,
        skipped: skippedDuplicates.length,
        duplicates: skippedDuplicates.map((s) => `${s.orderNumber} / ${s.itemId}`),
        errors: parseErrors,
        journalEntriesCreated: 0,
      });
    }

    // Check for required accounts (1050, 4000, 6200)
    const requiredAccountCodes = ['1050', '4000', '6200'];
    const accounts = await prisma.account.findMany({
      where: {
        companyId: companyId!,
        code: { in: requiredAccountCodes },
        isActive: true,
      },
    });

    const accountMap = new Map(accounts.map((a) => [a.code, a.id]));
    const missingAccounts = requiredAccountCodes.filter((code) => !accountMap.has(code));

    if (missingAccounts.length > 0) {
      return NextResponse.json(
        {
          error: `Missing required accounts: ${missingAccounts.join(', ')}. Please seed the chart of accounts first or add: eBay Pending Payouts (1050), eBay Parts Sales (4000), eBay Fees (6200)`,
        },
        { status: 400 }
      );
    }

    // Group sales by date for journal entries
    const salesByDate = new Map<string, ParsedEbaySale[]>();
    for (const sale of newSales) {
      const dateKey = sale.orderDate.toISOString().split('T')[0];
      if (!salesByDate.has(dateKey)) {
        salesByDate.set(dateKey, []);
      }
      salesByDate.get(dateKey)!.push(sale);
    }

    // Process each day separately to avoid SQLite timeout issues
    // createJournalEntry() uses its own prisma.$transaction() internally,
    // so we can't nest it inside another transaction
    const createdSales: Array<{ id: string; orderNumber: string; itemId: string; orderDate: Date }> = [];
    const journalEntryIds: string[] = [];
    const failedDays: Array<{ dateKey: string; error: string }> = [];

    // Sort dates for deterministic processing order
    const sortedDates = Array.from(salesByDate.keys()).sort();

    for (const dateKey of sortedDates) {
      const daySales = salesByDate.get(dateKey)!;

      try {
        const totalNet = daySales.reduce((sum, s) => sum + s.netAmount, 0);
        const totalFees = daySales.reduce((sum, s) => sum + s.totalFees, 0);
        const totalGross = daySales.reduce((sum, s) => sum + s.grossAmount, 0);

        // Step 1: Create journal entry (uses its own transaction internally)
        const entry = await createJournalEntry({
          companyId: companyId!,
          date: new Date(dateKey),
          memo: `eBay sales for ${dateKey}`,
          source: 'ebay_import',
          sourceId: trimmedBatchName,
          lines: [
            {
              accountId: accountMap.get('1050')!,
              description: `eBay payouts pending (${daySales.length} sale${daySales.length > 1 ? 's' : ''})`,
              debit: Math.round(totalNet * 100) / 100,
              credit: 0,
            },
            {
              accountId: accountMap.get('6200')!,
              description: `eBay fees (${daySales.length} sale${daySales.length > 1 ? 's' : ''})`,
              debit: Math.round(totalFees * 100) / 100,
              credit: 0,
            },
            {
              accountId: accountMap.get('4000')!,
              description: `eBay parts sales (${daySales.length} sale${daySales.length > 1 ? 's' : ''})`,
              debit: 0,
              credit: Math.round(totalGross * 100) / 100,
            },
          ],
        });

        journalEntryIds.push(entry.id);

        // Step 2: Create EbaySale records in a batch (small transaction for one day's sales)
        const saleRecords = await prisma.ebaySale.createMany({
          data: daySales.map((sale) => ({
            companyId: companyId!,
            orderDate: sale.orderDate,
            orderNumber: sale.orderNumber,
            itemId: sale.itemId,
            itemTitle: sale.itemTitle,
            buyerName: sale.buyerName,
            shipToCity: sale.shipToCity,
            shipToState: sale.shipToState,
            shipToZip: sale.shipToZip,
            shipToCountry: sale.shipToCountry,
            quantity: sale.quantity,
            itemPrice: sale.itemPrice,
            itemSubtotal: sale.itemSubtotal,
            shippingAmount: sale.shippingAmount,
            discountAmount: sale.discountAmount,
            grossAmount: sale.grossAmount,
            feeFixed: sale.feeFixed,
            feeVariable: sale.feeVariable,
            otherFees: sale.otherFees,
            shippingLabelFees: sale.shippingLabelFees,
            totalFees: sale.totalFees,
            netAmount: sale.netAmount,
            refundAmount: sale.refundAmount,
            ebayCollectedTax: sale.ebayCollectedTax,
            importBatch: trimmedBatchName,
            journalEntryId: entry.id,
          })),
        });

        // Track created sales for response
        for (const sale of daySales) {
          createdSales.push({
            id: `${sale.orderNumber}-${sale.itemId}`, // Approximate ID since createMany doesn't return IDs
            orderNumber: sale.orderNumber,
            itemId: sale.itemId,
            orderDate: sale.orderDate,
          });
        }
      } catch (dayError) {
        // Log the error but continue processing other days
        console.error(`Error processing eBay sales for ${dateKey}:`, dayError);
        failedDays.push({
          dateKey,
          error: dayError instanceof Error ? dayError.message : 'Unknown error',
        });
      }
    }

    // If all days failed, return an error
    if (createdSales.length === 0 && failedDays.length > 0) {
      return NextResponse.json(
        {
          error: 'Failed to import any sales',
          failedDays,
        },
        { status: 500 }
      );
    }

    // Calculate totals for successfully imported sales only
    // We need to filter newSales to only those that were successfully imported
    const successfulDates = new Set(sortedDates.filter((d) => !failedDays.some((f) => f.dateKey === d)));
    const importedSales = newSales.filter((s) => {
      const dateKey = s.orderDate.toISOString().split('T')[0];
      return successfulDates.has(dateKey);
    });

    const totalGross = importedSales.reduce((sum, s) => sum + s.grossAmount, 0);
    const totalFees = importedSales.reduce((sum, s) => sum + s.totalFees, 0);
    const totalNet = importedSales.reduce((sum, s) => sum + s.netAmount, 0);

    // Audit log
    await logAudit({
      companyId: companyId!,
      userId: session!.userId,
      action: 'ebay.import',
      entityType: 'EbaySale',
      entityId: trimmedBatchName,
      metadata: {
        batchName: trimmedBatchName,
        imported: createdSales.length,
        skipped: skippedDuplicates.length,
        journalEntriesCreated: journalEntryIds.length,
        failedDays: failedDays.length > 0 ? failedDays : undefined,
        totalGross,
        totalFees,
        totalNet,
      },
    });

    return NextResponse.json({
      success: failedDays.length === 0,
      partialSuccess: failedDays.length > 0 && createdSales.length > 0,
      imported: createdSales.length,
      skipped: skippedDuplicates.length,
      duplicates: skippedDuplicates.length > 0
        ? skippedDuplicates.slice(0, 10).map((s) => `${s.orderNumber} / ${s.itemId}`)
        : [],
      errors: parseErrors.slice(0, 10),
      failedDays: failedDays.length > 0 ? failedDays : undefined,
      journalEntriesCreated: journalEntryIds.length,
      totals: {
        grossAmount: Math.round(totalGross * 100) / 100,
        totalFees: Math.round(totalFees * 100) / 100,
        netAmount: Math.round(totalNet * 100) / 100,
      },
    }, { status: failedDays.length > 0 ? 207 : 201 }); // 207 Multi-Status for partial success
  } catch (err) {
    console.error('Error importing eBay sales:', err);
    return NextResponse.json(
      { error: 'Failed to import eBay sales' },
      { status: 500 }
    );
  }
}
