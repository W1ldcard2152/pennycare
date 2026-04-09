'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  description: string | null;
  taxLine: string | null;
  isActive: boolean;
}

interface Transaction {
  id: string;
  date: string;
  entryNumber: number;
  entryId: string;
  memo: string;
  source: string;
  description: string | null;
  debit: number;
  credit: number;
  runningBalance: number;
}

interface OpeningBalance {
  entryId: string;
  date: string;
  amount: number;
}

interface AccountData {
  account: Account;
  balance: number;
  openingBalance: OpeningBalance | null;
  transactions: Transaction[];
  totals: { totalDebits: number; totalCredits: number };
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

const TYPE_COLORS: Record<string, string> = {
  asset: 'bg-blue-100 text-blue-700',
  liability: 'bg-red-100 text-red-700',
  equity: 'bg-purple-100 text-purple-700',
  revenue: 'bg-green-100 text-green-700',
  expense: 'bg-orange-100 text-orange-700',
  credit_card: 'bg-rose-100 text-rose-700',
};

const TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
  credit_card: 'Credit Card',
};

const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-gray-100 text-gray-700',
  payroll: 'bg-indigo-100 text-indigo-700',
  ebay_import: 'bg-yellow-100 text-yellow-700',
  statement_import: 'bg-teal-100 text-teal-700',
  opening_balance: 'bg-purple-100 text-purple-700',
  cc_import: 'bg-pink-100 text-pink-700',
  expense: 'bg-orange-100 text-orange-700',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  payroll: 'Payroll',
  ebay_import: 'eBay Import',
  statement_import: 'Statement Import',
  opening_balance: 'Opening Balance',
  cc_import: 'CC Import',
  expense: 'Expense',
};

const SUBTYPE_LABELS: Record<string, string> = {
  bank_checking: 'Bank Checking',
  bank_savings: 'Bank Savings',
  accounts_receivable: 'Accounts Receivable',
  other_current_asset: 'Other Current Asset',
  fixed_asset: 'Fixed Asset',
  other_asset: 'Other Asset',
  accounts_payable: 'Accounts Payable',
  other_current_liability: 'Other Current Liability',
  long_term_liability: 'Long Term Liability',
  owners_equity: "Owner's Equity",
  retained_earnings: 'Retained Earnings',
  opening_balance_equity: 'Opening Balance Equity',
  income: 'Income',
  other_income: 'Other Income',
  expense: 'Expense',
  other_expense: 'Other Expense',
  cost_of_goods_sold: 'Cost of Goods Sold',
  credit_card: 'Credit Card',
};

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const accountId = resolvedParams.id;

  const [data, setData] = useState<AccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Filters
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(1);
  const limit = 100;

  // Editing states
  const [editingDescription, setEditingDescription] = useState(false);
  const [editingTaxLine, setEditingTaxLine] = useState(false);
  const [newDescription, setNewDescription] = useState('');
  const [newTaxLine, setNewTaxLine] = useState('');
  const [saving, setSaving] = useState(false);

  // Opening balance form
  const [showOpeningBalanceForm, setShowOpeningBalanceForm] = useState(false);
  const [obDate, setObDate] = useState('');
  const [obAmount, setObAmount] = useState('');
  const [obSaving, setObSaving] = useState(false);
  const [obError, setObError] = useState('');

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, startDate, endDate, page]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.append('startDate', startDate);
      if (endDate) params.append('endDate', endDate);
      params.append('page', String(page));
      params.append('limit', String(limit));

      const res = await fetch(`/api/bookkeeping/accounts/${accountId}/transactions?${params}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to load account');
        setData(null);
        return;
      }
      const result = await res.json();
      setData(result);
      setError('');
    } catch {
      setError('Failed to load account');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const updateAccount = async (field: string, value: string | boolean | null) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/bookkeeping/accounts/${accountId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to update account');
        return;
      }
      await fetchData();
    } catch {
      alert('Failed to update account');
    } finally {
      setSaving(false);
      setEditingDescription(false);
      setEditingTaxLine(false);
    }
  };

  const saveDescription = () => {
    updateAccount('description', newDescription || null);
  };

  const saveTaxLine = () => {
    updateAccount('taxLine', newTaxLine || null);
  };

  const toggleActive = () => {
    if (!data) return;
    updateAccount('isActive', !data.account.isActive);
  };

  const submitOpeningBalance = async (e: React.FormEvent) => {
    e.preventDefault();
    setObSaving(true);
    setObError('');

    try {
      const amount = parseFloat(obAmount);
      if (isNaN(amount) || amount === 0) {
        setObError('Amount cannot be zero');
        setObSaving(false);
        return;
      }

      // If there's an existing opening balance, void it first
      if (data?.openingBalance) {
        const voidRes = await fetch(`/api/bookkeeping/journal-entries/${data.openingBalance.entryId}/void`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ reason: 'Updating opening balance' }),
        });
        if (!voidRes.ok) {
          const err = await voidRes.json();
          setObError(err.error || 'Failed to void old opening balance');
          setObSaving(false);
          return;
        }
      }

      // Create the new opening balance
      const res = await fetch(`/api/bookkeeping/accounts/${accountId}/opening-balance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, date: obDate }),
      });

      if (!res.ok) {
        const err = await res.json();
        setObError(err.error || 'Failed to set opening balance');
        setObSaving(false);
        return;
      }

      setShowOpeningBalanceForm(false);
      setObDate('');
      setObAmount('');
      await fetchData();
    } catch {
      setObError('Failed to set opening balance');
    } finally {
      setObSaving(false);
    }
  };

  const clearFilters = () => {
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600">Loading account...</p>
        </div>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4">{error}</div>
          <Link href="/bookkeeping/accounts" className="text-blue-600 hover:text-blue-700">
            &larr; Back to Chart of Accounts
          </Link>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { account, balance, openingBalance, transactions, totals, pagination } = data;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4">
          <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">
            Dashboard
          </Link>
          <span className="text-gray-400">/</span>
          <Link href="/bookkeeping/accounts" className="text-blue-600 hover:text-blue-700 text-sm">
            Chart of Accounts
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">{account.code}</span>
        </div>

        {/* Header Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
            <div className="flex-1">
              {/* Account Code & Name */}
              <div className="flex items-center gap-3 mb-2">
                <h1 className="text-2xl font-bold text-gray-900">
                  {account.code} &mdash; {account.name}
                </h1>
                <span className={`px-2 py-1 rounded text-xs font-medium ${TYPE_COLORS[account.type] || 'bg-gray-100 text-gray-700'}`}>
                  {TYPE_LABELS[account.type] || account.type}
                </span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${account.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                  {account.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>

              {/* Subtype */}
              <p className="text-sm text-gray-500 mb-4">
                {SUBTYPE_LABELS[account.subtype || ''] || account.subtype || 'No subtype'}
              </p>

              {/* Description */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                {editingDescription ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newDescription}
                      onChange={(e) => setNewDescription(e.target.value)}
                      className="flex-1 border rounded px-3 py-1.5 text-sm text-gray-900"
                      placeholder="Enter description..."
                    />
                    <button
                      onClick={saveDescription}
                      disabled={saving}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingDescription(false)}
                      className="text-gray-500 hover:text-gray-700 px-3 py-1.5 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">{account.description || '—'}</span>
                    <button
                      onClick={() => {
                        setNewDescription(account.description || '');
                        setEditingDescription(true);
                      }}
                      className="text-blue-600 hover:text-blue-700 text-xs"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Tax Line */}
              <div className="mb-3">
                <label className="block text-xs font-medium text-gray-500 mb-1">Tax Line</label>
                {editingTaxLine ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newTaxLine}
                      onChange={(e) => setNewTaxLine(e.target.value)}
                      className="flex-1 border rounded px-3 py-1.5 text-sm text-gray-900"
                      placeholder="e.g., Schedule C: Line 9"
                    />
                    <button
                      onClick={saveTaxLine}
                      disabled={saving}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditingTaxLine(false)}
                      className="text-gray-500 hover:text-gray-700 px-3 py-1.5 text-sm"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-700">{account.taxLine || '—'}</span>
                    <button
                      onClick={() => {
                        setNewTaxLine(account.taxLine || '');
                        setEditingTaxLine(true);
                      }}
                      className="text-blue-600 hover:text-blue-700 text-xs"
                    >
                      Edit
                    </button>
                  </div>
                )}
              </div>

              {/* Toggle Active */}
              <button
                onClick={toggleActive}
                disabled={saving}
                className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-50"
              >
                {account.isActive ? 'Deactivate Account' : 'Activate Account'}
              </button>
            </div>

            {/* Balance */}
            <div className="text-right">
              <p className="text-xs font-medium text-gray-500 mb-1">Current Balance</p>
              <p className={`text-3xl font-bold ${balance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                {formatCurrency(balance)}
              </p>
            </div>
          </div>
        </div>

        {/* Opening Balance Section */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Opening Balance</h2>

          {openingBalance && !showOpeningBalanceForm ? (
            <div className="flex items-center gap-6">
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Date</p>
                <p className="text-sm text-gray-900">{formatDate(openingBalance.date)}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-gray-500 mb-1">Amount</p>
                <p className="text-sm font-medium text-gray-900">{formatCurrency(openingBalance.amount)}</p>
              </div>
              <button
                onClick={() => {
                  setObDate(new Date(openingBalance.date).toISOString().split('T')[0]);
                  setObAmount(String(openingBalance.amount));
                  setShowOpeningBalanceForm(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Update
              </button>
            </div>
          ) : showOpeningBalanceForm ? (
            <form onSubmit={submitOpeningBalance} className="max-w-md">
              {obError && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded text-sm">{obError}</div>}
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                  <input
                    type="date"
                    value={obDate}
                    onChange={(e) => setObDate(e.target.value)}
                    required
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={obAmount}
                    onChange={(e) => setObAmount(e.target.value)}
                    required
                    placeholder="0.00"
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={obSaving}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                >
                  {obSaving ? 'Saving...' : openingBalance ? 'Update Opening Balance' : 'Set Opening Balance'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowOpeningBalanceForm(false);
                    setObError('');
                  }}
                  className="text-gray-500 hover:text-gray-700 px-4 py-2 text-sm"
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <div>
              <p className="text-sm text-gray-500 mb-3">No opening balance has been set for this account.</p>
              <button
                onClick={() => {
                  setObDate(new Date().toISOString().split('T')[0]);
                  setObAmount('');
                  setShowOpeningBalanceForm(true);
                }}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
              >
                Set Opening Balance
              </button>
            </div>
          )}
        </div>

        {/* Transaction Register Section */}
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
              <h2 className="text-lg font-semibold text-gray-900">Transaction Register</h2>

              {/* Date Filters */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">From:</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => { setStartDate(e.target.value); setPage(1); }}
                    className="border rounded px-2 py-1 text-sm text-gray-900"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-500">To:</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => { setEndDate(e.target.value); setPage(1); }}
                    className="border rounded px-2 py-1 text-sm text-gray-900"
                  />
                </div>
                {(startDate || endDate) && (
                  <button
                    onClick={clearFilters}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Transaction Table */}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Entry #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Memo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Source</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {transactions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                      No transactions found for this account.
                    </td>
                  </tr>
                ) : (
                  transactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        {formatDate(tx.date)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                        <Link
                          href={`/bookkeeping/journal-entries/${tx.entryId}`}
                          className="text-blue-600 hover:text-blue-700"
                        >
                          #{tx.entryNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700">
                        {tx.memo}
                        {tx.description && tx.description !== tx.memo && (
                          <span className="text-gray-400 ml-1">({tx.description})</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm whitespace-nowrap">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS[tx.source] || 'bg-gray-100 text-gray-700'}`}>
                          {SOURCE_LABELS[tx.source] || tx.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 whitespace-nowrap">
                        {tx.debit > 0 ? formatCurrency(tx.debit) : ''}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-900 whitespace-nowrap">
                        {tx.credit > 0 ? formatCurrency(tx.credit) : ''}
                      </td>
                      <td className={`px-4 py-3 text-sm text-right font-medium whitespace-nowrap ${tx.runningBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatCurrency(tx.runningBalance)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              {transactions.length > 0 && (
                <tfoot className="bg-gray-50 border-t">
                  <tr>
                    <td colSpan={4} className="px-4 py-3 text-sm font-semibold text-gray-700">
                      Page Totals
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(totals.totalDebits)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                      {formatCurrency(totals.totalCredits)}
                    </td>
                    <td className={`px-4 py-3 text-sm text-right font-semibold ${transactions[transactions.length - 1].runningBalance < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                      {formatCurrency(transactions[transactions.length - 1].runningBalance)}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Pagination */}
          {pagination.totalPages > 1 && (
            <div className="px-6 py-4 border-t flex justify-between items-center">
              <p className="text-sm text-gray-500">
                Showing {((page - 1) * limit) + 1} - {Math.min(page * limit, pagination.total)} of {pagination.total} transactions
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-1 border rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="px-3 py-1 text-sm text-gray-500">
                  Page {page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => setPage(Math.min(pagination.totalPages, page + 1))}
                  disabled={page === pagination.totalPages}
                  className="px-3 py-1 border rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Back link */}
        <div className="mt-6">
          <Link href="/bookkeeping/accounts" className="text-blue-600 hover:text-blue-700 text-sm">
            &larr; Back to Chart of Accounts
          </Link>
        </div>
      </div>
    </div>
  );
}
