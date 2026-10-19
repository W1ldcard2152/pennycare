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

  // Reset-password dialog — in-page, not window.prompt(): Electron doesn't
  // implement prompt(), so in the desktop app Reset password did nothing.
  const [resetting, setResetting] = useState<ManagedUser | null>(null);
  const [resetPw, setResetPw] = useState('');
  const [resetErr, setResetErr] = useState('');

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

  const patch = async (id: string, body: Record<string, unknown>, successMsg: string): Promise<string | null> => {
    setError('');
    const res = await fetch(`/api/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg = data.error || 'Action failed';
      setError(msg);
      return msg;
    }
    flash(successMsg);
    load();
    return null;
  };

  const openReset = (u: ManagedUser) => {
    setResetting(u);
    setResetPw('');
    setResetErr('');
  };

  const confirmReset = async () => {
    if (!resetting) return;
    if (resetPw.length < 8) { setResetErr('Temporary password must be at least 8 characters'); return; }
    const err = await patch(resetting.id, { action: 'reset_password', temporaryPassword: resetPw }, `Password reset for ${resetting.email}.`);
    if (err) { setResetErr(err); return; }
    setResetting(null);
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
                    <button onClick={() => openReset(u)} className="text-blue-600 hover:text-blue-700 text-xs">
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

      {resetting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-gray-900">Reset password</h3>
            <p className="mt-1 text-sm text-gray-600">
              Enter a temporary password for {resetting.email} (at least 8 characters). They&apos;ll be asked to change it at next login.
            </p>
            {resetErr && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{resetErr}</div>}
            <input
              type="text"
              value={resetPw}
              onChange={(e) => setResetPw(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmReset(); }}
              autoFocus
              placeholder="Temporary password"
              className="mt-4 w-full border rounded px-3 py-2 text-sm text-gray-900"
            />
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setResetting(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmReset}
                disabled={!resetPw}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                Reset password
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
