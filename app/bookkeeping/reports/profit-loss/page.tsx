'use client';

import { useState } from 'react';
import Link from 'next/link';

interface AccountBalance {
  accountId: string;
  code: string;
  name: string;
  type: string;
  balance: number;
}

interface ProfitLossData {
  revenue: AccountBalance[];
  totalRevenue: number;
  expenses: AccountBalance[];
  totalExpenses: number;
  netIncome: number;
}

export default function ProfitLossPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);
  const [data, setData] = useState<ProfitLossData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async () => {
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
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">Profit & Loss</span>
        </div>
        <h1 className="text-3xl font-bold mb-6">Profit & Loss Statement</h1>

        {/* Date Range */}
        <div className="flex gap-4 items-end mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm" />
          </div>
          <button onClick={fetchReport} disabled={loading}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:opacity-50">
            {loading ? 'Loading...' : 'Generate'}
          </button>
          {data && (
            <button onClick={() => window.print()}
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors">
              Print
            </button>
          )}
        </div>

        {error && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}

        {data && (
          <div className="bg-white border rounded-lg shadow-sm p-6 print:shadow-none print:border-none">
            <div className="text-center mb-6 print:mb-4">
              <h2 className="text-xl font-bold">Profit & Loss</h2>
              <p className="text-sm text-gray-500">
                {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}
              </p>
            </div>

            {/* Revenue */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2 border-b pb-1">Revenue</h3>
              {data.revenue.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No revenue recorded</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.revenue.map((acct) => (
                      <tr key={acct.accountId}>
                        <td className="py-1 text-gray-600"><span className="font-mono text-xs text-gray-400 mr-2">{acct.code}</span>{acct.name}</td>
                        <td className="py-1 text-right font-medium">{formatCurrency(acct.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="py-2">Total Revenue</td>
                      <td className="py-2 text-right">{formatCurrency(data.totalRevenue)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Expenses */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2 border-b pb-1">Expenses</h3>
              {data.expenses.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No expenses recorded</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.expenses.map((acct) => (
                      <tr key={acct.accountId}>
                        <td className="py-1 text-gray-600"><span className="font-mono text-xs text-gray-400 mr-2">{acct.code}</span>{acct.name}</td>
                        <td className="py-1 text-right font-medium">{formatCurrency(acct.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="py-2">Total Expenses</td>
                      <td className="py-2 text-right">{formatCurrency(data.totalExpenses)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Net Income */}
            <div className="border-t-2 border-gray-900 pt-3">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Net Income</span>
                <span className={data.netIncome >= 0 ? 'text-green-700' : 'text-red-700'}>
                  {formatCurrency(data.netIncome)}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
