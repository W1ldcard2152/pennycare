'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', address: '', city: '', state: '', zipCode: '', taxId: '', notes: '',
  });
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [vendorExpenses, setVendorExpenses] = useState<Expense[]>([]);
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [editData, setEditData] = useState({
    name: '', email: '', phone: '', address: '', city: '', state: '', zipCode: '', taxId: '', notes: '',
  });

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
    setSelectedVendor(vendor);
    try {
      const res = await fetch(`/api/bookkeeping/vendors/${vendor.id}`);
      const data = await res.json();
      setVendorExpenses(data.expenses || []);
    } catch {
      setVendorExpenses([]);
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

  const deleteVendor = async (id: string, name: string) => {
    if (!confirm(`Delete vendor "${name}"? If they have expenses, they'll be deactivated instead.`)) return;
    try {
      const res = await fetch(`/api/bookkeeping/vendors/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || 'Failed to delete vendor');
        return;
      }
      if (data.deactivated) {
        alert(data.message);
      }
      setSelectedVendor(null);
      fetchVendors();
    } catch {
      alert('Failed to delete vendor');
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  if (loading) return <div className="p-8"><p className="text-gray-600">Loading vendors...</p></div>;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-600 text-sm">Vendors</span>
            </div>
            <h1 className="text-3xl font-bold">Vendors</h1>
            <p className="text-gray-600 mt-1">{vendors.length} vendor{vendors.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setSelectedVendor(null); setEditingVendor(null); }}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {showForm ? 'Cancel' : 'Add Vendor'}
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="mb-6 bg-white border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">New Vendor</h2>
            {formError && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded text-sm">{formError}</div>}
            <form onSubmit={createVendor} className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                <input type="text" required value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Vendor name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input type="email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input type="text" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax ID</label>
                <input type="text" value={formData.taxId} onChange={(e) => setFormData({ ...formData, taxId: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input type="text" value={formData.address} onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                  <input type="text" value={formData.city} onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <input type="text" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" maxLength={2} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Zip</label>
                  <input type="text" value={formData.zipCode} onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                <textarea value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
              </div>
              <div className="md:col-span-2">
                <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                  Create Vendor
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Vendor List */}
          <div className="lg:col-span-2">
            {vendors.length === 0 ? (
              <div className="text-center py-16 bg-gray-50 rounded-lg">
                <p className="text-gray-600 text-lg">No vendors yet</p>
                <p className="text-gray-500 mt-2">Add your first vendor to start tracking expenses by supplier.</p>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Contact</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Expenses</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase w-20">Status</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {vendors.map((v) => (
                      <tr
                        key={v.id}
                        className={`cursor-pointer hover:bg-gray-50 ${selectedVendor?.id === v.id ? 'bg-blue-50' : ''} ${!v.isActive ? 'opacity-60' : ''}`}
                        onClick={() => viewVendor(v)}
                      >
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{v.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {v.email || v.phone || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-center text-gray-600">{v._count.expenses}</td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${v.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                            {v.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => startEdit(v)} className="text-blue-600 hover:text-blue-700 mr-3 text-xs">Edit</button>
                          <button onClick={() => deleteVendor(v.id, v.name)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
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
                <h3 className="text-lg font-semibold mb-4">Edit Vendor</h3>
                <form onSubmit={saveEdit} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                    <input type="text" required value={editData.name} onChange={(e) => setEditData({ ...editData, name: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input type="email" value={editData.email} onChange={(e) => setEditData({ ...editData, email: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input type="text" value={editData.phone} onChange={(e) => setEditData({ ...editData, phone: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                    <textarea value={editData.notes} onChange={(e) => setEditData({ ...editData, notes: e.target.value })}
                      className="w-full border rounded-lg px-3 py-2 text-sm" rows={2} />
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors">Save</button>
                    <button type="button" onClick={() => setEditingVendor(null)} className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors">Cancel</button>
                  </div>
                </form>
              </div>
            ) : selectedVendor ? (
              <div className="bg-white border rounded-lg p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-2">{selectedVendor.name}</h3>
                {selectedVendor.email && <p className="text-sm text-gray-600">{selectedVendor.email}</p>}
                {selectedVendor.phone && <p className="text-sm text-gray-600">{selectedVendor.phone}</p>}
                {selectedVendor.address && (
                  <p className="text-sm text-gray-500 mt-1">
                    {selectedVendor.address}{selectedVendor.city ? `, ${selectedVendor.city}` : ''}{selectedVendor.state ? `, ${selectedVendor.state}` : ''} {selectedVendor.zipCode || ''}
                  </p>
                )}
                {selectedVendor.notes && <p className="text-sm text-gray-500 mt-2 italic">{selectedVendor.notes}</p>}

                <h4 className="text-sm font-semibold mt-6 mb-2 text-gray-700">Recent Expenses ({selectedVendor._count.expenses})</h4>
                {vendorExpenses.length === 0 ? (
                  <p className="text-sm text-gray-400">No expenses recorded</p>
                ) : (
                  <div className="space-y-2">
                    {vendorExpenses.slice(0, 10).map((exp) => (
                      <div key={exp.id} className="flex justify-between items-center text-sm">
                        <div>
                          <span className="text-gray-500">{new Date(exp.date).toLocaleDateString()}</span>
                          <span className="ml-2 text-gray-700">{exp.description}</span>
                        </div>
                        <span className="font-medium">{formatCurrency(exp.amount)}</span>
                      </div>
                    ))}
                  </div>
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
