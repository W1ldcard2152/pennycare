// Account taxonomy: types, group names, code ranges, and behavior helpers.
//
// The actual catalog of default accounts (with tiers and dependencies) lives
// in lib/account-catalog.ts. This file holds the surrounding metadata that
// the rest of the app uses to render group dropdowns, suggest codes, and
// branch on account behavior.

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
    'Payroll Liabilities',
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
    'Salaries and wages',
    'Repairs',
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
  'Payroll Liabilities': { start: 2100, end: 2199, increment: 10 },
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
  // 6000-6099 = Salaries and wages (matches createPayrollJournalEntries)
  'Salaries and wages': { start: 6000, end: 6099, increment: 10 },
  'Repairs': { start: 6100, end: 6149, increment: 10 },
  'Rent': { start: 6200, end: 6249, increment: 10 },
  'Taxes and Licenses': { start: 6250, end: 6399, increment: 10 },
  'Interest': { start: 6400, end: 6449, increment: 10 },
  'Depreciation expense': { start: 6450, end: 6499, increment: 10 },
  'Other deductions': { start: 6500, end: 6999, increment: 10 },

  // Credit Cards
  'Credit Cards': { start: 2050, end: 2099, increment: 10 },
};

// DEFAULT_CHART_OF_ACCOUNTS now lives in lib/account-catalog.ts as
// ACCOUNT_CATALOG. The re-export below is a backward-compatible alias:
// consumers that want "the list of accounts to consider creating" get the
// catalog. CatalogAccount has every field DefaultAccount has plus tier/group,
// so it's structurally assignable to DefaultAccount[]. The original
// automotive-shop industry-specific accounts (parts inventory, eBay
// accounts, vehicles) have been removed from this list; existing
// companies keep theirs. Industry packs are a future feature.
export { ACCOUNT_CATALOG as DEFAULT_CHART_OF_ACCOUNTS } from './account-catalog';

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
