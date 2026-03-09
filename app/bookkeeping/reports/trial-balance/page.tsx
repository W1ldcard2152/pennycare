'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { PrintLayout } from '@/components/PrintLayout';

interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: string;
  balance: number;
}

interface TrialBalanceData {
  accounts: AccountBalance[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

const DEBIT_NORMAL_TYPES = ['asset', 'expense'];

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function isDebitNormal(type: string): boolean {
  return DEBIT_NORMAL_TYPES.includes(type);
}

function formatAsOfDate(date: string): string {
  return `As of ${new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}

export default function TrialBalancePage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/bookkeeping/reports/trial-balance?asOfDate=${asOfDate}`);
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
  }, [asOfDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const getDebitCredit = (acct: AccountBalance) => {
    const debitNormal = isDebitNormal(acct.type);
    if (debitNormal) {
      return acct.balance >= 0
        ? { debit: acct.balance, credit: 0 }
        : { debit: 0, credit: Math.abs(acct.balance) };
    } else {
      return acct.balance >= 0
        ? { debit: 0, credit: acct.balance }
        : { debit: Math.abs(acct.balance), credit: 0 };
    }
  };

  const difference = data ? Math.abs(data.totalDebits - data.totalCredits) : 0;

  return (
    <PrintLayout
      title="Trial Balance"
      subtitle={formatAsOfDate(asOfDate)}
    >
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="mb-6 no-print">
            <div className="flex items-center gap-2 mb-2">
              <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">
                <ArrowLeftIcon className="h-4 w-4 inline mr-1" />
                Bookkeeping
              </Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-600 text-sm">Trial Balance</span>
            </div>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold mb-2 text-gray-900">Trial Balance</h1>
                <p className="text-gray-600">Verify debits equal credits across all accounts</p>
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
                <label className="block text-sm font-medium text-gray-700 mb-1">As of Date</label>
                <input
                  type="date"
                  value={asOfDate}
                  onChange={(e) => setAsOfDate(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
            </div>
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm no-print">{error}</div>}
          {loading && <div className="text-center py-12 text-gray-500 no-print">Loading...</div>}

          {data && !loading && (
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              {/* Screen-only header */}
              <div className="text-center py-4 border-b no-print">
                <h2 className="text-xl font-bold text-gray-900">Trial Balance</h2>
                <p className="text-sm text-gray-500">{formatAsOfDate(asOfDate)}</p>
              </div>

              {data.accounts.length === 0 ? (
                <div className="px-6 py-12 text-center text-gray-400">
                  No accounts with activity
                </div>
              ) : (
                <div className="report-section">
                  <div className="px-6 py-3 bg-gray-50 section-header">
                    <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wide text-center">Account Balances</h3>
                  </div>
                  <div className="expense-subgroup">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr className="border-b">
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Code</th>
                          <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Account Name</th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Debit</th>
                          <th className="px-6 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.accounts.map((acct) => {
                          const { debit, credit } = getDebitCredit(acct);
                          return (
                            <tr key={acct.accountId} className="border-b border-gray-100 hover:bg-gray-50">
                              <td className="px-6 py-2 font-mono text-xs text-gray-500">{acct.code}</td>
                              <td className="px-6 py-2 text-gray-900">{acct.name}</td>
                              <td className="px-6 py-2 text-right font-medium text-gray-900">
                                {debit > 0 ? formatCurrency(debit) : ''}
                              </td>
                              <td className="px-6 py-2 text-right font-medium text-gray-900">
                                {credit > 0 ? formatCurrency(credit) : ''}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr className="bg-gray-100 border-t-2 border-gray-300 font-bold">
                          <td colSpan={2} className="px-6 py-3 text-gray-900">Totals</td>
                          <td className="px-6 py-3 text-right text-gray-900">{formatCurrency(data.totalDebits)}</td>
                          <td className="px-6 py-3 text-right text-gray-900">{formatCurrency(data.totalCredits)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Balance Check */}
              {data.accounts.length > 0 && (
                <div className={`px-6 py-4 text-center font-semibold balance-indicator no-print ${data.isBalanced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {data.isBalanced ? (
                    <span>BALANCED — Total Debits equal Total Credits</span>
                  ) : (
                    <span>OUT OF BALANCE by {formatCurrency(difference)}</span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </PrintLayout>
  );
}
