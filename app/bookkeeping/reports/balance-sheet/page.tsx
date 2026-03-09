'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';
import { PrintLayout } from '@/components/PrintLayout';

interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  balance: number;
}

interface BalanceSheetData {
  assets: AccountBalance[];
  totalAssets: number;
  liabilities: AccountBalance[];
  totalLiabilities: number;
  creditCards: AccountBalance[];
  totalCreditCards: number;
  equity: AccountBalance[];
  totalEquity: number;
  retainedEarnings: number;
  totalLiabilitiesAndEquity: number;
}

const SUBTYPE_LABELS: Record<string, string> = {
  bank_checking: 'Bank Accounts',
  bank_savings: 'Bank Accounts',
  accounts_receivable: 'Accounts Receivable',
  other_current_asset: 'Other Current Assets',
  fixed_asset: 'Fixed Assets',
  other_asset: 'Other Assets',
  accounts_payable: 'Accounts Payable',
  other_current_liability: 'Other Current Liabilities',
  long_term_liability: 'Long-Term Liabilities',
  credit_card: 'Credit Cards',
};

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatAsOfDate(date: string): string {
  return `As of ${new Date(date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}

function groupBySubtype(accounts: AccountBalance[]): Record<string, AccountBalance[]> {
  const groups: Record<string, AccountBalance[]> = {};
  for (const acct of accounts) {
    const key = acct.subtype || 'other';
    if (!groups[key]) groups[key] = [];
    groups[key].push(acct);
  }
  return groups;
}

export default function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/bookkeeping/reports/balance-sheet?asOfDate=${asOfDate}`);
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

  const isBalanced = data ? Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity) < 0.01 : true;
  const difference = data ? Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity) : 0;

  const renderAccountGroup = (accounts: AccountBalance[]) => {
    const groups = groupBySubtype(accounts);
    const subtypeOrder = ['bank_checking', 'bank_savings', 'accounts_receivable', 'other_current_asset', 'fixed_asset', 'other_asset', 'accounts_payable', 'other_current_liability', 'long_term_liability'];

    return (
      <div className="expense-subgroup">
        <table className="w-full text-sm">
          <tbody>
            {subtypeOrder.map((subtype) => {
              const accts = groups[subtype];
              if (!accts || accts.length === 0) return null;
              const subtypeTotal = accts.reduce((sum, a) => sum + a.balance, 0);
              const label = SUBTYPE_LABELS[subtype] || subtype;

              return (
                <React.Fragment key={subtype}>
                  {/* Subtype header - italic, right-aligned, no background */}
                  <tr>
                    <td colSpan={3} className="px-6 pt-3 pb-1 text-sm font-medium text-gray-600 italic">{label}</td>
                  </tr>
                  {accts.map((acct) => (
                    <tr key={acct.accountId}>
                      <td className="px-6 py-1 text-gray-500 w-20 font-mono text-xs">{acct.code}</td>
                      <td className="py-1 text-gray-900 pl-4">{acct.name}</td>
                      <td className="px-6 py-1 text-right font-medium text-gray-900 w-32">{formatCurrency(acct.balance)}</td>
                    </tr>
                  ))}
                  {/* Subtotal - only underline the amount */}
                  <tr>
                    <td colSpan={2} className="px-6 py-1 text-sm text-gray-500 pl-10">Total {label}</td>
                    <td className="px-6 py-1 text-right font-medium text-gray-700 w-32 border-t border-gray-300">{formatCurrency(subtypeTotal)}</td>
                  </tr>
                </React.Fragment>
              );
            })}
            {/* Handle any ungrouped accounts */}
            {Object.keys(groups).filter(k => !subtypeOrder.includes(k)).map((subtype) => {
              const accts = groups[subtype];
              const subtypeTotal = accts.reduce((sum, a) => sum + a.balance, 0);
              return (
                <React.Fragment key={subtype}>
                  <tr>
                    <td colSpan={3} className="px-6 pt-3 pb-1 text-sm font-medium text-gray-600 italic">Other</td>
                  </tr>
                  {accts.map((acct) => (
                    <tr key={acct.accountId}>
                      <td className="px-6 py-1 text-gray-500 w-20 font-mono text-xs">{acct.code}</td>
                      <td className="py-1 text-gray-900 pl-4">{acct.name}</td>
                      <td className="px-6 py-1 text-right font-medium text-gray-900 w-32">{formatCurrency(acct.balance)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={2} className="px-6 py-1 text-sm text-gray-500 pl-10">Total Other</td>
                    <td className="px-6 py-1 text-right font-medium text-gray-700 w-32 border-t border-gray-300">{formatCurrency(subtypeTotal)}</td>
                  </tr>
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <PrintLayout
      title="Balance Sheet"
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
              <span className="text-gray-600 text-sm">Balance Sheet</span>
            </div>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold mb-2 text-gray-900">Balance Sheet</h1>
                <p className="text-gray-600">Assets, liabilities, and equity as of a specific date</p>
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
                <h2 className="text-xl font-bold text-gray-900">Balance Sheet</h2>
                <p className="text-sm text-gray-500">{formatAsOfDate(asOfDate)}</p>
              </div>

              {/* Assets Section */}
              <div className="report-section">
                <div className="px-6 py-3 bg-blue-50 section-header">
                  <h3 className="text-sm font-semibold text-blue-800 uppercase tracking-wide text-center">Assets</h3>
                </div>
                {data.assets.length === 0 ? (
                  <div className="px-6 py-4 text-sm text-gray-400 italic">No asset activity</div>
                ) : (
                  renderAccountGroup(data.assets)
                )}
                <table className="w-full text-sm">
                  <tfoot>
                    <tr className="font-semibold">
                      <td colSpan={2} className="px-6 py-2 text-blue-800">Total Assets</td>
                      <td className="px-6 py-2 text-right text-blue-800 w-32 border-t-2 border-blue-400">{formatCurrency(data.totalAssets)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Credit Cards Section */}
              {data.creditCards && data.creditCards.length > 0 && (
                <div className="report-section">
                  <div className="px-6 py-3 bg-rose-50 section-header">
                    <h3 className="text-sm font-semibold text-rose-800 uppercase tracking-wide text-center">Credit Cards</h3>
                  </div>
                  <div className="expense-subgroup">
                    <table className="w-full text-sm">
                      <tbody>
                        {data.creditCards.map((acct) => (
                          <tr key={acct.accountId}>
                            <td className="px-6 py-1 text-gray-500 w-20 font-mono text-xs">{acct.code}</td>
                            <td className="py-1 text-gray-900 pl-4">{acct.name}</td>
                            <td className="px-6 py-1 text-right font-medium text-gray-900 w-32">{formatCurrency(acct.balance)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-semibold">
                          <td colSpan={2} className="px-6 py-2 text-rose-800">Total Credit Cards</td>
                          <td className="px-6 py-2 text-right text-rose-800 w-32 border-t-2 border-rose-300">{formatCurrency(data.totalCreditCards)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </div>
              )}

              {/* Liabilities Section */}
              <div className="report-section">
                <div className="px-6 py-3 bg-red-50 section-header">
                  <h3 className="text-sm font-semibold text-red-800 uppercase tracking-wide text-center">Liabilities</h3>
                </div>
                {data.liabilities.length === 0 ? (
                  <div className="px-6 py-4 text-sm text-gray-400 italic">No liability activity</div>
                ) : (
                  renderAccountGroup(data.liabilities)
                )}
                <table className="w-full text-sm">
                  <tfoot>
                    <tr className="font-semibold">
                      <td colSpan={2} className="px-6 py-2 text-red-800">Total Liabilities</td>
                      <td className="px-6 py-2 text-right text-red-800 w-32 border-t-2 border-red-400">{formatCurrency(data.totalLiabilities)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Equity Section */}
              <div className="report-section">
                <div className="px-6 py-3 bg-purple-50 section-header">
                  <h3 className="text-sm font-semibold text-purple-800 uppercase tracking-wide text-center">Equity</h3>
                </div>
                <div className="expense-subgroup">
                  <table className="w-full text-sm">
                    <tbody>
                      {data.equity.map((acct) => (
                        <tr key={acct.accountId}>
                          <td className="px-6 py-1 text-gray-500 w-20 font-mono text-xs">{acct.code}</td>
                          <td className="py-1 text-gray-900 pl-4">{acct.name}</td>
                          <td className="px-6 py-1 text-right font-medium text-gray-900 w-32">{formatCurrency(acct.balance)}</td>
                        </tr>
                      ))}
                      <tr>
                        <td className="px-6 py-1 text-gray-500 w-20"></td>
                        <td className="py-1 text-gray-600 pl-4 italic">Retained Earnings (Net Income)</td>
                        <td className="px-6 py-1 text-right font-medium text-gray-900 w-32">{formatCurrency(data.retainedEarnings)}</td>
                      </tr>
                    </tbody>
                    <tfoot>
                      <tr className="font-semibold">
                        <td colSpan={2} className="px-6 py-2 text-purple-800">Total Equity</td>
                        <td className="px-6 py-2 text-right text-purple-800 w-32 border-t-2 border-purple-300">{formatCurrency(data.totalEquity + data.retainedEarnings)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Total Liabilities & Equity + Balance Check - grouped for print */}
              <div className="page-break-avoid">
                <div className="px-6 py-4 bg-gray-100 border-b">
                  <table className="w-full">
                    <tbody>
                      <tr className="text-lg font-bold text-gray-900">
                        <td>Total Liabilities & Equity</td>
                        <td className="text-right w-32">{formatCurrency(data.totalLiabilitiesAndEquity)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* Balance Check */}
                <div className={`px-6 py-4 text-center font-semibold balance-indicator ${isBalanced ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  {isBalanced ? (
                    <span>Balanced — Assets equal Liabilities + Equity</span>
                  ) : (
                    <span>OUT OF BALANCE by {formatCurrency(difference)}</span>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PrintLayout>
  );
}
