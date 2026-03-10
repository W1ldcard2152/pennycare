'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface Transaction {
  lineId: string;
  entryId: string;
  entryNumber: number;
  date: string;
  memo: string;
  description: string | null;
  source: string;
  referenceNumber: string | null;
  debit: number;
  credit: number;
  isCleared: boolean;
}

interface ReconciliationData {
  id: string;
  account: {
    id: string;
    code: string;
    name: string;
    type: string;
    subtype: string;
  };
  statementStartDate: string;
  statementEndDate: string;
  statementBalance: number;
  beginningBalance: number;
  clearedDebits: number;
  clearedCredits: number;
  clearedBalance: number;
  difference: number;
  transactions: Transaction[];
  clearedCount: number;
  totalCount: number;
  status: string;
  completedAt: string | null;
  adjustingEntry: { id: string; entryNumber: number; memo: string } | null;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

export default function ReconciliationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [data, setData] = useState<ReconciliationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toggling, setToggling] = useState<string | null>(null);

  // Sorting and filtering
  const [sortField, setSortField] = useState<'date' | 'entryNumber' | 'debit' | 'credit'>('date');
  const [sortAsc, setSortAsc] = useState(true);
  const [filterText, setFilterText] = useState('');
  const [showCleared, setShowCleared] = useState(true);
  const [showUncleared, setShowUncleared] = useState(true);

  // Finish modal
  const [showFinishModal, setShowFinishModal] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [expenseAccounts, setExpenseAccounts] = useState<Account[]>([]);
  const [adjustmentAccountId, setAdjustmentAccountId] = useState('');

  // Reopen modal
  const [showReopenModal, setShowReopenModal] = useState(false);
  const [reopenReason, setReopenReason] = useState('');
  const [reopening, setReopening] = useState(false);

  // Auto-match
  const [autoMatching, setAutoMatching] = useState(false);
  const [autoMatchMessage, setAutoMatchMessage] = useState('');

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookkeeping/reconciliation/${resolvedParams.id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Reconciliation not found');
          return;
        }
        throw new Error('Failed to fetch reconciliation');
      }
      const result = await res.json();
      setData(result);
    } catch {
      setError('Failed to load reconciliation');
    } finally {
      setLoading(false);
    }
  }, [resolvedParams.id]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    // Fetch expense accounts for adjustment dropdown
    const fetchAccounts = async () => {
      try {
        const res = await fetch('/api/bookkeeping/accounts?balances=false');
        if (res.ok) {
          const accounts = await res.json();
          setExpenseAccounts(accounts.filter((a: Account) => a.type === 'expense'));
          // Find and set default adjustment account
          const defaultAccount = accounts.find((a: Account) => a.code === '6800');
          if (defaultAccount) {
            setAdjustmentAccountId(defaultAccount.id);
          }
        }
      } catch {
        // silently fail
      }
    };
    fetchAccounts();
  }, []);

  const handleToggle = async (lineId: string, cleared: boolean) => {
    if (!data || data.status !== 'in_progress') return;

    setToggling(lineId);
    try {
      const res = await fetch(`/api/bookkeeping/reconciliation/${resolvedParams.id}/toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ journalEntryLineId: lineId, cleared }),
      });

      if (res.ok) {
        const result = await res.json();
        // Update local state
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            clearedDebits: result.clearedDebits,
            clearedCredits: result.clearedCredits,
            clearedBalance: result.clearedBalance,
            difference: result.difference,
            clearedCount: result.clearedCount,
            transactions: prev.transactions.map((t) =>
              t.lineId === lineId ? { ...t, isCleared: cleared } : t
            ),
          };
        });
      }
    } catch {
      // silently fail
    } finally {
      setToggling(null);
    }
  };

  const handleSelectAll = () => {
    if (!data || data.status !== 'in_progress') return;
    const unclearedLines = filteredTransactions.filter((t) => !t.isCleared);
    unclearedLines.forEach((t) => handleToggle(t.lineId, true));
  };

  const handleDeselectAll = () => {
    if (!data || data.status !== 'in_progress') return;
    const clearedLines = filteredTransactions.filter((t) => t.isCleared);
    clearedLines.forEach((t) => handleToggle(t.lineId, false));
  };

  const handleAutoMatch = async () => {
    if (!data || data.status !== 'in_progress') return;

    setAutoMatching(true);
    setAutoMatchMessage('');

    try {
      const res = await fetch(`/api/bookkeeping/reconciliation/${resolvedParams.id}/auto-match`, {
        method: 'POST',
      });

      const result = await res.json();
      if (res.ok) {
        setAutoMatchMessage(result.message);
        // Refresh data
        fetchData();
        setTimeout(() => setAutoMatchMessage(''), 4000);
      } else {
        setAutoMatchMessage(result.error || 'Auto-match failed');
      }
    } catch {
      setAutoMatchMessage('Auto-match failed');
    } finally {
      setAutoMatching(false);
    }
  };

  const handleFinish = async () => {
    if (!data) return;

    setFinishing(true);
    setError('');

    try {
      const res = await fetch(`/api/bookkeeping/reconciliation/${resolvedParams.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          createAdjustment: Math.abs(data.difference) > 0.01,
          adjustmentAccountId: adjustmentAccountId || null,
        }),
      });

      const result = await res.json();
      if (res.ok) {
        // Refresh to show completed status
        fetchData();
        setShowFinishModal(false);
      } else {
        setError(result.error || 'Failed to complete reconciliation');
      }
    } catch {
      setError('Network error');
    } finally {
      setFinishing(false);
    }
  };

  const handleReopen = async () => {
    if (!data || !reopenReason.trim()) return;

    setReopening(true);
    setError('');

    try {
      const res = await fetch(`/api/bookkeeping/reconciliation/${resolvedParams.id}/reopen`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reopenReason }),
      });

      const result = await res.json();
      if (res.ok) {
        // Refresh
        fetchData();
        setShowReopenModal(false);
        setReopenReason('');
      } else {
        setError(result.error || 'Failed to reopen reconciliation');
      }
    } catch {
      setError('Network error');
    } finally {
      setReopening(false);
    }
  };

  const handleCancel = async () => {
    if (!confirm('Are you sure you want to cancel this reconciliation? All progress will be lost.')) {
      return;
    }

    try {
      const res = await fetch(`/api/bookkeeping/reconciliation/${resolvedParams.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/bookkeeping/reconciliation');
      }
    } catch {
      setError('Failed to cancel reconciliation');
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { timeZone: 'UTC' });
  };

  const getSourceBadge = (source: string) => {
    const badges: Record<string, { bg: string; text: string; label: string }> = {
      manual: { bg: 'bg-gray-100', text: 'text-gray-600', label: 'Manual' },
      payroll: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Payroll' },
      statement_import: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Import' },
      cc_import: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'CC Import' },
      ebay_import: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'eBay' },
      reconciliation: { bg: 'bg-green-100', text: 'text-green-700', label: 'Recon' },
      opening_balance: { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Opening' },
    };
    const badge = badges[source] || badges.manual;
    return (
      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  // Filtering and sorting
  const filteredTransactions = data
    ? data.transactions
        .filter((t) => {
          if (!showCleared && t.isCleared) return false;
          if (!showUncleared && !t.isCleared) return false;
          if (filterText) {
            const searchLower = filterText.toLowerCase();
            return (
              t.memo.toLowerCase().includes(searchLower) ||
              (t.description?.toLowerCase().includes(searchLower) ?? false) ||
              t.entryNumber.toString().includes(searchLower)
            );
          }
          return true;
        })
        .sort((a, b) => {
          let cmp = 0;
          if (sortField === 'date') {
            cmp = new Date(a.date).getTime() - new Date(b.date).getTime();
          } else if (sortField === 'entryNumber') {
            cmp = a.entryNumber - b.entryNumber;
          } else if (sortField === 'debit') {
            cmp = a.debit - b.debit;
          } else if (sortField === 'credit') {
            cmp = a.credit - b.credit;
          }
          return sortAsc ? cmp : -cmp;
        })
    : [];

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="animate-pulse text-gray-500">Loading reconciliation...</div>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 text-red-600 p-4 rounded-lg">{error}</div>
          <Link
            href="/bookkeeping/reconciliation"
            className="mt-4 inline-block text-blue-600 hover:text-blue-700"
          >
            Back to Reconciliation
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const isBalanced = Math.abs(data.difference) < 0.01;
  const isCompleted = data.status === 'completed';
  const isInProgress = data.status === 'in_progress';
  const isCreditCard = data.account.type === 'credit_card';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-8 py-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">
              Bookkeeping
            </Link>
            <span className="text-gray-400">/</span>
            <Link
              href="/bookkeeping/reconciliation"
              className="text-blue-600 hover:text-blue-700 text-sm"
            >
              Reconciliation
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600 text-sm">{data.account.name}</span>
          </div>

          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {data.account.code} — {data.account.name}
              </h1>
              <p className="text-gray-600 mt-1">
                Statement Period: {formatDate(data.statementStartDate)} —{' '}
                {formatDate(data.statementEndDate)}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isCompleted && (
                <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-sm font-medium">
                  Completed
                </span>
              )}
              {data.status === 'reopened' && (
                <span className="px-3 py-1 rounded-full bg-yellow-100 text-yellow-700 text-sm font-medium">
                  Reopened
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Summary Bar - Sticky */}
      <div className="bg-gray-50 border-b sticky top-0 z-10 px-8 py-3">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-wrap gap-x-8 gap-y-2 items-center">
            <div>
              <div className="text-xs text-gray-500 uppercase">Beginning</div>
              <div className="font-semibold text-gray-900">
                {formatCurrency(data.beginningBalance)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">
                {isCreditCard ? 'Charges' : 'Deposits'}
              </div>
              <div className="font-semibold text-green-600">
                +{formatCurrency(isCreditCard ? data.clearedCredits : data.clearedDebits)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">
                {isCreditCard ? 'Payments/Credits' : 'Withdrawals'}
              </div>
              <div className="font-semibold text-red-600">
                -{formatCurrency(isCreditCard ? data.clearedDebits : data.clearedCredits)}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 uppercase">
                {isCreditCard ? 'Book Balance' : 'Cleared Balance'}
              </div>
              <div className="font-semibold text-gray-900">
                {formatCurrency(data.clearedBalance)}
              </div>
            </div>
            <div className="border-l pl-6 ml-2">
              <div className="text-xs text-gray-500 uppercase">Statement Balance</div>
              <div className="font-semibold text-gray-900">
                {formatCurrency(data.statementBalance)}
              </div>
            </div>
            <div className="border-l pl-6 ml-2">
              <div className="text-xs text-gray-500 uppercase">Difference</div>
              <div
                className={`text-xl font-bold ${
                  isBalanced ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {formatCurrency(data.difference)}
              </div>
            </div>
            <div className="border-l pl-6 ml-2">
              <div className="text-xs text-gray-500 uppercase">Items Cleared</div>
              <div className="font-semibold text-gray-900">
                {data.clearedCount} of {data.totalCount}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="px-8 py-3">
          <div className="max-w-7xl mx-auto">
            <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
          </div>
        </div>
      )}

      {/* Auto-match message */}
      {autoMatchMessage && (
        <div className="px-8 py-3">
          <div className="max-w-7xl mx-auto">
            <div className="p-3 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium">
              {autoMatchMessage}
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 px-8 py-4">
        <div className="max-w-7xl mx-auto">
          {/* Actions Bar */}
          <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
            <div className="flex gap-2 items-center">
              <input
                type="text"
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
                placeholder="Search transactions..."
                className="border rounded px-3 py-1.5 text-sm text-gray-900 w-64"
              />
              <label className="flex items-center gap-1 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={showCleared}
                  onChange={(e) => setShowCleared(e.target.checked)}
                  className="rounded"
                />
                Cleared
              </label>
              <label className="flex items-center gap-1 text-sm text-gray-600">
                <input
                  type="checkbox"
                  checked={showUncleared}
                  onChange={(e) => setShowUncleared(e.target.checked)}
                  className="rounded"
                />
                Uncleared
              </label>
            </div>

            <div className="flex gap-2">
              {isInProgress && (
                <>
                  <button
                    onClick={handleAutoMatch}
                    disabled={autoMatching}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                  >
                    {autoMatching ? 'Matching...' : 'Auto-Match Imports'}
                  </button>
                  <button
                    onClick={handleSelectAll}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm font-medium"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm font-medium"
                  >
                    Deselect All
                  </button>
                  <button
                    onClick={handleCancel}
                    className="text-red-600 hover:text-red-700 px-3 py-1.5 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowFinishModal(true)}
                    className={`px-4 py-1.5 rounded text-sm font-medium ${
                      isBalanced
                        ? 'bg-green-600 hover:bg-green-700 text-white'
                        : 'bg-amber-500 hover:bg-amber-600 text-white'
                    }`}
                  >
                    {isBalanced ? 'Finish' : 'Finish with Adjustment'}
                  </button>
                </>
              )}
              {isCompleted && (
                <button
                  onClick={() => setShowReopenModal(true)}
                  className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-1.5 rounded text-sm font-medium"
                >
                  Reopen
                </button>
              )}
            </div>
          </div>

          {/* Adjusting Entry Notice */}
          {data.adjustingEntry && (
            <div className="mb-4 p-3 bg-yellow-50 rounded-lg text-sm">
              <span className="text-yellow-700">
                An adjusting entry (#{data.adjustingEntry.entryNumber}) was created:{' '}
                {data.adjustingEntry.memo}
              </span>
            </div>
          )}

          {/* Transactions Table */}
          <div className="bg-white rounded-lg shadow overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  {isInProgress && <th className="px-3 py-2 w-10"></th>}
                  <th
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('date')}
                  >
                    Date {sortField === 'date' && (sortAsc ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('entryNumber')}
                  >
                    Entry # {sortField === 'entryNumber' && (sortAsc ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                    Memo/Description
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-20">
                    Source
                  </th>
                  <th
                    className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('debit')}
                  >
                    {isCreditCard ? 'Payment' : 'Deposit'}{' '}
                    {sortField === 'debit' && (sortAsc ? '↑' : '↓')}
                  </th>
                  <th
                    className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24 cursor-pointer hover:bg-gray-100"
                    onClick={() => handleSort('credit')}
                  >
                    {isCreditCard ? 'Charge' : 'Withdrawal'}{' '}
                    {sortField === 'credit' && (sortAsc ? '↑' : '↓')}
                  </th>
                  <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-20">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredTransactions.map((t) => (
                  <tr
                    key={t.lineId}
                    className={`${t.isCleared ? 'bg-green-50' : ''} ${
                      toggling === t.lineId ? 'opacity-50' : ''
                    }`}
                  >
                    {isInProgress && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={t.isCleared}
                          onChange={(e) => handleToggle(t.lineId, e.target.checked)}
                          disabled={toggling === t.lineId}
                          className="rounded"
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 font-mono text-xs whitespace-nowrap">
                      {formatDate(t.date)}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/bookkeeping/journal-entries/${t.entryId}`}
                        className="text-blue-600 hover:text-blue-700 font-medium"
                      >
                        #{t.entryNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">
                      <div className="text-gray-900">{t.memo}</div>
                      {t.description && <div className="text-xs text-gray-500">{t.description}</div>}
                    </td>
                    <td className="px-3 py-2 text-center">{getSourceBadge(t.source)}</td>
                    <td className="px-3 py-2 text-right font-medium">
                      {isCreditCard ? (
                        t.debit > 0 ? (
                          <span className="text-green-600">{formatCurrency(t.debit)}</span>
                        ) : (
                          ''
                        )
                      ) : t.debit > 0 ? (
                        <span className="text-green-600">{formatCurrency(t.debit)}</span>
                      ) : (
                        ''
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {isCreditCard ? (
                        t.credit > 0 ? (
                          <span className="text-red-600">{formatCurrency(t.credit)}</span>
                        ) : (
                          ''
                        )
                      ) : t.credit > 0 ? (
                        <span className="text-red-600">{formatCurrency(t.credit)}</span>
                      ) : (
                        ''
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      {t.isCleared ? (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                          Cleared
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          Pending
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {filteredTransactions.length === 0 && (
              <div className="text-center py-12 text-gray-500">
                {data.totalCount === 0
                  ? 'No uncleared transactions for this period'
                  : 'No transactions match your filters'}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Finish Modal */}
      {showFinishModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                {isBalanced ? 'Complete Reconciliation' : 'Complete with Adjustment'}
              </h3>
            </div>

            <div className="px-6 py-4">
              {isBalanced ? (
                <p className="text-gray-600">
                  The reconciliation is balanced. {data.clearedCount} transactions will be marked as
                  reconciled.
                </p>
              ) : (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    The reconciliation has a difference of{' '}
                    <span className="font-semibold text-red-600">
                      {formatCurrency(data.difference)}
                    </span>
                    .
                  </p>
                  <p className="text-gray-600">
                    An adjusting journal entry will be created to balance the reconciliation.
                  </p>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Adjustment Account
                    </label>
                    <select
                      value={adjustmentAccountId}
                      onChange={(e) => setAdjustmentAccountId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="">Default (Reconciliation Discrepancies)</option>
                      {expenseAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => setShowFinishModal(false)}
                disabled={finishing}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleFinish}
                disabled={finishing}
                className={`px-4 py-2 text-sm font-medium rounded-lg ${
                  finishing
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700 text-white'
                }`}
              >
                {finishing ? 'Completing...' : 'Complete Reconciliation'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reopen Modal */}
      {showReopenModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">Reopen Reconciliation</h3>
            </div>

            <div className="px-6 py-4 space-y-4">
              <p className="text-gray-600">
                Reopening will un-reconcile all {data.clearedCount} transactions in this
                reconciliation.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Reopening
                </label>
                <textarea
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="Why are you reopening this reconciliation?"
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowReopenModal(false);
                  setReopenReason('');
                }}
                disabled={reopening}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
              >
                Cancel
              </button>
              <button
                onClick={handleReopen}
                disabled={reopening || !reopenReason.trim()}
                className={`px-4 py-2 text-sm font-medium rounded-lg ${
                  reopening || !reopenReason.trim()
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-amber-500 hover:bg-amber-600 text-white'
                }`}
              >
                {reopening ? 'Reopening...' : 'Reopen Reconciliation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
