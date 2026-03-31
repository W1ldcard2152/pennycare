'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { PrinterIcon } from '@heroicons/react/24/outline';
import { PrintLayout } from '@/components/PrintLayout';
import {
  computeSuggestedCodes,
  getSuggestedCode,
  ACCOUNT_GROUPS,
  ACCOUNT_TYPE_LABELS,
  getGroupDisplayOrder,
} from '@/lib/account-codes';
import type { AccountType } from '@/lib/account-codes';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  accountGroup: string | null;
  description: string | null;
  taxLine: string | null;
  isActive: boolean;
  balance: number;
}

interface OpeningBalance {
  entryId: string;
  date: string;
  amount: number;
}

const ACCOUNT_TYPES: AccountType[] = ['asset', 'liability', 'equity', 'revenue', 'expense', 'credit_card'];

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
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    type: 'expense' as AccountType,
    accountGroup: ACCOUNT_GROUPS['expense'][0] || '',
    description: '',
  });
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [suggestedCodes, setSuggestedCodes] = useState<Record<string, string>>({});
  const [customGroup, setCustomGroup] = useState('');
  const [useCustomGroup, setUseCustomGroup] = useState(false);
  const [editCustomGroup, setEditCustomGroup] = useState('');
  const [editUseCustomGroup, setEditUseCustomGroup] = useState(false);
  const [editOpeningBalance, setEditOpeningBalance] = useState<OpeningBalance | null>(null);
  const [editOBAmount, setEditOBAmount] = useState('');
  const [editOBDate, setEditOBDate] = useState('');
  const [loadingOB, setLoadingOB] = useState(false);

  // Hierarchical sort: primary, then secondary, then tertiary
  const [sortStack, setSortStack] = useState<SortEntry[]>([{ key: 'code', dir: 'asc' }]);

  useEffect(() => { fetchAccounts(); }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts');
      const data = await res.json();
      setAccounts(data);
      setSuggestedCodes(computeSuggestedCodes(data));
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
      setFormData({
        code: '',
        name: '',
        type: 'expense',
        accountGroup: ACCOUNT_GROUPS['expense'][0] || '',
        description: '',
      });
      fetchAccounts();
    } catch { setFormError('Failed to create account'); }
  };

  const startEditAccount = async (acct: Account) => {
    setEditingAccount(acct);
    const groups = ACCOUNT_GROUPS[acct.type as AccountType] || [];
    const isCustomGroup = acct.accountGroup && !groups.includes(acct.accountGroup);
    setEditUseCustomGroup(false);
    setEditCustomGroup(isCustomGroup ? acct.accountGroup || '' : '');
    setFormData({
      code: acct.code,
      name: acct.name,
      type: acct.type as AccountType,
      accountGroup: acct.accountGroup || groups[0] || '',
      description: acct.description || '',
    });
    setFormError('');
    setEditOpeningBalance(null);
    setEditOBAmount('');
    setEditOBDate('');

    // Fetch opening balance for this account
    setLoadingOB(true);
    try {
      const res = await fetch(`/api/bookkeeping/accounts/${acct.id}/transactions?limit=1`);
      if (res.ok) {
        const data = await res.json();
        if (data.openingBalance) {
          setEditOpeningBalance(data.openingBalance);
          setEditOBAmount(String(data.openingBalance.amount));
          setEditOBDate(new Date(data.openingBalance.date).toISOString().split('T')[0]);
        }
      }
    } catch {
      // Non-critical
    } finally {
      setLoadingOB(false);
    }
  };

  const cancelEdit = () => {
    setEditingAccount(null);
    setEditUseCustomGroup(false);
    setEditCustomGroup('');
    setEditOpeningBalance(null);
    setEditOBAmount('');
    setEditOBDate('');
    setFormData({
      code: '',
      name: '',
      type: 'expense',
      accountGroup: ACCOUNT_GROUPS['expense'][0] || '',
      description: '',
    });
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
          accountGroup: formData.accountGroup,
          description: formData.description || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Failed to update account');
        return;
      }

      // Handle opening balance changes
      const newAmount = editOBAmount ? parseFloat(editOBAmount) : 0;
      const oldAmount = editOpeningBalance?.amount ?? 0;
      const oldDate = editOpeningBalance ? new Date(editOpeningBalance.date).toISOString().split('T')[0] : '';
      const obChanged = newAmount !== oldAmount || editOBDate !== oldDate;

      if (obChanged && (newAmount !== 0 || editOpeningBalance)) {
        // Void existing opening balance if there is one
        if (editOpeningBalance) {
          const voidRes = await fetch(`/api/bookkeeping/journal-entries/${editOpeningBalance.entryId}/void`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Updating opening balance' }),
          });
          if (!voidRes.ok) {
            const err = await voidRes.json();
            setFormError(err.error || 'Account saved but failed to update opening balance');
            fetchAccounts();
            return;
          }
        }

        // Create new opening balance if amount is non-zero
        if (newAmount !== 0 && editOBDate) {
          const obRes = await fetch(`/api/bookkeeping/accounts/${editingAccount.id}/opening-balance`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount: newAmount, date: editOBDate }),
          });
          if (!obRes.ok) {
            const err = await obRes.json();
            setFormError(err.error || 'Account saved but failed to set opening balance');
            fetchAccounts();
            return;
          }
        }
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

  // Apply hierarchical sort within each group
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

  // Group accounts by Type -> Group -> Accounts
  const groupedData = useMemo(() => {
    const result: Record<string, Record<string, Account[]>> = {};

    for (const type of ACCOUNT_TYPES) {
      result[type] = {};
      const typeAccounts = filtered.filter((a) => a.type === type);

      // Get all unique groups for this type from accounts
      const groups = new Set<string>();
      for (const acct of typeAccounts) {
        groups.add(acct.accountGroup || 'Uncategorized');
      }

      // Sort groups by their defined order
      const sortedGroups = Array.from(groups).sort((a, b) => {
        const orderA = getGroupDisplayOrder(type, a);
        const orderB = getGroupDisplayOrder(type, b);
        return orderA - orderB;
      });

      for (const group of sortedGroups) {
        result[type][group] = typeAccounts
          .filter((a) => (a.accountGroup || 'Uncategorized') === group)
          .sort(compareAccounts);
      }
    }

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortStack]);

  // Compute group and type subtotals
  const typeTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const type of ACCOUNT_TYPES) {
      totals[type] = filtered
        .filter((a) => a.type === type)
        .reduce((sum, a) => sum + a.balance, 0);
    }
    return totals;
  }, [filtered]);

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

  const groupColors: Record<string, string> = {
    asset: 'bg-blue-25 text-blue-600',
    liability: 'bg-red-25 text-red-600',
    equity: 'bg-purple-25 text-purple-600',
    revenue: 'bg-green-25 text-green-600',
    expense: 'bg-orange-25 text-orange-600',
    credit_card: 'bg-rose-25 text-rose-600',
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
              <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">Dashboard</Link>
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
            <button
              onClick={() => {
                if (showForm) {
                  setShowForm(false);
                  setUseCustomGroup(false);
                  setCustomGroup('');
                  setFormData({
                    code: '',
                    name: '',
                    type: 'expense',
                    accountGroup: ACCOUNT_GROUPS['expense'][0] || '',
                    description: '',
                  });
                } else {
                  const defaultType: AccountType = 'expense';
                  const defaultGroup = ACCOUNT_GROUPS[defaultType][0] || '';
                  setUseCustomGroup(false);
                  setCustomGroup('');
                  setFormData({
                    code: getSuggestedCode(suggestedCodes, defaultGroup),
                    name: '',
                    type: defaultType,
                    accountGroup: defaultGroup,
                    description: ''
                  });
                  setShowForm(true);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              {showForm ? 'Cancel' : 'Add Account'}
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="mb-4 p-3 bg-blue-50 text-blue-700 rounded-lg no-print">{actionMessage}</div>
        )}

        {/* Create Account Form - Sticky when open */}
        {showForm && (
          <div className="sticky top-0 z-40 -mx-8 px-8 py-4 bg-gray-100 no-print">
            <div className="bg-white border rounded-lg p-6 shadow-lg">
              <h2 className="text-lg font-semibold mb-4 text-gray-900">New Account</h2>
              {formError && !editingAccount && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded text-sm">{formError}</div>}
              <form onSubmit={createAccount} className="grid grid-cols-1 md:grid-cols-6 gap-4 items-end">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Code</label>
                  <input type="text" required value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400" placeholder="e.g., 6300" />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Name</label>
                  <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400" placeholder="e.g., Training Expense" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                  <select value={formData.type} onChange={(e) => {
                    const newType = e.target.value as AccountType;
                    const groups = ACCOUNT_GROUPS[newType] || [];
                    const newGroup = groups[0] || '';
                    setUseCustomGroup(false);
                    setCustomGroup('');
                    setFormData({
                      ...formData,
                      type: newType,
                      accountGroup: newGroup,
                      code: getSuggestedCode(suggestedCodes, newGroup)
                    });
                  }}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900">
                    {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
                  {useCustomGroup ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={customGroup}
                        onChange={(e) => {
                          setCustomGroup(e.target.value);
                          setFormData({
                            ...formData,
                            accountGroup: e.target.value,
                          });
                        }}
                        className="flex-1 border rounded-lg px-3 py-2 text-sm text-gray-900"
                        placeholder="Enter new group name"
                        required
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setUseCustomGroup(false);
                          const groups = ACCOUNT_GROUPS[formData.type] || [];
                          const firstGroup = groups[0] || '';
                          setFormData({
                            ...formData,
                            accountGroup: firstGroup,
                            code: getSuggestedCode(suggestedCodes, firstGroup)
                          });
                        }}
                        className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                        title="Cancel custom group"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.accountGroup}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setUseCustomGroup(true);
                          setCustomGroup('');
                          setFormData({ ...formData, accountGroup: '' });
                        } else {
                          const newGroup = e.target.value;
                          setFormData({
                            ...formData,
                            accountGroup: newGroup,
                            code: getSuggestedCode(suggestedCodes, newGroup)
                          });
                        }
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                      required
                    >
                      {(ACCOUNT_GROUPS[formData.type] || []).map((g) => (
                        <option key={g} value={g}>{g}</option>
                      ))}
                      <option value="__custom__">+ Add new group...</option>
                    </select>
                  )}
                </div>
                <div>
                  <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                    Create Account
                  </button>
                </div>
              </form>
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="Optional description for this account" />
              </div>
            </div>
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
                      const newType = e.target.value as AccountType;
                      const groups = ACCOUNT_GROUPS[newType] || [];
                      setEditUseCustomGroup(false);
                      setEditCustomGroup('');
                      setFormData({ ...formData, type: newType, accountGroup: groups[0] || '' });
                    }}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900">
                      {ACCOUNT_TYPES.map((t) => <option key={t} value={t}>{ACCOUNT_TYPE_LABELS[t]}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
                    {editUseCustomGroup ? (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={editCustomGroup}
                          onChange={(e) => {
                            setEditCustomGroup(e.target.value);
                            setFormData({ ...formData, accountGroup: e.target.value });
                          }}
                          className="flex-1 border rounded-lg px-3 py-2 text-sm text-gray-900"
                          placeholder="Enter new group name"
                          required
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setEditUseCustomGroup(false);
                            const groups = ACCOUNT_GROUPS[formData.type] || [];
                            setFormData({ ...formData, accountGroup: groups[0] || '' });
                          }}
                          className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700"
                          title="Cancel custom group"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <select
                        value={(ACCOUNT_GROUPS[formData.type] || []).includes(formData.accountGroup) ? formData.accountGroup : '__custom__'}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setEditUseCustomGroup(true);
                            setEditCustomGroup(formData.accountGroup);
                          } else {
                            setFormData({ ...formData, accountGroup: e.target.value });
                          }
                        }}
                        className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                        required
                      >
                        {(ACCOUNT_GROUPS[formData.type] || []).map((g) => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                        {!(ACCOUNT_GROUPS[formData.type] || []).includes(formData.accountGroup) && formData.accountGroup && (
                          <option value="__custom__">{formData.accountGroup} (custom)</option>
                        )}
                        <option value="__custom__">+ Add new group...</option>
                      </select>
                    )}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description (optional)</label>
                  <input type="text" value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div className="border-t pt-4">
                  <label className="block text-sm font-semibold text-gray-700 mb-3">Opening Balance</label>
                  {loadingOB ? (
                    <p className="text-xs text-gray-400">Loading...</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                        <input
                          type="number"
                          step="0.01"
                          value={editOBAmount}
                          onChange={(e) => setEditOBAmount(e.target.value)}
                          placeholder="0.00"
                          className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-1">As of Date</label>
                        <input
                          type="date"
                          value={editOBDate}
                          onChange={(e) => setEditOBDate(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                        />
                      </div>
                    </div>
                  )}
                  {!loadingOB && !editOBAmount && !editOpeningBalance && (
                    <p className="text-xs text-gray-400 mt-1">Leave blank if no opening balance is needed.</p>
                  )}
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
          <span className="text-xs text-gray-400">Click column headers to sort. Click again to reverse.</span>
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

        {/* Account Groups - Type -> Group -> Accounts */}
        {ACCOUNT_TYPES.map((type) => {
          const typeData = groupedData[type];
          const groups = Object.keys(typeData);
          if (groups.length === 0) return null;

          const typeLabel = ACCOUNT_TYPE_LABELS[type] || type;

          return (
            <div key={type} className="mb-8 report-section">
              {/* Type Header */}
              <div className={`px-4 py-3 ${typeColors[type]} section-header rounded-t-lg`}>
                <div className="flex justify-between items-center">
                  <h2 className="text-sm font-semibold uppercase tracking-wide">{typeLabel}</h2>
                  <span className={`text-sm font-semibold ${typeTotals[type] < 0 ? 'text-red-600' : ''}`}>
                    {formatCurrency(typeTotals[type])}
                  </span>
                </div>
              </div>

              <div className="bg-white rounded-b-lg shadow overflow-hidden">
                {groups.map((group, groupIdx) => {
                  const groupAccounts = typeData[group];
                  const groupTotal = groupAccounts.reduce((sum, a) => sum + a.balance, 0);

                  return (
                    <div key={group} className={groupIdx > 0 ? 'border-t-2 border-gray-200' : ''}>
                      {/* Group Header */}
                      <div className={`px-4 py-2 bg-gray-50 border-b flex justify-between items-center`}>
                        <h3 className="text-sm font-medium text-gray-700">{group}</h3>
                        <span className={`text-sm font-medium ${groupTotal < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                          {formatCurrency(groupTotal)}
                        </span>
                      </div>

                      {/* Accounts Table */}
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
                          {groupAccounts.map((acct) => (
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
                      </table>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
    </PrintLayout>
  );
}
