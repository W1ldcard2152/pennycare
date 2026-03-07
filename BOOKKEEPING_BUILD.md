# PennyCare Bookkeeping Module — Implementation Guide

## Project Overview

PennyCare is a business management app for Phoenix Automotive LLC, an auto repair and dismantling business. The payroll module is fully built. This document describes the **bookkeeping/accounting module** to be added.

**Accounting method**: Cash basis  
**Tech stack**: Next.js 16, TypeScript, Tailwind CSS, Prisma ORM, SQLite, Zod validation  
**Key principle**: Payroll runs automatically generate journal entries in the bookkeeping system

---

## Current State of the Codebase

### What Already Exists (DO NOT recreate or overwrite)
- Full payroll system: employees, time tracking, payroll processing, tax calculations, tax forms, reports
- Authentication: JWT-based session in cookies, `getSession()` in `lib/auth.ts`
- Authorization: `requireCompanyAccess(role?)` in `lib/api-utils.ts` — returns `{ error, companyId, session, role }`
- Validation: Zod schemas + `validateRequest()` helper in `lib/validation.ts`
- Audit logging: `logAudit()` in `lib/audit.ts`
- Prisma schema already has stub models: `Account`, `Transaction`, `Vendor`, `Expense` (these exist but have NO API routes or UI yet)
- UI pattern: Client components with `'use client'`, fetch from `/api/*`, Tailwind styling, blue-themed buttons, tables with `bg-white rounded-lg shadow`

### Schema Changes Already Made
The following changes have **already been applied** to `prisma/schema.prisma`:

1. **Company model** — added `nextJournalEntryNumber Int @default(1)` field and `journalEntries JournalEntry[]` relation
2. **Account model** — added `journalEntryLines JournalEntryLine[]` relation  
3. **JournalEntry model** — new model added at end of schema
4. **JournalEntryLine model** — new model added at end of schema

**You need to run `npx prisma db push` to apply these schema changes to the database.**

The comment on `nextJournalEntryNumber` incorrectly says "employee numbers" — fix it to say "journal entry numbers" when you encounter it.

### Files Already Created
These files have already been created and should be **reviewed and kept** (fix any issues you find):

- `lib/bookkeeping.ts` — Core bookkeeping library (687 lines). Contains:
  - `DEFAULT_CHART_OF_ACCOUNTS` — 40+ accounts for auto repair business
  - `seedChartOfAccounts()` — Idempotent seeder
  - `validateJournalEntry()` — Validates debits = credits
  - `createJournalEntry()` — Creates entry + lines in transaction, auto-increments entry number
  - `createPayrollJournalEntries()` — The payroll bridge (see below)
  - `getAccountBalances()` — Core balance calculator for reports
  - `generateProfitAndLoss()`, `generateBalanceSheet()`, `generateTrialBalance()`, `generateGeneralLedger()`
  - `isDebitNormal()` utility

- `lib/validation.ts` — Has been updated with bookkeeping schemas:
  - `createAccountSchema`, `updateAccountSchema`
  - `createJournalEntrySchema` (with nested line schema)
  - `createVendorSchema`, `createExpenseSchema`

### Files That Were Partially Created (need completion or recreation)
The following API routes were created but the **UI pages were NOT completed**. Review the API routes for correctness, then build all UI pages from scratch:

- `app/api/bookkeeping/accounts/route.ts` — GET (list), POST (create)
- `app/api/bookkeeping/accounts/[id]/route.ts` — GET, PATCH, DELETE (with transaction protection)
- `app/api/bookkeeping/accounts/seed/route.ts` — POST (seeds default chart of accounts)
- `app/api/bookkeeping/journal-entries/route.ts` — GET (list with filters), POST (create)
- `app/api/bookkeeping/journal-entries/[id]/route.ts` — GET
- `app/api/bookkeeping/journal-entries/[id]/void/route.ts` — POST
- `app/api/bookkeeping/vendors/route.ts` — GET, POST
- `app/api/bookkeeping/vendors/[id]/route.ts` — GET, PATCH, DELETE (deactivate if has expenses)
- `app/api/bookkeeping/expenses/route.ts` — GET (with filters), POST (optionally creates journal entry)
- `app/api/bookkeeping/expenses/[id]/route.ts` — GET, DELETE
- `app/api/bookkeeping/reports/profit-loss/route.ts` — GET
- `app/api/bookkeeping/reports/balance-sheet/route.ts` — GET
- `app/api/bookkeeping/reports/trial-balance/route.ts` — GET
- `app/api/bookkeeping/reports/general-ledger/route.ts` — GET

---

## What Needs To Be Built

### Phase 1: Database & Foundation
1. Run `npx prisma db push` to apply schema changes
2. Fix the comment on `nextJournalEntryNumber` in schema.prisma
3. Review and test all existing API routes for correctness
4. Review `lib/bookkeeping.ts` for any bugs

### Phase 2: Payroll → Journal Entry Bridge Integration
This is the critical integration. When payroll is processed, journal entries must be automatically created.

**Modify `app/api/payroll/process/route.ts`:**

After the `for` loop that processes each employee (around line 327, after `processedRecords.push(...)`), add a call to `createPayrollJournalEntries()`:

```typescript
import { createPayrollJournalEntries } from '@/lib/bookkeeping';

// ... at the end, after the for loop, before the return:

// Create bookkeeping journal entry for this payroll run
const payrollRecordIds = processedRecords.map((r) => r.payrollRecordId);
if (payrollRecordIds.length > 0) {
  const periodLabel = `${startDate} to ${endDate}`;
  const journalResult = await createPayrollJournalEntries(
    companyId!,
    payrollRecordIds,
    new Date(payDate),
    periodLabel,
  );
  // journalResult may be null if accounts aren't seeded yet — that's OK
}
```

**Modify `app/api/payroll/[id]/void/route.ts`:**

When a payroll record is voided, find and void any associated journal entries:

```typescript
// After voiding the payroll record, void associated journal entries
const relatedEntries = await prisma.journalEntry.findMany({
  where: {
    companyId: companyId!,
    source: 'payroll',
    status: 'posted',
  },
});

// Find entries whose sourceId contains this payroll record's ID
for (const entry of relatedEntries) {
  if (entry.sourceId && entry.sourceId.includes(id)) {
    await prisma.journalEntry.update({
      where: { id: entry.id },
      data: {
        status: 'voided',
        voidedAt: new Date(),
        voidedBy: session!.userId,
        voidReason: `Auto-voided: payroll record ${id} was voided (${reason})`,
      },
    });
  }
}
```

### Phase 3: UI Pages

Build all the following pages. Follow the existing UI patterns in the codebase (look at `app/employees/page.tsx`, `app/payroll/page.tsx`, etc. for reference):

**Pattern to follow:**
- `'use client'` directive
- `useState` + `useEffect` for data fetching
- Fetch from `/api/bookkeeping/*` endpoints
- Tailwind styling matching existing pages
- Loading states, error handling
- Tables use `bg-white rounded-lg shadow overflow-hidden` with `divide-y divide-gray-200`
- Buttons: primary = `bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium`
- Page wrapper: `<div className="min-h-screen p-8"><div className="max-w-7xl mx-auto">`

#### 3a. Bookkeeping Hub Page
**File**: `app/bookkeeping/page.tsx`

Landing page with card links to all sub-pages:
- Chart of Accounts, Journal Entries, Expenses, Vendors (management section)
- Profit & Loss, Balance Sheet, Trial Balance, General Ledger (reports section)

#### 3b. Chart of Accounts Page
**File**: `app/bookkeeping/accounts/page.tsx`

- List all accounts grouped by type (Asset, Liability, Equity, Revenue, Expense)
- Color-coded type badges (blue=asset, red=liability, purple=equity, green=revenue, orange=expense)
- "Load Default Accounts" button (calls POST `/api/bookkeeping/accounts/seed`) — show prominently if no accounts exist
- "Add Account" form (inline, togglable) with fields: code, name, type (dropdown), subtype, description
- Each account row shows: code, name, description, active status
- Actions per account: Deactivate/Activate toggle, Delete button
- Delete shows confirmation; if account has transactions, API returns 409 and UI shows the error
- Toggle to show/hide inactive accounts

#### 3c. Journal Entries Page
**File**: `app/bookkeeping/journal-entries/page.tsx`

**List view:**
- Table showing: entry #, date, memo, source (badge: Manual=blue, Payroll=green, Expense=orange), status, total amount
- Click row to expand and show line details (account, description, debit, credit)
- Void button on posted entries (prompts for reason)
- Voided entries shown with strikethrough/dimmed styling
- Filter by source type

**Create form (togglable):**
- Header fields: date, memo, reference number
- Dynamic line items table:
  - Each row: Account dropdown (code — name), description, debit amount, credit amount, remove button
  - "Add Line" button
  - Running totals row showing total debits and total credits
  - Visual indicator: green when balanced, red when not
  - Minimum 2 lines, cannot remove below 2
- Submit button (disabled when not balanced)

#### 3d. Expenses Page
**File**: `app/bookkeeping/expenses/page.tsx`

- List expenses in a table: date, vendor, description, category, amount, paid status
- "Add Expense" form:
  - Date, vendor (dropdown from vendors list + "No vendor" option), description, category (dropdown of common categories), amount
  - Payment method dropdown (cash, check, card, transfer)
  - Reference number
  - **Accounting section** (collapsible/optional): debit account dropdown, credit account dropdown
    - If both are selected, a journal entry is automatically created
    - Common pattern: debit an expense account (e.g., 6130 Shop Supplies), credit a cash account (e.g., 1000 Checking)
  - Paid checkbox + paid date
- Filter by: date range, category, vendor
- Delete button per expense

**Expense categories** (hardcoded list for the dropdown):
`parts`, `supplies`, `utilities`, `rent`, `insurance`, `tools`, `vehicle`, `advertising`, `office`, `professional_fees`, `bank_fees`, `platform_fees`, `shipping`, `licenses`, `miscellaneous`

#### 3e. Vendors Page
**File**: `app/bookkeeping/vendors/page.tsx`

- List vendors: name, contact info, expense count
- "Add Vendor" form: name, email, phone, address, city, state, zip, tax ID, notes
- Click vendor to see details and recent expenses
- Edit and delete (deactivates if has expenses)

#### 3f. Reports Pages

All reports should have:
- Date range selector (or "as of date" for balance sheet / trial balance)
- Print-friendly styling (add a `@media print` section or a print button)
- Export-ready format
- Currency formatting: `$X,XXX.XX`

**Profit & Loss** (`app/bookkeeping/reports/profit-loss/page.tsx`):
- Date range: start and end date inputs
- Revenue section: list each revenue account with balance, subtotal
- Expense section: list each expense account with balance, subtotal
- **Net Income** line at bottom (Revenue - Expenses), bold, highlighted

**Balance Sheet** (`app/bookkeeping/reports/balance-sheet/page.tsx`):
- "As of Date" input
- Assets section with subtotal
- Liabilities section with subtotal
- Equity section with subtotal + Retained Earnings line (calculated from revenue - expenses)
- Total Liabilities & Equity line — should equal Total Assets

**Trial Balance** (`app/bookkeeping/reports/trial-balance/page.tsx`):
- "As of Date" input
- Table: Account Code, Account Name, Debit Balance, Credit Balance
- Only shows accounts with activity
- Totals row at bottom
- "Balanced" / "OUT OF BALANCE" indicator

**General Ledger** (`app/bookkeeping/reports/general-ledger/page.tsx`):
- Date range inputs + optional account filter dropdown
- Grouped by account
- Each account section shows: date, entry #, memo, reference, debit, credit, running balance
- Subtotals per account

### Phase 4: Navigation Updates

**Update `components/Sidebar.tsx`:**

Add a Bookkeeping section to the navigation array. Place it after "Tax Forms" and before "Time Tracking":

```typescript
import { BookOpenIcon } from '@heroicons/react/24/outline';

// In the navigation array:
{ name: 'Bookkeeping', href: '/bookkeeping', icon: BookOpenIcon },
```

**Update `app/page.tsx` (Dashboard):**

Add a Bookkeeping card to the quickLinks array:

```typescript
{
  title: 'Bookkeeping',
  description: 'Manage accounts, record transactions, and generate financial reports',
  href: '/bookkeeping',
  icon: BookOpenIcon,
  available: true,
},
```

### Phase 5: Testing & Verification

1. **Schema**: Run `npx prisma db push` — should apply cleanly
2. **Seed**: Navigate to Chart of Accounts, click "Load Default Accounts" — should create ~40 accounts
3. **Manual journal entry**: Create a test entry (e.g., debit Checking, credit Owner's Equity for $1000)
4. **Expense with journal entry**: Create an expense with debit/credit accounts selected — verify journal entry created
5. **Payroll integration**: Process a test payroll — verify a journal entry is automatically created with correct debits/credits
6. **Reports**: Run each report and verify numbers make sense
7. **Void**: Void a journal entry — verify it's excluded from reports
8. **Delete protection**: Try to delete an account that has journal entries — should be blocked

---

## Architecture Details

### Double-Entry Bookkeeping Basics (for context)

Every transaction has equal debits and credits. The accounting equation: **Assets = Liabilities + Equity**

Normal balances:
- **Assets** and **Expenses** → Debit normal (increases with debits)
- **Liabilities**, **Equity**, and **Revenue** → Credit normal (increases with credits)

### The Payroll Journal Entry Structure

When payroll processes, this is the journal entry that gets created:

```
DEBIT  6000 Wages & Salaries           (total gross pay for all employees)
DEBIT  6010 Payroll Tax Expense         (employer SS + Medicare + FUTA + SUI)
  CREDIT 2100 Payroll Liabilities       (net pay — what employees are owed)
  CREDIT 2110 Federal Tax Payable       (federal income tax withholdings)
  CREDIT 2120 State Tax Payable         (state + local withholdings)
  CREDIT 2130 Social Security Payable   (employee + employer portions)
  CREDIT 2140 Medicare Payable          (employee + employer portions)
  CREDIT 2150 FUTA Payable              (employer federal unemployment)
  CREDIT 2160 SUI Payable               (employer state unemployment)
  CREDIT 2170 NY SDI Payable            (employee disability)
  CREDIT 2180 NY PFL Payable            (employee paid family leave)
```

The debits (expenses) equal the credits (liabilities). Zero-amount lines are omitted.

### The `source` Field Convention

Journal entries track their origin:
- `"manual"` — User-created entries
- `"payroll"` — Auto-created by payroll processing. `sourceId` contains comma-separated PayrollRecord IDs.
- `"expense"` — Auto-created when recording an expense with account selection. `sourceId` contains the Expense ID.

### Account Code Convention

```
1000-1999  Assets
2000-2999  Liabilities
3000-3999  Equity
4000-4999  Revenue
5000-5999  Cost of Goods Sold
6000-6999  Operating Expenses
```

---

## File Tree of New/Modified Files

```
Modified:
  prisma/schema.prisma          ← Already modified (JournalEntry, JournalEntryLine, Company.nextJournalEntryNumber, Account.journalEntryLines)
  lib/validation.ts             ← Already modified (bookkeeping schemas added)
  lib/bookkeeping.ts            ← Already created (core library)
  app/api/payroll/process/route.ts       ← NEEDS payroll bridge integration
  app/api/payroll/[id]/void/route.ts     ← NEEDS journal entry voiding on payroll void
  components/Sidebar.tsx                 ← NEEDS Bookkeeping nav item
  app/page.tsx                           ← NEEDS Bookkeeping quick link

Already created (review for correctness):
  app/api/bookkeeping/accounts/route.ts
  app/api/bookkeeping/accounts/[id]/route.ts
  app/api/bookkeeping/accounts/seed/route.ts
  app/api/bookkeeping/journal-entries/route.ts
  app/api/bookkeeping/journal-entries/[id]/route.ts
  app/api/bookkeeping/journal-entries/[id]/void/route.ts
  app/api/bookkeeping/vendors/route.ts
  app/api/bookkeeping/vendors/[id]/route.ts
  app/api/bookkeeping/expenses/route.ts
  app/api/bookkeeping/expenses/[id]/route.ts
  app/api/bookkeeping/reports/profit-loss/route.ts
  app/api/bookkeeping/reports/balance-sheet/route.ts
  app/api/bookkeeping/reports/trial-balance/route.ts
  app/api/bookkeeping/reports/general-ledger/route.ts

Need to be created (UI pages):
  app/bookkeeping/page.tsx                              ← Hub page
  app/bookkeeping/accounts/page.tsx                     ← Chart of Accounts
  app/bookkeeping/journal-entries/page.tsx               ← Journal Entries list + create
  app/bookkeeping/expenses/page.tsx                      ← Expenses list + create
  app/bookkeeping/vendors/page.tsx                       ← Vendors list + create
  app/bookkeeping/reports/profit-loss/page.tsx           ← P&L report
  app/bookkeeping/reports/balance-sheet/page.tsx         ← Balance Sheet report
  app/bookkeeping/reports/trial-balance/page.tsx         ← Trial Balance report
  app/bookkeeping/reports/general-ledger/page.tsx        ← General Ledger report
```

---

## Important Conventions

- **API auth pattern**: Always use `const { error, companyId, session } = await requireCompanyAccess('role');` at the top of every API route. Check `if (error) return error;` immediately.
- **Validation pattern**: Use `validateRequest(schema, body)` — returns `{ success, data }` or `{ success, errors }`.
- **Audit logging**: Use `logAudit()` for significant actions (create, void, delete).
- **Error responses**: `NextResponse.json({ error: 'message' }, { status: code })`.
- **Date handling**: Prisma DateTime fields, convert strings with `new Date(string)`.
- **Currency display**: Use `toLocaleString('en-US', { style: 'currency', currency: 'USD' })` or `Intl.NumberFormat`.
- **Next.js 16 route params**: Dynamic route params come as `{ params: Promise<{ id: string }> }` — you must `await params`.
- **No `return` in Prisma `$transaction`**: Use the callback style, not the array style.

## Build Order Recommendation

1. `npx prisma db push`
2. Review existing lib + API files, fix any issues
3. Payroll bridge integration (modify process + void routes)
4. Sidebar + dashboard updates
5. Bookkeeping hub page
6. Chart of Accounts page
7. Vendors page
8. Expenses page
9. Journal Entries page
10. Report pages (P&L → Balance Sheet → Trial Balance → General Ledger)
11. End-to-end testing
