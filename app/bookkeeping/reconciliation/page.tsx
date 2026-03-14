'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ReconcilableAccount {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string;
  bookBalance: number;
  lastReconciled: {
    date: string;
    balance: number;
    completedAt: string;
  } | null;
  inProgress: {
    id: string;
    statementStartDate: string;
    statementEndDate: string;
    createdAt: string;
  } | null;
}

interface ReconciliationHistory {
  id: string;
  statementStartDate: string;
  statementEndDate: string;
  statementBalance: number;
  reconciledBalance: number;
  status: string;
  clearedCount: number;
  completedAt: string | null;
}

export default function ReconciliationPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState<ReconcilableAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Start reconciliation modal state
  const [showModal, setShowModal] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [statementStartDate, setStatementStartDate] = useState('');
  const [statementEndDate, setStatementEndDate] = useState('');
  const [statementBalance, setStatementBalance] = useState('');
  const [starting, setStarting] = useState(false);

  // History modal state
  const [historyAccountId, setHistoryAccountId] = useState<string | null>(null);
  const [history, setHistory] = useState<ReconciliationHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    fetchAccounts();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/reconciliation/accounts');
      if (!res.ok) throw new Error('Failed to fetch accounts');
      const data = await res.json();
      setAccounts(data);
    } catch (err) {
      setError('Failed to load reconcilable accounts');
    } finally {
      setLoading(false);
    }
  };

  const openStartModal = (accountId: string) => {
    const account = accounts.find((a) => a.id === accountId);
    setSelectedAccountId(accountId);

    // Default statement end to today
    const today = new Date().toISOString().split('T')[0];
    setStatementEndDate(today);

    // Default start date to day after last reconciled, or first of month if never reconciled
    if (account?.lastReconciled) {
      const lastDate = new Date(account.lastReconciled.date);
      lastDate.setDate(lastDate.getDate() + 1);
      setStatementStartDate(lastDate.toISOString().split('T')[0]);
    } else {
      const firstOfMonth = new Date();
      firstOfMonth.setDate(1);
      setStatementStartDate(firstOfMonth.toISOString().split('T')[0]);
    }

    setStatementBalance('');
    setShowModal(true);
  };

  const handleStartReconciliation = async () => {
    if (!selectedAccountId || !statementStartDate || !statementEndDate || !statementBalance) {
      setError('Please fill in all fields');
      return;
    }

    setStarting(true);
    setError('');

    try {
      const res = await fetch('/api/bookkeeping/reconciliation/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: selectedAccountId,
          statementStartDate,
          statementEndDate,
          statementBalance: parseFloat(statementBalance),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        if (data.existingId) {
          // Redirect to existing reconciliation
          router.push(`/bookkeeping/reconciliation/${data.existingId}`);
          return;
        }
        setError(data.error || 'Failed to start reconciliation');
        return;
      }

      // Redirect to the new reconciliation
      router.push(`/bookkeeping/reconciliation/${data.id}`);
    } catch {
      setError('Network error');
    } finally {
      setStarting(false);
    }
  };

  const openHistory = async (accountId: string) => {
    setHistoryAccountId(accountId);
    setLoadingHistory(true);
    setHistory([]);

    try {
      const res = await fetch(`/api/bookkeeping/reconciliation/history?accountId=${accountId}`);
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoadingHistory(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { timeZone: 'UTC' });
  };

  const selectedAccount = accounts.find((a) => a.id === selectedAccountId);
  const historyAccount = accounts.find((a) => a.id === historyAccountId);

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
          <div className="animate-pulse text-gray-500">Loading accounts...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">
            Dashboard
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">Reconciliation</span>
        </div>
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2 text-gray-900">Account Reconciliation</h1>
          <p className="text-gray-600">
            Reconcile bank and credit card accounts against statement balances
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        {/* Accounts List */}
        <div className="bg-white border rounded-lg shadow-sm">
          <div className="px-4 py-3 border-b">
            <h2 className="font-semibold text-gray-900">Reconcilable Accounts</h2>
          </div>

          {accounts.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No bank or credit card accounts found. Add accounts in the Chart of Accounts.
            </div>
          ) : (
            <div className="divide-y">
              {accounts.map((account) => (
                <div key={account.id} className="px-4 py-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-gray-500">{account.code}</span>
                        <span className="font-medium text-gray-900">{account.name}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-medium ${
                            account.type === 'credit_card'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}
                        >
                          {account.type === 'credit_card' ? 'Credit Card' : 'Bank'}
                        </span>
                      </div>

                      <div className="mt-1 text-sm text-gray-600">
                        <span>
                          Book Balance:{' '}
                          <span className="font-medium">{formatCurrency(account.bookBalance)}</span>
                        </span>
                        {account.lastReconciled && (
                          <span className="ml-4">
                            Last Reconciled:{' '}
                            <span className="font-medium">{formatDate(account.lastReconciled.date)}</span>
                            {' '}({formatCurrency(account.lastReconciled.balance)})
                          </span>
                        )}
                        {!account.lastReconciled && (
                          <span className="ml-4 text-amber-600">Never reconciled</span>
                        )}
                      </div>

                      {account.inProgress && (
                        <div className="mt-2 p-2 bg-yellow-50 rounded text-sm">
                          <span className="text-yellow-700">
                            Reconciliation in progress for {formatDate(account.inProgress.statementStartDate)} —{' '}
                            {formatDate(account.inProgress.statementEndDate)}
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => openHistory(account.id)}
                        className="text-gray-500 hover:text-gray-700 px-3 py-1.5 text-sm font-medium"
                      >
                        History
                      </button>
                      {account.inProgress ? (
                        <Link
                          href={`/bookkeeping/reconciliation/${account.inProgress.id}`}
                          className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-1.5 rounded text-sm font-medium"
                        >
                          Continue
                        </Link>
                      ) : (
                        <button
                          onClick={() => openStartModal(account.id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded text-sm font-medium"
                        >
                          Reconcile
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Start Reconciliation Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Start Reconciliation</h3>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedAccount?.code} — {selectedAccount?.name}
                </p>
              </div>

              <div className="px-6 py-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Statement Start Date
                  </label>
                  <input
                    type="date"
                    value={statementStartDate}
                    onChange={(e) => setStatementStartDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Statement End Date
                  </label>
                  <input
                    type="date"
                    value={statementEndDate}
                    onChange={(e) => setStatementEndDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Statement Ending Balance
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-2 text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      value={statementBalance}
                      onChange={(e) => setStatementBalance(e.target.value)}
                      placeholder="0.00"
                      className="w-full border rounded-lg px-3 py-2 pl-7 text-sm text-gray-900"
                    />
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    {selectedAccount?.type === 'credit_card'
                      ? 'Enter the balance exactly as shown on your credit card statement (positive if you owe, negative if you have a credit)'
                      : 'Enter the ending balance exactly as shown on your bank statement'}
                  </p>
                </div>
              </div>

              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={() => setShowModal(false)}
                  disabled={starting}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartReconciliation}
                  disabled={starting || !statementBalance}
                  className={`px-4 py-2 text-sm font-medium rounded-lg ${
                    starting || !statementBalance
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {starting ? 'Starting...' : 'Start Reconciliation'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* History Modal */}
        {historyAccountId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Reconciliation History</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {historyAccount?.code} — {historyAccount?.name}
                  </p>
                </div>
                <button
                  onClick={() => setHistoryAccountId(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto">
                {loadingHistory ? (
                  <div className="p-8 text-center text-gray-500">Loading...</div>
                ) : history.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    No reconciliation history for this account
                  </div>
                ) : (
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Period
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Statement
                        </th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                          Reconciled
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                          Status
                        </th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">
                          Items
                        </th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {history.map((rec) => (
                        <tr key={rec.id}>
                          <td className="px-4 py-2 text-gray-900">
                            {formatDate(rec.statementStartDate)} — {formatDate(rec.statementEndDate)}
                          </td>
                          <td className="px-4 py-2 text-right font-medium">
                            {formatCurrency(rec.statementBalance)}
                          </td>
                          <td className="px-4 py-2 text-right font-medium">
                            {rec.reconciledBalance !== null
                              ? formatCurrency(rec.reconciledBalance)
                              : '—'}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-medium ${
                                rec.status === 'completed'
                                  ? 'bg-green-100 text-green-700'
                                  : rec.status === 'in_progress'
                                  ? 'bg-yellow-100 text-yellow-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {rec.status}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center text-gray-600">{rec.clearedCount}</td>
                          <td className="px-4 py-2">
                            <Link
                              href={`/bookkeeping/reconciliation/${rec.id}`}
                              className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
