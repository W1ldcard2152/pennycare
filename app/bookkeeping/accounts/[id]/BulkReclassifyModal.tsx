'use client';

import { useEffect, useMemo, useState } from 'react';
import SearchableSelect from '@/components/SearchableSelect';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
}

interface AccountSummary {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface PreflightLine {
  id: string;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  debit: number;
  credit: number;
  description: string | null;
  isReconciled: boolean;
}

interface PreflightEntry {
  entryId: string;
  entryNumber: number | null;
  date: string | null;
  memo: string | null;
  source: string | null;
  status: string | null;
  isVoided: boolean;
  isClosedPeriod: boolean;
  closedFiscalYear: number | null;
  lines: PreflightLine[];
  notFound?: true;
}

interface PreflightResponse {
  sourceAccount: { id: string; code: string; name: string };
  entries: PreflightEntry[];
  accountsInUse: AccountSummary[];
}

interface Rule {
  sourceAccountId: string;
  targetAccountId: string;
}

interface Props {
  sourceAccountId: string;
  selectedIds: string[];
  onClose: () => void;
  onComplete: (summary: { updated: number; unchanged: number; skipped: number; totalLinesChanged: number }) => void;
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export default function BulkReclassifyModal({ sourceAccountId, selectedIds, onClose, onComplete }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [preflight, setPreflight] = useState<PreflightResponse | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<Rule[]>([{ sourceAccountId: '', targetAccountId: '' }]);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        setLoading(true);
        const [preflightRes, accountsRes] = await Promise.all([
          fetch(`/api/bookkeeping/accounts/${sourceAccountId}/bulk-reclassify/preflight`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ entryIds: selectedIds }),
          }),
          fetch('/api/bookkeeping/accounts?balances=false'),
        ]);
        if (!preflightRes.ok) {
          const err = await preflightRes.json();
          if (!cancelled) setError(err.error || 'Preflight failed');
          return;
        }
        if (!accountsRes.ok) {
          if (!cancelled) setError('Failed to load accounts');
          return;
        }
        const preflightData: PreflightResponse = await preflightRes.json();
        const accountsData: Account[] = await accountsRes.json();
        if (cancelled) return;
        setPreflight(preflightData);
        setAccounts(accountsData.filter((a) => a.isActive));
        // Pre-fill the first rule's From with the page account if it appears
        // on the selected entries — matches the most common workflow ("I'm
        // looking at the wrong account, swap it for the right one").
        const pageAccountInUse = preflightData.accountsInUse.find((a) => a.id === sourceAccountId);
        if (pageAccountInUse) {
          setRules([{ sourceAccountId, targetAccountId: '' }]);
        }
      } catch {
        if (!cancelled) setError('Failed to load preflight data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [sourceAccountId, selectedIds]);

  const updateRule = (index: number, field: keyof Rule, value: string) => {
    setRules((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)));
  };

  const addRule = () => {
    setRules((prev) => [...prev, { sourceAccountId: '', targetAccountId: '' }]);
  };

  const removeRule = (index: number) => {
    setRules((prev) => (prev.length === 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  // Validation & impact computation for live preview
  const validRules = useMemo(
    () => rules.filter((r) => r.sourceAccountId && r.targetAccountId && r.sourceAccountId !== r.targetAccountId),
    [rules]
  );

  const duplicateSource = useMemo(() => {
    const seen = new Set<string>();
    for (const r of rules) {
      if (!r.sourceAccountId) continue;
      if (seen.has(r.sourceAccountId)) return r.sourceAccountId;
      seen.add(r.sourceAccountId);
    }
    return null;
  }, [rules]);

  const impact = useMemo(() => {
    if (!preflight) return { willModify: 0, willSkip: 0, unchanged: 0, totalLinesChanged: 0, perEntry: new Map<string, { status: 'modify' | 'skip' | 'unchanged'; reason?: string; matchedLineIds: string[] }>() };
    const sourceIdSet = new Set(validRules.map((r) => r.sourceAccountId));
    let willModify = 0;
    let willSkip = 0;
    let unchanged = 0;
    let totalLinesChanged = 0;
    const perEntry = new Map<string, { status: 'modify' | 'skip' | 'unchanged'; reason?: string; matchedLineIds: string[] }>();
    for (const entry of preflight.entries) {
      if (entry.notFound) {
        willSkip += 1;
        perEntry.set(entry.entryId, { status: 'skip', reason: 'Not found', matchedLineIds: [] });
        continue;
      }
      if (entry.isVoided) {
        willSkip += 1;
        perEntry.set(entry.entryId, { status: 'skip', reason: 'Voided', matchedLineIds: [] });
        continue;
      }
      if (entry.isClosedPeriod) {
        willSkip += 1;
        perEntry.set(entry.entryId, {
          status: 'skip',
          reason: `In closed FY ${entry.closedFiscalYear}`,
          matchedLineIds: [],
        });
        continue;
      }
      const matchingLines = entry.lines.filter((l) => sourceIdSet.has(l.accountId));
      const reconciledMatch = matchingLines.find((l) => l.isReconciled);
      if (reconciledMatch) {
        willSkip += 1;
        perEntry.set(entry.entryId, {
          status: 'skip',
          reason: `Reconciled line on ${reconciledMatch.accountCode}`,
          matchedLineIds: matchingLines.map((l) => l.id),
        });
        continue;
      }
      if (matchingLines.length === 0) {
        unchanged += 1;
        perEntry.set(entry.entryId, { status: 'unchanged', matchedLineIds: [] });
        continue;
      }
      willModify += 1;
      totalLinesChanged += matchingLines.length;
      perEntry.set(entry.entryId, {
        status: 'modify',
        matchedLineIds: matchingLines.map((l) => l.id),
      });
    }
    return { willModify, willSkip, unchanged, totalLinesChanged, perEntry };
  }, [preflight, validRules]);

  const canApply =
    !applying &&
    validRules.length === rules.length &&
    rules.length > 0 &&
    !duplicateSource &&
    impact.willModify > 0;

  const apply = async () => {
    if (!canApply || !preflight) return;
    setApplying(true);
    setError('');
    try {
      const res = await fetch(`/api/bookkeeping/accounts/${sourceAccountId}/bulk-reclassify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entryIds: preflight.entries.filter((e) => !e.notFound).map((e) => e.entryId),
          rules: validRules,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Reclassify failed');
        setApplying(false);
        return;
      }
      const data = await res.json();
      onComplete({
        updated: data.updated,
        unchanged: data.unchanged,
        skipped: data.skipped.length,
        totalLinesChanged: data.totalLinesChanged,
      });
    } catch {
      setError('Reclassify failed');
      setApplying(false);
    }
  };

  const sourcesUsedInOtherRules = (index: number) =>
    new Set(rules.filter((_, i) => i !== index).map((r) => r.sourceAccountId).filter(Boolean));

  // For matched-line "after" previews: source accountId -> target account info
  const targetByrSourceId = useMemo(() => {
    const m = new Map<string, { code: string; name: string }>();
    for (const r of validRules) {
      const tgt = accounts.find((a) => a.id === r.targetAccountId);
      if (tgt) m.set(r.sourceAccountId, { code: tgt.code, name: tgt.name });
    }
    return m;
  }, [validRules, accounts]);

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="p-6 border-b">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Reclassify Selected Entries</h2>
              {preflight && (
                <p className="text-sm text-gray-600 mt-1">
                  Viewing from <span className="font-medium">{preflight.sourceAccount.code} &mdash; {preflight.sourceAccount.name}</span>
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              disabled={applying}
              className="text-gray-400 hover:text-gray-600 text-2xl leading-none disabled:opacity-50"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <p className="text-gray-600">Loading...</p>
          ) : error && !preflight ? (
            <div className="bg-red-50 text-red-700 p-3 rounded">{error}</div>
          ) : preflight ? (
            <>
              {/* Entries list */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">
                  {preflight.entries.length} selected {preflight.entries.length === 1 ? 'entry' : 'entries'}
                </h3>
                <div className="border rounded-lg max-h-72 overflow-y-auto divide-y divide-gray-200">
                  {preflight.entries.map((entry) => {
                    const entryImpact = impact.perEntry.get(entry.entryId);
                    const matchedSet = new Set(entryImpact?.matchedLineIds ?? []);
                    return (
                      <div key={entry.entryId} className="p-3">
                        <div className="flex items-baseline justify-between mb-2">
                          <div className="text-sm">
                            <span className="font-medium text-gray-900">
                              {entry.entryNumber !== null ? `#${entry.entryNumber}` : 'Unknown'}
                            </span>
                            {entry.date && <span className="text-gray-600 ml-2">{formatDate(entry.date)}</span>}
                            {entry.memo && <span className="text-gray-600 ml-2">· {entry.memo}</span>}
                          </div>
                          {entryImpact && (
                            <span
                              className={`text-xs px-2 py-0.5 rounded font-medium ${
                                entryImpact.status === 'modify'
                                  ? 'bg-green-100 text-green-700'
                                  : entryImpact.status === 'unchanged'
                                    ? 'bg-gray-100 text-gray-600'
                                    : 'bg-amber-100 text-amber-700'
                              }`}
                            >
                              {entryImpact.status === 'modify'
                                ? `Will modify ${matchedSet.size} ${matchedSet.size === 1 ? 'line' : 'lines'}`
                                : entryImpact.status === 'unchanged'
                                  ? 'No matching lines'
                                  : `Skipped: ${entryImpact.reason}`}
                            </span>
                          )}
                        </div>
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-[10px] uppercase tracking-wide text-gray-400">
                              <th className="py-0.5 pr-2 text-left font-medium w-2/3">Account</th>
                              <th className="py-0.5 px-2 text-right font-medium w-20">Dr</th>
                              <th className="py-0.5 pl-2 text-right font-medium w-20">Cr</th>
                            </tr>
                          </thead>
                          <tbody>
                            {entry.lines.map((line) => {
                              const isMatched = matchedSet.has(line.id);
                              const target = isMatched ? targetByrSourceId.get(line.accountId) : undefined;
                              return (
                                <tr key={line.id} className={isMatched ? 'bg-blue-50' : ''}>
                                  <td className="py-1 pr-2 w-2/3 align-top">
                                    <div>
                                      <span className="font-mono text-gray-500 mr-1">{line.accountCode}</span>
                                      <span className="text-gray-700">{line.accountName}</span>
                                      {line.isReconciled && (
                                        <span className="ml-2 text-amber-700 text-[10px] font-medium uppercase">Reconciled</span>
                                      )}
                                    </div>
                                    {target && (
                                      <div className="text-blue-700 mt-0.5">
                                        &#x21B3; becomes <span className="font-mono">{target.code}</span> &mdash; {target.name}
                                      </div>
                                    )}
                                    {line.description && (
                                      <div className="text-gray-500 mt-0.5">{line.description}</div>
                                    )}
                                  </td>
                                  <td className="py-1 px-2 text-right text-gray-900 whitespace-nowrap align-top">
                                    {line.debit > 0 ? formatCurrency(line.debit) : ''}
                                  </td>
                                  <td className="py-1 pl-2 text-right text-gray-900 whitespace-nowrap align-top">
                                    {line.credit > 0 ? formatCurrency(line.credit) : ''}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Rule builder */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2">Remappings</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Each remapping is a find-and-replace: any line on the selected entries whose account matches <em>From</em> will be moved to <em>To</em>. Amounts and debit/credit sides are preserved.
                </p>
                <div className="space-y-2">
                  {rules.map((rule, i) => {
                    const otherSources = sourcesUsedInOtherRules(i);
                    const fromOptions = preflight.accountsInUse.map((a) => ({
                      id: a.id,
                      code: a.code,
                      name: a.name,
                      disabled: otherSources.has(a.id),
                      disabledHint: otherSources.has(a.id) ? 'used in another rule' : undefined,
                    }));
                    const toOptions = accounts
                      .filter((a) => a.id !== rule.sourceAccountId)
                      .map((a) => ({ id: a.id, code: a.code, name: a.name }));
                    return (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 w-10">From</span>
                        <SearchableSelect
                          value={rule.sourceAccountId}
                          onChange={(v) => updateRule(i, 'sourceAccountId', v)}
                          options={fromOptions}
                          className="flex-1"
                          disabled={applying}
                        />
                        <span className="text-xs text-gray-400">&rarr;</span>
                        <span className="text-xs font-medium text-gray-500 w-6">To</span>
                        <SearchableSelect
                          value={rule.targetAccountId}
                          onChange={(v) => updateRule(i, 'targetAccountId', v)}
                          options={toOptions}
                          className="flex-1"
                          disabled={applying}
                        />
                        <button
                          onClick={() => removeRule(i)}
                          disabled={rules.length === 1 || applying}
                          className="text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed px-2 text-lg leading-none"
                          aria-label="Remove rule"
                        >
                          &times;
                        </button>
                      </div>
                    );
                  })}
                </div>
                <button
                  onClick={addRule}
                  disabled={applying}
                  className="mt-3 text-sm text-blue-600 hover:text-blue-700 disabled:opacity-50"
                >
                  + Add another remapping
                </button>
                {duplicateSource && (
                  <p className="mt-2 text-xs text-red-600">Each From account can only be used in one rule.</p>
                )}
              </div>

              {/* Summary */}
              <div className="bg-gray-50 rounded-lg p-4 grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Will modify</p>
                  <p className="text-2xl font-bold text-green-700">{impact.willModify}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {impact.totalLinesChanged} {impact.totalLinesChanged === 1 ? 'line' : 'lines'} changed
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Unchanged</p>
                  <p className="text-2xl font-bold text-gray-500">{impact.unchanged}</p>
                  <p className="text-xs text-gray-500 mt-1">No matching lines</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase">Will be skipped</p>
                  <p className={`text-2xl font-bold ${impact.willSkip > 0 ? 'text-amber-700' : 'text-gray-400'}`}>
                    {impact.willSkip}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">Voided, closed, or reconciled</p>
                </div>
              </div>

              {error && <div className="bg-red-50 text-red-700 p-3 rounded text-sm">{error}</div>}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-6 border-t flex items-center justify-between gap-4">
          <p className="text-sm text-gray-500">
            {validRules.length === 0
              ? 'Add a remapping to continue.'
              : impact.willModify === 0
                ? 'No selected entries match the current rules.'
                : `${impact.willModify} ${impact.willModify === 1 ? 'entry' : 'entries'} will be saved (${impact.totalLinesChanged} ${impact.totalLinesChanged === 1 ? 'line' : 'lines'}).`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              disabled={applying}
              className="px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={apply}
              disabled={!canApply}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              {applying ? 'Saving...' : 'Save reclassification'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
