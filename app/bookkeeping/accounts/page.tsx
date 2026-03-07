'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

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

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

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
  const [formData, setFormData] = useState({ code: '', name: '', type: 'expense', subtype: '', description: '' });
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
      setFormData({ code: '', name: '', type: 'expense', subtype: '', description: '' });
      fetchAccounts();
    } catch { setFormError('Failed to create account'); }
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
      <span className={`ml-1 ${idx === 0 ? 'text-blue-600' : 'text-gray-400'}`}>
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

  if (loading) return <div className="p-8"><p className="text-gray-600">Loading accounts...</p></div>;

  const typeColors: Record<string, string> = {
    asset: 'bg-blue-50 text-blue-700',
    liability: 'bg-red-50 text-red-700',
    equity: 'bg-purple-50 text-purple-700',
    revenue: 'bg-green-50 text-green-700',
    expense: 'bg-orange-50 text-orange-700',
  };

  const thClass = 'px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700 transition-colors';

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-600 text-sm">Chart of Accounts</span>
            </div>
            <h1 className="text-3xl font-bold mb-2">Chart of Accounts</h1>
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
            <button onClick={() => setShowForm(!showForm)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors">
              {showForm ? 'Cancel' : 'Add Account'}
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg">{actionMessage}</div>
        )}

        {/* Create Form */}
        {showForm && (
          <div className="mb-6 bg-white border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">New Account</h2>
            {formError && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded text-sm">{formError}</div>}
            <form onSubmit={createAccount} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Code</label>
                <input type="text" required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g., 6300" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g., Training Expense" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={formData.type} onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtype (optional)</label>
                <input type="text" value={formData.subtype} onChange={(e) => setFormData({ ...formData, subtype: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="e.g., current_asset" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                  Create Account
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Show Inactive Toggle + Sort hint */}
        <div className="mb-4 flex justify-between items-center">
          <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={() => setShowInactive(!showInactive)} className="rounded" />
            Show inactive accounts ({accounts.filter((a) => !a.isActive).length})
          </label>
          <span className="text-xs text-gray-400">Click column headers to sort. Click again to reverse. Multiple clicks build priority.</span>
        </div>

        {/* Seed button if no accounts */}
        {accounts.length === 0 && (
          <div className="text-center py-16 bg-gray-50 rounded-lg">
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

          const typeLabel = type.charAt(0).toUpperCase() + type.slice(1);

          return (
            <div key={type} className="mb-6">
              <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-medium ${typeColors[type]}`}>{typeLabel}</span>
                <span className="text-gray-400 text-sm font-normal">({accts.length})</span>
              </h2>
              <div className="bg-white rounded-lg shadow overflow-hidden">
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
                      <th className={`${thClass} w-20`} onClick={() => handleSort('isActive')}>
                        Status{getSortIndicator('isActive')}
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-40">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {accts.map((acct) => (
                      <tr key={acct.id} className={acct.isActive ? '' : 'bg-gray-50 opacity-60'}>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">{acct.code}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{acct.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{acct.description || '\u2014'}</td>
                        <td className={`px-4 py-3 text-sm text-right font-medium ${acct.balance < 0 ? 'text-red-600' : acct.balance > 0 ? 'text-gray-900' : 'text-gray-400'}`}>
                          {acct.balance === 0 ? '\u2014' : formatCurrency(acct.balance)}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${acct.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {acct.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right">
                          <button onClick={() => toggleActive(acct.id, acct.isActive)}
                            className="text-gray-500 hover:text-gray-700 mr-3 text-xs">
                            {acct.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button onClick={() => deleteAccount(acct.id, acct.name)}
                            className="text-red-500 hover:text-red-700 text-xs">
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {/* Group subtotal */}
                  <tfoot>
                    <tr className="bg-gray-50 border-t">
                      <td className="px-4 py-2 text-xs font-semibold text-gray-500" colSpan={3}>
                        Total {typeLabel}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right font-semibold ${groupTotals[type] < 0 ? 'text-red-600' : 'text-gray-900'}`}>
                        {formatCurrency(groupTotals[type])}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
