'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Vendor {
  id: string;
  name: string;
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface Expense {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
  paymentMethod: string | null;
  referenceNumber: string | null;
  isPaid: boolean;
  paidDate: string | null;
  notes: string | null;
  vendor: Vendor | null;
}

const CATEGORIES = [
  'parts', 'supplies', 'utilities', 'rent', 'insurance', 'tools', 'vehicle',
  'advertising', 'office', 'professional_fees', 'bank_fees', 'platform_fees',
  'shipping', 'licenses', 'miscellaneous',
];

const PAYMENT_METHODS = ['cash', 'check', 'card', 'transfer'];

function formatCategory(cat: string) {
  return cat.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [showAccounting, setShowAccounting] = useState(false);

  // Filters
  const [filterCategory, setFilterCategory] = useState('');
  const [filterVendor, setFilterVendor] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');

  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    vendorId: '',
    description: '',
    category: 'miscellaneous',
    amount: '',
    paymentMethod: '',
    referenceNumber: '',
    debitAccountId: '',
    creditAccountId: '',
    isPaid: false,
    paidDate: '',
    notes: '',
  });

  useEffect(() => {
    fetchExpenses();
    fetchVendors();
    fetchAccounts();
  }, []);

  const fetchExpenses = async () => {
    try {
      const params = new URLSearchParams();
      if (filterCategory) params.set('category', filterCategory);
      if (filterVendor) params.set('vendorId', filterVendor);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      params.set('limit', '100');

      const res = await fetch(`/api/bookkeeping/expenses?${params}`);
      const data = await res.json();
      setExpenses(data.expenses || []);
      setTotal(data.total || 0);
    } catch {
      // handled by empty state
    } finally {
      setLoading(false);
    }
  };

  const fetchVendors = async () => {
    try {
      const res = await fetch('/api/bookkeeping/vendors');
      const data = await res.json();
      setVendors(data.filter((v: Vendor & { isActive?: boolean }) => v.isActive !== false));
    } catch {
      // handled by empty state
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts');
      const data = await res.json();
      setAccounts(data.filter((a: Account & { isActive?: boolean }) => a.isActive !== false));
    } catch {
      // handled by empty state
    }
  };

  const applyFilters = () => {
    setLoading(true);
    fetchExpenses();
  };

  const clearFilters = () => {
    setFilterCategory('');
    setFilterVendor('');
    setFilterStartDate('');
    setFilterEndDate('');
    setLoading(true);
    setTimeout(() => fetchExpenses(), 0);
  };

  const createExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      const res = await fetch('/api/bookkeeping/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          vendorId: formData.vendorId || null,
          paymentMethod: formData.paymentMethod || null,
          referenceNumber: formData.referenceNumber || null,
          debitAccountId: formData.debitAccountId || null,
          creditAccountId: formData.creditAccountId || null,
          paidDate: formData.paidDate || null,
          notes: formData.notes || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Failed to create expense');
        return;
      }
      setShowForm(false);
      setFormData({
        date: new Date().toISOString().split('T')[0], vendorId: '', description: '',
        category: 'miscellaneous', amount: '', paymentMethod: '', referenceNumber: '',
        debitAccountId: '', creditAccountId: '', isPaid: false, paidDate: '', notes: '',
      });
      setShowAccounting(false);
      fetchExpenses();
    } catch {
      setFormError('Failed to create expense');
    }
  };

  const deleteExpense = async (id: string, desc: string) => {
    if (!confirm(`Delete expense "${desc}"?`)) return;
    try {
      const res = await fetch(`/api/bookkeeping/expenses/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to delete expense');
        return;
      }
      fetchExpenses();
    } catch {
      alert('Failed to delete expense');
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const expenseAccounts = accounts.filter((a) => a.type === 'expense');
  const cashAccounts = accounts.filter((a) => a.type === 'asset');

  if (loading) return <div className="p-8"><p className="text-gray-600">Loading expenses...</p></div>;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-600 text-sm">Expenses</span>
            </div>
            <h1 className="text-3xl font-bold">Expenses</h1>
            <p className="text-gray-600 mt-1">{total} expense{total !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {showForm ? 'Cancel' : 'Add Expense'}
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="mb-6 bg-white border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">New Expense</h2>
            {formError && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded text-sm">{formError}</div>}
            <form onSubmit={createExpense} className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                <input type="date" required value={formData.date} onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
                <select value={formData.vendorId} onChange={(e) => setFormData({ ...formData, vendorId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">No vendor</option>
                  {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                <select required value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{formatCategory(c)}</option>)}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                <input type="text" required value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                <input type="number" required step="0.01" min="0.01" value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="0.00" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select value={formData.paymentMethod} onChange={(e) => setFormData({ ...formData, paymentMethod: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm">
                  <option value="">Select...</option>
                  {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m.charAt(0).toUpperCase() + m.slice(1)}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reference #</label>
                <input type="text" value={formData.referenceNumber} onChange={(e) => setFormData({ ...formData, referenceNumber: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                  <input type="checkbox" checked={formData.isPaid}
                    onChange={(e) => setFormData({ ...formData, isPaid: e.target.checked, paidDate: e.target.checked ? formData.date : '' })}
                    className="rounded" />
                  Paid
                </label>
                {formData.isPaid && (
                  <input type="date" value={formData.paidDate} onChange={(e) => setFormData({ ...formData, paidDate: e.target.value })}
                    className="border rounded-lg px-3 py-2 text-sm" />
                )}
              </div>

              {/* Accounting Section */}
              <div className="md:col-span-3">
                <button type="button" onClick={() => setShowAccounting(!showAccounting)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                  {showAccounting ? 'Hide' : 'Show'} Accounting (Journal Entry)
                </button>
              </div>
              {showAccounting && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Debit Account (Expense)</label>
                    <select value={formData.debitAccountId} onChange={(e) => setFormData({ ...formData, debitAccountId: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">Select account...</option>
                      {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Credit Account (Cash/Bank)</label>
                    <select value={formData.creditAccountId} onChange={(e) => setFormData({ ...formData, creditAccountId: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm">
                      <option value="">Select account...</option>
                      {cashAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                    </select>
                  </div>
                  <div className="flex items-end text-xs text-gray-500">
                    If both accounts are selected, a journal entry will be automatically created.
                  </div>
                </>
              )}

              <div className="md:col-span-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div className="md:col-span-3">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                  Create Expense
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="mb-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Category</label>
            <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{formatCategory(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Vendor</label>
            <select value={filterVendor} onChange={(e) => setFilterVendor(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="">All</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start Date</label>
            <input type="date" value={filterStartDate} onChange={(e) => setFilterStartDate(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">End Date</label>
            <input type="date" value={filterEndDate} onChange={(e) => setFilterEndDate(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm" />
          </div>
          <button onClick={applyFilters} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
            Apply
          </button>
          <button onClick={clearFilters} className="text-gray-500 hover:text-gray-700 px-2 py-1.5 text-sm transition-colors">
            Clear
          </button>
        </div>

        {/* Expense Table */}
        {expenses.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-lg">
            <p className="text-gray-600 text-lg">No expenses found</p>
            <p className="text-gray-500 mt-2">Add an expense to start tracking your business spending.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Vendor</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Paid</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-20">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {expenses.map((exp) => (
                  <tr key={exp.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-600">{new Date(exp.date).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-sm text-gray-700">{exp.vendor?.name || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{exp.description}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {formatCategory(exp.category)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium">{formatCurrency(exp.amount)}</td>
                    <td className="px-4 py-3 text-sm text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${exp.isPaid ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {exp.isPaid ? 'Paid' : 'Unpaid'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button onClick={() => deleteExpense(exp.id, exp.description)} className="text-red-500 hover:text-red-700 text-xs">
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
