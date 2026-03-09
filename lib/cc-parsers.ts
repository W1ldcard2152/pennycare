/**
 * Credit Card Statement Parsers
 *
 * Parses pasted text blobs from credit card statements into structured transactions.
 * Each card company has a different format, so we have separate parsers.
 *
 * All dates are stored as "business dates" at noon UTC to prevent timezone shifting.
 */

import { localToBusinessDate } from './date-utils';

export interface ParsedCCTransaction {
  transDate: Date;
  postDate?: Date;
  description: string;
  amount: number;  // Always positive
  isCredit: boolean;  // true = credit/payment, false = charge
  transactionId?: string;
  category?: 'payment' | 'credit';  // For payment-section items: payment vs credit/return
}

export interface ParseResult {
  transactions: ParsedCCTransaction[];
  errors: string[];
}

// Keywords for classifying payment-section items
const PAYMENT_KEYWORDS = [
  'ONLINE PYMT',
  'ONLINE PAYMENT',
  'AUTOMATIC PAYMENT',
  'PAYMENT THANK YOU',
  'PYMT',
  'AUTOPAY',
  'AUTO PAY',
  'ACH PAYMENT',
  'PAYMENT RECEIVED',
];

const CREDIT_KEYWORDS = [
  'RETURN',
  'CREDIT-',
  'CASH BACK',
  'REWARD',
  'REFUND',
  'REVERSAL',
  'DISPUTE',
  'ADJUSTMENT',
  'CREDIT BALANCE',
];

/**
 * Classify a payment-section item as either 'payment' or 'credit'
 * based on description keywords.
 */
export function classifyPaymentItem(description: string): 'payment' | 'credit' {
  const upperDesc = description.toUpperCase();

  // Check for credit keywords first (more specific)
  for (const keyword of CREDIT_KEYWORDS) {
    if (upperDesc.includes(keyword)) {
      return 'credit';
    }
  }

  // Check for payment keywords
  for (const keyword of PAYMENT_KEYWORDS) {
    if (upperDesc.includes(keyword)) {
      return 'payment';
    }
  }

  // Default to payment (safer assumption)
  return 'payment';
}

// Month abbreviations for parsing
const MONTH_ABBREVS: Record<string, number> = {
  'jan': 0, 'feb': 1, 'mar': 2, 'apr': 3, 'may': 4, 'jun': 5,
  'jul': 6, 'aug': 7, 'sep': 8, 'oct': 9, 'nov': 10, 'dec': 11,
};

/**
 * Parse Capital One credit card statement text.
 *
 * Transaction pattern: {Mon DD} {Mon DD} {DESCRIPTION} {-$AMOUNT or $AMOUNT}
 * Example: Dec 16 Dec 17 USPS STAMPS ENDICIA888-434-0055DC $100.00
 * Credits: Mar 19 Mar 19 CREDIT-CASH BACK REWARD - $208.51 (note space between - and $)
 *
 * @param text - The pasted text blob
 * @param year - Year to use for dates (from statement period end date)
 */
export function parseCapitalOne(text: string, year: number): ParseResult {
  const transactions: ParsedCCTransaction[] = [];
  const errors: string[] = [];

  // Month pattern
  const monthPattern = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)';

  // Split on transaction boundaries - look for {Mon DD} {Mon DD} pattern
  // Use lookahead to split while preserving the delimiter
  const splitRegex = new RegExp(
    `(?=${monthPattern}\\s+\\d{1,2}\\s+${monthPattern}\\s+\\d{1,2}\\s)`,
    'gi'
  );

  const chunks = text.split(splitRegex).filter(chunk => chunk.trim());

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (!chunk) continue;

    // Match: {Mon DD} {Mon DD} {description} {amount}
    // Amount can be: $123.45 (charge) or - $123.45 (credit, note space)
    const pattern = new RegExp(
      `^(${monthPattern})\\s+(\\d{1,2})\\s+(${monthPattern})\\s+(\\d{1,2})\\s+(.+?)\\s+(-\\s*)?\\$([\\d,]+\\.\\d{2})\\s*$`,
      'i'
    );

    const match = chunk.match(pattern);
    if (!match) {
      // Try to give a helpful error
      if (chunk.length > 10) {
        errors.push(`Could not parse transaction: "${chunk.substring(0, 50)}..."`);
      }
      continue;
    }

    const [, transMonth, transDay, postMonth, postDay, description, creditIndicator, amountStr] = match;

    const transMonthNum = MONTH_ABBREVS[transMonth.toLowerCase()];
    const postMonthNum = MONTH_ABBREVS[postMonth.toLowerCase()];

    if (transMonthNum === undefined || postMonthNum === undefined) {
      errors.push(`Invalid month in: "${chunk.substring(0, 50)}..."`);
      continue;
    }

    // Determine the correct year, handling year rollover
    // (e.g., December transaction on a January statement)
    let transYear = year;
    let postYear = year;

    // If the month is in the future relative to the statement end month,
    // it's likely from the previous year
    const statementEndMonth = new Date(year, 0, 1).getMonth(); // Assume we might need to check
    if (transMonthNum > 6 && transMonthNum >= statementEndMonth + 6) {
      transYear = year - 1;
    }
    if (postMonthNum > 6 && postMonthNum >= statementEndMonth + 6) {
      postYear = year - 1;
    }

    // Use localToBusinessDate for timezone-safe date creation (noon UTC)
    const transDate = localToBusinessDate(transMonthNum + 1, parseInt(transDay), transYear);
    const postDate = localToBusinessDate(postMonthNum + 1, parseInt(postDay), postYear);

    const amount = parseFloat(amountStr.replace(/,/g, ''));
    const isCredit = !!creditIndicator;  // Has "- " prefix

    transactions.push({
      transDate,
      postDate,
      description: description.trim(),
      amount,
      isCredit,
    });
  }

  if (transactions.length === 0 && text.trim().length > 0) {
    errors.push('No transactions could be parsed. Check that the text matches Capital One format.');
  }

  return { transactions, errors };
}

/**
 * Parse Chase credit card statement text.
 *
 * Transaction pattern: {MM/DD}     {DESCRIPTION} {-AMOUNT or AMOUNT}
 * Example: 01/25     E-Z*PASSNY REBILL 800-333-8655 NY 50.00
 * Credits: 01/28     eBay O*26-12528-08142 800-4563229 CA-73.88 (negative attached to amount)
 *
 * @param text - The pasted text blob
 * @param year - Year to use for dates
 */
export function parseChase(text: string, year: number): ParseResult {
  const transactions: ParsedCCTransaction[] = [];
  const errors: string[] = [];

  // Split on date pattern with lookahead
  const splitRegex = /(?=\d{2}\/\d{2}\s{2,})/g;
  const chunks = text.split(splitRegex).filter(chunk => chunk.trim());

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (!chunk) continue;

    // Match: {MM/DD} {whitespace} {description} {amount}
    // Amount is at the end, may be negative (directly attached, no space)
    // e.g., "CA-73.88" - the CA is description, -73.88 is amount
    const datePattern = /^(\d{2})\/(\d{2})\s{2,}/;
    const dateMatch = chunk.match(datePattern);

    if (!dateMatch) {
      if (chunk.length > 10) {
        errors.push(`Could not parse date from: "${chunk.substring(0, 50)}..."`);
      }
      continue;
    }

    const [datePart, month, day] = dateMatch;
    const remainder = chunk.slice(datePart.length).trim();

    // Extract amount from end - could be positive or negative
    // Pattern: optional negative sign directly attached to number at end
    const amountPattern = /(-?)(\d[\d,]*\.\d{2})$/;
    const amountMatch = remainder.match(amountPattern);

    if (!amountMatch) {
      errors.push(`Could not parse amount from: "${chunk.substring(0, 50)}..."`);
      continue;
    }

    const [amountFull, negSign, amountStr] = amountMatch;
    const description = remainder.slice(0, -amountFull.length).trim();

    if (!description) {
      errors.push(`Empty description in: "${chunk.substring(0, 50)}..."`);
      continue;
    }

    // Use localToBusinessDate for timezone-safe date creation (noon UTC)
    const postDate = localToBusinessDate(parseInt(month), parseInt(day), year);
    const amount = parseFloat(amountStr.replace(/,/g, ''));
    const isCredit = negSign === '-';

    transactions.push({
      transDate: postDate,  // Chase only has one date
      description,
      amount,
      isCredit,
    });
  }

  if (transactions.length === 0 && text.trim().length > 0) {
    errors.push('No transactions could be parsed. Check that the text matches Chase format.');
  }

  return { transactions, errors };
}

/**
 * Parse PayPal Credit statement text.
 *
 * Transaction pattern: {MM/DD/YY} {MM/DD/YY} {TRANSACTION_ID} {DESCRIPTION} {-$AMOUNT or $AMOUNT}
 * Example: 01/08/25 01/08/25 P92830009EHM6LLAJ Deferred EBAY 800-456-3229 No Interest If Paid In Full $126.74
 * Credits: 01/20/25 01/20/25 P9283000L01KJFT22 Online Payment Thank You Alpharetta   Ga-$72.00
 *
 * @param text - The pasted text blob
 */
export function parsePayPalCredit(text: string): ParseResult {
  const transactions: ParsedCCTransaction[] = [];
  const errors: string[] = [];

  // Split on the two-date pattern
  const splitRegex = /(?=\d{2}\/\d{2}\/\d{2}\s+\d{2}\/\d{2}\/\d{2}\s)/g;
  const chunks = text.split(splitRegex).filter(chunk => chunk.trim());

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i].trim();
    if (!chunk) continue;

    // Match: {MM/DD/YY} {MM/DD/YY} {transaction_id} {description} {amount}
    const pattern = /^(\d{2})\/(\d{2})\/(\d{2})\s+(\d{2})\/(\d{2})\/(\d{2})\s+([A-Z0-9]+)\s+(.+?)(-?)\$([0-9,]+\.\d{2})\s*$/i;

    const match = chunk.match(pattern);
    if (!match) {
      if (chunk.length > 10) {
        errors.push(`Could not parse transaction: "${chunk.substring(0, 60)}..."`);
      }
      continue;
    }

    const [, transMonth, transDay, transYear, postMonth, postDay, postYear, txnId, description, negSign, amountStr] = match;

    // Convert 2-digit year to 4-digit (assumes 20xx)
    const transFullYear = 2000 + parseInt(transYear);
    const postFullYear = 2000 + parseInt(postYear);

    // Use localToBusinessDate for timezone-safe date creation (noon UTC)
    const transDate = localToBusinessDate(parseInt(transMonth), parseInt(transDay), transFullYear);
    const postDate = localToBusinessDate(parseInt(postMonth), parseInt(postDay), postFullYear);
    const amount = parseFloat(amountStr.replace(/,/g, ''));
    const isCredit = negSign === '-';

    transactions.push({
      transDate,
      postDate,
      description: `${txnId} ${description.trim()}`,  // Include transaction ID in description
      amount,
      isCredit,
      transactionId: txnId,
    });
  }

  if (transactions.length === 0 && text.trim().length > 0) {
    errors.push('No transactions could be parsed. Check that the text matches PayPal Credit format.');
  }

  return { transactions, errors };
}

/**
 * Parse credit card statement based on format type.
 */
export function parseCCStatement(
  format: 'capital_one' | 'chase' | 'paypal_credit',
  transactionsText: string,
  paymentsText: string,
  year: number
): {
  transactions: ParsedCCTransaction[];
  payments: ParsedCCTransaction[];
  errors: string[];
} {
  let transResult: ParseResult;
  let payResult: ParseResult;

  switch (format) {
    case 'capital_one':
      transResult = parseCapitalOne(transactionsText, year);
      payResult = parseCapitalOne(paymentsText, year);
      break;
    case 'chase':
      transResult = parseChase(transactionsText, year);
      payResult = parseChase(paymentsText, year);
      break;
    case 'paypal_credit':
      transResult = parsePayPalCredit(transactionsText);
      payResult = parsePayPalCredit(paymentsText);
      break;
    default:
      return {
        transactions: [],
        payments: [],
        errors: [`Unknown format: ${format}`],
      };
  }

  // Combine errors with context
  const allErrors: string[] = [];
  if (transResult.errors.length > 0) {
    allErrors.push('Transaction parsing errors:');
    allErrors.push(...transResult.errors);
  }
  if (payResult.errors.length > 0) {
    allErrors.push('Payment parsing errors:');
    allErrors.push(...payResult.errors);
  }

  // Classify payment-section items as either 'payment' or 'credit'
  const classifiedPayments = payResult.transactions.map(txn => ({
    ...txn,
    category: classifyPaymentItem(txn.description),
  }));

  return {
    transactions: transResult.transactions,
    payments: classifiedPayments,
    errors: allErrors,
  };
}
