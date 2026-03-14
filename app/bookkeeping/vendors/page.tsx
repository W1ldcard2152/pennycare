'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MagnifyingGlassIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  EyeSlashIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';

interface Vendor {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  taxId: string | null;
  notes: string | null;
  isActive: boolean;
  _count: { expenses: number };
}

interface Expense {
  id: string;
  date: string;
  description: string;
  category: string;
  amount: number;
}

interface VendorDetail extends Vendor {
  expenses: Expense[];
}

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', address: '', city: '', state: '', zipCode: '', taxId: '', notes: '',
  });
  const [selectedVendor, setSelectedVendor] = useState<VendorDetail | null>(null);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [editData, setEditData] = useState({
    name: '', email: '', phone: '', address: '', city: '', state: '', zipCode: '', taxId: '', notes: '',
  });

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  useEffect(() => { fetchVendors(); }, []);

  const fetchVendors = async () => {
    try {
      const res = await fetch('/api/bookkeeping/vendors');
      const data = await res.json();
      setVendors(data);
    } catch {
      // handled by empty state
    } finally {
      setLoading(false);
    }
  };

  const createVendor = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    try {
      const res = await fetch('/api/bookkeeping/vendors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Failed to create vendor');
        return;
      }
      setShowForm(false);
      setFormData({ name: '', email: '', phone: '', address: '', city: '', state: '', zipCode: '', taxId: '', notes: '' });
      fetchVendors();
    } catch {
      setFormError('Failed to create vendor');
    }
  };

  const viewVendor = async (vendor: Vendor) => {
    try {
      const res = await fetch(`/api/bookkeeping/vendors/${vendor.id}`);
      const data = await res.json();
      setSelectedVendor(data);
    } catch {
      setSelectedVendor({ ...vendor, expenses: [] });
    }
  };

  const startEdit = (vendor: Vendor) => {
    setEditingVendor(vendor);
    setEditData({
      name: vendor.name,
      email: vendor.email || '',
      phone: vendor.phone || '',
      address: vendor.address || '',
      city: vendor.city || '',
      state: vendor.state || '',
      zipCode: vendor.zipCode || '',
      taxId: vendor.taxId || '',
      notes: vendor.notes || '',
    });
  };

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingVendor) return;
    try {
      const res = await fetch(`/api/bookkeeping/vendors/${editingVendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editData),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to update vendor');
        return;
      }
      setEditingVendor(null);
      setSelectedVendor(null);
      fetchVendors();
    } catch {
      alert('Failed to update vendor');
    }
  };

  const reactivateVendor = async (vendor: Vendor) => {
    try {
      const res = await fetch(`/api/bookkeeping/vendors/${vendor.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: true }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to reactivate vendor');
        return;
      }
      fetchVendors();
      if (selectedVendor?.id === vendor.id) {
        setSelectedVendor({ ...selectedVendor, isActive: true });
      }
    } catch {
      alert('Failed to reactivate vendor');
    }
  };

  const deleteVendor = async (id: string, name: string, hasExpenses: boolean) => {
    const message = hasExpenses
      ? `Deactivate vendor "${name}"? They have expenses so cannot be fully deleted.`
      : `Delete vendor "${name}"? This cannot be undone.`;
    if (!confirm(message)) return;
    try {
      const res = await fetch(`/api/bookkeeping/vendors/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to delete vendor');
        return;
      }
      if (data.deactivated) {
        alert('Vendor deactivated (has associated expenses)');
      }
      setSelectedVendor(null);
      fetchVendors();
    } catch {
      alert('Failed to delete vendor');
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  // Filter vendors
  const filteredVendors = vendors.filter((v) => {
    const matchesSearch = !searchQuery || v.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesActive = showInactive || v.isActive;
    return matchesSearch && matchesActive;
  });

  // Calculate total spent for selected vendor
  const totalSpent = selectedVendor?.expenses.reduce((sum, e) => sum + e.amount, 0) || 0;

  if (loading) return <div className="p-8"><p className="text-gray-600">Loading vendors...</p></div>;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">Dashboard</Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-600 text-sm">Vendors</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Vendors</h1>
            <p className="text-gray-600 mt-1">
              {filteredVendors.length} vendor{filteredVendors.length !== 1 ? 's' : ''}
              {!showInactive && vendors.some(v => !v.isActive) && (
                <span className="text-gray-400 ml-2">
                  ({vendors.filter(v => !v.isActive).length} inactive hidden)
                </span>
              )}
            </p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setSelectedVendor(null); setEditingVendor(null); }}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            {showForm ? 'Cancel' : 'Add Vendor'}
          </button>
        </div>

        {/* Search and Filters */}
        <div className="mb-4 flex flex-wrap gap-3 items-center">
          <div className="relative flex-1 max-w-xs">
            <MagnifyingGlassIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search vendors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded-lg text-sm text-gray-900 placeholder-gray-400"
            />
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(e) => setShowInactive(e.target.checked)}
              className="rounded"
            />
            Show inactive vendors
          </label>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="mb-6 bg-white border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4 text-gray-900">New Vendor</h2>
            {formError && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded text-sm">{formError}</div>}
            <form onSubmit={createVendor} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400" placeholder="Vendor name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID</label>
                <input type="text" value={formData.taxId} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" placeholder="EIN or SSN" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input type="text" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" maxLength={2} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zip</label>
                  <input type="text" value={formData.zipCode} onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" rows={2} />
              </div>
              <div className="md:col-span-2 flex gap-3">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                  Create Vendor
                </button>
                <button type="button" onClick={() => setShowForm(false)} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Vendor List */}
          <div className="lg:col-span-2">
            {filteredVendors.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 rounded-lg">
                <p className="text-gray-600 text-lg">
                  {searchQuery ? 'No vendors match your search' : 'No vendors yet'}
                </p>
                <p className="text-gray-500 mt-2">
                  {searchQuery ? 'Try a different search term' : 'Add your first vendor to start tracking expenses by supplier.'}
                </p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Location</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Expenses</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-20">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {filteredVendors.map((v) => (
                      <tr
                        key={v.id}
                        className={`cursor-pointer hover:bg-gray-50 ${selectedVendor?.id === v.id ? 'bg-blue-50' : ''} ${!v.isActive ? 'opacity-50' : ''}`}
                        onClick={() => viewVendor(v)}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{v.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {v.email || v.phone || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {v.city && v.state ? `${v.city}, ${v.state}` : v.city || v.state || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-gray-600">{v._count.expenses}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {v.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => startEdit(v)} className="text-blue-600 hover:text-blue-700 p-1" title="Edit">
                            <PencilIcon className="w-4 h-4" />
                          </button>
                          {!v.isActive ? (
                            <button onClick={() => reactivateVendor(v)} className="text-green-600 hover:text-green-700 p-1 ml-1" title="Reactivate">
                              <ArrowPathIcon className="w-4 h-4" />
                            </button>
                          ) : v._count.expenses > 0 ? (
                            <button onClick={() => deleteVendor(v.id, v.name, true)} className="text-yellow-600 hover:text-yellow-700 p-1 ml-1" title="Deactivate">
                              <EyeSlashIcon className="w-4 h-4" />
                            </button>
                          ) : (
                            <button onClick={() => deleteVendor(v.id, v.name, false)} className="text-red-500 hover:text-red-700 p-1 ml-1" title="Delete">
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Vendor Detail Panel */}
          <div>
            {editingVendor ? (
              <div className="bg-white border rounded-lg p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-4 text-gray-900">Edit Vendor</h3>
                <form onSubmit={saveEdit} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input type="text" required value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="text" value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                    <input type="text" value={editData.address} onChange={(e) => setEditData({ ...editData, address: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                      <input type="text" value={editData.city} onChange={(e) => setEditData({ ...editData, city: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <input type="text" value={editData.state} onChange={(e) => setEditData({ ...editData, state: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" maxLength={2} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Zip</label>
                      <input type="text" value={editData.zipCode} onChange={(e) => setEditData({ ...editData, zipCode: e.target.value })}
                        className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID</label>
                    <input type="text" value={editData.taxId} onChange={(e) => setEditData({ ...editData, taxId: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" rows={2} />
                  </div>
                  <div className="flex gap-2 pt-2">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors">Save</button>
                    <button type="button" onClick={() => setEditingVendor(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors">Cancel</button>
                  </div>
                </form>
              </div>
            ) : selectedVendor ? (
              <div className="bg-white border rounded-lg p-6 shadow-sm">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{selectedVendor.name}</h3>
                    {!selectedVendor.isActive && (
                      <span className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
                        Inactive
                      </span>
                    )}
                  </div>
                  <button onClick={() => startEdit(selectedVendor)} className="text-blue-600 hover:text-blue-700 p-1">
                    <PencilIcon className="w-4 h-4" />
                  </button>
                </div>

                {selectedVendor.email && (
                  <p className="text-sm text-gray-600">
                    <a href={`mailto:${selectedVendor.email}`} className="hover:text-blue-600">{selectedVendor.email}</a>
                  </p>
                )}
                {selectedVendor.phone && (
                  <p className="text-sm text-gray-600">
                    <a href={`tel:${selectedVendor.phone}`} className="hover:text-blue-600">{selectedVendor.phone}</a>
                  </p>
                )}
                {(selectedVendor.address || selectedVendor.city || selectedVendor.state) && (
                  <p className="text-sm text-gray-500 mt-2">
                    {selectedVendor.address && <span>{selectedVendor.address}<br /></span>}
                    {selectedVendor.city}{selectedVendor.city && selectedVendor.state && ', '}{selectedVendor.state} {selectedVendor.zipCode}
                  </p>
                )}
                {selectedVendor.taxId && (
                  <p className="text-sm text-gray-500 mt-2">Tax ID: {selectedVendor.taxId}</p>
                )}
                {selectedVendor.notes && (
                  <p className="text-sm text-gray-500 mt-3 italic border-t pt-3">{selectedVendor.notes}</p>
                )}

                {/* Total Spent */}
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-500">Total Spent</div>
                  <div className="text-2xl font-bold text-gray-900">{formatCurrency(totalSpent)}</div>
                  <div className="text-xs text-gray-400">{selectedVendor._count.expenses} expense{selectedVendor._count.expenses !== 1 ? 's' : ''}</div>
                </div>

                {/* Recent Expenses */}
                <h4 className="text-sm font-semibold mt-6 mb-2 text-gray-700">Recent Expenses</h4>
                {selectedVendor.expenses.length === 0 ? (
                  <p className="text-sm text-gray-400">No expenses recorded</p>
                ) : (
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {selectedVendor.expenses.slice(0, 10).map((exp) => (
                      <div key={exp.id} className="flex justify-between items-center text-sm py-1 border-b border-gray-100 last:border-0">
                        <div>
                          <span className="text-gray-500">{new Date(exp.date).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' })}</span>
                          <span className="ml-2 text-gray-700">{exp.description}</span>
                        </div>
                        <span className="font-medium text-gray-900">{formatCurrency(exp.amount)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Link to Expenses filtered by vendor */}
                {selectedVendor._count.expenses > 0 && (
                  <Link
                    href={`/bookkeeping/expenses?vendorId=${selectedVendor.id}`}
                    className="inline-block mt-4 text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View all expenses from this vendor &rarr;
                  </Link>
                )}
              </div>
            ) : (
              <div className="bg-gray-50 border rounded-lg p-6 text-center text-gray-500">
                <p>Select a vendor to view details</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
