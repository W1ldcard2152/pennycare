'use client';

import { useEffect, useState } from 'react';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype: string | null;
  description: string | null;
  isActive: boolean;
}

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'revenue', 'expense'];

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInactive, setShowInactive] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({ code: '', name: '', type: 'expense', subtype: '', description: '' });
  const [formError, setFormError] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  useEffect(() => { fetchAccounts(); }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts');
      const data = await res.json();
      setAccounts(data);
    } catch { /* ignore */ } finally { setLoading(false); }
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
    } catch { /* ignore */ }
  };

  const filtered = showInactive ? accounts : accounts.filter((a) => a.isActive);

  const groupedByType = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = filtered.filter((a) => a.type === type);
    return acc;
  }, {} as Record<string, Account[]>);

  if (loading) return <div className="p-8"><p className="text-gray-600">Loading accounts...</p></div>;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
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

        {/* Show Inactive Toggle */}
        <div className="mb-4">
          <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input type="checkbox" checked={showInactive} onChange={() => setShowInactive(!showInactive)} className="rounded" />
            Show inactive accounts ({accounts.filter((a) => !a.isActive).length})
          </label>
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
          const typeColors: Record<string, string> = {
            asset: 'bg-blue-50 text-blue-700',
            liability: 'bg-red-50 text-red-700',
            equity: 'bg-purple-50 text-purple-700',
            revenue: 'bg-green-50 text-green-700',
            expense: 'bg-orange-50 text-orange-700',
          };

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
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-24">Code</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-20">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-40">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {accts.map((acct) => (
                      <tr key={acct.id} className={acct.isActive ? '' : 'bg-gray-50 opacity-60'}>
                        <td className="px-4 py-3 text-sm font-mono text-gray-900">{acct.code}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{acct.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{acct.description || '—'}</td>
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
                </table>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
