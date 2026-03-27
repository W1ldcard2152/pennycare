import { prisma } from './db';
import { startOfDay, endOfDay } from './date-utils';
import { DEFAULT_CHART_OF_ACCOUNTS, ACCOUNT_GROUPS, GROUP_CODE_RANGES, ACCOUNT_TYPE_LABELS } from './default-chart-of-accounts';
import type { AccountType, DefaultAccount } from './default-chart-of-accounts';

// Re-export for backward compatibility
export { DEFAULT_CHART_OF_ACCOUNTS, ACCOUNT_GROUPS, GROUP_CODE_RANGES, ACCOUNT_TYPE_LABELS };
export type { AccountType, DefaultAccount };

// ============================================
// CHART OF ACCOUNTS SEEDING
// ============================================

export async function seedChartOfAccounts(companyId: string): Promise<number> {
  let created = 0;
  for (const acct of DEFAULT_CHART_OF_ACCOUNTS) {
    const existing = await prisma.account.findUnique({
      where: { companyId_code: { companyId, code: acct.code } },
    });
    if (!existing) {
      await prisma.account.create({
        data: {
          companyId,
          code: acct.code,
          name: acct.name,
          type: acct.type,
          accountGroup: acct.accountGroup || null,
          description: acct.description || null,
          taxLine: acct.taxLine || null,
          isActive: true,
        },
      });
      created++;
    }
  }
  return created;
}

// ============================================
// JOURNAL ENTRY HELPERS
// ============================================

export interface JournalEntryLineInput {
  accountId: string;
  description?: string;
  debit: number;
  credit: number;
}

export interface CreateJournalEntryInput {
  companyId: string;
  date: Date;
  memo: string;
  referenceNumber?: string;
  source?: string;
  sourceId?: string;
  lines: JournalEntryLineInput[];
  notes?: string;
  skipClosedPeriodCheck?: boolean; // For internal operations like year-end closing
}

/**
 * Validate that debits equal credits in a journal entry.
 */
export function validateJournalEntry(lines: JournalEntryLineInput[]): {
  valid: boolean;
  totalDebits: number;
  totalCredits: number;
  error?: string;
} {
  if (lines.length < 2) {
    return { valid: false, totalDebits: 0, totalCredits: 0, error: 'A journal entry must have at least 2 lines' };
  }

  const totalDebits = lines.reduce((sum, l) => sum + (l.debit || 0), 0);
  const totalCredits = lines.reduce((sum, l) => sum + (l.credit || 0), 0);

  // Allow for floating-point rounding (within 1 cent)
  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    return {
      valid: false,
      totalDebits,
      totalCredits,
      error: `Debits ($${totalDebits.toFixed(2)}) must equal credits ($${totalCredits.toFixed(2)})`,
    };
  }

  // Each line must have either a debit or credit (not both, not neither)
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if ((line.debit || 0) > 0 && (line.credit || 0) > 0) {
      return { valid: false, totalDebits, totalCredits, error: `Line ${i + 1}: Cannot have both debit and credit on the same line` };
    }
    if ((line.debit || 0) === 0 && (line.credit || 0) === 0) {
      return { valid: false, totalDebits, totalCredits, error: `Line ${i + 1}: Must have either a debit or credit amount` };
    }
  }

  return { valid: true, totalDebits, totalCredits };
}

/**
 * Create a journal entry with its lines in a transaction.
 */
export async function createJournalEntry(input: CreateJournalEntryInput) {
  const validation = validateJournalEntry(input.lines);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  // Check for closed period unless explicitly skipped
  if (!input.skipClosedPeriodCheck) {
    const { isClosed, closedPeriod } = await checkClosedPeriod(input.companyId, input.date);
    if (isClosed) {
      throw new Error(`Cannot create journal entry: Fiscal year ${closedPeriod!.fiscalYear} is closed. Reopen the period to make changes.`);
    }
  }

  return prisma.$transaction(async (tx) => {
    // Get and increment the entry number
    const company = await tx.company.update({
      where: { id: input.companyId },
      data: { nextJournalEntryNumber: { increment: 1 } },
    });

    const entryNumber = company.nextJournalEntryNumber - 1; // We incremented, so use the previous value

    const entry = await tx.journalEntry.create({
      data: {
        companyId: input.companyId,
        entryNumber,
        date: input.date,
        memo: input.memo,
        referenceNumber: input.referenceNumber || null,
        source: input.source || 'manual',
        sourceId: input.sourceId || null,
        notes: input.notes || null,
        lines: {
          create: input.lines.map((line) => ({
            accountId: line.accountId,
            description: line.description || null,
            debit: line.debit || 0,
            credit: line.credit || 0,
          })),
        },
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return entry;
  });
}

// ============================================
// OPENING BALANCE HELPER
// ============================================

/**
 * Creates a journal entry to record an account's opening balance.
 * Uses the Opening Balance Equity account (3900) as the offsetting entry.
 *
 * @param companyId - The company ID
 * @param accountId - The account to set the opening balance for
 * @param amount - Positive number representing the balance amount
 * @param asOfDate - The date for the opening balance entry
 * @returns The created journal entry
 */
export async function createOpeningBalanceEntry(
  companyId: string,
  accountId: string,
  amount: number,
  asOfDate: Date,
) {
  if (amount === 0) {
    throw new Error('Opening balance amount cannot be zero');
  }

  // Look up the target account
  const targetAccount = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!targetAccount) {
    throw new Error('Target account not found');
  }

  if (targetAccount.companyId !== companyId) {
    throw new Error('Account does not belong to this company');
  }

  // Find the Opening Balance Equity account (code 3900)
  const openingBalanceEquity = await prisma.account.findUnique({
    where: { companyId_code: { companyId, code: '3900' } },
  });

  if (!openingBalanceEquity) {
    throw new Error('Opening Balance Equity account (3900) not found. Please seed the chart of accounts first.');
  }

  // Determine debit/credit based on account type and sign of amount
  // Negative amount flips the normal debit/credit sides
  const targetIsDebitNormal = isDebitNormal(targetAccount.type);
  const isNegative = amount < 0;
  const absAmount = Math.abs(amount);
  const lines: JournalEntryLineInput[] = [];

  // For positive amounts: debit-normal accounts get debited, credit-normal get credited
  // For negative amounts: flip the sides (debit-normal accounts get credited, etc.)
  const debitTarget = targetIsDebitNormal !== isNegative;

  if (debitTarget) {
    // Debit target, credit Opening Balance Equity
    lines.push({
      accountId: targetAccount.id,
      description: 'Opening balance',
      debit: absAmount,
      credit: 0,
    });
    lines.push({
      accountId: openingBalanceEquity.id,
      description: 'Opening balance offset',
      debit: 0,
      credit: absAmount,
    });
  } else {
    // Credit target, debit Opening Balance Equity
    lines.push({
      accountId: targetAccount.id,
      description: 'Opening balance',
      debit: 0,
      credit: absAmount,
    });
    lines.push({
      accountId: openingBalanceEquity.id,
      description: 'Opening balance offset',
      debit: absAmount,
      credit: 0,
    });
  }

  return createJournalEntry({
    companyId,
    date: asOfDate,
    memo: `Opening balance for ${targetAccount.name}`,
    source: 'opening_balance',
    sourceId: targetAccount.id,
    lines,
  });
}

// ============================================
// PAYROLL → JOURNAL ENTRY BRIDGE
// ============================================

/**
 * Creates journal entries from a batch of processed payroll records.
 * Called after payroll processing to automatically record the accounting impact.
 *
 * For cash basis: We record the full payroll expense and liabilities when payroll is processed.
 *
 * The journal entry for a payroll run looks like:
 *   DEBIT  6000 Wages & Salaries         (gross pay)
 *   DEBIT  6010 Payroll Tax Expense       (employer taxes: SS, Medicare, FUTA, SUI)
 *   CREDIT 2100 Payroll Liabilities       (net pay — what employees are owed)
 *   CREDIT 2110 Federal Tax Payable       (federal withholding)
 *   CREDIT 2120 State Tax Payable         (state withholding)
 *   CREDIT 2130 Social Security Payable   (employee + employer SS)
 *   CREDIT 2140 Medicare Payable          (employee + employer Medicare)
 *   CREDIT 2150 FUTA Payable              (employer FUTA)
 *   CREDIT 2160 SUI Payable               (employer SUI)
 *   CREDIT 2170 NY SDI Payable            (employee SDI)
 *   CREDIT 2180 NY PFL Payable            (employee PFL)
 */
export async function createPayrollJournalEntries(
  companyId: string,
  payrollRecordIds: string[],
  payDate: Date,
  payPeriodLabel: string,
): Promise<{ entryId: string; entryNumber: number } | null> {
  // Get the payroll records
  const records = await prisma.payrollRecord.findMany({
    where: {
      id: { in: payrollRecordIds },
      companyId,
      status: 'active',
    },
    include: {
      employee: { select: { firstName: true, lastName: true } },
    },
  });

  if (records.length === 0) return null;

  // Aggregate totals across all employees in this payroll run
  const totals = records.reduce(
    (acc, r) => {
      acc.grossPay += r.grossPay;
      acc.federalTax += r.federalTax;
      acc.stateTax += r.stateTax;
      acc.localTax += r.localTax;
      acc.socialSecurityEmployee += r.socialSecurity;
      acc.medicareEmployee += r.medicare + r.additionalMedicare;
      acc.nySDI += r.nySDI;
      acc.nyPFL += r.nyPFL;
      acc.netPay += r.netPay;
      acc.employerSocialSecurity += r.employerSocialSecurity;
      acc.employerMedicare += r.employerMedicare;
      acc.employerFUTA += r.employerFUTA;
      acc.employerSUI += r.employerSUI;
      acc.totalPreTaxDeductions += r.totalPreTaxDeductions;
      acc.totalPostTaxDeductions += r.totalPostTaxDeductions;
      return acc;
    },
    {
      grossPay: 0, federalTax: 0, stateTax: 0, localTax: 0,
      socialSecurityEmployee: 0, medicareEmployee: 0,
      nySDI: 0, nyPFL: 0, netPay: 0,
      employerSocialSecurity: 0, employerMedicare: 0,
      employerFUTA: 0, employerSUI: 0,
      totalPreTaxDeductions: 0, totalPostTaxDeductions: 0,
    }
  );

  // Look up account IDs by code
  const accountCodes = ['6000', '6010', '2100', '2110', '2120', '2130', '2140', '2150', '2160', '2170', '2180'];
  const accounts = await prisma.account.findMany({
    where: { companyId, code: { in: accountCodes } },
  });
  const acctMap = new Map(accounts.map((a) => [a.code, a.id]));

  // Check all required accounts exist
  const missing = accountCodes.filter((c) => !acctMap.has(c));
  if (missing.length > 0) {
    console.warn(`Missing accounts for payroll journal entry: ${missing.join(', ')}. Skipping journal entry creation.`);
    return null;
  }

  // Build journal entry lines (only include non-zero amounts)
  const lines: JournalEntryLineInput[] = [];

  // DEBITS
  if (totals.grossPay > 0) {
    lines.push({ accountId: acctMap.get('6000')!, description: 'Gross wages', debit: round2(totals.grossPay), credit: 0 });
  }

  const employerTaxTotal = totals.employerSocialSecurity + totals.employerMedicare + totals.employerFUTA + totals.employerSUI;
  if (employerTaxTotal > 0) {
    lines.push({ accountId: acctMap.get('6010')!, description: 'Employer payroll taxes', debit: round2(employerTaxTotal), credit: 0 });
  }

  // CREDITS
  // Net pay + pre-tax deductions go to Payroll Liabilities
  // Pre-tax deductions (401k, health insurance, etc.) are withheld from employee pay
  // and owed to third parties (retirement plan, insurance company)
  const payrollLiabilitiesTotal = totals.netPay + totals.totalPreTaxDeductions;
  if (payrollLiabilitiesTotal > 0) {
    lines.push({ accountId: acctMap.get('2100')!, description: 'Net pay + benefit withholdings payable', debit: 0, credit: round2(payrollLiabilitiesTotal) });
  }
  if (totals.federalTax > 0) {
    lines.push({ accountId: acctMap.get('2110')!, description: 'Federal withholding', debit: 0, credit: round2(totals.federalTax) });
  }
  if (totals.stateTax + totals.localTax > 0) {
    lines.push({ accountId: acctMap.get('2120')!, description: 'State/local withholding', debit: 0, credit: round2(totals.stateTax + totals.localTax) });
  }
  if (totals.socialSecurityEmployee + totals.employerSocialSecurity > 0) {
    lines.push({ accountId: acctMap.get('2130')!, description: 'Social Security (EE + ER)', debit: 0, credit: round2(totals.socialSecurityEmployee + totals.employerSocialSecurity) });
  }
  if (totals.medicareEmployee + totals.employerMedicare > 0) {
    lines.push({ accountId: acctMap.get('2140')!, description: 'Medicare (EE + ER)', debit: 0, credit: round2(totals.medicareEmployee + totals.employerMedicare) });
  }
  if (totals.employerFUTA > 0) {
    lines.push({ accountId: acctMap.get('2150')!, description: 'FUTA', debit: 0, credit: round2(totals.employerFUTA) });
  }
  if (totals.employerSUI > 0) {
    lines.push({ accountId: acctMap.get('2160')!, description: 'SUI', debit: 0, credit: round2(totals.employerSUI) });
  }
  if (totals.nySDI > 0) {
    lines.push({ accountId: acctMap.get('2170')!, description: 'NY SDI', debit: 0, credit: round2(totals.nySDI) });
  }
  if (totals.nyPFL > 0) {
    lines.push({ accountId: acctMap.get('2180')!, description: 'NY PFL', debit: 0, credit: round2(totals.nyPFL) });
  }

  // Note: Pre-tax deductions are included in the Payroll Liabilities line above.
  // A future enhancement could break these out into separate liability accounts
  // (e.g., 401k Payable, Health Insurance Payable) for better tracking.

  // Validate the entry balances
  const validation = validateJournalEntry(lines);
  if (!validation.valid) {
    // Rounding can sometimes cause a tiny imbalance — adjust the net pay line
    const diff = validation.totalDebits - validation.totalCredits;
    const netPayLine = lines.find((l) => l.accountId === acctMap.get('2100'));
    if (netPayLine && Math.abs(diff) <= 0.02) {
      netPayLine.credit = round2(netPayLine.credit + diff);
    } else {
      console.error(`Payroll journal entry doesn't balance: ${validation.error}`);
      return null;
    }
  }

  const employeeNames = records.map((r) => `${r.employee.firstName} ${r.employee.lastName}`).join(', ');

  try {
    const entry = await createJournalEntry({
      companyId,
      date: payDate,
      memo: `Payroll: ${payPeriodLabel} (${records.length} employee${records.length > 1 ? 's' : ''})`,
      referenceNumber: `PR-${payPeriodLabel}`,
      source: 'payroll',
      sourceId: payrollRecordIds.join(','),
      lines,
      notes: `Employees: ${employeeNames}`,
    });

    return { entryId: entry.id, entryNumber: entry.entryNumber };
  } catch (error) {
    console.error('Failed to create payroll journal entry:', error);
    return null;
  }
}

// ============================================
// FINANCIAL REPORT HELPERS
// ============================================

export interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: AccountType;
  accountGroup: string | null;
  debitTotal: number;
  creditTotal: number;
  balance: number; // Normal balance (debit-positive for assets/expenses, credit-positive for liabilities/equity/revenue)
}

/**
 * Calculate account balances for a date range.
 * For cash basis, we simply sum all posted journal entry lines.
 *
 * @param companyId - The company ID
 * @param startDateStr - Optional start date string (YYYY-MM-DD format)
 * @param endDateStr - Optional end date string (YYYY-MM-DD format)
 */
export async function getAccountBalances(
  companyId: string,
  startDateStr?: string,
  endDateStr?: string,
): Promise<AccountBalance[]> {
  // Get all active accounts
  const accounts = await prisma.account.findMany({
    where: { companyId, isActive: true },
    orderBy: { code: 'asc' },
  });

  // Build date filter for journal entries using timezone-safe date handling
  const dateFilter: Record<string, unknown> = {};
  if (startDateStr) dateFilter.gte = startOfDay(startDateStr);
  if (endDateStr) dateFilter.lte = endOfDay(endDateStr);

  // Get all posted journal entry lines within the date range
  const lines = await prisma.journalEntryLine.findMany({
    where: {
      journalEntry: {
        companyId,
        status: 'posted',
        ...(Object.keys(dateFilter).length > 0 ? { date: dateFilter } : {}),
      },
    },
    select: {
      accountId: true,
      debit: true,
      credit: true,
    },
  });

  // Aggregate by account
  const linesByAccount = new Map<string, { debits: number; credits: number }>();
  for (const line of lines) {
    const existing = linesByAccount.get(line.accountId) || { debits: 0, credits: 0 };
    existing.debits += line.debit;
    existing.credits += line.credit;
    linesByAccount.set(line.accountId, existing);
  }

  return accounts.map((acct) => {
    const totals = linesByAccount.get(acct.id) || { debits: 0, credits: 0 };
    const type = acct.type as AccountType;

    // Normal balance: assets and expenses are debit-normal, others are credit-normal
    const balance = isDebitNormal(type)
      ? round2(totals.debits - totals.credits)
      : round2(totals.credits - totals.debits);

    return {
      accountId: acct.id,
      code: acct.code,
      name: acct.name,
      type,
      accountGroup: acct.accountGroup,
      debitTotal: round2(totals.debits),
      creditTotal: round2(totals.credits),
      balance,
    };
  });
}

/**
 * Whether an account type has a normal debit balance.
 * Assets and expenses are debit-normal.
 * Liabilities, equity, revenue, and credit_card are credit-normal.
 */
export function isDebitNormal(type: AccountType | string): boolean {
  return type === 'asset' || type === 'expense';
}

/**
 * Generate a Profit & Loss (Income Statement) report.
 *
 * @param companyId - The company ID
 * @param startDateStr - Start date string (YYYY-MM-DD format)
 * @param endDateStr - End date string (YYYY-MM-DD format)
 */
export async function generateProfitAndLoss(
  companyId: string,
  startDateStr: string,
  endDateStr: string,
) {
  const balances = await getAccountBalances(companyId, startDateStr, endDateStr);

  // Include all revenue/expense accounts - let frontend handle zero-balance filtering
  const revenue = balances.filter((b) => b.type === 'revenue');
  const expenses = balances.filter((b) => b.type === 'expense');

  // Totals only count non-zero balances
  const totalRevenue = revenue.reduce((sum, b) => sum + b.balance, 0);
  const totalExpenses = expenses.reduce((sum, b) => sum + b.balance, 0);
  const netIncome = round2(totalRevenue - totalExpenses);

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    revenue,
    totalRevenue: round2(totalRevenue),
    expenses,
    totalExpenses: round2(totalExpenses),
    netIncome,
  };
}

/**
 * Generate a Balance Sheet report.
 * For the specified date, includes all transactions up to that date.
 * Credit card accounts appear in their own section after current liabilities.
 *
 * @param companyId - The company ID
 * @param asOfDateStr - As-of date string (YYYY-MM-DD format)
 */
export async function generateBalanceSheet(companyId: string, asOfDateStr: string) {
  const balances = await getAccountBalances(companyId, undefined, asOfDateStr);

  const assets = balances.filter((b) => b.type === 'asset' && b.balance !== 0);
  const liabilities = balances.filter((b) => b.type === 'liability' && b.balance !== 0);
  const creditCards = balances.filter((b) => b.type === 'credit_card' && b.balance !== 0);
  const equity = balances.filter((b) => b.type === 'equity' && b.balance !== 0);

  const totalAssets = round2(assets.reduce((sum, b) => sum + b.balance, 0));
  const totalLiabilities = round2(liabilities.reduce((sum, b) => sum + b.balance, 0));
  const totalCreditCards = round2(creditCards.reduce((sum, b) => sum + b.balance, 0));
  const totalEquity = round2(equity.reduce((sum, b) => sum + b.balance, 0));

  // Calculate retained earnings (net income for all time up to this date)
  const revenueBalances = balances.filter((b) => b.type === 'revenue');
  const expenseBalances = balances.filter((b) => b.type === 'expense');
  const retainedEarnings = round2(
    revenueBalances.reduce((sum, b) => sum + b.balance, 0) -
    expenseBalances.reduce((sum, b) => sum + b.balance, 0)
  );

  return {
    asOfDate: asOfDateStr,
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    creditCards,
    totalCreditCards,
    equity,
    totalEquity,
    retainedEarnings,
    totalLiabilitiesAndEquity: round2(totalLiabilities + totalCreditCards + totalEquity + retainedEarnings),
  };
}

/**
 * Generate a Trial Balance report.
 *
 * @param companyId - The company ID
 * @param asOfDateStr - As-of date string (YYYY-MM-DD format)
 */
export async function generateTrialBalance(companyId: string, asOfDateStr: string) {
  const balances = await getAccountBalances(companyId, undefined, asOfDateStr);

  // Only include accounts with activity
  const activeBalances = balances.filter((b) => b.debitTotal !== 0 || b.creditTotal !== 0);

  const totalDebits = round2(activeBalances.reduce((sum, b) => {
    return sum + (isDebitNormal(b.type) && b.balance > 0 ? b.balance : (!isDebitNormal(b.type) && b.balance < 0 ? Math.abs(b.balance) : 0));
  }, 0));

  const totalCredits = round2(activeBalances.reduce((sum, b) => {
    return sum + (!isDebitNormal(b.type) && b.balance > 0 ? b.balance : (isDebitNormal(b.type) && b.balance < 0 ? Math.abs(b.balance) : 0));
  }, 0));

  return {
    asOfDate: asOfDateStr,
    accounts: activeBalances,
    totalDebits,
    totalCredits,
    isBalanced: Math.abs(totalDebits - totalCredits) < 0.01,
  };
}

/**
 * Generate a General Ledger report for a specific account or all accounts.
 *
 * @param companyId - The company ID
 * @param startDateStr - Start date string (YYYY-MM-DD format)
 * @param endDateStr - End date string (YYYY-MM-DD format)
 * @param accountId - Optional account ID to filter by
 */
export async function generateGeneralLedger(
  companyId: string,
  startDateStr: string,
  endDateStr: string,
  accountId?: string,
) {
  const whereClause: Record<string, unknown> = {
    journalEntry: {
      companyId,
      status: 'posted',
      date: {
        gte: startOfDay(startDateStr),
        lte: endOfDay(endDateStr),
      },
    },
  };

  if (accountId) {
    whereClause.accountId = accountId;
  }

  const lines = await prisma.journalEntryLine.findMany({
    where: whereClause,
    include: {
      account: true,
      journalEntry: {
        select: {
          id: true,
          entryNumber: true,
          date: true,
          memo: true,
          referenceNumber: true,
          source: true,
        },
      },
    },
    orderBy: [
      { journalEntry: { date: 'asc' } },
      { journalEntry: { entryNumber: 'asc' } },
    ],
  });

  // Group by account
  const byAccount = new Map<string, {
    account: { id: string; code: string; name: string; type: string };
    entries: Array<{
      date: Date;
      entryNumber: number;
      memo: string;
      referenceNumber: string | null;
      source: string;
      description: string | null;
      debit: number;
      credit: number;
      runningBalance: number;
    }>;
    totalDebits: number;
    totalCredits: number;
  }>();

  for (const line of lines) {
    const key = line.accountId;
    if (!byAccount.has(key)) {
      byAccount.set(key, {
        account: {
          id: line.account.id,
          code: line.account.code,
          name: line.account.name,
          type: line.account.type,
        },
        entries: [],
        totalDebits: 0,
        totalCredits: 0,
      });
    }

    const group = byAccount.get(key)!;
    group.totalDebits += line.debit;
    group.totalCredits += line.credit;

    const balance = isDebitNormal(line.account.type as AccountType)
      ? group.totalDebits - group.totalCredits
      : group.totalCredits - group.totalDebits;

    group.entries.push({
      date: line.journalEntry.date,
      entryNumber: line.journalEntry.entryNumber,
      memo: line.journalEntry.memo,
      referenceNumber: line.journalEntry.referenceNumber,
      source: line.journalEntry.source,
      description: line.description,
      debit: line.debit,
      credit: line.credit,
      runningBalance: round2(balance),
    });
  }

  // Sort accounts by code
  const result = Array.from(byAccount.values()).sort((a, b) =>
    a.account.code.localeCompare(b.account.code)
  );

  return {
    startDate: startDateStr,
    endDate: endDateStr,
    accounts: result,
  };
}

// ============================================
// YEAR-END CLOSING HELPERS
// ============================================

/**
 * Check if a date falls within a closed fiscal period.
 * Returns the closed period if found, null otherwise.
 *
 * @param companyId - The company ID
 * @param date - The date to check
 * @returns The closed period if the date is in a closed period, null otherwise
 */
export async function checkClosedPeriod(companyId: string, date: Date): Promise<{
  isClosed: boolean;
  closedPeriod?: {
    id: string;
    fiscalYear: number;
    periodEnd: Date;
    closedAt: Date;
    isOpen: boolean;
  };
}> {
  // Get the fiscal year for the date
  const year = date.getUTCFullYear();

  const closedPeriod = await prisma.closedPeriod.findUnique({
    where: { companyId_fiscalYear: { companyId, fiscalYear: year } },
    select: {
      id: true,
      fiscalYear: true,
      periodEnd: true,
      closedAt: true,
      isOpen: true,
    },
  });

  if (!closedPeriod) {
    return { isClosed: false };
  }

  // If the period has been reopened, it's not closed
  if (closedPeriod.isOpen) {
    return { isClosed: false };
  }

  // Check if the date is within the closed period
  if (date <= closedPeriod.periodEnd) {
    return { isClosed: true, closedPeriod };
  }

  return { isClosed: false };
}

/**
 * Create a year-end closing entry that zeros out all revenue and expense accounts
 * and moves the net income to Retained Earnings.
 *
 * The closing entry:
 * - DEBITS all revenue accounts (to zero them out)
 * - CREDITS all expense accounts (to zero them out)
 * - DEBITS or CREDITS Retained Earnings for the net income/loss
 *
 * @param companyId - The company ID
 * @param fiscalYear - The fiscal year being closed
 * @param periodEnd - The last day of the fiscal year
 * @returns The closing journal entry
 */
export async function createYearEndClosingEntry(
  companyId: string,
  fiscalYear: number,
  periodEnd: Date,
) {
  // Get the start of the fiscal year (assume calendar year)
  const fiscalYearStart = `${fiscalYear}-01-01`;
  const fiscalYearEnd = `${fiscalYear}-12-31`;

  // Get all account balances for the fiscal year
  const balances = await getAccountBalances(companyId, fiscalYearStart, fiscalYearEnd);

  // Filter to revenue and expense accounts with non-zero balances
  const revenueAccounts = balances.filter((b) => b.type === 'revenue' && b.balance !== 0);
  const expenseAccounts = balances.filter((b) => b.type === 'expense' && b.balance !== 0);

  // Calculate net income (revenue - expenses)
  const totalRevenue = revenueAccounts.reduce((sum, b) => sum + b.balance, 0);
  const totalExpenses = expenseAccounts.reduce((sum, b) => sum + b.balance, 0);
  const netIncome = round2(totalRevenue - totalExpenses);

  // Find Retained Earnings account (code 3200)
  const retainedEarnings = await prisma.account.findUnique({
    where: { companyId_code: { companyId, code: '3200' } },
  });

  if (!retainedEarnings) {
    throw new Error('Retained Earnings account (3200) not found. Please seed the chart of accounts first.');
  }

  // Build journal entry lines
  const lines: JournalEntryLineInput[] = [];

  // DEBIT all revenue accounts (revenue has credit-normal balance, so we debit to zero)
  for (const rev of revenueAccounts) {
    lines.push({
      accountId: rev.accountId,
      description: `Close ${rev.name} to Retained Earnings`,
      debit: round2(rev.balance),
      credit: 0,
    });
  }

  // CREDIT all expense accounts (expense has debit-normal balance, so we credit to zero)
  for (const exp of expenseAccounts) {
    lines.push({
      accountId: exp.accountId,
      description: `Close ${exp.name} to Retained Earnings`,
      debit: 0,
      credit: round2(exp.balance),
    });
  }

  // Net income entry to Retained Earnings
  // If net income is positive (profit), credit Retained Earnings
  // If net income is negative (loss), debit Retained Earnings
  if (netIncome !== 0) {
    if (netIncome > 0) {
      lines.push({
        accountId: retainedEarnings.id,
        description: `Net income for fiscal year ${fiscalYear}`,
        debit: 0,
        credit: round2(netIncome),
      });
    } else {
      lines.push({
        accountId: retainedEarnings.id,
        description: `Net loss for fiscal year ${fiscalYear}`,
        debit: round2(Math.abs(netIncome)),
        credit: 0,
      });
    }
  }

  // If no revenue/expense activity, no closing entry needed
  if (lines.length === 0) {
    throw new Error(`No revenue or expense activity found for fiscal year ${fiscalYear}. Nothing to close.`);
  }

  // Create the closing journal entry (skip closed period check since we're creating this entry)
  const entry = await createJournalEntry({
    companyId,
    date: periodEnd,
    memo: `Year-end closing entry for fiscal year ${fiscalYear}`,
    referenceNumber: `YEC-${fiscalYear}`,
    source: 'year_end_closing',
    sourceId: fiscalYear.toString(),
    lines,
    skipClosedPeriodCheck: true,
  });

  return {
    entry,
    summary: {
      fiscalYear,
      totalRevenue: round2(totalRevenue),
      totalExpenses: round2(totalExpenses),
      netIncome,
      revenueAccountsClosed: revenueAccounts.length,
      expenseAccountsClosed: expenseAccounts.length,
    },
  };
}

// ============================================
// UTILITY
// ============================================

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
