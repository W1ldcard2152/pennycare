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

interface BalanceSheetData {
  assets: AccountBalance[];
  totalAssets: number;
  liabilities: AccountBalance[];
  totalLiabilities: number;
  equity: AccountBalance[];
  totalEquity: number;
  retainedEarnings: number;
  totalLiabilitiesAndEquity: number;
}

export default function BalanceSheetPage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<BalanceSheetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async () => {
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
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const isBalanced = data ? Math.abs(data.totalAssets - data.totalLiabilitiesAndEquity) < 0.01 : true;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">Balance Sheet</span>
        </div>
        <h1 className="text-3xl font-bold mb-6">Balance Sheet</h1>

        {/* Date */}
        <div className="flex gap-4 items-end mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">As of Date</label>
            <input type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)}
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
              <h2 className="text-xl font-bold">Balance Sheet</h2>
              <p className="text-sm text-gray-500">As of {new Date(asOfDate).toLocaleDateString()}</p>
            </div>

            {/* Assets */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2 border-b pb-1">Assets</h3>
              {data.assets.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No asset activity</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.assets.map((acct) => (
                      <tr key={acct.accountId}>
                        <td className="py-1 text-gray-600"><span className="font-mono text-xs text-gray-400 mr-2">{acct.code}</span>{acct.name}</td>
                        <td className="py-1 text-right font-medium">{formatCurrency(acct.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="py-2">Total Assets</td>
                      <td className="py-2 text-right">{formatCurrency(data.totalAssets)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Liabilities */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2 border-b pb-1">Liabilities</h3>
              {data.liabilities.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">No liability activity</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {data.liabilities.map((acct) => (
                      <tr key={acct.accountId}>
                        <td className="py-1 text-gray-600"><span className="font-mono text-xs text-gray-400 mr-2">{acct.code}</span>{acct.name}</td>
                        <td className="py-1 text-right font-medium">{formatCurrency(acct.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t font-semibold">
                      <td className="py-2">Total Liabilities</td>
                      <td className="py-2 text-right">{formatCurrency(data.totalLiabilities)}</td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Equity */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2 border-b pb-1">Equity</h3>
              <table className="w-full text-sm">
                <tbody>
                  {data.equity.map((acct) => (
                    <tr key={acct.accountId}>
                      <td className="py-1 text-gray-600"><span className="font-mono text-xs text-gray-400 mr-2">{acct.code}</span>{acct.name}</td>
                      <td className="py-1 text-right font-medium">{formatCurrency(acct.balance)}</td>
                    </tr>
                  ))}
                  <tr>
                    <td className="py-1 text-gray-600 italic">Retained Earnings (calculated)</td>
                    <td className="py-1 text-right font-medium">{formatCurrency(data.retainedEarnings)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr className="border-t font-semibold">
                    <td className="py-2">Total Equity</td>
                    <td className="py-2 text-right">{formatCurrency(data.totalEquity + data.retainedEarnings)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Total L&E */}
            <div className="border-t-2 border-gray-900 pt-3 mb-4">
              <div className="flex justify-between items-center text-lg font-bold">
                <span>Total Liabilities & Equity</span>
                <span>{formatCurrency(data.totalLiabilitiesAndEquity)}</span>
              </div>
            </div>

            {/* Balance Check */}
            <div className={`text-center text-sm font-medium py-2 rounded ${isBalanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {isBalanced
                ? 'Assets = Liabilities + Equity (Balanced)'
                : `OUT OF BALANCE: Assets (${formatCurrency(data.totalAssets)}) != L+E (${formatCurrency(data.totalLiabilitiesAndEquity)})`}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
