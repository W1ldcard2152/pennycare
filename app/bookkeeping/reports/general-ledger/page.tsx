'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

export default function GeneralLedgerPage() {
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear()}-01-01`);
  const [endDate, setEndDate] = useState(now.toISOString().split('T')[0]);
  const [accountFilter, setAccountFilter] = useState('');
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

  const fetchReport = async () => {
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
  };

  const formatCurrency = (amount: number) =>
    amount === 0 ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatCurrencyAlways = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">General Ledger</span>
        </div>
        <h1 className="text-3xl font-bold mb-6">General Ledger</h1>

        {/* Controls */}
        <div className="flex flex-wrap gap-4 items-end mb-6">
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Account (optional)</label>
            <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm min-w-[200px]">
              <option value="">All Accounts</option>
              {allAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
            </select>
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
          <div className="print:text-xs">
            <div className="text-center mb-6 print:mb-4">
              <h2 className="text-xl font-bold">General Ledger</h2>
              <p className="text-sm text-gray-500">
                {new Date(startDate).toLocaleDateString()} - {new Date(endDate).toLocaleDateString()}
              </p>
            </div>

            {data.accounts.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 rounded-lg">
                <p className="text-gray-600">No transactions found for the selected period</p>
              </div>
            ) : (
              <div className="space-y-6">
                {data.accounts.map((group) => (
                  <div key={group.account.id} className="bg-white border rounded-lg shadow-sm overflow-hidden print:shadow-none print:break-inside-avoid">
                    {/* Account Header */}
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <span className="font-mono text-sm text-gray-500 mr-2">{group.account.code}</span>
                      <span className="font-semibold text-gray-900">{group.account.name}</span>
                      <span className="ml-2 text-xs text-gray-400 uppercase">{group.account.type}</span>
                    </div>

                    {/* Transaction Table */}
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase border-b bg-gray-50">
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
                            <td className="py-1.5 px-4 text-gray-600">{new Date(entry.date).toLocaleDateString()}</td>
                            <td className="py-1.5 px-2 font-mono text-xs text-gray-500">#{entry.entryNumber}</td>
                            <td className="py-1.5 px-2 text-gray-700">{entry.memo}</td>
                            <td className="py-1.5 px-2 text-gray-400 text-xs">{entry.referenceNumber || ''}</td>
                            <td className="py-1.5 px-2 text-right font-medium">{formatCurrency(entry.debit)}</td>
                            <td className="py-1.5 px-2 text-right font-medium">{formatCurrency(entry.credit)}</td>
                            <td className="py-1.5 px-4 text-right font-medium">{formatCurrencyAlways(entry.runningBalance)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t font-semibold bg-gray-50">
                          <td className="py-2 px-4" colSpan={4}>Subtotal</td>
                          <td className="py-2 px-2 text-right">{formatCurrencyAlways(group.totalDebits)}</td>
                          <td className="py-2 px-2 text-right">{formatCurrencyAlways(group.totalCredits)}</td>
                          <td className="py-2 px-4"></td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
