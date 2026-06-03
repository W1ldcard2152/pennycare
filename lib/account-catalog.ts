// Chart of Accounts catalog — the source of truth for tiered seeding.
//
// Three tiers are layered: basic ⊂ business ⊂ business_payroll. Seeding a tier
// includes that tier's accounts plus every lower-tier account. Functional
// groups (`payroll`, `credit_cards`) layer dependency rules on top so a UI
// can warn / auto-add when a user picks one account that requires others.
//
// This file holds only the data + pure helpers. The DB-touching helpers
// (seed, resolveDependencies inside the seed flow) live in lib/bookkeeping.ts.

import type { AccountType } from './default-chart-of-accounts';

export type Tier = 'basic' | 'business' | 'business_payroll';

export interface CatalogAccount {
  code: string;
  name: string;
  type: AccountType;
  accountGroup: string;       // Must be one of ACCOUNT_GROUPS[type] in default-chart-of-accounts.ts
  description: string;
  taxLine?: string;           // IRS tax-line mapping for Schedule C / Form 1120 etc.
  tier: Tier;
  group?: 'payroll' | 'credit_cards'; // Functional group for UI nesting / dependency hints
}

export const TIER_ORDER: Tier[] = ['basic', 'business', 'business_payroll'];

export const TIER_INFO: Record<Tier, {
  name: string;
  description: string;
  highlights: string[];
}> = {
  basic: {
    name: 'Basic',
    description: 'Checking, savings, a credit card, and standard expense categories. Great for personal finance, household budgets, or simple organizations.',
    highlights: [
      'Checking & savings',
      'Credit card',
      'Standard expense categories',
      'Revenue tracking',
    ],
  },
  business: {
    name: 'Business',
    description: 'Everything in Basic plus accounts receivable/payable, depreciation, cost of goods sold, and additional expense categories. For businesses without employees on payroll.',
    highlights: [
      'Everything in Basic',
      'Accounts receivable & payable',
      'Fixed assets & depreciation',
      'Cost of goods sold',
    ],
  },
  business_payroll: {
    name: 'Business with Payroll',
    description: 'Everything in Business plus payroll tax liabilities and wage expense accounts. Required for processing employee payroll.',
    highlights: [
      'Everything in Business',
      'Full payroll tax liabilities',
      'Wage expense accounts',
      'Required for payroll processing',
    ],
  },
};

// Catalog codes chosen to align with the existing chart conventions
// (GROUP_CODE_RANGES in lib/default-chart-of-accounts.ts) so that a freshly
// seeded company and a long-running company land on the same codes for the
// same logical accounts — keeping any future code-by-number lookups working
// for both. Industry-specific accounts (auto-parts inventory, eBay
// integration, work vehicles, etc.) are intentionally not in this catalog;
// industry packs are a future feature.
export const ACCOUNT_CATALOG: CatalogAccount[] = [
  // ============================================================
  // BASIC TIER (~18 accounts)
  // ============================================================

  // Assets — Cash
  { code: '1010', name: 'Checking Account', type: 'asset', accountGroup: 'Cash', taxLine: 'B/S-Assets: Cash', description: 'Primary bank account', tier: 'basic' },
  { code: '1030', name: 'Savings Account', type: 'asset', accountGroup: 'Cash', taxLine: 'B/S-Assets: Cash', description: 'Savings or money market account', tier: 'basic' },
  { code: '1040', name: 'Petty Cash', type: 'asset', accountGroup: 'Cash', taxLine: 'B/S-Assets: Cash', description: 'Cash on hand for small purchases', tier: 'basic' },

  // Credit Cards (1 generic CC; the clearing account and interest live in Business)
  { code: '2050', name: 'Credit Card', type: 'credit_card', accountGroup: 'Credit Cards', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'Business or personal credit card', tier: 'basic', group: 'credit_cards' },

  // Equity
  { code: '3000', name: "Owner's Equity", type: 'equity', accountGroup: 'Equity', taxLine: "B/S-Liabs/Eq: Add'l paid-in capital", description: "Owner's investment in the business or organization", tier: 'basic' },
  { code: '3100', name: "Owner's Draw", type: 'equity', accountGroup: 'Equity', taxLine: 'B/S-Liabs/Eq: Shareholder distributions', description: "Owner's personal withdrawals", tier: 'basic' },
  { code: '3020', name: 'Retained Earnings', type: 'equity', accountGroup: 'Equity', taxLine: 'B/S-Liabs/Eq: Retained earnings', description: 'Accumulated net income from prior years', tier: 'basic' },
  { code: '3900', name: 'Opening Balance Equity', type: 'equity', accountGroup: 'Equity', taxLine: 'B/S-Liabs/Eq: Capital stock', description: 'Temporary balancing account for opening balances', tier: 'basic' },

  // Revenue
  { code: '4010', name: 'Sales Revenue', type: 'revenue', accountGroup: 'Revenues', taxLine: 'Gross receipts or sales', description: 'Income from sales of goods or services', tier: 'basic' },
  { code: '4500', name: 'Other Income', type: 'revenue', accountGroup: 'Other Income', taxLine: 'Other income', description: 'Miscellaneous income (interest, gifts, etc.)', tier: 'basic' },

  // Expenses
  { code: '6200', name: 'Rent', type: 'expense', accountGroup: 'Rent', taxLine: 'Rents', description: 'Rent or lease payments', tier: 'basic' },
  { code: '6780', name: 'Utilities', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Utilities', description: 'Electric, gas, water, sewer', tier: 'basic' },
  { code: '6610', name: 'Insurance', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Insurance', description: 'Business or personal insurance premiums', tier: 'basic' },
  { code: '6630', name: 'Office Supplies', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Office expense', description: 'Paper, ink, general office supplies', tier: 'basic' },
  { code: '6650', name: 'Professional Fees', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions', description: 'Accounting, legal, consulting fees', tier: 'basic' },
  { code: '6530', name: 'Bank & Merchant Fees', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions', description: 'Bank charges, payment processing fees', tier: 'basic' },
  { code: '6770', name: 'Internet & Phone', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Utilities', description: 'Internet service, phone bills', tier: 'basic' },
  { code: '6740', name: 'Miscellaneous Expense', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions', description: 'Uncategorized expenses', tier: 'basic' },

  // ============================================================
  // BUSINESS TIER (adds ~14 accounts)
  // ============================================================

  // Assets — Current Assets
  { code: '1100', name: 'Accounts Receivable', type: 'asset', accountGroup: 'Current Assets', taxLine: 'B/S-Assets: Other current assets', description: 'Money owed to you by customers', tier: 'business' },
  { code: '1130', name: 'CC Payments Pending', type: 'asset', accountGroup: 'Current Assets', taxLine: 'B/S-Assets: Other current assets', description: 'Clearing account for credit card payments (bridges timing between CC and bank)', tier: 'business', group: 'credit_cards' },

  // Assets — Depreciable
  { code: '1500', name: 'Tools & Equipment', type: 'asset', accountGroup: 'Buildings and other depreciable assets', taxLine: 'B/S-Assets: Buildings/oth. depr. assets', description: 'Long-term business equipment', tier: 'business' },
  { code: '1600', name: 'Accumulated Depreciation', type: 'asset', accountGroup: 'Less accumulated depreciation', taxLine: 'B/S-Assets: Less accum. depreciation', description: 'Total depreciation on fixed assets (contra-asset)', tier: 'business' },

  // Liabilities
  { code: '2400', name: 'Accounts Payable', type: 'liability', accountGroup: 'Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'Money you owe to vendors and suppliers', tier: 'business' },
  { code: '2200', name: 'Sales Tax Payable', type: 'liability', accountGroup: 'Other Current Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'Sales tax collected but not yet remitted', tier: 'business' },

  // Revenue
  { code: '4510', name: 'Cash Back Rewards', type: 'revenue', accountGroup: 'Other Income', taxLine: 'Other income', description: 'Credit card cash back and reward redemptions', tier: 'business' },

  // COGS
  { code: '5000', name: 'Cost of Goods Sold', type: 'expense', accountGroup: 'Cost of Goods Sold', taxLine: 'COGS: Other costs', description: 'Direct cost of products sold', tier: 'business' },

  // Expenses
  { code: '6705', name: 'Supplies', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Sch C: Supplies', description: 'Business supplies and materials', tier: 'business' },
  { code: '6580', name: 'Advertising & Marketing', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions', description: 'Ads, promotions, marketing costs', tier: 'business' },
  { code: '6670', name: 'Shipping & Postage', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions', description: 'Shipping, postage, delivery costs', tier: 'business' },
  { code: '6250', name: 'Licenses & Permits', type: 'expense', accountGroup: 'Taxes and Licenses', taxLine: 'Taxes and licenses', description: 'Business licenses, permits, registrations', tier: 'business' },
  { code: '6550', name: 'Credit Card Interest', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions', description: 'Interest charges on credit card balances', tier: 'business', group: 'credit_cards' },
  { code: '6810', name: 'Reconciliation Discrepancies', type: 'expense', accountGroup: 'Other deductions', taxLine: 'Other deductions', description: 'Small differences found during bank reconciliation', tier: 'business' },

  // ============================================================
  // BUSINESS WITH PAYROLL TIER (adds 11 accounts)
  // ============================================================
  // Codes 2100–2180, 6000, 6010 are hardcoded into the payroll → journal
  // entry bridge (createPayrollJournalEntries in lib/bookkeeping.ts). Do
  // not change these codes.

  // Liabilities — Payroll
  { code: '2100', name: 'Net Pay Payable', type: 'liability', accountGroup: 'Payroll Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'Employee net pay owed but not yet disbursed', tier: 'business_payroll', group: 'payroll' },
  { code: '2110', name: 'Federal Tax Payable', type: 'liability', accountGroup: 'Payroll Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'Federal income tax withheld from employees', tier: 'business_payroll', group: 'payroll' },
  { code: '2120', name: 'State Tax Payable', type: 'liability', accountGroup: 'Payroll Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'State/local income tax withheld from employees', tier: 'business_payroll', group: 'payroll' },
  { code: '2130', name: 'Social Security Payable', type: 'liability', accountGroup: 'Payroll Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'Social Security tax (employee + employer portions)', tier: 'business_payroll', group: 'payroll' },
  { code: '2140', name: 'Medicare Payable', type: 'liability', accountGroup: 'Payroll Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'Medicare tax (employee + employer portions)', tier: 'business_payroll', group: 'payroll' },
  { code: '2150', name: 'FUTA Payable', type: 'liability', accountGroup: 'Payroll Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'Federal unemployment tax (employer-paid)', tier: 'business_payroll', group: 'payroll' },
  { code: '2160', name: 'SUI Payable', type: 'liability', accountGroup: 'Payroll Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'State unemployment insurance (employer-paid)', tier: 'business_payroll', group: 'payroll' },
  { code: '2170', name: 'NY SDI Payable', type: 'liability', accountGroup: 'Payroll Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'New York disability insurance (employee-paid)', tier: 'business_payroll', group: 'payroll' },
  { code: '2180', name: 'NY PFL Payable', type: 'liability', accountGroup: 'Payroll Liabilities', taxLine: 'B/S-Liabs/Eq: Other current liabilities', description: 'New York paid family leave (employee-paid)', tier: 'business_payroll', group: 'payroll' },

  // Expenses — Salaries and wages
  { code: '6000', name: 'Wages & Salaries', type: 'expense', accountGroup: 'Salaries and wages', taxLine: 'Sch C: Wages paid', description: 'Gross pay to employees', tier: 'business_payroll', group: 'payroll' },
  { code: '6010', name: 'Payroll Tax Expense', type: 'expense', accountGroup: 'Salaries and wages', taxLine: 'Taxes and licenses', description: "Employer's share of payroll taxes (SS, Medicare, FUTA, SUI)", tier: 'business_payroll', group: 'payroll' },
];

// Functional groups expose related accounts for the onboarding UI and for
// dependency enforcement. Renamed from ACCOUNT_GROUPS to avoid colliding
// with the existing ACCOUNT_GROUPS in lib/default-chart-of-accounts.ts,
// which maps account-type → list of taxonomy group names and is consumed
// by the Add Account form.
export const CATALOG_GROUPS: Record<string, {
  name: string;
  description: string;
  codes: string[];
}> = {
  payroll: {
    name: 'Payroll & Tax Liabilities',
    description: 'Wage expense accounts and tax liability accounts. Required for the payroll module to process employee pay and create journal entries.',
    codes: ['6000', '6010', '2100', '2110', '2120', '2130', '2140', '2150', '2160', '2170', '2180'],
  },
  credit_cards: {
    name: 'Credit Cards',
    description: 'Credit card accounts with payment clearing and interest tracking. The clearing account (1130) bridges the timing gap between paying a CC bill and the withdrawal appearing on your bank statement.',
    codes: ['1130', '2050', '6550'],
  },
};

// Account dependencies: "if you pick code X, you also need codes [...]".
// Asymmetric is fine — picking a CC implies you need the clearing account
// and interest expense, but picking the clearing account alone is OK.
//
// Payroll dependencies are symmetric because the bridge writes all of
// 2100–2180 + 6000 + 6010 in a single journal entry; missing any one
// breaks the entry.
const PAYROLL_CODES = ['6000', '6010', '2100', '2110', '2120', '2130', '2140', '2150', '2160', '2170', '2180'];

export const ACCOUNT_DEPENDENCIES: Record<string, string[]> = {
  // Payroll: every payroll account requires every other payroll account
  ...Object.fromEntries(PAYROLL_CODES.map((code) => [code, PAYROLL_CODES.filter((c) => c !== code)])),

  // Credit cards: a CC account requires the clearing account and interest expense
  '2050': ['1130', '6550'],
  // The clearing account and interest expense don't require a specific CC
  // (intentionally absent from this map)
};

// Reserved account-code ranges — manual account creation rejects any code
// that falls inside these. The seed endpoint and "Add Payroll Accounts"
// flow bypass this check because they create accounts on the user's
// behalf (via the catalog) and we know the codes are safe.
export const RESERVED_RANGES: Array<{
  start: string;
  end: string;
  feature: string;
  message: string;
}> = [
  {
    start: '2100',
    end: '2199',
    feature: 'payroll',
    message: 'Codes 2100–2199 are reserved for payroll tax liability accounts. Use "Add Payroll Accounts" to add these.',
  },
];

export function isReservedCode(code: string): { reserved: boolean; message?: string } {
  for (const range of RESERVED_RANGES) {
    // String compare works because all codes are zero-padded 4-digit numerics
    if (code >= range.start && code <= range.end) {
      return { reserved: true, message: range.message };
    }
  }
  return { reserved: false };
}

// "All accounts at or below this tier" — basic ⊂ business ⊂ business_payroll
export function getAccountsForTier(tier: Tier): CatalogAccount[] {
  const tierIndex = TIER_ORDER.indexOf(tier);
  return ACCOUNT_CATALOG.filter((a) => TIER_ORDER.indexOf(a.tier) <= tierIndex);
}

export function getCatalogAccount(code: string): CatalogAccount | undefined {
  return ACCOUNT_CATALOG.find((a) => a.code === code);
}

export interface DependencyResolution {
  selectedCodes: string[];   // What the user explicitly picked
  requiredCodes: string[];   // What was pulled in via dependencies
  allCodes: string[];        // Union of both, in catalog order
  explanations: Array<{
    code: string;
    name: string;
    reason: string;
  }>;
}

// Walks the dependency graph from the seed set, returning the full
// transitive closure plus a per-account explanation of why each
// auto-added account is there. Idempotent and order-independent.
export function resolveDependencies(selectedCodes: string[]): DependencyResolution {
  const selected = new Set(selectedCodes);
  const required = new Set<string>();
  const explanationsByCode = new Map<string, { code: string; name: string; reason: string }>();

  // Track which selected account triggered each requirement, for explanations
  const queue: Array<{ code: string; triggeredBy: string | null }> = selectedCodes.map((c) => ({ code: c, triggeredBy: null }));

  while (queue.length > 0) {
    const { code, triggeredBy } = queue.shift()!;
    const deps = ACCOUNT_DEPENDENCIES[code] || [];
    for (const dep of deps) {
      if (selected.has(dep) || required.has(dep)) continue;
      required.add(dep);

      const depAccount = getCatalogAccount(dep);
      if (depAccount) {
        const trigger = triggeredBy ? getCatalogAccount(triggeredBy) : getCatalogAccount(code);
        const triggerName = trigger ? `${trigger.name} (${trigger.code})` : code;
        const groupLabel = depAccount.group ? ` — ${depAccount.group === 'payroll' ? 'payroll accounts work as a group' : 'credit card accounts work as a group'}` : '';
        explanationsByCode.set(dep, {
          code: dep,
          name: depAccount.name,
          reason: `Required by ${triggerName}${groupLabel}`,
        });
      }

      queue.push({ code: dep, triggeredBy: code });
    }
  }

  const all = new Set([...selected, ...required]);
  // Sort by catalog order to keep output stable
  const allCodes = ACCOUNT_CATALOG.filter((a) => all.has(a.code)).map((a) => a.code);

  return {
    selectedCodes: selectedCodes.filter((c) => selected.has(c)),
    requiredCodes: ACCOUNT_CATALOG.filter((a) => required.has(a.code)).map((a) => a.code),
    allCodes,
    explanations: Array.from(explanationsByCode.values()),
  };
}
