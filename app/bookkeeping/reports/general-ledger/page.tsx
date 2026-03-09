'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { PrintLayout } from '@/components/PrintLayout';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface LedgerEntry {
  date: string;
  entryNumber: number;
  memo: string;
  referenceNumber: string | null;
  source: string;
  description: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

interface LedgerAccount {
  account: Account;
  entries: LedgerEntry[];
  totalDebits: number;
  totalCredits: number;
}

interface LedgerData {
  accounts: LedgerAccount[];
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatCurrencyOrBlank(amount: number): string {
  return amount === 0 ? '' : formatCurrency(amount);
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} — ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}

export default function GeneralLedgerPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);
  const [accountFilter, setAccountFilter] = useState('');
  const [showAllAccounts, setShowAllAccounts] = useState(false);
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts');
      const data = await res.json();
      setAllAccounts(data.filter((a: Account & { isActive?: boolean }) => a.isActive !== false));
    } catch {
      // handled by empty state
    }
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ startDate, endDate });
      if (accountFilter) params.set('accountId', accountFilter);
      const res = await fetch(`/api/bookkeeping/reports/general-ledger?${params}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to generate report');
        return;
      }
      setData(await res.json());
    } catch {
      setError('Failed to generate report');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, accountFilter]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Filter accounts based on showAllAccounts toggle
  const displayedAccounts = data?.accounts || [];

  return (
    <PrintLayout
      title="General Ledger"
      subtitle={formatDateRange(startDate, endDate)}
    >
      <div className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="mb-6 no-print">
            <div className="flex items-center gap-2 mb-2">
              <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">
                <ArrowLeftIcon className="h-4 w-4 inline mr-1" />
                Bookkeeping
              </Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-600 text-sm">General Ledger</span>
            </div>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold mb-2 text-gray-900">General Ledger</h1>
                <p className="text-gray-600">Detailed transaction history by account</p>
              </div>
              {data && (
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <PrinterIcon className="h-5 w-5 mr-2" />
                  Print
                </button>
              )}
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow mb-6 p-4 no-print">
            <div className="flex flex-wrap gap-4 items-end">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account</label>
                <select
                  value={accountFilter}
                  onChange={(e) => setAccountFilter(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm min-w-[200px] text-gray-900"
                >
                  <option value="">All Accounts</option>
                  {allAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code} - {a.name}
                    </option>
                  ))}
                </select>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={showAllAccounts}
                  onChange={(e) => setShowAllAccounts(e.target.checked)}
                  className="rounded"
                />
                Show all accounts
              </label>
            </div>
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm no-print">{error}</div>}
          {loading && <div className="text-center py-12 text-gray-500 no-print">Loading...</div>}

          {data && !loading && (
            <div>
              {/* Screen-only header */}
              <div className="text-center mb-6 no-print">
                <h2 className="text-xl font-bold text-gray-900">General Ledger</h2>
                <p className="text-sm text-gray-500">{formatDateRange(startDate, endDate)}</p>
              </div>

              {displayedAccounts.length === 0 ? (
                <div className="bg-white rounded-lg shadow p-12 text-center text-gray-400">
                  No transactions found for the selected period
                </div>
              ) : (
                <div className="space-y-6">
                  {displayedAccounts.map((group) => (
                    <div key={group.account.id} className="bg-white border rounded-lg shadow-sm overflow-hidden account-section report-section">
                      {/* Account Header */}
                      <div className="bg-gray-50 px-4 py-3 section-header">
                        <div className="text-center">
                          <span className="font-mono text-sm text-gray-500 mr-2">{group.account.code}</span>
                          <span className="font-semibold text-gray-900">{group.account.name}</span>
                          <span className="ml-2 text-xs text-gray-400 uppercase bg-gray-200 px-2 py-0.5 rounded no-print">{group.account.type}</span>
                        </div>
                        <div className="text-sm text-gray-600 text-center mt-1 no-print">
                          <span className="mr-4">Debits: {formatCurrency(group.totalDebits)}</span>
                          <span>Credits: {formatCurrency(group.totalCredits)}</span>
                        </div>
                      </div>

                      {/* Transaction Table */}
                      <div className="expense-subgroup">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr className="border-b text-xs text-gray-500 uppercase">
                              <th className="text-left py-2 px-4 w-24">Date</th>
                              <th className="text-left py-2 px-2 w-16">Entry #</th>
                              <th className="text-left py-2 px-2">Memo</th>
                              <th className="text-left py-2 px-2 w-20">Ref</th>
                              <th className="text-right py-2 px-2 w-24">Debit</th>
                              <th className="text-right py-2 px-2 w-24">Credit</th>
                              <th className="text-right py-2 px-4 w-28">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {group.entries.map((entry, idx) => (
                              <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                                <td className="py-1.5 px-4 text-gray-600">
                                  {new Date(entry.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}
                                </td>
                                <td className="py-1.5 px-2 font-mono text-xs text-gray-500">#{entry.entryNumber}</td>
                                <td className="py-1.5 px-2 text-gray-700 truncate max-w-xs" title={entry.memo}>
                                  {entry.description || entry.memo}
                                </td>
                                <td className="py-1.5 px-2 text-gray-400 text-xs">{entry.referenceNumber || ''}</td>
                                <td className="py-1.5 px-2 text-right font-medium text-gray-900">
                                  {formatCurrencyOrBlank(entry.debit)}
                                </td>
                                <td className="py-1.5 px-2 text-right font-medium text-gray-900">
                                  {formatCurrencyOrBlank(entry.credit)}
                                </td>
                                <td className="py-1.5 px-4 text-right font-medium text-gray-900">
                                  {formatCurrency(entry.runningBalance)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="bg-gray-50 border-t font-semibold">
                              <td colSpan={4} className="py-2 px-4 text-gray-700">Account Totals</td>
                              <td className="py-2 px-2 text-right text-gray-900">{formatCurrency(group.totalDebits)}</td>
                              <td className="py-2 px-2 text-right text-gray-900">{formatCurrency(group.totalCredits)}</td>
                              <td className="py-2 px-4 text-right text-gray-900">
                                {group.entries.length > 0 ? formatCurrency(group.entries[group.entries.length - 1].runningBalance) : formatCurrency(0)}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PrintLayout>
  );
}
