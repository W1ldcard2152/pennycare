// Default Chart of Accounts - matches tax accountant's structure
// Hierarchy: Type -> Group -> Account

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'credit_card';

export interface DefaultAccount {
  code: string;
  name: string;
  type: AccountType;
  accountGroup: string;
  description?: string;
  taxLine?: string;
}

/**
 * Account groups by type - defines the hierarchy for display and code ranges
 */
export const ACCOUNT_GROUPS: Record<AccountType, string[]> = {
  asset: [
    'Cash',
    'Current Assets',
    'Buildings and other depreciable assets',
    'Less accumulated depreciation',
    'Vehicles',
  ],
  liability: [
    'Credit Card Liabilities',
    'Other Current Liabilities',
    'Mortgages, notes, bonds payable in less than 1 year',
    'Current Liabilities',
    'Mortgages, notes, bonds payable in 1 year or more',
    'Non-Current Liabilities',
  ],
  equity: [
    'Equity',
  ],
  revenue: [
    'Revenues',
    'Other Income',
  ],
  expense: [
    'Cost of Goods Sold',
    'COGS Purchases',
    'COGS other costs',
    'Shop Supplies',
    'Repairs',
    'Salaries and wages',
    'Rent',
    'Taxes and Licenses',
    'Interest',
    'Depreciation expense',
    'Other deductions',
  ],
  credit_card: [
    'Credit Cards',
  ],
};

/**
 * Code ranges for each group - used for auto-suggesting account codes
 */
export const GROUP_CODE_RANGES: Record<string, { start: number; end: number; increment: number }> = {
  // Assets
  'Cash': { start: 1000, end: 1049, increment: 10 },
  'Current Assets': { start: 1100, end: 1499, increment: 10 },
  'Buildings and other depreciable assets': { start: 1500, end: 1599, increment: 10 },
  'Less accumulated depreciation': { start: 1600, end: 1699, increment: 10 },
  'Vehicles': { start: 1700, end: 1999, increment: 10 },

  // Liabilities
  'Credit Card Liabilities': { start: 2100, end: 2199, increment: 10 },
  'Other Current Liabilities': { start: 2200, end: 2299, increment: 10 },
  'Mortgages, notes, bonds payable in less than 1 year': { start: 2300, end: 2399, increment: 10 },
  'Current Liabilities': { start: 2400, end: 2499, increment: 10 },
  'Mortgages, notes, bonds payable in 1 year or more': { start: 2500, end: 2599, increment: 10 },
  'Non-Current Liabilities': { start: 2600, end: 2999, increment: 10 },

  // Equity
  'Equity': { start: 3000, end: 3999, increment: 10 },

  // Revenue
  'Revenues': { start: 4000, end: 4499, increment: 10 },
  'Other Income': { start: 4500, end: 4999, increment: 10 },

  // Cost of Goods Sold (5000s)
  'Cost of Goods Sold': { start: 5000, end: 5049, increment: 10 },
  'COGS Purchases': { start: 5050, end: 5199, increment: 10 },
  'COGS other costs': { start: 5200, end: 5999, increment: 10 },

  // Expenses (6000s+)
  'Shop Supplies': { start: 6000, end: 6049, increment: 10 },
  'Repairs': { start: 6050, end: 6099, increment: 10 },
  'Salaries and wages': { start: 6100, end: 6199, increment: 10 },
  'Rent': { start: 6200, end: 6249, increment: 10 },
  'Taxes and Licenses': { start: 6250, end: 6399, increment: 10 },
  'Interest': { start: 6400, end: 6449, increment: 10 },
  'Depreciation expense': { start: 6450, end: 6499, increment: 10 },
  'Other deductions': { start: 6500, end: 6999, increment: 10 },

  // Credit Cards
  'Credit Cards': { start: 2050, end: 2099, increment: 10 },
};

/**
 * Default chart of accounts matching tax accountant's structure.
 * Each account includes type, group, name, code, and tax line mapping.
 */
export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccount[] = [
  // ══════════════════════════════════════════════════════════════════════════════
  // ASSETS
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Cash ──
  { code: '1000', name: 'Cash', type: 'asset', accountGroup: 'Cash', taxLine: 'B/S-Assets: Cash' },
  { code: '1010', name: 'Checking Account', type: 'asset', accountGroup: 'Cash', taxLine: 'B/S-Assets: Cash' },
  { code: '1020', name: 'eBay Managed Payments Checking Account', type: 'asset', accountGroup: 'Cash', taxLine: 'B/S-Assets: Cash' },
  { code: '1030', name: 'Savings Account', type: 'asset', accountGroup: 'Cash', taxLine: 'B/S-Assets: Cash' },
  { code: '1040', name: 'Cash', type: 'asset', accountGroup: 'Cash', taxLine: 'B/S-Assets: Cash', description: 'Petty cash on hand' },

  // ── Current Assets ──
  { code: '1100', name: 'Parts Inventory', type: 'asset', accountGroup: 'Current Assets', taxLine: 'B/S-Assets: Other current assets' },
  { code: '1110', name: 'Core/Car Inventory', type: 'asset', accountGroup: 'Current Assets', taxLine: 'B/S-Assets: Other current assets' },
  { code: '1120', name: 'eBay Pending Payouts', type: 'asset', accountGroup: 'Current Assets', description: 'Funds held by eBay pending daily payout to bank', taxLine: 'B/S-Assets: Other current assets' },
  { code: '1130', name: 'CC Payments Pending', type: 'asset', accountGroup: 'Current Assets', description: 'Credit card payments pending bank clearing', taxLine: 'B/S-Assets: Other current assets' },

  // ── Buildings and other depreciable assets ──
  { code: '1500', name: 'Furniture and Equipment', type: 'asset', accountGroup: 'Buildings and other depreciable assets', taxLine: 'B/S-Assets: Buildings/oth. depr. assets' },
  { code: '1510', name: 'Equipment', type: 'asset', accountGroup: 'Buildings and other depreciable assets', taxLine: 'B/S-Assets: Buildings/oth. depr. assets' },

  // ── Less accumulated depreciation ──
  { code: '1600', name: 'Accumulated Depreciation', type: 'asset', accountGroup: 'Less accumulated depreciation', taxLine: 'B/S-Assets: Less accum. depreciation' },

  // ── Vehicles ──
  { code: '1700', name: 'Work Vehicles', type: 'asset', accountGroup: 'Vehicles', taxLine: 'B/S-Assets: Vehicles' },

  // ══════════════════════════════════════════════════════════════════════════════
  // LIABILITIES
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Credit Card Liabilities ──
  { code: '2100', name: 'Credit Card', type: 'liability', accountGroup: 'Credit Card Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2110', name: 'Other Current Liability', type: 'liability', accountGroup: 'Credit Card Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2120', name: 'Payable Bond/Trust Fund Credit Account', type: 'liability', accountGroup: 'Credit Card Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },

  // ── Other Current Liabilities ──
  { code: '2200', name: 'Sales Tax Payable', type: 'liability', accountGroup: 'Other Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2210', name: 'Notes Payable', type: 'liability', accountGroup: 'Other Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },

  // ── Mortgages, notes, bonds payable in less than 1 year ──
  { code: '2300', name: 'Mortgages, notes, bonds payable in less than 1 year', type: 'liability', accountGroup: 'Mortgages, notes, bonds payable in less than 1 year', taxLine: 'B/S-Liabs/Eq: Mortgages/notes < 1 yr' },

  // ── Current Liabilities ──
  { code: '2400', name: 'Payroll Liabilities', type: 'liability', accountGroup: 'Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'Wages, taxes, and withholdings payable' },
  { code: '2410', name: 'Federal Tax Payable', type: 'liability', accountGroup: 'Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2420', name: 'NY State Tax Payable', type: 'liability', accountGroup: 'Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2430', name: 'Social Security Payable', type: 'liability', accountGroup: 'Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2440', name: 'Medicare Payable', type: 'liability', accountGroup: 'Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2450', name: 'FUTA Payable', type: 'liability', accountGroup: 'Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2460', name: 'NY SUI Payable', type: 'liability', accountGroup: 'Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2470', name: 'NY SDI Payable', type: 'liability', accountGroup: 'Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2480', name: 'NY PFL Payable', type: 'liability', accountGroup: 'Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },

  // ── Mortgages, notes, bonds payable in 1 year or more ──
  { code: '2500', name: 'eBay Managed Payments Reserve Hold Funds', type: 'liability', accountGroup: 'Mortgages, notes, bonds payable in 1 year or more', taxLine: 'B/S-Liabs/Eq: Mortgages/notes >= 1 yr' },
  { code: '2510', name: 'LRAP FUNDS HELD', type: 'liability', accountGroup: 'Mortgages, notes, bonds payable in 1 year or more', taxLine: 'B/S-Liabs/Eq: Mortgages/notes >= 1 yr' },

  // ── Non-Current Liabilities ──
  { code: '2600', name: 'NYS DMV LIENS', type: 'liability', accountGroup: 'Non-Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other liabilities' },

  // ══════════════════════════════════════════════════════════════════════════════
  // EQUITY
  // ══════════════════════════════════════════════════════════════════════════════

  { code: '3000', name: 'Opening Balance Equity', type: 'equity', accountGroup: 'Equity', taxLine: 'B/S-Liabs/Eq: Capital stock' },
  { code: '3010', name: 'Additional paid in capital', type: 'equity', accountGroup: 'Equity', taxLine: 'B/S-Liabs/Eq: Add\'l paid-in capital' },
  { code: '3020', name: 'Retained Earnings', type: 'equity', accountGroup: 'Equity', taxLine: 'B/S-Liabs/Eq: Retained earnings' },
  { code: '3030', name: 'Adjustments to shareholders\' equity', type: 'equity', accountGroup: 'Equity', taxLine: 'B/S-Liabs/Eq: Adj to shareholders equity' },
  { code: '3040', name: 'Shareholder Distributions', type: 'equity', accountGroup: 'Equity', taxLine: 'B/S-Liabs/Eq: Shareholder distributions' },
  { code: '3050', name: 'Shareholder Distributions', type: 'equity', accountGroup: 'Equity', taxLine: 'B/S-Liabs/Eq: Other equity', description: 'Owner\'s draw' },
  { code: '3060', name: 'NET INC/(NET LOSS)', type: 'equity', accountGroup: 'Equity', taxLine: 'B/S-Liabs/Eq: Net income / loss' },

  // ══════════════════════════════════════════════════════════════════════════════
  // REVENUE
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Revenues ──
  { code: '4000', name: 'Credit Card Rewards Income', type: 'revenue', accountGroup: 'Revenues', taxLine: 'Gross receipts or sales' },
  { code: '4010', name: 'eBay Sales', type: 'revenue', accountGroup: 'Revenues', taxLine: 'Gross receipts or sales' },
  { code: '4020', name: 'Scrap Recycler Income', type: 'revenue', accountGroup: 'Revenues', taxLine: 'Gross receipts or sales' },
  { code: '4030', name: 'Gross receipts or sales', type: 'revenue', accountGroup: 'Revenues', taxLine: 'Gross receipts or sales' },

  // ── Other Income ──
  { code: '4500', name: 'Interest', type: 'revenue', accountGroup: 'Other Income', taxLine: 'Other income' },

  // ══════════════════════════════════════════════════════════════════════════════
  // EXPENSES - COST OF GOODS SOLD
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Cost of Goods Sold ──
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', accountGroup: 'Cost of Goods Sold', taxLine: 'COGS: Cost of labor' },
  { code: '5010', name: 'Misc. Cost of Goods Sold', type: 'expense', accountGroup: 'Cost of Goods Sold', taxLine: 'COGS: Other costs' },

  // ── COGS Purchases ──
  { code: '5050', name: 'Parts for Install: Vehicles', type: 'expense', accountGroup: 'COGS Purchases', taxLine: 'COGS: Purchases' },
  { code: '5060', name: 'COGS Purchases (FORM)', type: 'expense', accountGroup: 'COGS Purchases', taxLine: 'COGS: Purchases' },

  // ── COGS other costs ──
  { code: '5200', name: 'eBay Listing and selling costs', type: 'expense', accountGroup: 'COGS other costs', taxLine: 'COGS: Other costs' },
  { code: '5210', name: 'Freight and Shipping Costs', type: 'expense', accountGroup: 'COGS other costs', taxLine: 'COGS: Other costs' },
  { code: '5220', name: 'Shipping and Freight', type: 'expense', accountGroup: 'COGS other costs', taxLine: 'COGS: Other costs' },

  // ══════════════════════════════════════════════════════════════════════════════
  // EXPENSES - OPERATING EXPENSES
  // ══════════════════════════════════════════════════════════════════════════════

  // ── Shop Supplies ──
  { code: '6000', name: 'Shop Supplies', type: 'expense', accountGroup: 'Shop Supplies', taxLine: 'Sch C: Supplies' },

  // ── Repairs ──
  { code: '6050', name: 'Repairs', type: 'expense', accountGroup: 'Repairs', taxLine: 'Sch C: Repairs and maintenance' },
  { code: '6060', name: 'Equipment Maintenance', type: 'expense', accountGroup: 'Repairs', taxLine: 'Sch C: Repairs and maintenance' },

  // ── Salaries and wages ──
  { code: '6100', name: 'Payroll Expenses-Employee Wages', type: 'expense', accountGroup: 'Salaries and wages', taxLine: 'Sch C: Wages paid' },
  { code: '6110', name: 'Payroll Expenses-Officer Wages', type: 'expense', accountGroup: 'Salaries and wages', taxLine: 'Comp. of Officers: M-3 Detail' },
  { code: '6120', name: 'Payroll Expenses/Officers Wages', type: 'expense', accountGroup: 'Salaries and wages', taxLine: 'Comp. of Officers: M-3 Detail' },

  // ── Rent ──
  { code: '6200', name: 'Rent Expense', type: 'expense', accountGroup: 'Rent', taxLine: 'Rents' },

  // ── Taxes and Licenses ──
  { code: '6250', name: 'Payroll Expenses Employer Taxes', type: 'expense', accountGroup: 'Taxes and Licenses', taxLine: 'Taxes and licenses' },
  { code: '6260', name: 'Payroll Withhold Taxes', type: 'expense', accountGroup: 'Taxes and Licenses', taxLine: 'Taxes and licenses' },
  { code: '6270', name: 'Taxes - Federal', type: 'expense', accountGroup: 'Taxes and Licenses', taxLine: 'Taxes and licenses' },
  { code: '6280', name: 'New York Taxes Expense', type: 'expense', accountGroup: 'Taxes and Licenses', taxLine: 'Taxes and licenses' },
  { code: '6290', name: 'State Income taxes', type: 'expense', accountGroup: 'Taxes and Licenses', taxLine: 'Taxes and licenses' },

  // ── Interest ──
  { code: '6400', name: 'Interest Expense', type: 'expense', accountGroup: 'Interest', taxLine: 'Sch C: Interest expense' },

  // ── Depreciation expense ──
  { code: '6450', name: 'Depreciation expense', type: 'expense', accountGroup: 'Depreciation expense', taxLine: 'Depreciation' },

  // ── Other deductions ──
  { code: '6500', name: 'Auto Expenses', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6510', name: 'Automotive Expense', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6520', name: 'Auto Expense', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6530', name: 'Bank Fees', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6540', name: 'Cash Over or Short', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6550', name: 'Credit Card Finance Charges', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6560', name: 'Credit Card Fees', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6570', name: 'Dues and Subscriptions', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6580', name: 'Dues And Subscriptions', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6590', name: 'eBay Fees', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6600', name: 'eBay Fees', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions', description: 'Final Value Fees and other platform fees' },
  { code: '6610', name: 'Insurance Expense', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Insurance' },
  { code: '6620', name: 'Insurance Exp', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Insurance' },
  { code: '6630', name: 'Office Supplies', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Office expense' },
  { code: '6640', name: 'Office Supplies', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Office expense' },
  { code: '6650', name: 'Professional Fees', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6660', name: 'Professional Fees', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6670', name: 'Shipping & Supplies', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6680', name: 'Shipping & Supplies', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6690', name: 'Software', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6700', name: 'Software', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6710', name: 'Small Tools and Equipment', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6720', name: 'Small Tools and Equipment', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6730', name: 'Tow & Hwy Expense', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6740', name: 'Misc. Expenses', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6750', name: 'Miscellaneous Exp', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6760', name: 'DMV Expense', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions' },
  { code: '6770', name: 'Computer and Internet Expenses', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Utilities' },
  { code: '6780', name: 'Utilities', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Utilities' },
  { code: '6790', name: 'Meals and entertainment-subject to 50%', type: 'expense', accountGroup: 'Other deductions', taxLine: 'M&E (100% LIMIT)' },
  { code: '6800', name: 'Other deductions', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions', description: 'Catch-all for other business expenses' },
  { code: '6810', name: 'Reconciliation Discrepancies', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions', description: 'Adjustments for reconciliation differences' },

  // ══════════════════════════════════════════════════════════════════════════════
  // CREDIT CARDS (as a separate type for tracking CC balances)
  // ══════════════════════════════════════════════════════════════════════════════

  { code: '2050', name: 'Capital One Credit Card', type: 'credit_card', accountGroup: 'Credit Cards', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2060', name: 'Chase Credit Card', type: 'credit_card', accountGroup: 'Credit Cards', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
  { code: '2070', name: 'PayPal Credit', type: 'credit_card', accountGroup: 'Credit Cards', taxLine: 'B/S-Liabs/Eq: Other current liabilities' },
];

/**
 * Get groups for a specific account type
 */
export function getGroupsForType(type: AccountType): string[] {
  return ACCOUNT_GROUPS[type] || [];
}

/**
 * Get the code range for a specific group
 */
export function getGroupCodeRange(group: string): { start: number; end: number; increment: number } | undefined {
  return GROUP_CODE_RANGES[group];
}

/**
 * Labels for account types (for display)
 */
export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: 'Assets',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
  credit_card: 'Credit Cards',
};

// ============================================
// ACCOUNT BEHAVIOR HELPERS
// ============================================
// These functions infer accounting behavior from account groups
// (replaces the old subtype-based behavior detection)

/**
 * Groups that represent bank/cash accounts (for reconciliation, statement import, etc.)
 */
const BANK_ACCOUNT_GROUPS = ['Cash'];

/**
 * Groups that represent Cost of Goods Sold expenses
 */
const COGS_GROUPS = ['Cost of Goods Sold', 'COGS Purchases', 'COGS other costs'];

/**
 * Check if an account is a bank/cash account based on its group
 */
export function isBankAccount(accountGroup: string | null | undefined, type: string): boolean {
  if (type !== 'asset') return false;
  return BANK_ACCOUNT_GROUPS.includes(accountGroup || '');
}

/**
 * Check if an account is a credit card based on its type
 */
export function isCreditCardAccount(type: string): boolean {
  return type === 'credit_card';
}

/**
 * Check if an account is reconcilable (bank or credit card)
 */
export function isReconcilableAccount(accountGroup: string | null | undefined, type: string): boolean {
  return isBankAccount(accountGroup, type) || isCreditCardAccount(type);
}

/**
 * Check if an expense account is COGS based on its group
 */
export function isCOGSAccount(accountGroup: string | null | undefined, type: string): boolean {
  if (type !== 'expense') return false;
  return COGS_GROUPS.includes(accountGroup || '');
}

/**
 * Get display order for groups within a type (for sorting)
 */
export function getGroupDisplayOrder(type: AccountType, group: string): number {
  const groups = ACCOUNT_GROUPS[type];
  const index = groups.indexOf(group);
  return index >= 0 ? index : 999;
}
