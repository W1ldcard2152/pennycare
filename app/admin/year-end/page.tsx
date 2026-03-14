'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  LockClosedIcon,
  LockOpenIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface ClosedPeriod {
  id: string;
  fiscalYear: number;
  periodEnd: string;
  closedAt: string;
  closedBy: string;
  isOpen: boolean;
  reopenedAt?: string;
  reopenedBy?: string;
  reopenReason?: string;
  reclosedAt?: string;
  closingEntry?: {
    id: string;
    entryNumber: number;
    date: string;
    status: string;
  };
}

interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: string;
  balance: number;
}

interface PreviewData {
  fiscalYear: number;
  summary: {
    totalRevenue: number;
    totalExpenses: number;
    netIncome: number;
    revenueAccounts: number;
    expenseAccounts: number;
  };
  revenue: AccountBalance[];
  expenses: AccountBalance[];
}

export default function YearEndPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [closedPeriods, setClosedPeriods] = useState<ClosedPeriod[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());

  // Preview/close state
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);

  // Reopen state
  const [reopenYear, setReopenYear] = useState<number | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [reopenLoading, setReopenLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/bookkeeping/year-end');
      if (!res.ok) {
        throw new Error('Failed to fetch year-end data');
      }
      const data = await res.json();
      setClosedPeriods(data.closedPeriods || []);
      setAvailableYears(data.availableYears || []);
      setCurrentYear(data.currentYear || new Date().getFullYear());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handlePreview = async (year: number) => {
    try {
      setPreviewLoading(true);
      setSelectedYear(year);
      setPreviewData(null);

      const res = await fetch('/api/bookkeeping/year-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalYear: year, preview: true }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to preview year-end');
      }

      const data = await res.json();
      setPreviewData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to preview year-end');
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleClose = async () => {
    if (!selectedYear) return;

    if (!confirm(`Are you sure you want to close fiscal year ${selectedYear}? This will:\n\n` +
      `• Create a closing journal entry\n` +
      `• Zero out all revenue and expense accounts\n` +
      `• Transfer net income to Retained Earnings\n` +
      `• Prevent any further changes to transactions in this period\n\n` +
      `You can reopen the period later if needed.`)) {
      return;
    }

    try {
      setCloseLoading(true);

      const res = await fetch('/api/bookkeeping/year-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalYear: selectedYear, preview: false }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to close fiscal year');
      }

      // Reset state and refresh
      setSelectedYear(null);
      setPreviewData(null);
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to close fiscal year');
    } finally {
      setCloseLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!reopenYear || reopenReason.trim().length < 10) return;

    try {
      setReopenLoading(true);

      const res = await fetch(`/api/bookkeeping/year-end/${reopenYear}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reopen fiscal year');
      }

      // Reset state and refresh
      setReopenYear(null);
      setReopenReason('');
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen fiscal year');
    } finally {
      setReopenLoading(false);
    }
  };

  const handleReclose = async (year: number) => {
    if (!confirm(`Are you sure you want to reclose fiscal year ${year}? This will create a new closing entry.`)) {
      return;
    }

    try {
      setCloseLoading(true);

      const res = await fetch('/api/bookkeeping/year-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fiscalYear: year, preview: false }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to reclose fiscal year');
      }

      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reclose fiscal year');
    } finally {
      setCloseLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    });
  };

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Year-End Closing</h1>
        <div className="flex items-center justify-center h-64">
          <ArrowPathIcon className="h-8 w-8 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-2xl font-bold mb-2">Year-End Closing</h1>
      <p className="text-gray-600 mb-6">
        Close fiscal years to lock transactions and create closing entries that zero out revenue/expense accounts
        and transfer net income to Retained Earnings.
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <ExclamationTriangleIcon className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-700 font-medium">Error</p>
            <p className="text-red-600 text-sm">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-red-400 hover:text-red-600"
          >
            &times;
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Available Years to Close */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <LockOpenIcon className="h-5 w-5 text-green-600" />
            Available Years to Close
          </h2>

          {availableYears.length === 0 ? (
            <p className="text-gray-500 text-sm">
              No fiscal years are available to close. Years must be complete (before {currentYear})
              and have journal entry activity.
            </p>
          ) : (
            <div className="space-y-3">
              {availableYears.map((year) => (
                <div
                  key={year}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
                >
                  <span className="font-medium">Fiscal Year {year}</span>
                  <button
                    onClick={() => handlePreview(year)}
                    disabled={previewLoading && selectedYear === year}
                    className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                  >
                    {previewLoading && selectedYear === year ? 'Loading...' : 'Preview & Close'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Closed Periods */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <LockClosedIcon className="h-5 w-5 text-red-600" />
            Closed Periods
          </h2>

          {closedPeriods.length === 0 ? (
            <p className="text-gray-500 text-sm">No fiscal years have been closed yet.</p>
          ) : (
            <div className="space-y-3">
              {closedPeriods.map((period) => (
                <div
                  key={period.id}
                  className={`p-3 border rounded-lg ${period.isOpen ? 'bg-yellow-50 border-yellow-200' : 'bg-gray-50'}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">Fiscal Year {period.fiscalYear}</span>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        period.isOpen
                          ? 'bg-yellow-200 text-yellow-800'
                          : 'bg-green-200 text-green-800'
                      }`}
                    >
                      {period.isOpen ? 'Reopened' : 'Closed'}
                    </span>
                  </div>

                  <div className="text-sm text-gray-600 space-y-1">
                    <p>Closed: {formatDate(period.closedAt)}</p>
                    {period.closingEntry && (
                      <p>
                        Closing Entry: JE #{period.closingEntry.entryNumber}
                        {period.closingEntry.status === 'voided' && (
                          <span className="text-red-600 ml-1">(voided)</span>
                        )}
                      </p>
                    )}
                    {period.isOpen && period.reopenReason && (
                      <p className="text-yellow-700">Reason: {period.reopenReason}</p>
                    )}
                  </div>

                  <div className="mt-3 flex gap-2">
                    {period.isOpen ? (
                      <button
                        onClick={() => handleReclose(period.fiscalYear)}
                        disabled={closeLoading}
                        className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50"
                      >
                        Reclose
                      </button>
                    ) : (
                      <button
                        onClick={() => setReopenYear(period.fiscalYear)}
                        className="px-3 py-1.5 bg-yellow-600 text-white text-sm rounded hover:bg-yellow-700"
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview Panel */}
      {previewData && (
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <CheckCircleIcon className="h-5 w-5 text-blue-600" />
            Preview: Fiscal Year {previewData.fiscalYear} Closing
          </h2>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="p-4 bg-green-50 rounded-lg">
              <p className="text-sm text-green-600 font-medium">Total Revenue</p>
              <p className="text-2xl font-bold text-green-700">
                {formatCurrency(previewData.summary.totalRevenue)}
              </p>
              <p className="text-xs text-green-600">{previewData.summary.revenueAccounts} accounts</p>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <p className="text-sm text-red-600 font-medium">Total Expenses</p>
              <p className="text-2xl font-bold text-red-700">
                {formatCurrency(previewData.summary.totalExpenses)}
              </p>
              <p className="text-xs text-red-600">{previewData.summary.expenseAccounts} accounts</p>
            </div>
            <div className={`p-4 rounded-lg ${previewData.summary.netIncome >= 0 ? 'bg-blue-50' : 'bg-yellow-50'}`}>
              <p className={`text-sm font-medium ${previewData.summary.netIncome >= 0 ? 'text-blue-600' : 'text-yellow-600'}`}>
                Net {previewData.summary.netIncome >= 0 ? 'Income' : 'Loss'}
              </p>
              <p className={`text-2xl font-bold ${previewData.summary.netIncome >= 0 ? 'text-blue-700' : 'text-yellow-700'}`}>
                {formatCurrency(Math.abs(previewData.summary.netIncome))}
              </p>
              <p className="text-xs text-gray-600">→ Retained Earnings</p>
            </div>
          </div>

          {/* Account Details */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            {/* Revenue Accounts */}
            <div>
              <h3 className="font-medium text-gray-700 mb-2">Revenue Accounts to Close</h3>
              {previewData.revenue.length === 0 ? (
                <p className="text-sm text-gray-500">No revenue accounts with balances</p>
              ) : (
                <div className="border rounded overflow-hidden">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100">
                      <tr>
                        <th className="text-left px-3 py-2">Account</th>
                        <th className="text-right px-3 py-2">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.revenue.map((acct) => (
                        <tr key={acct.accountId} className="border-t">
                          <td className="px-3 py-2">
                            <span className="text-gray-500">{acct.code}</span> {acct.name}
                          </td>
                          <td className="text-right px-3 py-2 text-green-600">
                            {formatCurrency(acct.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Expense Accounts */}
            <div>
              <h3 className="font-medium text-gray-700 mb-2">Expense Accounts to Close</h3>
              {previewData.expenses.length === 0 ? (
                <p className="text-sm text-gray-500">No expense accounts with balances</p>
              ) : (
                <div className="border rounded overflow-hidden max-h-64 overflow-y-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-100 sticky top-0">
                      <tr>
                        <th className="text-left px-3 py-2">Account</th>
                        <th className="text-right px-3 py-2">Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.expenses.map((acct) => (
                        <tr key={acct.accountId} className="border-t">
                          <td className="px-3 py-2">
                            <span className="text-gray-500">{acct.code}</span> {acct.name}
                          </td>
                          <td className="text-right px-3 py-2 text-red-600">
                            {formatCurrency(acct.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <button
              onClick={handleClose}
              disabled={closeLoading}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
            >
              <LockClosedIcon className="h-4 w-4" />
              {closeLoading ? 'Closing...' : `Close Fiscal Year ${previewData.fiscalYear}`}
            </button>
            <button
              onClick={() => {
                setSelectedYear(null);
                setPreviewData(null);
              }}
              className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {reopenYear && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Reopen Fiscal Year {reopenYear}</h3>
            <p className="text-sm text-gray-600 mb-4">
              Reopening this period will void the closing journal entry and allow changes to transactions
              dated within this fiscal year.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Reason for Reopening <span className="text-red-500">*</span>
              </label>
              <textarea
                value={reopenReason}
                onChange={(e) => setReopenReason(e.target.value)}
                rows={3}
                placeholder="Enter reason (minimum 10 characters)..."
                className="w-full px-3 py-2 border border-gray-300 rounded text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                {reopenReason.length}/10 characters minimum
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleReopen}
                disabled={reopenLoading || reopenReason.trim().length < 10}
                className="px-4 py-2 bg-yellow-600 text-white rounded hover:bg-yellow-700 disabled:opacity-50"
              >
                {reopenLoading ? 'Reopening...' : 'Reopen Period'}
              </button>
              <button
                onClick={() => {
                  setReopenYear(null);
                  setReopenReason('');
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
