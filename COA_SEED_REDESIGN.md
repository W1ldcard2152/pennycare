# Chart of Accounts Seed Redesign — Implementation Guide

## Goal

Replace the current single-list `seedChartOfAccounts()` with a tiered onboarding experience. The current seed dumps ~40 auto-shop–specific accounts into the database with one button click. The new system lets the user choose a starting tier (Basic, Business, or Business with Payroll), then optionally customize by adding or removing individual accounts, with dependency enforcement and a preview/confirmation step before anything is written.

Industry-specific account packs (automotive, restaurant, retail, etc.) are a future feature. For now, three tiers cover the range from personal/non-profit bookkeeping to a small business with employees. Users can always add custom accounts after setup.

---

## Constraints

1. **No changes to existing companies.** Companies that already have accounts seeded are unaffected. This only changes the experience for new companies seeding accounts for the first time.
2. **The seed endpoint remains idempotent.** If called on a company that already has accounts, it skips existing codes and only adds new ones.
3. **Existing account codes are sacred.** The code numbering (1000–6999) and the account codes used by payroll (2100–2180, 6000, 6010), eBay import (1050, 4000, 6200), CC import (1060, 2200–2220, 6300), and reconciliation (6900) must not change. Other features reference these codes directly.
4. **The `DEFAULT_CHART_OF_ACCOUNTS` array in `lib/bookkeeping.ts` is replaced** by a structured catalog, but the old function signature should still work for backward compatibility (tests, etc.).
5. **Reserved account code ranges** — certain code ranges are used by system features (payroll, imports) and must be blocked from manual account creation. See the Reserved Ranges section.

---

## Architecture

### Account Catalog Structure

Replace the flat `DEFAULT_CHART_OF_ACCOUNTS` array with a structured catalog where each account has a `tier` and optional `group` and `requires` fields:

```typescript
interface CatalogAccount {
  code: string;        // e.g., '1000'
  name: string;        // e.g., 'Checking Account'
  type: AccountType;   // 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'credit_card'
  subtype: string;     // e.g., 'bank_checking'
  description: string; // One-line explanation of what this account is for
  tier: 'basic' | 'business' | 'business_payroll';
  group?: string;      // Optional grouping for the UI, e.g., 'payroll', 'credit_cards'
  requires?: string[]; // Account codes that must also be included (dependency)
}
```

### Tier Definitions

**Basic** (~18 accounts) — Personal finance, household budgets, non-profits, or any organization doing simple bookkeeping. The essentials: a checking account, savings, a credit card, standard expense categories, and the equity accounts needed to keep the books balanced.

```
ASSETS
  1000  Checking Account              bank_checking        "Primary bank account"
  1010  Savings Account               bank_savings         "Savings or money market account"
  1020  Petty Cash                    other_current_asset  "Cash on hand for small purchases"

CREDIT CARDS
  2200  Credit Card                   credit_card          "Business or personal credit card"

EQUITY
  3000  Owner's Equity                owners_equity        "Owner's investment in the business/organization"
  3100  Owner's Draw                  owners_equity        "Owner's personal withdrawals"
  3200  Retained Earnings             retained_earnings    "Accumulated net income from prior years"
  3900  Opening Balance Equity        opening_balance_equity "Temporary balancing account for opening balances"

REVENUE
  4010  Sales Revenue                 income               "Income from sales of goods or services"
  4900  Other Income                  other_income         "Miscellaneous income (interest, gifts, etc.)"

EXPENSES
  6100  Rent                          expense              "Rent or lease payments"
  6110  Utilities                     expense              "Electric, gas, water, sewer"
  6120  Insurance                     expense              "Business or personal insurance premiums"
  6170  Office Supplies               expense              "Paper, ink, general office supplies"
  6180  Professional Fees             expense              "Accounting, legal, consulting fees"
  6190  Bank & Merchant Fees          expense              "Bank charges, payment processing fees"
  6230  Internet & Phone              expense              "Internet service, phone bills"
  6990  Miscellaneous Expense         expense              "Uncategorized expenses"
```

**Business** (~30 accounts) — Everything in Basic plus accounts for a real business: accounts receivable/payable, multiple expense categories, CC payment clearing, depreciation, and other accounts a business needs but a household doesn't. For sole proprietors, partnerships, or small businesses *without* employees on payroll.

Adds to Basic:

```
ASSETS
  1060  CC Payments Pending           other_current_asset  "Clearing account for credit card payments (bridges timing between CC and bank)"
  1100  Accounts Receivable           accounts_receivable  "Money owed to you by customers"
  1500  Tools & Equipment             fixed_asset          "Long-term business equipment"
  1520  Accumulated Depreciation      fixed_asset          "Total depreciation on fixed assets (contra-asset)"

LIABILITIES
  2000  Accounts Payable              accounts_payable     "Money you owe to vendors and suppliers"
  2190  Sales Tax Payable             other_current_liability "Sales tax collected but not yet remitted"

REVENUE
  4910  Cash Back Rewards             other_income         "Credit card cash back and reward redemptions"

COGS
  5000  Cost of Goods Sold            cost_of_goods_sold   "Direct cost of products sold"

EXPENSES
  6130  Supplies                      expense              "Business supplies and materials"
  6160  Advertising & Marketing       expense              "Ads, promotions, marketing costs"
  6210  Shipping & Postage            expense              "Shipping, postage, delivery costs"
  6220  Licenses & Permits            expense              "Business licenses, permits, registrations"
  6300  Credit Card Interest          expense              "Interest charges on credit card balances"
  6900  Reconciliation Discrepancies  expense              "Small differences found during bank reconciliation"
```

Group: `credit_cards` — accounts 1060, 2200, 6300. CC Payments Pending (1060) and CC Interest (6300) are required if any credit card account exists. Note: 2200 is in the Basic tier (a credit card is useful even for personal budgets), but 1060 and 6300 move up to Business because Basic users likely aren't doing formal CC reconciliation with clearing accounts.

**Business with Payroll** (~42 accounts) — Everything in Business plus the full payroll liability structure and wage expense accounts needed by the payroll module. For businesses with W-2 employees.

Adds to Business:

```
LIABILITIES
  2100  Net Pay Payable               other_current_liability "Employee net pay owed but not yet disbursed"
  2110  Federal Tax Payable           other_current_liability "Federal income tax withheld from employees"
  2120  State Tax Payable             other_current_liability "State/local income tax withheld from employees"
  2130  Social Security Payable       other_current_liability "Social Security tax (employee + employer portions)"
  2140  Medicare Payable              other_current_liability "Medicare tax (employee + employer portions)"
  2150  FUTA Payable                  other_current_liability "Federal unemployment tax (employer-paid)"
  2160  SUI Payable                   other_current_liability "State unemployment insurance (employer-paid)"
  2170  NY SDI Payable                other_current_liability "New York disability insurance (employee-paid)"
  2180  NY PFL Payable                other_current_liability "New York paid family leave (employee-paid)"

EXPENSES
  6000  Wages & Salaries              expense              "Gross pay to employees"
  6010  Payroll Tax Expense           expense              "Employer's share of payroll taxes (SS, Medicare, FUTA, SUI)"
```

Group: `payroll` — accounts 2100–2180, 6000, 6010. All required together. The payroll processing module creates journal entries that debit 6000/6010 and credit 2100–2180. If any are missing, the journal entry bridge fails.

### Reserved Account Code Ranges

Certain account code ranges are used by system features and **must be blocked from manual account creation**. When a user tries to create an account manually (via the "Add Account" form), the system must reject codes in these ranges with a clear error message.

```typescript
const RESERVED_RANGES: Array<{
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
```

**Where to enforce:**
- `POST /api/bookkeeping/accounts` (manual account creation) — check the submitted code against reserved ranges. If it falls in a reserved range, return 400 with the message.
- The "Add Account" form on the Chart of Accounts page — client-side validation showing the same message.
- `PATCH /api/bookkeeping/accounts/[id]` — if the user tries to change an account code *into* a reserved range, reject it.

**What's NOT blocked:**
- The seed endpoint (`POST /api/bookkeeping/accounts/seed`) — it creates reserved-range accounts as part of the payroll tier.
- The "Add Payroll Accounts" / "Add from Catalog" flow — it uses the seed endpoint internally.

For now only the 2100–2199 range is reserved. Other ranges used by features (1050 for eBay, 2200–2220 for CCs, etc.) are convention but not hard-coded dependencies in the same way — the eBay importer could theoretically work with any account code if configured. Payroll is different: the journal entry bridge looks up accounts by code directly, so those codes *must* be exactly right.

### Dependency Rules

Dependencies are expressed as: "if account X is included, accounts Y and Z must also be included."

```typescript
const ACCOUNT_DEPENDENCIES: Record<string, string[]> = {
  // Payroll group: if any payroll account is selected, all are required
  // (Every payroll account requires every other payroll account)
  '6000': ['6010', '2100', '2110', '2120', '2130', '2140', '2150', '2160', '2170', '2180'],
  '6010': ['6000', '2100', '2110', '2120', '2130', '2140', '2150', '2160', '2170', '2180'],
  '2100': ['6000', '6010', '2110', '2120', '2130', '2140', '2150', '2160', '2170', '2180'],
  '2110': ['6000', '6010', '2100', '2120', '2130', '2140', '2150', '2160', '2170', '2180'],
  '2120': ['6000', '6010', '2100', '2110', '2130', '2140', '2150', '2160', '2170', '2180'],
  '2130': ['6000', '6010', '2100', '2110', '2120', '2140', '2150', '2160', '2170', '2180'],
  '2140': ['6000', '6010', '2100', '2110', '2120', '2130', '2150', '2160', '2170', '2180'],
  '2150': ['6000', '6010', '2100', '2110', '2120', '2130', '2140', '2160', '2170', '2180'],
  '2160': ['6000', '6010', '2100', '2110', '2120', '2130', '2140', '2150', '2170', '2180'],
  '2170': ['6000', '6010', '2100', '2110', '2120', '2130', '2140', '2150', '2160', '2180'],
  '2180': ['6000', '6010', '2100', '2110', '2120', '2130', '2140', '2150', '2160', '2170'],

  // Credit card group: any CC account requires the clearing account and interest expense
  '2200': ['1060', '6300'],
  '2210': ['1060', '6300'],
  '2220': ['1060', '6300'],
  '1060': [],  // Clearing account doesn't require a specific CC, but CCs require it
  '6300': [],  // Interest doesn't require a specific CC
};
```

The dependency resolver takes a set of selected account codes and returns the full set including all dependencies, plus a list of what was auto-added and why:

```typescript
interface DependencyResult {
  selectedCodes: string[];       // What the user explicitly selected
  requiredCodes: string[];       // What was auto-added by dependencies
  allCodes: string[];            // Union of both
  explanations: Array<{          // Why each auto-add happened
    code: string;
    name: string;
    reason: string;              // e.g., "Required by Wages & Salaries (6000) — payroll accounts work as a group"
  }>;
}

function resolveDependencies(selectedCodes: string[], catalog: CatalogAccount[]): DependencyResult
```

---

## API Changes

### Modify: `POST /api/bookkeeping/accounts/seed`

Currently accepts no body and seeds the full default list. Change to accept an optional body:

```typescript
// New request body (optional — omitting it seeds Basic tier for backward compatibility)
{
  tier?: 'basic' | 'business' | 'business_payroll';  // Starting tier
  additionalCodes?: string[];                          // Extra accounts from the catalog
}
```

The endpoint:
1. Determines the full account set: all accounts at or below the selected tier, plus any `additionalCodes`, plus all dependency-resolved accounts
2. Filters out any codes that already exist for this company
3. Creates the remaining accounts
4. Returns: `{ created: number, skipped: number, accounts: Array<{ code, name, type }> }`

If no body is provided (backward compat), default to `tier: 'basic'`.

### Modify: `POST /api/bookkeeping/accounts` (manual account creation)

Add reserved range validation. Before creating the account, check:

```typescript
function isReservedCode(code: string): { reserved: boolean; message?: string } {
  for (const range of RESERVED_RANGES) {
    if (code >= range.start && code <= range.end) {
      return { reserved: true, message: range.message };
    }
  }
  return { reserved: false };
}
```

If reserved, return 400: `{ error: range.message }`.

### Modify: `PATCH /api/bookkeeping/accounts/[id]`

Same reserved range check if the code is being changed.

### New: `GET /api/bookkeeping/accounts/catalog`

Returns the full account catalog for the UI. Requires company access.

```typescript
// Response
{
  tiers: {
    basic: {
      name: 'Basic',
      description: 'Checking, savings, a credit card, and standard expense categories. Great for personal finance, household budgets, or simple organizations.',
      accountCount: number,
    },
    business: {
      name: 'Business',
      description: 'Everything in Basic plus accounts receivable/payable, depreciation, cost of goods sold, and additional expense categories. For businesses without employees on payroll.',
      accountCount: number,
    },
    business_payroll: {
      name: 'Business with Payroll',
      description: 'Everything in Business plus payroll tax liabilities and wage expense accounts. Required for processing employee payroll.',
      accountCount: number,
    },
  },
  accounts: CatalogAccount[],
  groups: {
    [groupName: string]: {
      name: string,
      description: string,
      codes: string[],
    }
  },
  dependencies: Record<string, string[]>,
  reservedRanges: Array<{ start: string; end: string; feature: string; message: string }>,
}
```

---

## UI Changes

### Modify: Chart of Accounts Page (`app/bookkeeping/accounts/page.tsx`)

The current page shows a "Load Default Accounts" button when no accounts exist. Replace that button and its handler with the new onboarding flow.

**Detection**: If the company has zero accounts (or only system-generated accounts), show the onboarding flow instead of the empty account list.

**Post-setup**: Once accounts exist, show the normal Chart of Accounts list. Add two new buttons:
- **"Add from Catalog"** — opens the Step 2 customization UI, filtered to show only accounts not yet in the company. For users who started with Basic and later want to add Business accounts.
- **"Add Payroll Accounts"** — shown only if the payroll group is not already present. Shortcut that adds the full payroll group with one click (with confirmation). This is the primary path for a user who started without payroll and later hires an employee.

### Onboarding Flow (3 Steps)

**Step 1: Choose Your Starting Point**

Three cards, one per tier. Each shows:
- Tier name and one-line description
- Number of accounts included
- Key highlights as a short list (e.g., Basic: "Checking & savings, Credit card, Standard expense categories, Revenue tracking"; Business: "Everything in Basic, plus: Accounts receivable & payable, Fixed assets & depreciation, Cost of goods sold")
- A "Select" button

The cards should visually communicate nesting — Business clearly includes Basic, Business with Payroll clearly includes Business. Use additive language: "Includes all Basic accounts plus..." and "Includes all Business accounts plus..."

**Step 2: Customize (Optional)**

After selecting a tier, show the full account catalog grouped by account type (Assets, Credit Cards, Liabilities, Equity, Revenue, COGS, Expenses). Each account shows:
- Checkbox (checked if included by the selected tier, unchecked if from a different tier)
- Account code and name
- One-line description (the `description` field from the catalog)
- Tier badge (Basic / Business / Payroll) — small, unobtrusive, helps the user understand where each account comes from

Accounts included by the selected tier are pre-checked. Accounts from other tiers are unchecked and can be added individually.

**Dependency behavior:**
- When the user checks an account that has dependencies, auto-check the dependencies and show a brief inline note below the checkbox group: "Also adding: [list of auto-added accounts] — these accounts work together for [feature name]"
- When the user unchecks an account that other selected accounts depend on, show a warning: "Removing this will also remove: [list]. These accounts work as a group." Confirm or cancel.
- The payroll group should have a group-level header with a single toggle that checks/unchecks all 11 payroll accounts at once. Same for credit card group.

A "Continue with defaults" link/button for users who don't want to customize — skips directly to Step 3.

**Step 3: Preview & Confirm**

Show the final list of accounts to be created, grouped by type, in a clean read-only table:
- Account Code | Account Name | Type | Description

At the top: "This will create **X accounts** in your chart of accounts."

Below the table: "You can add, rename, or deactivate accounts at any time after setup."

Two buttons:
- "Create Accounts" (primary) — calls the seed endpoint, shows loading state
- "Go Back" (secondary) — returns to Step 2

After creation: success message with count, then transition to the normal Chart of Accounts list view.

### Manual Account Creation — Reserved Range Validation

In the "Add Account" form, add client-side validation on the account code field. When the user types or blurs a code that falls in a reserved range, show an inline error message: "Codes 2100–2199 are reserved for payroll accounts. Use 'Add Payroll Accounts' to add these."

---

## Library Changes

### Modify: `lib/bookkeeping.ts`

1. **Replace `DEFAULT_CHART_OF_ACCOUNTS`** with the new `ACCOUNT_CATALOG` array using the `CatalogAccount` interface. Keep the old constant name as a backward-compatible alias:

```typescript
// Backward compatibility — some tests/code may reference this
export const DEFAULT_CHART_OF_ACCOUNTS = ACCOUNT_CATALOG.filter(
  a => ['basic', 'business', 'business_payroll'].includes(a.tier)
);
```

2. **Update `seedChartOfAccounts()`** to accept an optional config:

```typescript
interface SeedConfig {
  tier?: 'basic' | 'business' | 'business_payroll';
  additionalCodes?: string[];
}

async function seedChartOfAccounts(companyId: string, config?: SeedConfig): Promise<{
  created: number;
  skipped: number;
  accounts: Array<{ code: string; name: string; type: string }>;
}>
```

If no config is provided, default to `{ tier: 'basic' }`.

The function:
1. Gets catalog accounts where tier is at or below the selected tier (basic < business < business_payroll)
2. Adds any `additionalCodes` from the catalog
3. Resolves dependencies
4. Queries existing accounts for this company
5. Filters to only new codes
6. Creates them in a transaction
7. Returns results

3. **Add `resolveDependencies()`** function as described in the Dependency Rules section.

4. **Add `ACCOUNT_DEPENDENCIES`** constant as described above.

5. **Add `ACCOUNT_GROUPS`** constant:

```typescript
export const ACCOUNT_GROUPS: Record<string, { name: string; description: string; codes: string[] }> = {
  payroll: {
    name: 'Payroll & Tax Liabilities',
    description: 'Wage expense accounts and tax liability accounts. Required for the payroll module to process employee pay and create journal entries.',
    codes: ['6000', '6010', '2100', '2110', '2120', '2130', '2140', '2150', '2160', '2170', '2180'],
  },
  credit_cards: {
    name: 'Credit Cards',
    description: 'Credit card accounts with payment clearing and interest tracking. The clearing account (1060) bridges the timing gap between paying a CC bill and the withdrawal appearing on your bank statement.',
    codes: ['1060', '2200', '6300'],
  },
};
```

6. **Add `RESERVED_RANGES`** constant and `isReservedCode()` utility:

```typescript
export const RESERVED_RANGES = [
  {
    start: '2100',
    end: '2199',
    feature: 'payroll',
    message: 'Codes 2100–2199 are reserved for payroll tax liability accounts. Use "Add Payroll Accounts" to add these.',
  },
];

export function isReservedCode(code: string): { reserved: boolean; message?: string } {
  for (const range of RESERVED_RANGES) {
    if (code >= range.start && code <= range.end) {
      return { reserved: true, message: range.message };
    }
  }
  return { reserved: false };
}
```

---

## Validation Changes

### Modify: `lib/validation.ts`

Add a schema for the seed request:

```typescript
export const seedAccountsSchema = z.object({
  tier: z.enum(['basic', 'business', 'business_payroll']).default('basic'),
  additionalCodes: z.array(z.string()).optional().default([]),
});
```

---

## What NOT to Change

- **Account model in schema.prisma** — no changes needed
- **Any existing API routes** that reference account codes (payroll, eBay import, CC import, reconciliation, tax deposits)
- **Any existing accounts** in companies that have already seeded
- **The payroll bridge** (`createPayrollJournalEntries`) — it looks up accounts by code at runtime
- **Report generators** — they query accounts by type, not by a hardcoded list

---

## Edge Cases to Handle

1. **Company already has some accounts**: The seed should skip existing codes. The UI should still allow the onboarding flow but note "X accounts already exist and will be skipped."

2. **User unchecks a Basic account**: Let them — accounts like Checking or Retained Earnings are strongly recommended but not system-enforced. Dependency enforcement is only for functional groups (Payroll, CC) where features break without the full set.

3. **Future tiers/packs**: The system should be extensible. Adding an "Automotive" or "Restaurant" industry pack later should be straightforward — add accounts to the catalog with a new tier or group value. The UI should render tiers dynamically from whatever the catalog contains, not hardcode exactly three cards.

4. **Re-seeding / Add from Catalog**: After initial setup, the user should be able to add accounts they skipped. The "Add from Catalog" button reuses the Step 2 UI, filtered to show only accounts not yet in the company.

5. **Add Payroll Later**: A user who started with Basic or Business and later needs payroll should have a clear path. The "Add Payroll Accounts" button on the Chart of Accounts page adds the full payroll group (11 accounts) with a confirmation step. This is the only way to create accounts in the 2100–2199 reserved range.

6. **Credit card dependencies across tiers**: The credit card account (2200) is in Basic, but its dependencies (1060 CC Payments Pending, 6300 Credit Card Interest) are in Business. This is intentional — a Basic user has a credit card for tracking charges but doesn't need the clearing account workflow. When a Basic user later upgrades to Business (via Add from Catalog), the dependencies get added. The dependency resolver should NOT auto-add Business-tier accounts when seeding Basic — it only enforces within the selected set.

---

## Build Order

1. Define `ACCOUNT_CATALOG` with all accounts and their tier/group assignments in `lib/bookkeeping.ts`
2. Define `ACCOUNT_DEPENDENCIES`, `ACCOUNT_GROUPS`, `RESERVED_RANGES` in `lib/bookkeeping.ts`
3. Implement `resolveDependencies()` and `isReservedCode()` in `lib/bookkeeping.ts`
4. Update `seedChartOfAccounts()` to accept config
5. Add `seedAccountsSchema` to `lib/validation.ts`
6. Update `POST /api/bookkeeping/accounts/seed` to accept the new body
7. Add reserved range validation to `POST /api/bookkeeping/accounts` and `PATCH /api/bookkeeping/accounts/[id]`
8. Create `GET /api/bookkeeping/accounts/catalog`
9. Build the onboarding UI (Steps 1–3) on the Chart of Accounts page
10. Add "Add from Catalog" and "Add Payroll Accounts" buttons for post-setup
11. Test: fresh company → select Basic → verify ~18 accounts created, credit card included, no payroll accounts
12. Test: fresh company → select Business → verify ~30 accounts, no payroll
13. Test: fresh company → select Business with Payroll → verify ~42 accounts, full payroll set
14. Test: Basic company → Add Payroll Accounts → verify all 11 payroll accounts added
15. Test: manually create account with code 2150 → verify rejected with reserved range message
16. Test: company with existing accounts → verify skip behavior
17. Run full test suite to confirm nothing broke

---

## CLAUDE.md Addition

```markdown
### Chart of Accounts Onboarding

New companies seed their chart of accounts through a tiered onboarding flow rather than a single "Load Default Accounts" button.

**Tiers:**
- `basic` (~18 accounts) — Checking, savings, credit card, standard expenses. For personal finance, non-profits, or simple organizations.
- `business` (~30 accounts) — Basic + AR/AP, fixed assets, depreciation, COGS, additional expense categories. For businesses without employees.
- `business_payroll` (~42 accounts) — Business + full payroll liability structure (2100–2180) and wage expense accounts (6000, 6010). Required for payroll processing.

**Account groups** (functional units with dependency enforcement):
- `payroll` — 6000, 6010, 2100–2180 (all required together for payroll processing)
- `credit_cards` — 1060, 2200, 6300 (clearing account and interest required with any CC)

**Reserved account code ranges:**
- 2100–2199: Reserved for payroll. Blocked from manual creation. Added only via seed or "Add Payroll Accounts."

**Key files:**
- `lib/bookkeeping.ts` — `ACCOUNT_CATALOG`, `ACCOUNT_GROUPS`, `ACCOUNT_DEPENDENCIES`, `RESERVED_RANGES`, `resolveDependencies()`, `isReservedCode()`, `seedChartOfAccounts(config?)`
- `GET /api/bookkeeping/accounts/catalog` — returns full catalog for UI
- `POST /api/bookkeeping/accounts/seed` — accepts `{ tier, additionalCodes? }` body

The catalog is the single source of truth for default accounts. Adding a new industry tier means adding accounts with the new tier value — the UI renders dynamically.
```
