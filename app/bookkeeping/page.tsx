'use client';

import Link from 'next/link';
import {
  BookOpenIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ChartBarIcon,
  ScaleIcon,
  TableCellsIcon,
} from '@heroicons/react/24/outline';

const sections = [
  {
    title: 'Chart of Accounts',
    description: 'Manage your accounts — add, edit, deactivate, or delete accounts',
    href: '/bookkeeping/accounts',
    icon: BookOpenIcon,
    color: 'text-blue-600',
  },
  {
    title: 'Journal Entries',
    description: 'View and create double-entry journal entries',
    href: '/bookkeeping/journal-entries',
    icon: ClipboardDocumentListIcon,
    color: 'text-green-600',
  },
  {
    title: 'Expenses',
    description: 'Track business expenses with vendor and category management',
    href: '/bookkeeping/expenses',
    icon: CurrencyDollarIcon,
    color: 'text-red-600',
  },
  {
    title: 'Vendors',
    description: 'Manage vendors and suppliers',
    href: '/bookkeeping/vendors',
    icon: UserGroupIcon,
    color: 'text-purple-600',
  },
];

const reports = [
  {
    title: 'Profit & Loss',
    description: 'Income statement showing revenue, expenses, and net income',
    href: '/bookkeeping/reports/profit-loss',
    icon: ChartBarIcon,
  },
  {
    title: 'Balance Sheet',
    description: 'Assets, liabilities, and equity as of a specific date',
    href: '/bookkeeping/reports/balance-sheet',
    icon: ScaleIcon,
  },
  {
    title: 'Trial Balance',
    description: 'Verify debits equal credits across all accounts',
    href: '/bookkeeping/reports/trial-balance',
    icon: TableCellsIcon,
  },
  {
    title: 'General Ledger',
    description: 'Detailed transaction history by account',
    href: '/bookkeeping/reports/general-ledger',
    icon: DocumentTextIcon,
  },
];

export default function BookkeepingPage() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">Bookkeeping</h1>
          <p className="text-gray-600">
            Manage your books — chart of accounts, journal entries, expenses, and financial reports
          </p>
        </div>

        {/* Main Sections */}
        <div className="mb-10">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Manage</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {sections.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <item.icon className={`h-8 w-8 ${item.color}`} />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Reports */}
        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Reports</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {reports.map((item) => (
              <Link
                key={item.title}
                href={item.href}
                className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <item.icon className="h-8 w-8 text-gray-500" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                      {item.title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-600">{item.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
