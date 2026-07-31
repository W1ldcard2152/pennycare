# CV Books

Business management application for payroll and bookkeeping, designed specifically for auto repair and dismantling businesses.

## Features

### Payroll
- Employee management
- Time tracking
- Payroll calculations with tax withholdings
- Pay period management
- Overtime tracking

### Bookkeeping
- Double-entry accounting system
- Chart of accounts
- Transaction tracking
- Vendor management
- Expense tracking
- Financial reporting

## Tech Stack

- **Frontend**: Next.js 16 with TypeScript
- **Styling**: Tailwind CSS
- **Database**: SQLite with Prisma ORM
- **Runtime**: Node.js

## Getting Started

### Prerequisites
- Node.js 18+ installed
- npm or yarn package manager

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up the database:
```bash
npx prisma generate
npx prisma db push
```

4. Run the development server:
```bash
npm run dev
```

5. Open [http://localhost:3000](http://localhost:3000). On a fresh database you'll be taken through **first-time setup**, which creates the first owner account and company. After that, registration is closed — additional users are created by an owner under **Settings → Users** (each new user gets a temporary password and is forced to change it at first login).

To seed test data:
```bash
npx tsx prisma/seed-test-employee.ts
```

## Production Deployment (Offline PC)

### 1. Install and Build

```bash
npm install
npx prisma generate
npx prisma db push
npm run build
```

### 2. Generate Secrets

Before storing any real employee data, generate fresh secrets. **Do not use the defaults from the repo.**

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Copy output into .env.local as JWT_SECRET

node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Copy output into .env.local as ENCRYPTION_KEY
```

Your `.env.local` should look like:

```
JWT_SECRET=<your generated value>
ENCRYPTION_KEY=<your generated value>
```

### 3. Start the Server

```bash
npx next start
```

The app runs at `http://localhost:3000`. On first launch you'll complete first-time setup to create the owner account; thereafter, sign in and manage additional users under Settings → Users.

### 4. Seed Files (Development Only)

The `prisma/seed.ts` and `prisma/seed-test-employee.ts` files are for development and testing. They contain dummy data and should **not** be run on a production database with real employee information. You can safely delete them from the production machine.

### 5. Database Backups

The database is a single SQLite file at `prisma/prisma/pennycare.db`. **Back it up regularly** — if this file is lost or corrupted, all payroll data is gone.

Recommended backup routine:

- **Daily**: Copy `prisma/prisma/pennycare.db` to a USB drive or second disk
- **Weekly**: Keep a dated copy (e.g., `cvbooks-backup-2026-02-07.db`)
- **Before any update**: Always back up before running `npm install`, `prisma db push`, or updating code

To back up (Windows):

```cmd
copy prisma\prisma\pennycare.db backups\cvbooks-%date:~-4,4%-%date:~-7,2%-%date:~-10,2%.db
```

To restore from a backup, stop the server and replace the database file:

```cmd
copy backups\cvbooks-2026-02-07.db prisma\prisma\pennycare.db
```

**Important**: The ENCRYPTION_KEY used when data was entered must match the key used when reading it. If you change the ENCRYPTION_KEY, previously encrypted SSNs and bank account numbers will be unreadable. Keep a secure record of your ENCRYPTION_KEY separate from the database.

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | Yes | Secret key for signing session tokens. Min 32 chars. |
| `ENCRYPTION_KEY` | Yes | Key for encrypting SSNs and bank account numbers. |
| `DATABASE_URL` | No | Defaults to `file:./prisma/pennycare.db` (SQLite). |

## Database Schema

### Payroll Models
- **Employee**: Employee information, pay rates, tax details
- **TimeEntry**: Daily time tracking for hourly employees
- **PayrollRecord**: Completed payroll runs with earnings and deductions

### Bookkeeping Models
- **Account**: Chart of accounts for double-entry bookkeeping
- **Transaction**: Financial transactions with debit/credit entries
- **Vendor**: Supplier and vendor information
- **Expense**: Business expense tracking

## Quarterly Tax Forms

Both quarterly returns are computed by pure, unit-tested modules that take plain
objects and return the form's own line items. Route handlers fetch Prisma rows,
hand them to the module, and render either a JSON preview for the page or a
filled PDF. Keeping the arithmetic out of the route is what makes the tie-outs
testable — see `__tests__/nys45.test.ts` and `__tests__/form941.test.ts`.

- **`lib/nys45.ts`** — NYS-45 (rev. 1/26). Part A lines 1–6, Part B lines 13–24,
  Part C columns a–j per employee.
- **`lib/form941.ts`** — Form 941. Part 1 lines 1–15 plus the Part 2 line 16
  liability breakdown.

### Things that are easy to get wrong

- **Wage-base ladders.** NY UI (`NY_SUI_WAGE_BASE_BY_YEAR`) and Social Security
  (`SOCIAL_SECURITY_WAGE_BASE_BY_YEAR`) are both year-to-date caps, so both
  builders walk every active record from Jan 1 — not just the quarter — to know
  how much of each employee's base is already consumed. `Employee.ytdGrossPaySeed`
  is applied on top, with `ytdSeedAsOfDate` deciding which of our own records are
  additive. **Verify each new year's base against the SSA / NY publication.**
- **Reference-week headcounts.** NYS-45 Part A wants covered employees for the
  week containing the 12th of each month; 941 line 1 wants the pay period
  including the 12th of the quarter's third month. Both are questions about
  *employment*, so they are derived from hire/termination dates plus payroll
  activity — deriving them from recorded pay periods alone reports 0 whenever the
  reference week falls between pay runs.
- **Wages are not gross pay.** 941 lines 2/5a/5c and NYS-45 column g use federal
  taxable wages (`PayrollRecord.taxableWages`, i.e. gross less pre-tax
  deductions), falling back to gross only when that column is null.
- **NYS-45 column f is total remuneration**, not the taxable slice. Its total
  must equal Part A line 1; columns h+i+j must equal line 24.
- **SDI and PFL never appear on the NYS-45.** They are carrier premiums, not NYS
  withholding. Adding them to line 13 overstates the return.
- **IRS money fields are two boxes.** Every 941 amount writes whole dollars and
  cents into separate widgets via `setMoney()`. Writing `"1234.56"` into one
  field silently produces a wrong return. Field names were mapped by correlating
  widget rectangles against the template's text — the Part 1 body starts at
  `f1_12`, because the entity block consumes `f1_1`–`f1_11`.
- **Deposit schedule drives 941 Part 2.** `Company.federalDepositSchedule`
  selects line 16: `monthly` marks its box and fills the three monthly amounts;
  `semiweekly` marks its box and leaves them blank, requiring a Schedule B
  attachment. Unset leaves line 16 blank.

### Deliberately left for the filer

Fields that are declarations or depend on a prior return are never auto-filled:
NYS-45 lines 7–12 and 14/16/18 and the quarter checkbox (printed artwork, not a
form field); 941 Parts 3–5 and the line 16 under-$2,500 box, which also depends
on the prior quarter's line 12. Each builder returns a `warnings` array surfaced
above the form — including tie-out failures between derived and booked tax, which
is how a stale wage base or a duplicated pay run gets caught before filing.

No Schedule B (Form 941) template ships with the app; semiweekly filers complete
it from the daily liabilities shown on the page.

## Development

```bash
# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run tests
npm test

# Run linter
npm run lint

# Prisma commands
npx prisma studio        # Open database GUI
npx prisma db push       # Push schema changes to database
npx prisma generate      # Generate Prisma Client
```

## Project Structure

```
cvbooks/
├── app/                  # Next.js app directory
│   ├── api/             # API routes
│   ├── employees/       # Employee management pages
│   ├── payroll/         # Payroll pages
│   └── reports/         # Reporting pages
├── components/          # Reusable React components
├── lib/                 # Utility functions and shared code
├── prisma/             # Database schema and migrations
│   └── schema.prisma   # Prisma schema definition
└── public/             # Static assets
```

## License

ISC
