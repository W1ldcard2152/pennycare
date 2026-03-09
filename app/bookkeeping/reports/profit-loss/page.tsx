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
  subtype: string | null;
  balance: number;
}

interface ProfitLossData {
  revenue: AccountBalance[];
  totalRevenue: number;
  expenses: AccountBalance[];
  totalExpenses: number;
  netIncome: number;
}

function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);
  return `${startDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} — ${endDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`;
}

export default function ProfitLossPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);
  const [showZeroBalances, setShowZeroBalances] = useState(false);
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/bookkeeping/reports/profit-loss?startDate=${startDate}&endDate=${endDate}`);
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
  }, [startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Group expenses by subtype for display
  const groupExpensesBySubtype = (expenses: AccountBalance[]) => {
    const cogs = expenses.filter(e => e.subtype === 'cost_of_goods_sold' || e.subtype === 'cogs');
    const other = expenses.filter(e => e.subtype === 'other_expense');
    const operating = expenses.filter(e =>
      e.subtype === 'expense' ||
      e.subtype === null ||
      (!['cost_of_goods_sold', 'cogs', 'other_expense'].includes(e.subtype || ''))
    );
    return { cogs, operating, other };
  };

  const filterAccounts = (accounts: AccountBalance[]) => {
    if (showZeroBalances) return accounts;
    return accounts.filter(a => a.balance !== 0);
  };

  return (
    <PrintLayout
      title="Profit & Loss Statement"
      subtitle={formatDateRange(startDate, endDate)}
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
              <span className="text-gray-600 text-sm">Profit & Loss</span>
            </div>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-3xl font-bold mb-2 text-gray-900">Profit & Loss Statement</h1>
                <p className="text-gray-600">Income statement showing revenue, expenses, and net income</p>
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
              <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={showZeroBalances}
                  onChange={(e) => setShowZeroBalances(e.target.checked)}
                  className="rounded"
                />
                Show zero balances
              </label>
            </div>
          </div>

          {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm no-print">{error}</div>}
          {loading && <div className="text-center py-12 text-gray-500 no-print">Loading...</div>}

          {data && !loading && (
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              {/* Screen-only header */}
              <div className="text-center py-4 border-b no-print">
                <h2 className="text-xl font-bold text-gray-900">Profit & Loss Statement</h2>
                <p className="text-sm text-gray-500">{formatDateRange(startDate, endDate)}</p>
              </div>

              {/* Revenue Section */}
              <div className="report-section">
                <div className="px-6 py-3 bg-green-50 section-header">
                  <h3 className="text-sm font-semibold text-green-800 uppercase tracking-wide text-center">Revenue</h3>
                </div>
                <div className="expense-subgroup">
                  <table className="w-full text-sm">
                    <tbody>
                      {filterAccounts(data.revenue).map((acct) => (
                        <tr key={acct.accountId} className="border-b border-gray-100">
                          <td className="px-6 py-2 text-gray-500 w-20 font-mono text-xs">{acct.code}</td>
                          <td className="px-6 py-2 text-gray-900 pl-10">{acct.name}</td>
                          <td className="px-6 py-2 text-right font-medium text-gray-900 w-32">{formatCurrency(acct.balance)}</td>
                        </tr>
                      ))}
                      {filterAccounts(data.revenue).length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-6 py-4 text-sm text-gray-400 italic">No revenue recorded</td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot>
                      <tr className="bg-green-50 border-t border-green-200 font-semibold">
                        <td colSpan={2} className="px-6 py-3 text-green-800">Total Revenue</td>
                        <td className="px-6 py-3 text-right text-green-800 w-32">{formatCurrency(data.totalRevenue)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Expenses Section */}
              <div className="report-section">
                <div className="px-6 py-3 bg-orange-50 section-header">
                  <h3 className="text-sm font-semibold text-orange-800 uppercase tracking-wide text-center">Expenses</h3>
                </div>
                {(() => {
                  const { cogs, operating, other } = groupExpensesBySubtype(data.expenses);
                  const filteredCogs = filterAccounts(cogs);
                  const filteredOperating = filterAccounts(operating);
                  const filteredOther = filterAccounts(other);
                  const cogsTotal = cogs.reduce((sum, a) => sum + a.balance, 0);
                  const operatingTotal = operating.reduce((sum, a) => sum + a.balance, 0);
                  const otherTotal = other.reduce((sum, a) => sum + a.balance, 0);

                  return (
                    <>
                      {/* COGS */}
                      {filteredCogs.length > 0 && (
                        <div className="expense-subgroup">
                          <table className="w-full text-sm">
                            <tbody>
                              <tr className="bg-gray-50">
                                <td colSpan={3} className="px-6 py-2 text-sm font-medium text-gray-700 text-right italic">Cost of Goods Sold</td>
                              </tr>
                              {filteredCogs.map((acct) => (
                                <tr key={acct.accountId} className="border-b border-gray-100">
                                  <td className="px-6 py-2 text-gray-500 w-20 font-mono text-xs">{acct.code}</td>
                                  <td className="px-6 py-2 text-gray-900 pl-10">{acct.name}</td>
                                  <td className="px-6 py-2 text-right font-medium text-gray-900 w-32">{formatCurrency(acct.balance)}</td>
                                </tr>
                              ))}
                              <tr className="subtotal-row">
                                <td colSpan={2} className="px-6 py-2 text-sm font-medium text-gray-600 pl-14">Subtotal COGS</td>
                                <td className="px-6 py-2 text-right font-medium text-gray-700">{formatCurrency(cogsTotal)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Operating Expenses */}
                      {filteredOperating.length > 0 && (
                        <div className="expense-subgroup">
                          <table className="w-full text-sm">
                            <tbody>
                              <tr className="bg-gray-50">
                                <td colSpan={3} className="px-6 py-2 text-sm font-medium text-gray-700 text-right italic">Operating Expenses</td>
                              </tr>
                              {filteredOperating.map((acct) => (
                                <tr key={acct.accountId} className="border-b border-gray-100">
                                  <td className="px-6 py-2 text-gray-500 w-20 font-mono text-xs">{acct.code}</td>
                                  <td className="px-6 py-2 text-gray-900 pl-10">{acct.name}</td>
                                  <td className="px-6 py-2 text-right font-medium text-gray-900 w-32">{formatCurrency(acct.balance)}</td>
                                </tr>
                              ))}
                              <tr className="subtotal-row">
                                <td colSpan={2} className="px-6 py-2 text-sm font-medium text-gray-600 pl-14">Subtotal Operating Expenses</td>
                                <td className="px-6 py-2 text-right font-medium text-gray-700">{formatCurrency(operatingTotal)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Other Expenses */}
                      {filteredOther.length > 0 && (
                        <div className="expense-subgroup">
                          <table className="w-full text-sm">
                            <tbody>
                              <tr className="bg-gray-50">
                                <td colSpan={3} className="px-6 py-2 text-sm font-medium text-gray-700 text-right italic">Other Expenses</td>
                              </tr>
                              {filteredOther.map((acct) => (
                                <tr key={acct.accountId} className="border-b border-gray-100">
                                  <td className="px-6 py-2 text-gray-500 w-20 font-mono text-xs">{acct.code}</td>
                                  <td className="px-6 py-2 text-gray-900 pl-10">{acct.name}</td>
                                  <td className="px-6 py-2 text-right font-medium text-gray-900 w-32">{formatCurrency(acct.balance)}</td>
                                </tr>
                              ))}
                              <tr className="subtotal-row">
                                <td colSpan={2} className="px-6 py-2 text-sm font-medium text-gray-600 pl-14">Subtotal Other Expenses</td>
                                <td className="px-6 py-2 text-right font-medium text-gray-700">{formatCurrency(otherTotal)}</td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}

                      {filteredCogs.length === 0 && filteredOperating.length === 0 && filteredOther.length === 0 && (
                        <div className="px-6 py-4 text-sm text-gray-400 italic">No expenses recorded</div>
                      )}
                    </>
                  );
                })()}
                {/* Total Expenses */}
                <table className="w-full text-sm">
                  <tfoot>
                    <tr className="bg-orange-50 border-t border-orange-200 font-semibold">
                      <td colSpan={2} className="px-6 py-3 text-orange-800">Total Expenses</td>
                      <td className="px-6 py-3 text-right text-orange-800 w-32">{formatCurrency(data.totalExpenses)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Net Income */}
              <div className={`px-6 py-5 ${data.netIncome >= 0 ? 'bg-green-100 net-income-positive' : 'bg-red-100 net-income-negative'}`}>
                <div className="flex justify-between items-center">
                  <span className={`text-xl font-bold ${data.netIncome >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                    Net Income
                  </span>
                  <span className={`text-2xl font-bold ${data.netIncome >= 0 ? 'text-green-800' : 'text-red-800'}`}>
                    {formatCurrency(data.netIncome)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PrintLayout>
  );
}
