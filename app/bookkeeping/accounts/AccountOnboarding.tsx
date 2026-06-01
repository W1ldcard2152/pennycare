'use client';

// Tiered onboarding for the chart of accounts. Two modes:
//   - 'setup': full 3-step flow (tier picker → customize → preview/confirm).
//     Renders inline on the accounts page when the company has zero accounts.
//   - 'add': skip step 1; opens directly to the customize grid filtered to
//     codes the company doesn't already have. Renders as a modal.
//
// Both modes call the seed endpoint when the user confirms.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type Tier = 'basic' | 'business' | 'business_payroll';

interface CatalogAccount {
  code: string;
  name: string;
  type: string;
  accountGroup: string;
  description: string;
  taxLine?: string;
  tier: Tier;
  group?: 'payroll' | 'credit_cards';
}

interface CatalogResponse {
  tiers: Record<Tier, {
    name: string;
    description: string;
    highlights: string[];
    accountCount: number;
    codes: string[];
  }>;
  tierOrder: Tier[];
  accounts: CatalogAccount[];
  groups: Record<string, { name: string; description: string; codes: string[] }>;
  dependencies: Record<string, string[]>;
}

interface Props {
  mode: 'setup' | 'add';
  existingCodes?: string[];
  onComplete: (created: number) => void;
  onCancel?: () => void;
}

const TYPE_LABELS: Record<string, string> = {
  asset: 'Assets',
  credit_card: 'Credit Cards',
  liability: 'Liabilities',
  equity: 'Equity',
  revenue: 'Revenue',
  expense: 'Expenses',
};

const TYPE_ORDER = ['asset', 'credit_card', 'liability', 'equity', 'revenue', 'expense'];

const TIER_BADGE_STYLE: Record<Tier, string> = {
  basic: 'bg-gray-100 text-gray-600',
  business: 'bg-indigo-100 text-indigo-700',
  business_payroll: 'bg-emerald-100 text-emerald-700',
};

const TIER_BADGE_LABEL: Record<Tier, string> = {
  basic: 'Basic',
  business: 'Business',
  business_payroll: 'Payroll',
};

// Walk the dependency graph starting from a set of codes. Returns the closed
// set plus the extras that got pulled in.
function closeDependencies(seed: Set<string>, dependencies: Record<string, string[]>) {
  const closed = new Set(seed);
  const added = new Set<string>();
  const queue = Array.from(seed);
  while (queue.length > 0) {
    const code = queue.shift()!;
    for (const dep of dependencies[code] || []) {
      if (!closed.has(dep)) {
        closed.add(dep);
        added.add(dep);
        queue.push(dep);
      }
    }
  }
  return { closed, added };
}

// Find every code that (transitively) depends on the given code from within
// the selected set. Used when the user unchecks an account that other
// selected accounts require.
function findDependents(
  code: string,
  selected: Set<string>,
  dependencies: Record<string, string[]>,
): Set<string> {
  const dependents = new Set<string>();
  for (const candidate of selected) {
    if (candidate === code) continue;
    const { closed } = closeDependencies(new Set([candidate]), dependencies);
    if (closed.has(code)) {
      dependents.add(candidate);
    }
  }
  return dependents;
}

export function AccountOnboarding({ mode, existingCodes = [], onComplete, onCancel }: Props) {
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(mode === 'setup' ? 1 : 2);
  const [tier, setTier] = useState<Tier | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const existingCodeSet = useMemo(() => new Set(existingCodes), [existingCodes]);

  // Auto-clear the dependency notice after a few seconds
  const flashNotice = useCallback((msg: string) => {
    setNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), 6000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/bookkeeping/accounts/catalog')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load catalog');
        return res.json() as Promise<CatalogResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setCatalog(data);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchError(err.message || 'Failed to load catalog');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // When tier picked (setup mode), pre-select that tier's codes
  const pickTier = useCallback((t: Tier) => {
    if (!catalog) return;
    setTier(t);
    const tierCodes = catalog.tiers[t].codes.filter((c) => !existingCodeSet.has(c));
    setSelected(new Set(tierCodes));
    setStep(2);
  }, [catalog, existingCodeSet]);

  const toggleAccount = useCallback((code: string) => {
    if (!catalog) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        // Unchecking — if other selected accounts depend on this one, warn and pull them too
        const dependents = findDependents(code, next, catalog.dependencies);
        if (dependents.size > 0) {
          const depNames = Array.from(dependents)
            .map((c) => catalog.accounts.find((a) => a.code === c)?.name || c)
            .join(', ');
          const account = catalog.accounts.find((a) => a.code === code);
          const confirmed = window.confirm(
            `Removing ${account?.name || code} will also remove: ${depNames}. These accounts work as a group. Continue?`,
          );
          if (!confirmed) return prev;
          for (const dep of dependents) next.delete(dep);
        }
        next.delete(code);
      } else {
        // Checking — auto-add dependencies
        const before = new Set(next);
        before.add(code);
        const { closed, added } = closeDependencies(before, catalog.dependencies);
        if (added.size > 0) {
          const names = Array.from(added)
            .map((c) => catalog.accounts.find((a) => a.code === c)?.name || c)
            .join(', ');
          flashNotice(`Also added: ${names} — these accounts work together.`);
        }
        return closed;
      }
      return next;
    });
  }, [catalog, flashNotice]);

  const toggleGroup = useCallback((groupKey: string) => {
    if (!catalog) return;
    const group = catalog.groups[groupKey];
    if (!group) return;
    const groupCodes = group.codes.filter((c) => !existingCodeSet.has(c));
    const allSelected = groupCodes.every((c) => selected.has(c));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        // Uncheck the whole group (and any selected codes that depend on it)
        for (const code of groupCodes) {
          const dependents = findDependents(code, next, catalog.dependencies);
          for (const dep of dependents) next.delete(dep);
          next.delete(code);
        }
      } else {
        // Check the whole group + transitive deps
        for (const code of groupCodes) next.add(code);
        const { closed } = closeDependencies(next, catalog.dependencies);
        return closed;
      }
      return next;
    });
  }, [catalog, selected, existingCodeSet]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      // For 'setup' mode we send tier + additionalCodes; for 'add' mode tier
      // is irrelevant (basic is the implicit floor, but we don't want to
      // re-add the whole basic tier — just the codes the user picked).
      const body = mode === 'setup'
        ? { tier: tier ?? 'basic', additionalCodes: Array.from(selected) }
        : { tier: 'basic' as Tier, additionalCodes: Array.from(selected) };

      const res = await fetch('/api/bookkeeping/accounts/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Failed to create accounts');
        setSubmitting(false);
        return;
      }
      onComplete(data.created ?? 0);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to create accounts');
      setSubmitting(false);
    }
  }, [mode, tier, selected, onComplete]);

  if (loading) {
    return (
      <div className="p-8 text-center text-gray-500">Loading catalog...</div>
    );
  }

  if (fetchError || !catalog) {
    return (
      <div className="p-8 text-center text-red-600">{fetchError || 'Catalog unavailable'}</div>
    );
  }

  // ============================================
  // Step 1 — Pick a tier
  // ============================================
  if (step === 1) {
    return (
      <div className="bg-white border rounded-lg p-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-2">Set up your chart of accounts</h2>
        <p className="text-gray-600 mb-8">Pick a starting point. You can customize before anything is created, and add or remove accounts at any time after setup.</p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {catalog.tierOrder.map((t) => {
            const info = catalog.tiers[t];
            return (
              <div key={t} className="border-2 border-gray-200 rounded-lg p-6 flex flex-col hover:border-blue-400 transition-colors">
                <h3 className="text-lg font-semibold text-gray-900 mb-1">{info.name}</h3>
                <p className="text-sm text-gray-500 mb-4">{info.accountCount} account{info.accountCount === 1 ? '' : 's'}</p>
                <p className="text-sm text-gray-700 mb-4">{info.description}</p>
                <ul className="text-sm text-gray-600 space-y-1 mb-6 flex-1">
                  {info.highlights.map((h) => (
                    <li key={h} className="flex items-start">
                      <span className="text-green-500 mr-2">&#10003;</span>
                      <span>{h}</span>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => pickTier(t)}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
                >
                  Select {info.name}
                </button>
              </div>
            );
          })}
        </div>

        {mode === 'setup' && onCancel && (
          <div className="mt-6 text-center">
            <button onClick={onCancel} className="text-sm text-gray-500 hover:text-gray-700">
              Skip — I&apos;ll add accounts manually
            </button>
          </div>
        )}
      </div>
    );
  }

  // ============================================
  // Shared rendering helpers for steps 2 and 3
  // ============================================
  const visibleAccounts = catalog.accounts.filter((a) => !existingCodeSet.has(a.code));
  const accountsByType = TYPE_ORDER
    .map((type) => ({
      type,
      label: TYPE_LABELS[type] || type,
      accounts: visibleAccounts.filter((a) => a.type === type),
    }))
    .filter((g) => g.accounts.length > 0);

  // ============================================
  // Step 2 — Customize
  // ============================================
  if (step === 2) {
    return (
      <div className="bg-white border rounded-lg p-6">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {mode === 'setup' ? `Customize ${tier ? catalog.tiers[tier].name : ''}` : 'Add accounts from the catalog'}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {mode === 'setup'
                ? 'Adjust the selection if you need extras or want to leave anything out. Some accounts work as a group — checking one will check the others.'
                : 'Pick any accounts you want to add. Already-present codes are hidden.'}
            </p>
          </div>
          <div className="text-sm text-gray-500 whitespace-nowrap ml-4">
            {selected.size} selected
          </div>
        </div>

        {notice && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 text-blue-800 rounded-lg text-sm">
            {notice}
          </div>
        )}

        {/* Group-level toggles (payroll, credit_cards) — only show if at least
            one account in the group is still visible */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-2 gap-3">
          {Object.entries(catalog.groups).map(([key, group]) => {
            const visibleGroupCodes = group.codes.filter((c) => !existingCodeSet.has(c));
            if (visibleGroupCodes.length === 0) return null;
            const allSelected = visibleGroupCodes.every((c) => selected.has(c));
            const anySelected = visibleGroupCodes.some((c) => selected.has(c));
            return (
              <label key={key} className="flex items-start gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = !allSelected && anySelected;
                  }}
                  onChange={() => toggleGroup(key)}
                  className="mt-1"
                />
                <div>
                  <div className="font-medium text-gray-900 text-sm">{group.name}</div>
                  <div className="text-xs text-gray-500">{group.description}</div>
                </div>
              </label>
            );
          })}
        </div>

        {/* Per-account checkbox grid */}
        <div className="space-y-6">
          {accountsByType.map(({ type, label, accounts }) => (
            <div key={type}>
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</h3>
              <div className="divide-y border rounded-lg">
                {accounts.map((acct) => (
                  <label key={acct.code} className="flex items-start gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected.has(acct.code)}
                      onChange={() => toggleAccount(acct.code)}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-gray-500">{acct.code}</span>
                        <span className="font-medium text-gray-900 text-sm">{acct.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${TIER_BADGE_STYLE[acct.tier]}`}>
                          {TIER_BADGE_LABEL[acct.tier]}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{acct.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex justify-between">
          {mode === 'setup' ? (
            <button
              onClick={() => setStep(1)}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              &larr; Back
            </button>
          ) : (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => setStep(3)}
            disabled={selected.size === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            Review &amp; Confirm &rarr;
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // Step 3 — Preview & confirm
  // ============================================
  const selectedAccounts = visibleAccounts.filter((a) => selected.has(a.code));
  const previewByType = TYPE_ORDER
    .map((type) => ({
      type,
      label: TYPE_LABELS[type] || type,
      accounts: selectedAccounts.filter((a) => a.type === type),
    }))
    .filter((g) => g.accounts.length > 0);

  return (
    <div className="bg-white border rounded-lg p-6">
      <h2 className="text-xl font-semibold text-gray-900 mb-2">Review &amp; confirm</h2>
      <p className="text-gray-700 mb-6">
        This will create <strong>{selected.size}</strong> account{selected.size === 1 ? '' : 's'} in your chart of accounts.
      </p>

      {submitError && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{submitError}</div>
      )}

      <div className="border rounded-lg overflow-hidden mb-6">
        {previewByType.map(({ type, label, accounts }) => (
          <div key={type}>
            <div className="px-4 py-2 bg-gray-50 border-b">
              <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">{label}</h3>
            </div>
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs w-20">Code</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs">Name</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 text-xs">Description</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.code} className="border-b last:border-b-0">
                    <td className="px-4 py-2 font-mono text-xs text-gray-600">{a.code}</td>
                    <td className="px-4 py-2 text-gray-900">{a.name}</td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{a.description}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <p className="text-sm text-gray-500 mb-6">
        You can add, rename, or deactivate accounts at any time after setup.
      </p>

      <div className="flex justify-between">
        <button
          onClick={() => setStep(2)}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          disabled={submitting}
        >
          &larr; Go Back
        </button>
        <button
          onClick={submit}
          disabled={submitting || selected.size === 0}
          className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium transition-colors"
        >
          {submitting ? 'Creating...' : `Create ${selected.size} Account${selected.size === 1 ? '' : 's'}`}
        </button>
      </div>
    </div>
  );
}
