'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  BuildingLibraryIcon,
  CreditCardIcon,
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ShoppingCartIcon,
  DocumentTextIcon,
  ClockIcon,
  CurrencyDollarIcon,
  ArrowPathIcon,
  ChartBarIcon,
  ClipboardDocumentListIcon,
} from '@heroicons/react/24/outline';

interface AccountBalance {
  id: string;
  code: string;
  name: string;
  type: string;
  accountGroup: string | null;
  balance: number;
}

interface PnLSummary {
  revenue: number;
  expenses: number;
  netIncome: number;
  startDate: string;
  endDate: string;
  label: string;
}

interface UnreconciledAccount {
  accountId: string;
  accountCode: string;
  accountName: string;
  lastReconciledDate: string | null;
  needsReconciliation: boolean;
}

interface RecentActivity {
  type: string;
  description: string;
  date: string;
  timestamp: string;
  count?: number;
}

interface DashboardData {
  accountBalances: AccountBalance[];
  currentMonthPnL: PnLSummary;
  ytdPnL: PnLSummary;
  pendingItems: {
    unbookedTransactions: number;
    unreconciledAccounts: UnreconciledAccount[];
    payrollMayBeNeeded: boolean;
    employeeCount: number;
  };
  recentActivity: RecentActivity[];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDashboard() {
      try {
        const res = await fetch('/api/bookkeeping/dashboard');
        if (!res.ok) {
          if (res.status === 401) {
            window.location.href = '/login';
            return;
          }
          throw new Error('Failed to load dashboard');
        }
        const json = await res.json();
        setData(json);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load dashboard');
      } finally {
        setLoading(false);
      }
    }
    fetchDashboard();
  }, []);

  if (loading) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-gray-200 rounded" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-32 bg-gray-200 rounded-lg" />
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="h-48 bg-gray-200 rounded-lg" />
            <div className="h-48 bg-gray-200 rounded-lg" />
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <ExclamationTriangleIcon className="h-12 w-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-red-800">Failed to Load Dashboard</h2>
          <p className="text-red-600 mt-2">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const bankAccounts = data.accountBalances.filter(
    (a) => a.type === 'asset' && a.accountGroup === 'Cash'
  );
  const creditCards = data.accountBalances.filter((a) => a.type === 'credit_card');
  const clearingAccounts = data.accountBalances.filter(
    (a) => a.code === '1050' || a.code === '1060'
  );

  const hasAttentionItems =
    data.pendingItems.unbookedTransactions > 0 ||
    data.pendingItems.unreconciledAccounts.length > 0 ||
    data.pendingItems.payrollMayBeNeeded;

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-gray-600">Financial overview at a glance</p>
      </div>

      {/* Row 1: Account Balance Cards */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Account Balances
        </h2>
        {bankAccounts.length === 0 && creditCards.length === 0 && clearingAccounts.length === 0 ? (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-gray-500">
            <BuildingLibraryIcon className="h-10 w-10 mx-auto mb-2 text-gray-300" />
            <p>No accounts set up yet</p>
            <Link
              href="/bookkeeping/accounts"
              className="text-blue-600 hover:text-blue-700 text-sm mt-2 inline-block"
            >
              Set up Chart of Accounts
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Bank Accounts */}
            {bankAccounts.map((account) => (
              <Link
                key={account.id}
                href={`/bookkeeping/accounts/${account.id}`}
                className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <BuildingLibraryIcon className="h-8 w-8 text-blue-500" />
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-600">{account.name}</p>
                      <p className="text-xl font-bold text-green-600">
                        {formatCurrency(account.balance)}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {/* Credit Cards */}
            {creditCards.map((account) => (
              <Link
                key={account.id}
                href={`/bookkeeping/accounts/${account.id}`}
                className="bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <CreditCardIcon className="h-8 w-8 text-red-500" />
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-600">{account.name}</p>
                      <p className="text-xl font-bold text-red-600">
                        {formatCurrency(account.balance)}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}

            {/* Clearing Accounts (only shown if non-zero) */}
            {clearingAccounts.map((account) => (
              <Link
                key={account.id}
                href={`/bookkeeping/accounts/${account.id}`}
                className="bg-white rounded-lg shadow border border-amber-200 p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <ClockIcon className="h-8 w-8 text-amber-500" />
                    <div className="ml-3">
                      <p className="text-sm font-medium text-gray-600">{account.name}</p>
                      <p className="text-xl font-bold text-amber-600">
                        {formatCurrency(account.balance)}
                      </p>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Row 2: P&L Summary */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Profit & Loss
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Current Month */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Current Month</h3>
                <p className="text-sm text-gray-500">{data.currentMonthPnL.label}</p>
              </div>
              <Link
                href={`/bookkeeping/reports/profit-loss?startDate=${data.currentMonthPnL.startDate}&endDate=${data.currentMonthPnL.endDate}`}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                View Report
              </Link>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Revenue</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(data.currentMonthPnL.revenue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Expenses</span>
                <span className="font-medium text-red-600">
                  {formatCurrency(data.currentMonthPnL.expenses)}
                </span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold text-gray-900">Net Income</span>
                <span
                  className={`font-bold text-xl flex items-center ${
                    data.currentMonthPnL.netIncome >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {data.currentMonthPnL.netIncome >= 0 ? (
                    <ArrowTrendingUpIcon className="h-5 w-5 mr-1" />
                  ) : (
                    <ArrowTrendingDownIcon className="h-5 w-5 mr-1" />
                  )}
                  {formatCurrency(data.currentMonthPnL.netIncome)}
                </span>
              </div>
            </div>
          </div>

          {/* Year to Date */}
          <div className="bg-white rounded-lg shadow border border-gray-200 p-5">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-semibold text-gray-900">Year to Date</h3>
                <p className="text-sm text-gray-500">{data.ytdPnL.label}</p>
              </div>
              <Link
                href={`/bookkeeping/reports/profit-loss?startDate=${data.ytdPnL.startDate}&endDate=${data.ytdPnL.endDate}`}
                className="text-blue-600 hover:text-blue-700 text-sm"
              >
                View Report
              </Link>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-600">Revenue</span>
                <span className="font-medium text-green-600">
                  {formatCurrency(data.ytdPnL.revenue)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Expenses</span>
                <span className="font-medium text-red-600">
                  {formatCurrency(data.ytdPnL.expenses)}
                </span>
              </div>
              <div className="border-t pt-3 flex justify-between">
                <span className="font-semibold text-gray-900">Net Income</span>
                <span
                  className={`font-bold text-xl flex items-center ${
                    data.ytdPnL.netIncome >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}
                >
                  {data.ytdPnL.netIncome >= 0 ? (
                    <ArrowTrendingUpIcon className="h-5 w-5 mr-1" />
                  ) : (
                    <ArrowTrendingDownIcon className="h-5 w-5 mr-1" />
                  )}
                  {formatCurrency(data.ytdPnL.netIncome)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Row 3: Attention Needed */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Attention Needed
        </h2>
        <div className="bg-white rounded-lg shadow border border-gray-200 p-5">
          {!hasAttentionItems ? (
            <div className="flex items-center justify-center py-4 text-green-600">
              <CheckCircleIcon className="h-8 w-8 mr-3" />
              <span className="text-lg font-medium">All caught up!</span>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Unbooked Transactions */}
              {data.pendingItems.unbookedTransactions > 0 && (
                <Link
                  href="/bookkeeping/transaction-review"
                  className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                >
                  <div className="flex items-center">
                    <ExclamationTriangleIcon className="h-6 w-6 text-amber-500 mr-3" />
                    <div>
                      <p className="font-medium text-gray-900">
                        {data.pendingItems.unbookedTransactions} unbooked transaction
                        {data.pendingItems.unbookedTransactions !== 1 ? 's' : ''}
                      </p>
                      <p className="text-sm text-gray-600">
                        Review and categorize imported statements
                      </p>
                    </div>
                  </div>
                  <span className="text-amber-600 text-sm font-medium">Review &rarr;</span>
                </Link>
              )}

              {/* Unreconciled Accounts */}
              {data.pendingItems.unreconciledAccounts.length > 0 && (
                <Link
                  href="/bookkeeping/reconciliation"
                  className="flex items-center justify-between p-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                >
                  <div className="flex items-center">
                    <ArrowPathIcon className="h-6 w-6 text-blue-500 mr-3" />
                    <div>
                      <p className="font-medium text-gray-900">
                        {data.pendingItems.unreconciledAccounts.length} account
                        {data.pendingItems.unreconciledAccounts.length !== 1 ? 's' : ''} need
                        reconciliation
                      </p>
                      <p className="text-sm text-gray-600">
                        {data.pendingItems.unreconciledAccounts
                          .slice(0, 3)
                          .map((a) => a.accountName)
                          .join(', ')}
                        {data.pendingItems.unreconciledAccounts.length > 3 && '...'}
                      </p>
                    </div>
                  </div>
                  <span className="text-blue-600 text-sm font-medium">Reconcile &rarr;</span>
                </Link>
              )}

              {/* Payroll Reminder */}
              {data.pendingItems.payrollMayBeNeeded && (
                <Link
                  href="/payroll"
                  className="flex items-center justify-between p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
                >
                  <div className="flex items-center">
                    <BanknotesIcon className="h-6 w-6 text-purple-500 mr-3" />
                    <div>
                      <p className="font-medium text-gray-900">Payroll may be due</p>
                      <p className="text-sm text-gray-600">
                        {data.pendingItems.employeeCount} active employee
                        {data.pendingItems.employeeCount !== 1 ? 's' : ''} — no recent payroll
                        found
                      </p>
                    </div>
                  </div>
                  <span className="text-purple-600 text-sm font-medium">Run Payroll &rarr;</span>
                </Link>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Row 4: Recent Activity */}
      <div className="mb-6">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Recent Activity
        </h2>
        <div className="bg-white rounded-lg shadow border border-gray-200 p-5">
          {data.recentActivity.length === 0 ? (
            <div className="text-center py-6 text-gray-500">
              <ChartBarIcon className="h-10 w-10 mx-auto mb-2 text-gray-300" />
              <p>No recent activity</p>
            </div>
          ) : (
            <div className="space-y-3">
              {data.recentActivity.map((activity, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="flex items-center">
                    {activity.type.includes('ebay') && (
                      <ShoppingCartIcon className="h-5 w-5 text-orange-500 mr-3" />
                    )}
                    {activity.type.includes('statement') && (
                      <BuildingLibraryIcon className="h-5 w-5 text-blue-500 mr-3" />
                    )}
                    {activity.type.includes('cc_import') && (
                      <CreditCardIcon className="h-5 w-5 text-red-500 mr-3" />
                    )}
                    {activity.type.includes('payroll') && (
                      <CurrencyDollarIcon className="h-5 w-5 text-green-500 mr-3" />
                    )}
                    {activity.type.includes('reconciliation') && (
                      <ArrowPathIcon className="h-5 w-5 text-purple-500 mr-3" />
                    )}
                    <span className="text-gray-900">{activity.description}</span>
                  </div>
                  <span className="text-sm text-gray-500">{formatDate(activity.date)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Row 5: Quick Actions */}
      <div>
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
          Quick Actions
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <Link
            href="/bookkeeping/ebay"
            className="flex flex-col items-center justify-center bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md hover:border-orange-300 transition-all"
          >
            <ShoppingCartIcon className="h-8 w-8 text-orange-500 mb-2" />
            <span className="text-sm font-medium text-gray-700 text-center">Import eBay</span>
          </Link>

          <Link
            href="/bookkeeping/statement-import"
            className="flex flex-col items-center justify-center bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md hover:border-blue-300 transition-all"
          >
            <DocumentTextIcon className="h-8 w-8 text-blue-500 mb-2" />
            <span className="text-sm font-medium text-gray-700 text-center">Import Statement</span>
          </Link>

          <Link
            href="/bookkeeping/transaction-review"
            className="flex flex-col items-center justify-center bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md hover:border-purple-300 transition-all"
          >
            <ClipboardDocumentListIcon className="h-8 w-8 text-purple-500 mb-2" />
            <span className="text-sm font-medium text-gray-700 text-center">Review Transactions</span>
          </Link>

          <Link
            href="/payroll"
            className="flex flex-col items-center justify-center bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md hover:border-green-300 transition-all"
          >
            <CurrencyDollarIcon className="h-8 w-8 text-green-500 mb-2" />
            <span className="text-sm font-medium text-gray-700 text-center">Run Payroll</span>
          </Link>

          <Link
            href="/bookkeeping/reconciliation"
            className="flex flex-col items-center justify-center bg-white rounded-lg shadow border border-gray-200 p-4 hover:shadow-md hover:border-purple-300 transition-all"
          >
            <ArrowPathIcon className="h-8 w-8 text-purple-500 mb-2" />
            <span className="text-sm font-medium text-gray-700 text-center">Reconcile</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
