# Pennycare

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

5. Open [http://localhost:3000](http://localhost:3000) and register a new account.

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

The app runs at `http://localhost:3000`. Create your account via the registration page.

### 4. Seed Files (Development Only)

The `prisma/seed.ts` and `prisma/seed-test-employee.ts` files are for development and testing. They contain dummy data and should **not** be run on a production database with real employee information. You can safely delete them from the production machine.

### 5. Database Backups

The database is a single SQLite file at `prisma/prisma/pennycare.db`. **Back it up regularly** — if this file is lost or corrupted, all payroll data is gone.

Recommended backup routine:

- **Daily**: Copy `prisma/prisma/pennycare.db` to a USB drive or second disk
- **Weekly**: Keep a dated copy (e.g., `pennycare-backup-2026-02-07.db`)
- **Before any update**: Always back up before running `npm install`, `prisma db push`, or updating code

To back up (Windows):

```cmd
copy prisma\prisma\pennycare.db backups\pennycare-%date:~-4,4%-%date:~-7,2%-%date:~-10,2%.db
```

To restore from a backup, stop the server and replace the database file:

```cmd
copy backups\pennycare-2026-02-07.db prisma\prisma\pennycare.db
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
pennycare/
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
