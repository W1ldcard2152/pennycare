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
 * @param statementEndMonth - 0-indexed month of the statement end date (0=Jan, 11=Dec)
 */
export function parseCapitalOne(text: string, year: number, statementEndMonth: number): ParseResult {
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
    // (e.g., December transaction on a January statement that closes in January)
    // If a transaction month is more than 6 months after the statement end month,
    // it's from the previous year (e.g., Dec transaction on a Jan/Feb statement)
    let transYear = year;
    let postYear = year;

    if (transMonthNum - statementEndMonth > 6) {
      transYear = year - 1;
    }
    if (postMonthNum - statementEndMonth > 6) {
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
 * @param statementEndMonth - 0-indexed month of the statement end date (0=Jan, 11=Dec)
 */
export function parseChase(text: string, year: number, statementEndMonth: number): ParseResult {
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
    const remainder = chunk.slice(datePart.length);

    // Extract description + amount, with optional continuation text after.
    // The amount is the first number with exactly 2 decimal places (e.g., 23.68).
    // Continuation text (e.g., "Order Number ...") may follow on the same line
    // (separated by spaces) or on a new line — both are handled by [\s\S]*.
    // Credits have a negative sign directly attached (e.g., CA-73.88).
    const txnPattern = /^(.+?)(-?)(\d[\d,]*\.\d{2}|\.\d{2})([\s\S]*)$/;
    const txnMatch = remainder.match(txnPattern);

    if (!txnMatch) {
      errors.push(`Could not parse amount from: "${chunk.substring(0, 50)}..."`);
      continue;
    }

    const [, descPart, negSign, amountStr, continuationRaw] = txnMatch;
    let description = descPart.trim();

    if (!description) {
      errors.push(`Empty description in: "${chunk.substring(0, 50)}..."`);
      continue;
    }

    // Append continuation text (e.g., "Order Number 113-8931723-9944253")
    const continuation = continuationRaw.trim();
    if (continuation) {
      description += ' | ' + continuation.replace(/\s+/g, ' ');
    }

    // Handle year rollover (e.g., December transaction on a January statement)
    const monthNum = parseInt(month) - 1; // 0-indexed
    let txnYear = year;
    if (monthNum - statementEndMonth > 6) {
      txnYear = year - 1;
    }

    // Use localToBusinessDate for timezone-safe date creation (noon UTC)
    const postDate = localToBusinessDate(parseInt(month), parseInt(day), txnYear);
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
 * Parse ESL Federal Credit Union bank statement text.
 *
 * Format: {MM/DD} {DESCRIPTION} {AMOUNT} {BALANCE}
 * - Each transaction has a date, description, transaction amount, and running balance
 * - "Beginning Balance" line has only one amount (the balance)
 * - Continuation lines (reference numbers, etc.) follow without a date prefix
 * - Withdrawal vs deposit is determined by comparing the running balance
 * - Amounts may omit leading zero (e.g., .90 instead of 0.90)
 *
 * @param text - The pasted text blob
 * @param year - Year to use for dates (from statement period end date)
 * @param statementEndMonth - 0-indexed month of the statement end date (0=Jan, 11=Dec)
 */
export function parseESLBank(text: string, year: number, statementEndMonth: number): ParseResult {
  const transactions: ParsedCCTransaction[] = [];
  const errors: string[] = [];

  // Split on date pattern with lookahead
  const splitRegex = /(?=\d{2}\/\d{2}\s)/g;
  const chunks = text.split(splitRegex).filter(chunk => chunk.trim());

  // Amount pattern: matches 123.45, 1,234.56, .90
  const amountRe = /(\d[\d,]*\.\d{2}|\.\d{2})/g;

  let prevBalance: number | null = null;

  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (!trimmed) continue;

    // Extract date
    const dateMatch = trimmed.match(/^(\d{2})\/(\d{2})\s+/);
    if (!dateMatch) continue;

    const [datePart, month, day] = dateMatch;
    const remainder = trimmed.slice(datePart.length);

    // Find all dollar amounts in the remainder
    const amounts: { value: number; index: number; length: number }[] = [];
    let m;
    // Reset lastIndex for the global regex
    amountRe.lastIndex = 0;
    while ((m = amountRe.exec(remainder)) !== null) {
      amounts.push({
        value: parseFloat(m[0].replace(/,/g, '')),
        index: m.index,
        length: m[0].length,
      });
    }

    if (amounts.length === 0) {
      errors.push(`No amounts found in: "${trimmed.substring(0, 50)}..."`);
      continue;
    }

    // Beginning Balance: only 1 amount (the balance itself)
    if (amounts.length === 1) {
      const descText = remainder.slice(0, amounts[0].index).trim();
      if (/beginning\s+balance/i.test(descText)) {
        prevBalance = amounts[0].value;
        continue; // Skip — not an actual transaction
      }
      // Single amount with no balance — can't determine debit/credit
      errors.push(`Only one amount found (expected amount + balance): "${trimmed.substring(0, 60)}..."`);
      continue;
    }

    // Last amount is the running balance, second-to-last is the transaction amount
    const balanceEntry = amounts[amounts.length - 1];
    const txnAmountEntry = amounts[amounts.length - 2];
    const newBalance = balanceEntry.value;
    const txnAmount = txnAmountEntry.value;

    // Description is everything before the transaction amount
    const descRaw = remainder.slice(0, txnAmountEntry.index);
    // Continuation text is everything after the balance amount (e.g., reference numbers)
    const continuationRaw = remainder.slice(balanceEntry.index + balanceEntry.length).trim();
    // Clean up: collapse whitespace, trim, and separate continuation text
    const descParts = descRaw.split(/\s{4,}|\r?\n/).map(s => s.trim()).filter(Boolean);
    if (continuationRaw) {
      descParts.push(continuationRaw.replace(/\s+/g, ' '));
    }
    const description = descParts.join(' | ');

    if (!description) {
      errors.push(`Empty description in: "${trimmed.substring(0, 50)}..."`);
      continue;
    }

    // Determine debit/credit by comparing balance change
    let isCredit: boolean;
    if (prevBalance !== null) {
      // If balance went up, it's a deposit (credit); if down, withdrawal (debit)
      isCredit = newBalance > prevBalance;
    } else {
      // No previous balance — fall back to description keywords
      isCredit = /deposit|credit/i.test(description);
    }

    prevBalance = newBalance;

    // Handle year rollover
    const monthNum = parseInt(month) - 1;
    let txnYear = year;
    if (monthNum - statementEndMonth > 6) {
      txnYear = year - 1;
    }

    const postDate = localToBusinessDate(parseInt(month), parseInt(day), txnYear);

    transactions.push({
      transDate: postDate,
      description,
      amount: txnAmount,
      isCredit,
    });
  }

  if (transactions.length === 0 && text.trim().length > 0) {
    errors.push('No transactions could be parsed. Check that the text matches ESL Bank format.');
  }

  return { transactions, errors };
}

/**
 * Parse statement based on format type.
 */
export function parseCCStatement(
  format: 'capital_one' | 'chase' | 'paypal_credit' | 'esl_bank',
  transactionsText: string,
  paymentsText: string,
  year: number,
  statementEndMonth: number = 0
): {
  transactions: ParsedCCTransaction[];
  payments: ParsedCCTransaction[];
  errors: string[];
} {
  let transResult: ParseResult;
  let payResult: ParseResult;

  switch (format) {
    case 'capital_one':
      transResult = parseCapitalOne(transactionsText, year, statementEndMonth);
      payResult = parseCapitalOne(paymentsText, year, statementEndMonth);
      break;
    case 'chase':
      transResult = parseChase(transactionsText, year, statementEndMonth);
      payResult = parseChase(paymentsText, year, statementEndMonth);
      break;
    case 'paypal_credit':
      transResult = parsePayPalCredit(transactionsText);
      payResult = parsePayPalCredit(paymentsText);
      break;
    case 'esl_bank':
      transResult = parseESLBank(transactionsText, year, statementEndMonth);
      payResult = { transactions: [], errors: [] }; // Bank statements have no payments section
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
