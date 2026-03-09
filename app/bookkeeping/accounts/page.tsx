'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { PrinterIcon } from '@heroicons/react/24/outline';
import { PrintLayout } from '@/components/PrintLayout';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  description: string | null;
  isActive: boolean;
  balance: number;
}

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense', 'credit_card'];

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  asset: 'Asset',
  liability: 'Liability',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expense',
  credit_card: 'Credit Card',
};

// Valid subtypes per account type (must match validation.ts)
const VALID_SUBTYPES: Record<string, string[]> = {
  asset: ['bank_checking', 'bank_savings', 'accounts_receivable', 'other_current_asset', 'fixed_asset', 'other_asset'],
  liability: ['accounts_payable', 'other_current_liability', 'long_term_liability'],
  equity: ['owners_equity', 'retained_earnings', 'opening_balance_equity'],
  revenue: ['income', 'other_income'],
  expense: ['expense', 'other_expense', 'cost_of_goods_sold'],
  credit_card: ['credit_card'],
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

type SortKey = 'code' | 'name' | 'description' | 'balance' | 'isActive';
type SortDir = 'asc' | 'desc';
type SortEntry = { key: SortKey; dir: SortDir };

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [formData, setFormData] = useState({ code: '', name: '', type: 'expense', subtype: 'expense', description: '' });
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  // Hierarchical sort: primary, then secondary, then tertiary
  const [sortStack, setSortStack] = useState<SortEntry[]>([{ key: 'code', dir: 'asc' }]);

  useEffect(() => { fetchAccounts(); }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts');
      const data = await res.json();
      setAccounts(data);
    } catch {
      // handled by empty state
    } finally {
      setLoading(false);
    }
  };

  const seedAccounts = async () => {
    setActionMessage('Seeding accounts...');
    try {
      const res = await fetch('/api/bookkeeping/accounts/seed', { method: 'POST' });
      const data = await res.json();
      setActionMessage(data.message || 'Accounts seeded');
      fetchAccounts();
    } catch { setActionMessage('Failed to seed accounts'); }
    setTimeout(() => setActionMessage(''), 3000);
  };

  const createAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      const res = await fetch('/api/bookkeeping/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Failed to create account');
        return;
      }
      setShowForm(false);
      setFormData({ code: '', name: '', type: 'expense', subtype: 'expense', description: '' });
      fetchAccounts();
    } catch { setFormError('Failed to create account'); }
  };

  const startEditAccount = (acct: Account) => {
    setEditingAccount(acct);
    setFormData({
      code: acct.code,
      name: acct.name,
      type: acct.type,
      subtype: acct.subtype || VALID_SUBTYPES[acct.type]?.[0] || '',
      description: acct.description || '',
    });
    setFormError('');
  };

  const cancelEdit = () => {
    setEditingAccount(null);
    setFormData({ code: '', name: '', type: 'expense', subtype: 'expense', description: '' });
    setFormError('');
  };

  const updateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAccount) return;
    setFormError('');
    try {
      const res = await fetch(`/api/bookkeeping/accounts/${editingAccount.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          type: formData.type,
          subtype: formData.subtype,
          description: formData.description || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Failed to update account');
        return;
      }
      cancelEdit();
      fetchAccounts();
    } catch { setFormError('Failed to update account'); }
  };

  const deleteAccount = async (id: string, name: string) => {
    if (!confirm(`Delete account "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/bookkeeping/accounts/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to delete account');
        return;
      }
      fetchAccounts();
    } catch { alert('Failed to delete account'); }
  };

  const toggleActive = async (id: string, currentActive: boolean) => {
    try {
      await fetch(`/api/bookkeeping/accounts/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentActive }),
      });
      fetchAccounts();
    } catch {
      // handled silently
    }
  };

  // Hierarchical sort: clicking a column makes it primary, shifts others down
  const handleSort = (key: SortKey) => {
    setSortStack((prev) => {
      const existing = prev.find((s) => s.key === key);
      if (existing && prev[0]?.key === key) {
        // Already primary — flip direction
        return [{ key, dir: (existing.dir === 'asc' ? 'desc' : 'asc') as SortDir }, ...prev.slice(1)];
      }
      // Make this the primary sort, keep others as secondary/tertiary
      const rest = prev.filter((s) => s.key !== key);
      return [{ key, dir: 'asc' as SortDir }, ...rest].slice(0, 3);
    });
  };

  const getSortIndicator = (key: SortKey) => {
    const idx = sortStack.findIndex((s) => s.key === key);
    if (idx === -1) return null;
    const arrow = sortStack[idx].dir === 'asc' ? '\u25B2' : '\u25BC';
    const priority = idx === 0 ? '' : ` ${idx + 1}`;
    return (
      <span className={`ml-1 no-print ${idx === 0 ? 'text-blue-600' : 'text-gray-400'}`}>
        {arrow}<sup className="text-[9px]">{priority}</sup>
      </span>
    );
  };

  const filtered = showInactive ? accounts : accounts.filter((a) => a.isActive);

  // Apply hierarchical sort within each type group
  const compareAccounts = (a: Account, b: Account): number => {
    for (const { key, dir } of sortStack) {
      let cmp = 0;
      if (key === 'code') {
        cmp = a.code.localeCompare(b.code);
      } else if (key === 'name') {
        cmp = a.name.localeCompare(b.name);
      } else if (key === 'description') {
        cmp = (a.description || '').localeCompare(b.description || '');
      } else if (key === 'balance') {
        cmp = a.balance - b.balance;
      } else if (key === 'isActive') {
        cmp = (a.isActive === b.isActive) ? 0 : a.isActive ? -1 : 1;
      }
      if (cmp !== 0) return dir === 'asc' ? cmp : -cmp;
    }
    return 0;
  };

  const groupedByType = useMemo(() => {
    return ACCOUNT_TYPES.reduce((acc, type) => {
      acc[type] = filtered.filter((a) => a.type === type).sort(compareAccounts);
      return acc;
    }, {} as Record<string, Account[]>);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortStack]);

  // Compute group subtotals
  const groupTotals = useMemo(() => {
    return ACCOUNT_TYPES.reduce((acc, type) => {
      acc[type] = (groupedByType[type] || []).reduce((sum, a) => sum + a.balance, 0);
      return acc;
    }, {} as Record<string, number>);
  }, [groupedByType]);

  const asOfDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  if (loading) return <div className="p-8"><p className="text-gray-600">Loading accounts...</p></div>;

  const typeColors: Record<string, string> = {
    asset: 'bg-blue-50 text-blue-700',
    liability: 'bg-red-50 text-red-700',
    equity: 'bg-purple-50 text-purple-700',
    revenue: 'bg-green-50 text-green-700',
    expense: 'bg-orange-50 text-orange-700',
    credit_card: 'bg-rose-50 text-rose-700',
  };

  const thClass = 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700 transition-colors';

  return (
    <PrintLayout
      title="Chart of Accounts"
      subtitle={`As of ${asOfDate}`}
    >
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6 no-print">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-600 text-sm">Chart of Accounts</span>
            </div>
            <h1 className="text-3xl font-bold mb-2 text-gray-900">Chart of Accounts</h1>
            <p className="text-gray-600">
              {accounts.length} account{accounts.length !== 1 ? 's' : ''} ({accounts.filter((a) => a.isActive).length} active)
            </p>
          </div>
          <div className="flex gap-3">
            {accounts.length === 0 && (
              <button onClick={seedAccounts} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
                Load Default Accounts
              </button>
            )}
            <button
              onClick={() => window.print()}
              className="inline-flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
            >
              <PrinterIcon className="h-5 w-5 mr-2" />
              Print
            </button>
            <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              {showForm ? 'Cancel' : 'Add Account'}
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg no-print">{actionMessage}</div>
        )}

        {/* Create Account Form */}
        {showForm && (
          <div className="mb-6 bg-white border rounded-lg p-6 shadow-sm no-print">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">New Account</h2>
            {formError && !editingAccount && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded text-sm">{formError}</div>}
            <form onSubmit={createAccount} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Code</label>
                <input type="text" required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400" placeholder="e.g., 6300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400" placeholder="e.g., Training Expense" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={formData.type} onChange={(e) => {
                  const newType = e.target.value;
                  const subtypes = VALID_SUBTYPES[newType] || [];
                  setFormData({ ...formData, type: newType, subtype: subtypes[0] || '' });
                }}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900">
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtype</label>
                <select value={formData.subtype} onChange={(e) => setFormData({ ...formData, subtype: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900">
                  {(VALID_SUBTYPES[formData.type] || []).map((st) => (
                    <option key={st} value={st}>{SUBTYPE_LABELS[st] || st}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Edit Account Modal */}
        {editingAccount && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 no-print">
            <div className="bg-white rounded-lg shadow-xl max-w-lg w-full mx-4">
              <div className="px-6 py-4 border-b flex justify-between items-center">
                <h3 className="text-lg font-semibold text-gray-900">Edit Account: {editingAccount.code}</h3>
                <button type="button" onClick={cancelEdit} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <form onSubmit={updateAccount} className="px-6 py-4 space-y-4">
                {formError && <div className="p-2 bg-red-50 text-red-600 rounded text-sm">{formError}</div>}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Code</label>
                  <input type="text" value={formData.code} disabled
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 bg-gray-100 cursor-not-allowed" />
                  <p className="text-xs text-gray-500 mt-1">Account code cannot be changed</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                    <select value={formData.type} onChange={(e) => {
                      const newType = e.target.value;
                      const subtypes = VALID_SUBTYPES[newType] || [];
                      setFormData({ ...formData, type: newType, subtype: subtypes[0] || '' });
                    }}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900">
                      {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Subtype</label>
                    <select value={formData.subtype} onChange={(e) => setFormData({ ...formData, subtype: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900">
                      {(VALID_SUBTYPES[formData.type] || []).map((st) => (
                        <option key={st} value={st}>{SUBTYPE_LABELS[st] || st}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
              </form>
              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-lg">
                <button type="button" onClick={cancelEdit}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={updateAccount}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors">
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Show Inactive Toggle + Sort hint */}
        <div className="mb-4 flex justify-between items-center no-print">
          <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={() => setShowInactive(!showInactive)} className="rounded" />
            Show inactive accounts ({accounts.filter((a) => !a.isActive).length})
          </label>
          <span className="text-xs text-gray-400">Click column headers to sort. Click again to reverse. Multiple clicks build priority.</span>
        </div>

        {/* Seed button if no accounts */}
        {accounts.length === 0 && (
          <div className="text-center py-16 bg-gray-50 rounded-lg no-print">
            <p className="text-gray-600 mb-4 text-lg">No accounts yet</p>
            <p className="text-gray-500 mb-6">Load the default chart of accounts to get started, or create accounts manually.</p>
            <button onClick={seedAccounts} className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium transition-colors text-lg">
              Load Default Chart of Accounts
            </button>
          </div>
        )}

        {/* Account Groups */}
        {ACCOUNT_TYPES.map((type) => {
          const accts = groupedByType[type];
          if (accts.length === 0) return null;

          const typeLabel = ACCOUNT_TYPE_LABELS[type] || type;

          return (
            <div key={type} className="mb-6 report-section">
              <div className={`px-4 py-3 ${typeColors[type]} section-header rounded-t-lg`}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-center">{typeLabel}</h2>
              </div>
              <div className="bg-white rounded-b-lg shadow overflow-hidden expense-subgroup">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className={`${thClass} w-24`} onClick={() => handleSort('code')}>
                        Code{getSortIndicator('code')}
                      </th>
                      <th className={thClass} onClick={() => handleSort('name')}>
                        Name{getSortIndicator('name')}
                      </th>
                      <th className={thClass} onClick={() => handleSort('description')}>
                        Description{getSortIndicator('description')}
                      </th>
                      <th className={`${thClass} text-right w-32`} onClick={() => handleSort('balance')}>
                        Balance{getSortIndicator('balance')}
                      </th>
                      <th className={`${thClass} w-20 no-print`} onClick={() => handleSort('isActive')}>
                        Status{getSortIndicator('isActive')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-48 no-print">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {accts.map((acct) => (
                      <tr key={acct.id} className={`hover:bg-blue-50 ${acct.isActive ? '' : 'bg-gray-50 opacity-60'}`}>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900 cursor-pointer">
                          <Link href={`/bookkeeping/accounts/${acct.id}`} className="block">
                            {acct.code}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900 cursor-pointer">
                          <Link href={`/bookkeeping/accounts/${acct.id}`} className="block">
                            {acct.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500 cursor-pointer">
                          <Link href={`/bookkeeping/accounts/${acct.id}`} className="block">
                            {acct.description || '\u2014'}
                          </Link>
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-medium cursor-pointer ${acct.balance < 0 ? 'text-red-600' : acct.balance > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                          <Link href={`/bookkeeping/accounts/${acct.id}`} className="block">
                            {acct.balance === 0 ? '\u2014' : formatCurrency(acct.balance)}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm no-print">
                          <select
                            value={acct.isActive ? 'active' : 'inactive'}
                            onChange={(e) => toggleActive(acct.id, e.target.value !== 'active')}
                            className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer border-0 ${acct.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}
                          >
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                          </select>
                        </td>
                        <td className="px-4 py-3 text-sm text-right whitespace-nowrap no-print">
                          <button
                            type="button"
                            onClick={() => startEditAccount(acct)}
                            className="text-blue-500 hover:text-blue-700 hover:underline mr-3 text-xs cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteAccount(acct.id, acct.name)}
                            className="text-red-500 hover:text-red-700 hover:underline text-xs cursor-pointer"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Group subtotal */}
                  <tfoot>
                    <tr className="bg-gray-50 border-t subtotal-row">
                      <td className="px-4 py-2 text-xs font-semibold text-gray-500" colSpan={3}>
                        Total {typeLabel}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right font-semibold ${groupTotals[type] < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatCurrency(groupTotals[type])}
                      </td>
                      <td colSpan={2} className="no-print"></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </PrintLayout>
  );
}
