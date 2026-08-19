'use client';

import { useCallback, useEffect, useState } from 'react';

interface ManagedUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  isActive: boolean;
  mustChangePassword: boolean;
  role: 'OWNER' | 'APPROVER' | 'BOOKKEEPER' | 'VIEWER';
}

const ROLES: ManagedUser['role'][] = ['OWNER', 'APPROVER', 'BOOKKEEPER', 'VIEWER'];

export default function UsersPage() {
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ email: '', firstName: '', lastName: '', temporaryPassword: '', role: 'BOOKKEEPER' as ManagedUser['role'] });

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/users');
      if (res.status === 403) {
        setError('Only an owner can manage users.');
        setUsers([]);
        return;
      }
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to load users');
        return;
      }
      setUsers(data.users);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const flash = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 4000);
  };

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to create user');
      return;
    }
    setShowCreate(false);
    setForm({ email: '', firstName: '', lastName: '', temporaryPassword: '', role: 'BOOKKEEPER' });
    flash(`Created ${data.email}. They must change their temporary password at first login.`);
    load();
  };

  const patch = async (id: string, body: Record<string, unknown>, successMsg: string) => {
    setError('');
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Action failed');
      return;
    }
    flash(successMsg);
    load();
  };

  const resetPassword = (u: ManagedUser) => {
    const temp = prompt(`Enter a temporary password for ${u.email} (min 8 chars). They'll be forced to change it at next login.`);
    if (!temp) return;
    if (temp.length < 8) { setError('Temporary password must be at least 8 characters'); return; }
    patch(u.id, { action: 'reset_password', temporaryPassword: temp }, `Password reset for ${u.email}.`);
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Users</h1>
          <p className="text-sm text-gray-600 mt-1">Manage who can access this company and what they can do.</p>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
        >
          {showCreate ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
      {notice && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">{notice}</div>}

      {showCreate && (
        <form onSubmit={createUser} className="mb-6 bg-white border rounded-lg p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input required placeholder="Email" type="email" value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            className="border rounded px-3 py-2 text-sm text-gray-900" />
          <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as ManagedUser['role'] })}
            className="border rounded px-3 py-2 text-sm text-gray-900">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input required placeholder="First name" value={form.firstName}
            onChange={(e) => setForm({ ...form, firstName: e.target.value })}
            className="border rounded px-3 py-2 text-sm text-gray-900" />
          <input required placeholder="Last name" value={form.lastName}
            onChange={(e) => setForm({ ...form, lastName: e.target.value })}
            className="border rounded px-3 py-2 text-sm text-gray-900" />
          <input required placeholder="Temporary password (min 8)" type="text" value={form.temporaryPassword}
            onChange={(e) => setForm({ ...form, temporaryPassword: e.target.value })}
            className="border rounded px-3 py-2 text-sm text-gray-900 md:col-span-2" />
          <div className="md:col-span-2">
            <button type="submit" className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium">
              Create user
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Name</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Email</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Role</th>
                <th className="text-left px-4 py-2 font-medium text-gray-700">Status</th>
                <th className="text-right px-4 py-2 font-medium text-gray-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b last:border-0">
                  <td className="px-4 py-2 text-gray-900">{u.firstName} {u.lastName}</td>
                  <td className="px-4 py-2 text-gray-600">{u.email}</td>
                  <td className="px-4 py-2">
                    <select
                      value={u.role}
                      onChange={(e) => patch(u.id, { action: 'change_role', role: e.target.value }, `Role updated for ${u.email}.`)}
                      className="border rounded px-2 py-1 text-xs text-gray-900"
                    >
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600'}`}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {u.mustChangePassword && (
                      <span className="ml-1 inline-block px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700">
                        Temp password
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right space-x-2 whitespace-nowrap">
                    <button onClick={() => resetPassword(u)} className="text-blue-600 hover:text-blue-700 text-xs">
                      Reset password
                    </button>
                    {u.isActive ? (
                      <button onClick={() => patch(u.id, { action: 'deactivate' }, `${u.email} deactivated.`)} className="text-red-600 hover:text-red-700 text-xs">
                        Deactivate
                      </button>
                    ) : (
                      <button onClick={() => patch(u.id, { action: 'reactivate' }, `${u.email} reactivated.`)} className="text-green-600 hover:text-green-700 text-xs">
                        Reactivate
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
  );
}
