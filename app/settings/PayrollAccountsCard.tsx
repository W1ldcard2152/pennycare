'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircleIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

type Role = 'wages' | 'employerTaxes' | 'taxAdjustments';

interface AccountRef {
  id: string;
  code: string;
  name: string;
}

type RoleStatus = {
  role: Role;
  label: string;
  standardCode: string;
  chosenAccountId: string | null;
} & (
  | { status: 'mapped' | 'standard'; account: AccountRef }
  | { status: 'will_create'; code: string; name: string }
  | { status: 'problem'; message: string }
);

interface Payload {
  roles: RoleStatus[];
  expenseAccounts: AccountRef[];
}

/**
 * Settings → Payroll → Payroll Accounts: which expense accounts payroll posts
 * gross wages, employer taxes and filed-return adjustments to. Needed when a
 * chart uses 6000 / 6010 / 6020 for something else (lib/payroll-accounts.ts).
 */
export default function PayrollAccountsCard() {
  const [data, setData] = useState<Payload | null>(null);
  const [hidden, setHidden] = useState(false);
  const [choices, setChoices] = useState<Record<Role, string>>({ wages: '', employerTaxes: '', taxAdjustments: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch('/api/payroll/accounts');
    if (res.status === 401 || res.status === 403) {
      setHidden(true);
      return;
    }
    const body = await res.json();
    if (!res.ok) {
      setErr(body.error || 'Failed to load payroll accounts');
      return;
    }
    setData(body);
    setChoices(
      Object.fromEntries((body as Payload).roles.map((r) => [r.role, r.chosenAccountId ?? ''])) as Record<Role, string>
    );
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (hidden) return null;

  const dirty = !!data && data.roles.some((r) => (r.chosenAccountId ?? '') !== choices[r.role]);

  const save = async () => {
    setSaving(true);
    setErr('');
    setSaved(false);
    try {
      const res = await fetch('/api/payroll/accounts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          Object.fromEntries(Object.entries(choices).map(([role, id]) => [role, id || null]))
        ),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to save');
      await load();
      setSaved(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg bg-white p-6 shadow">
      <h3 className="mb-1 text-lg font-semibold text-gray-900">Payroll Accounts</h3>
      <p className="mb-4 text-sm text-gray-600">
        The expense accounts each payroll run and each filed 941 / NYS-45 post to. Standard uses the
        usual code when the account there is the right kind. Changes apply to entries posted from now
        on — to move past entries, use Bulk reclassify on the account&apos;s page.
      </p>

      {err && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}
      {!data && !err && <p className="text-sm text-gray-500">Loading…</p>}

      {data && (
        <div className="space-y-4">
          {data.roles.map((r) => {
            const standardLabel =
              r.status === 'standard'
                ? `Standard — ${r.account.code} ${r.account.name}`
                : r.status === 'will_create'
                  ? `Standard — create ${r.code} ${r.name}`
                  : `Standard — ${r.standardCode}`;
            const unsaved = (r.chosenAccountId ?? '') !== choices[r.role];
            return (
              <div key={r.role} className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:items-start">
                <label htmlFor={`payroll-acct-${r.role}`} className="pt-2 text-sm font-medium text-gray-700">
                  {r.label}
                </label>
                <div className="sm:col-span-2">
                  <select
                    id={`payroll-acct-${r.role}`}
                    value={choices[r.role]}
                    onChange={(e) => {
                      setSaved(false);
                      setChoices((c) => ({ ...c, [r.role]: e.target.value }));
                    }}
                    className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  >
                    <option value="">{standardLabel}</option>
                    {data.expenseAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name}
                      </option>
                    ))}
                  </select>
                  <div className="mt-1 text-xs">
                    {unsaved ? (
                      <span className="text-gray-500">Save to apply.</span>
                    ) : r.status === 'problem' ? (
                      <span className="flex gap-1.5 text-red-700">
                        <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                        {r.message}
                      </span>
                    ) : r.status === 'will_create' ? (
                      <span className="text-gray-500">
                        {r.code} {r.name} will be created the first time it&apos;s needed.
                      </span>
                    ) : (
                      <span className="flex gap-1.5 text-green-700">
                        <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
                        Posting to {r.account.code} {r.account.name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-green-700">Saved</span>}
            <button
              type="button"
              onClick={save}
              disabled={saving || !dirty}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save payroll accounts'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
