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

interface TrialBalanceData {
  accounts: AccountBalance[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

const DEBIT_NORMAL_TYPES = ['asset', 'expense'];

export default function TrialBalancePage() {
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [data, setData] = useState<TrialBalanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchReport = async () => {
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
  };

  const formatCurrency = (amount: number) =>
    amount === 0 ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const getDebitCredit = (acct: AccountBalance) => {
    const isDebitNormal = DEBIT_NORMAL_TYPES.includes(acct.type);
    if (isDebitNormal) {
      return acct.balance >= 0
        ? { debit: acct.balance, credit: 0 }
        : { debit: 0, credit: Math.abs(acct.balance) };
    } else {
      return acct.balance >= 0
        ? { debit: 0, credit: acct.balance }
        : { debit: Math.abs(acct.balance), credit: 0 };
    }
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">Trial Balance</span>
        </div>
        <h1 className="text-3xl font-bold mb-6">Trial Balance</h1>

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
              <h2 className="text-xl font-bold">Trial Balance</h2>
              <p className="text-sm text-gray-500">As of {new Date(asOfDate).toLocaleDateString()}</p>
            </div>

            {data.accounts.length === 0 ? (
              <p className="text-center text-gray-400 py-8">No accounts with activity</p>
            ) : (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-gray-500 uppercase">
                      <th className="text-left py-2 w-20">Code</th>
                      <th className="text-left py-2">Account Name</th>
                      <th className="text-right py-2 w-32">Debit</th>
                      <th className="text-right py-2 w-32">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.accounts.map((acct) => {
                      const { debit, credit } = getDebitCredit(acct);
                      return (
                        <tr key={acct.accountId} className="border-b border-gray-100">
                          <td className="py-2 font-mono text-xs text-gray-500">{acct.code}</td>
                          <td className="py-2 text-gray-700">{acct.name}</td>
                          <td className="py-2 text-right font-medium">{formatCurrency(debit)}</td>
                          <td className="py-2 text-right font-medium">{formatCurrency(credit)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-gray-900 font-bold">
                      <td className="py-3" colSpan={2}>Totals</td>
                      <td className="py-3 text-right">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.totalDebits)}
                      </td>
                      <td className="py-3 text-right">
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(data.totalCredits)}
                      </td>
                    </tr>
                  </tfoot>
                </table>

                {/* Balance Indicator */}
                <div className={`mt-4 text-center text-sm font-semibold py-2 rounded ${data.isBalanced ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {data.isBalanced ? 'BALANCED' : 'OUT OF BALANCE'}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
