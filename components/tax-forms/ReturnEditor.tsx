'use client';

/**
 * Shared editing UI for the quarterly returns (Form 941, NYS-45).
 *
 * The form pages render their own layout; every amount on them is a
 * <ReturnAmount k="lineKey" />, which reads from the editor context. Values
 * recompute live through lib/tax-return-values — the same code the server
 * uses to file — so what the filer sees is exactly what gets saved.
 */

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowUturnLeftIcon,
  CheckCircleIcon,
  ClipboardIcon,
  ExclamationTriangleIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline';
import {
  resolveReturn,
  type AdjustmentLine,
  type LineKind,
  type PaymentComponents,
  type ReturnLineDef,
  type ReturnOverrides,
  type ReturnValues,
} from '@/lib/tax-return-values';

/** `editor` block returned by the form preview routes. */
export interface EditorPayload {
  computed: ReturnValues;
  overrides: ReturnOverrides;
  values: ReturnValues;
  /** True once filed: values are the return as filed. */
  frozen: boolean;
  driftSinceFiling: string[];
}

export type ReturnFormApiType = '941' | 'NYS-45';

function formatValue(kind: LineKind, n: number): string {
  if (kind === 'count') return String(n);
  if (kind === 'rate') return n.toFixed(3);
  return n.toFixed(2);
}

function displayValue(kind: LineKind, n: number): string {
  if (kind === 'count') return String(n);
  if (kind === 'rate') return `${n.toFixed(3)}%`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function parseInput(kind: LineKind, raw: string): number | null {
  const cleaned = raw.replace(/[$,%\s]/g, '');
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null;
  const n = Number(cleaned);
  if (!Number.isFinite(n)) return null;
  if (kind === 'count' && (n < 0 || !Number.isInteger(n))) return null;
  if (kind === 'rate' && n < 0) return null;
  return n;
}

function sameOverrides(a: ReturnOverrides, b: ReturnOverrides): boolean {
  const ka = Object.keys(a);
  return ka.length === Object.keys(b).length && ka.every((k) => k in b && a[k] === b[k]);
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

export function useReturnEditor(options: {
  defs: ReturnLineDef[];
  payload: EditorPayload | null;
  formType: ReturnFormApiType;
  year: number;
  quarter: number;
  onSaved: () => void;
}) {
  const { defs, payload, formType, year, quarter, onSaved } = options;
  const [overrides, setOverrides] = useState<ReturnOverrides>(payload?.overrides ?? {});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // A fresh load (period change, after saving or filing) resets the editor.
  useEffect(() => {
    setOverrides(payload?.overrides ?? {});
    setEditing(false);
    setSaveError('');
  }, [payload]);

  const computed = useMemo(() => payload?.computed ?? {}, [payload]);
  const frozen = Boolean(payload?.frozen);
  const savedOverrides = useMemo(() => payload?.overrides ?? {}, [payload]);
  const defByKey = useMemo(() => new Map(defs.map((d) => [d.key, d])), [defs]);

  const values = useMemo(() => {
    if (!payload) return {};
    if (frozen && !editing) return payload.values;
    return resolveReturn(defs, computed, overrides);
  }, [payload, frozen, editing, defs, computed, overrides]);

  const setLine = (key: string, n: number) =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      // Typing the value the line would have anyway is not an edit.
      const without = resolveReturn(defs, computed, next)[key] ?? 0;
      if (Math.abs(without - n) < 0.0005) return next;
      next[key] = n;
      return next;
    });

  const resetLine = (key: string) =>
    setOverrides((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });

  const saveDraft = async () => {
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/bookkeeping/tax-filings/draft', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType,
          taxPeriodYear: year,
          taxPeriodQuarter: `Q${quarter}`,
          overrides,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save');
      }
      onSaved();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  /** PDF URL reflecting what is on screen, including unsaved edits. */
  const pdfUrl = (base: string) => {
    const params = new URLSearchParams({ year: String(year), quarter: String(quarter) });
    if (editing || !frozen) params.set('overrides', JSON.stringify(overrides));
    return `${base}?${params.toString()}`;
  };

  return {
    defs,
    values,
    computed,
    overrides,
    editing,
    frozen,
    saving,
    saveError,
    dirty: !sameOverrides(overrides, savedOverrides),
    driftSinceFiling: payload?.driftSinceFiling ?? [],
    kindOf: (key: string): LineKind => defByKey.get(key)?.kind ?? 'money',
    startEditing: () => setEditing(true),
    discard: () => {
      setOverrides(savedOverrides);
      setEditing(false);
      setSaveError('');
    },
    resetAll: () => setOverrides({}),
    setLine,
    resetLine,
    saveDraft,
    pdfUrl,
  };
}

export type ReturnEditorState = ReturnType<typeof useReturnEditor>;

const EditorContext = createContext<ReturnEditorState | null>(null);

export function ReturnEditorProvider({ editor, children }: { editor: ReturnEditorState; children: ReactNode }) {
  return <EditorContext.Provider value={editor}>{children}</EditorContext.Provider>;
}

function useEditor(): ReturnEditorState {
  const ctx = useContext(EditorContext);
  if (!ctx) throw new Error('ReturnAmount must be used inside ReturnEditorProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Amount cell
// ---------------------------------------------------------------------------

/**
 * One line of the return. Editing: an input, with the calculated figure and a
 * reset button when it differs. Viewing: click-to-copy, since these figures
 * get re-typed into NY Online Services / e-file software.
 */
export function ReturnAmount({ k, bold }: { k: string; bold?: boolean }) {
  const ed = useEditor();
  const kind = ed.kindOf(k);
  const value = ed.values[k] ?? 0;
  const calc = ed.computed[k] ?? 0;
  const edited = k in ed.overrides;
  const differs = Math.abs(value - calc) >= (kind === 'count' ? 0.5 : 0.005);

  const note = differs ? (
    <span className="mt-0.5 flex items-center gap-1 text-xs text-gray-500">
      calc {displayValue(kind, calc)}
      {ed.editing && edited && (
        <button
          type="button"
          onClick={() => ed.resetLine(k)}
          title="Reset to calculated"
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
        >
          <ArrowUturnLeftIcon className="h-3 w-3" />
        </button>
      )}
    </span>
  ) : null;

  return (
    <span className="inline-flex flex-col items-end">
      {ed.editing ? (
        <LineInput kind={kind} value={value} edited={edited} onCommit={(n) => ed.setLine(k, n)} />
      ) : (
        <CopyableValue kind={kind} value={value} bold={bold} edited={edited} />
      )}
      {note}
    </span>
  );
}

function LineInput({
  kind,
  value,
  edited,
  onCommit,
}: {
  kind: LineKind;
  value: number;
  edited: boolean;
  onCommit: (n: number) => void;
}) {
  const [text, setText] = useState(formatValue(kind, value));
  const [focused, setFocused] = useState(false);

  // Follow recalculated values while the field isn't being typed in.
  useEffect(() => {
    if (!focused) setText(formatValue(kind, value));
  }, [kind, value, focused]);

  const invalid = focused && parseInput(kind, text) === null;
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      onFocus={(e) => {
        setFocused(true);
        e.target.select();
      }}
      onChange={(e) => {
        setText(e.target.value);
        const n = parseInput(kind, e.target.value);
        if (n !== null) onCommit(n);
      }}
      onBlur={() => setFocused(false)}
      className={`w-32 rounded-md border px-2 py-1 text-right text-sm tabular-nums focus:outline-none focus:ring-1 ${
        invalid
          ? 'border-red-400 focus:ring-red-400'
          : edited
            ? 'border-amber-400 bg-amber-50 focus:ring-amber-500'
            : 'border-gray-300 focus:ring-blue-500'
      }`}
    />
  );
}

function CopyableValue({
  kind,
  value,
  bold,
  edited,
}: {
  kind: LineKind;
  value: number;
  bold?: boolean;
  edited: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formatValue(kind, value));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable (non-secure context) — the number is still visible.
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      title={edited ? 'Edited — click to copy' : 'Copy value'}
      className={`group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 tabular-nums ${
        edited ? 'bg-amber-50 ring-1 ring-amber-300 hover:bg-amber-100' : 'hover:bg-blue-50'
      } ${bold ? 'text-base font-bold' : 'text-sm font-medium'} text-gray-900`}
    >
      {displayValue(kind, value)}
      {copied ? (
        <CheckCircleIcon className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <ClipboardIcon className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-500" />
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export function ReturnEditorBar({
  editor: ed,
  formLabel,
  filed,
  onFileAgain,
  lineLabel,
}: {
  editor: ReturnEditorState;
  formLabel: string;
  filed: boolean;
  onFileAgain: () => void;
  /** Human label for a line key, for the drift warning. */
  lineLabel: (key: string) => string;
}) {
  const editedCount = Object.keys(ed.overrides).length;
  const button =
    'rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed';

  let message: ReactNode;
  let actions: ReactNode;
  if (!ed.editing && filed) {
    message = (
      <>
        <strong>Filed return.</strong> These are the figures you filed — the books were adjusted
        to match them.
      </>
    );
    actions = (
      <button type="button" onClick={ed.startEditing} className={`${button} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>
        Edit filed return
      </button>
    );
  } else if (!ed.editing) {
    message =
      editedCount > 0 ? (
        <>
          <strong>Draft.</strong> {editedCount} line{editedCount === 1 ? '' : 's'} edited — highlighted
          below. Figures not edited still follow payroll.
        </>
      ) : (
        <>
          Figures are calculated from payroll. If the {formLabel} you actually file differs (e.g.
          NY&apos;s or the IRS&apos;s own calculation), edit them here — the filed figures update
          your books.
        </>
      );
    actions = (
      <button type="button" onClick={ed.startEditing} className={`${button} inline-flex items-center gap-1.5 bg-blue-600 text-white hover:bg-blue-700`}>
        <PencilSquareIcon className="h-4 w-4" />
        Edit return
      </button>
    );
  } else {
    message = filed ? (
      <>
        <strong>Editing a filed return.</strong> Filing it again replaces its adjusting entry in the
        books.
      </>
    ) : (
      <>
        <strong>Editing.</strong> Totals recalculate as you type; you can also overwrite a total
        directly. {editedCount > 0 && `${editedCount} line${editedCount === 1 ? '' : 's'} edited.`}
      </>
    );
    actions = (
      <>
        {editedCount > 0 && (
          <button type="button" onClick={ed.resetAll} className={`${button} text-gray-600 hover:bg-gray-100`}>
            Reset all to calculated
          </button>
        )}
        <button type="button" onClick={ed.discard} disabled={ed.saving} className={`${button} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}>
          Cancel
        </button>
        {filed ? (
          <button type="button" onClick={onFileAgain} className={`${button} bg-green-600 text-white hover:bg-green-700`}>
            File again…
          </button>
        ) : (
          <button type="button" onClick={ed.saveDraft} disabled={ed.saving || !ed.dirty} className={`${button} bg-blue-600 text-white hover:bg-blue-700`}>
            {ed.saving ? 'Saving…' : 'Save draft'}
          </button>
        )}
      </>
    );
  }

  return (
    <div className={`rounded-lg border p-4 ${ed.editing ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white shadow-sm'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-gray-700">{message}</p>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>
      {ed.saveError && <p className="mt-2 text-sm text-red-700">{ed.saveError}</p>}
      {filed && !ed.editing && ed.driftSinceFiling.length > 0 && (
        <div className="mt-3 flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-600" />
          <span>
            Payroll for this quarter changed after you filed (
            {ed.driftSinceFiling.slice(0, 6).map(lineLabel).join(', ')}
            {ed.driftSinceFiling.length > 6 ? ', …' : ''}). The figures below are still the ones you
            filed — check whether an amended return is needed.
          </span>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// File dialog
// ---------------------------------------------------------------------------

interface FilingPreviewResponse {
  values: ReturnValues;
  adjustments: AdjustmentLine[];
  supersedesEntryId: string | null;
  payment: { components: PaymentComponents; total: number; returnBalanceDue: number };
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  isActive: boolean;
}

const FILING_METHODS: Record<ReturnFormApiType, string[]> = {
  '941': ['IRS e-file', 'EFTPS', 'Mail', 'Other'],
  'NYS-45': ['NY Online Services', 'Mail', 'Other'],
};
const PAYMENT_METHODS = ['EFTPS', 'IRS Direct Pay', 'NY Online Services', 'Check', 'Other'];

const PAYMENT_FIELDS: Record<ReturnFormApiType, Array<{ key: keyof PaymentComponents; label: string }>> = {
  '941': [
    { key: 'federalIncomeTaxWithheld', label: 'Federal income tax' },
    { key: 'socialSecurityTax', label: 'Social Security' },
    { key: 'medicareTax', label: 'Medicare' },
  ],
  'NYS-45': [
    { key: 'stateUnemploymentTax', label: 'UI (line 10)' },
    { key: 'stateIncomeTaxWithheld', label: 'Withholding (line 20)' },
  ],
};

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function FileReturnModal({
  formType,
  formLabel,
  year,
  quarter,
  overrides,
  refile,
  hasRecordedDeposits,
  onClose,
  onSaved,
}: {
  formType: ReturnFormApiType;
  formLabel: string;
  year: number;
  quarter: number;
  overrides: ReturnOverrides;
  refile: boolean;
  hasRecordedDeposits: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  // Local calendar date — toISOString() is already tomorrow after 8pm Eastern.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const [preview, setPreview] = useState<FilingPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);

  const [filedDate, setFiledDate] = useState(today);
  const [filingMethod, setFilingMethod] = useState(FILING_METHODS[formType][0]);
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [notes, setNotes] = useState('');

  const [recordPayment, setRecordPayment] = useState(false);
  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState(formType === '941' ? 'EFTPS' : 'NY Online Services');
  const [paymentConfirmation, setPaymentConfirmation] = useState('');
  const [components, setComponents] = useState<Record<string, string>>({});

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch('/api/bookkeeping/tax-filings/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ formType, taxPeriodYear: year, taxPeriodQuarter: `Q${quarter}`, overrides }),
    })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Failed to preview the filing');
        return body as FilingPreviewResponse;
      })
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setRecordPayment(p.payment.total > 0);
        setComponents(
          Object.fromEntries(
            PAYMENT_FIELDS[formType].map((f) => [f.key, p.payment.components[f.key].toFixed(2)])
          )
        );
      })
      .catch((e) => !cancelled && setPreviewError(e instanceof Error ? e.message : 'Failed to preview'));

    fetch('/api/bookkeeping/accounts?balances=false')
      .then((r) => r.json())
      .then((list: Account[]) => {
        if (cancelled || !Array.isArray(list)) return;
        const banks = list.filter((a) => a.type === 'asset' && a.isActive);
        setAccounts(banks);
        if (banks.length > 0) setBankAccountId((prev) => prev || banks[0].id);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [formType, year, quarter, overrides]);

  const material = preview?.adjustments.filter((a) => Math.abs(a.amount) >= 0.005) ?? [];
  const netAdjustment = Math.round(material.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  const paymentTotal =
    Math.round(
      PAYMENT_FIELDS[formType].reduce((s, f) => s + (parseFloat(components[f.key] ?? '0') || 0), 0) * 100
    ) / 100;
  const balanceDue = preview?.payment.returnBalanceDue ?? 0;
  const unpaidWarning = !recordPayment && !hasRecordedDeposits && balanceDue > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      if (recordPayment && !bankAccountId) throw new Error('Choose the account the payment came from');
      const res = await fetch('/api/bookkeeping/tax-filings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType,
          taxPeriodYear: year,
          taxPeriodQuarter: `Q${quarter}`,
          overrides,
          filedDate,
          filingMethod,
          confirmationNumber: confirmationNumber || null,
          notes: notes || null,
          ...(unpaidWarning && { acknowledgedNoDeposits: true }),
          payment: recordPayment
            ? {
                bankAccountId,
                depositDate: paymentDate,
                paymentMethod,
                confirmationNumber: paymentConfirmation || null,
                components: Object.fromEntries(
                  PAYMENT_FIELDS[formType].map((f) => [f.key, parseFloat(components[f.key] ?? '0') || 0])
                ),
              }
            : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to file');
      }
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to file');
    } finally {
      setSaving(false);
    }
  };

  const input =
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={handleSubmit}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
      >
        <h3 className="text-lg font-semibold text-gray-900">
          {refile ? 'File again' : 'Mark filed'} — {formLabel} Q{quarter} {year}
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Saves the return exactly as shown, updates your payroll tax accounts to match it, and
          clears the deadline alert.
        </p>

        {err && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">Filed date</label>
            <input type="date" value={filedDate} onChange={(e) => setFiledDate(e.target.value)} required className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Filing method</label>
            <select value={filingMethod} onChange={(e) => setFilingMethod(e.target.value)} className={input}>
              {FILING_METHODS[formType].map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Confirmation # <span className="text-gray-400">(optional)</span>
            </label>
            <input type="text" value={confirmationNumber} onChange={(e) => setConfirmationNumber(e.target.value)} className={input} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)} className={input} />
          </div>
        </div>

        {/* Books impact */}
        <div className="mt-5">
          <h4 className="text-sm font-semibold text-gray-900">Books</h4>
          {previewError && <p className="mt-1 text-sm text-red-700">{previewError}</p>}
          {!preview && !previewError && <p className="mt-1 text-sm text-gray-500">Calculating…</p>}
          {preview && (
            <div className="mt-2 rounded-md border border-gray-200">
              {material.length === 0 ? (
                <p className="px-3 py-2 text-sm text-gray-600">
                  Your payroll tax accounts already match this return — no adjusting entry needed.
                </p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Account</th>
                      <th className="px-3 py-2 text-right font-medium">Payroll accrued</th>
                      <th className="px-3 py-2 text-right font-medium">Per return</th>
                      <th className="px-3 py-2 text-right font-medium">Adjustment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {material.map((a) => (
                      <tr key={a.code}>
                        <td className="px-3 py-2 text-gray-900">
                          {a.code} {a.label}
                          <div className="text-xs text-gray-500">{a.basis}</div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(a.booked)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{money(a.filed)}</td>
                        <td className="px-3 py-2 text-right tabular-nums font-medium">
                          {a.amount > 0 ? '+' : ''}
                          {money(a.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-gray-50">
                      <td colSpan={4} className="px-3 py-2 text-xs text-gray-600">
                        One journal entry dated the last day of the quarter.{' '}
                        {netAdjustment !== 0 &&
                          `${netAdjustment > 0 ? 'Debits' : 'Credits'} 6020 Payroll Tax Adjustments ${money(Math.abs(netAdjustment))}.`}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
              {preview.supersedesEntryId && (
                <p className="border-t border-gray-200 px-3 py-2 text-xs text-gray-600">
                  The adjusting entry from the earlier filing will be voided and replaced (
                  <Link href={`/bookkeeping/journal-entries/${preview.supersedesEntryId}`} className="text-blue-600 hover:underline" target="_blank">
                    view
                  </Link>
                  ). Voiding requires the Approver role.
                </p>
              )}
            </div>
          )}
        </div>

        {/* Payment */}
        {preview && (
          <div className="mt-5">
            <label className="flex items-center gap-2 text-sm font-semibold text-gray-900">
              <input type="checkbox" checked={recordPayment} onChange={(e) => setRecordPayment(e.target.checked)} className="rounded border-gray-300" />
              Record payment now
              <span className="font-normal text-gray-500">
                — balance due on this return: {money(balanceDue)}
              </span>
            </label>
            {recordPayment && (
              <div className="mt-2 space-y-3 rounded-md border border-gray-200 p-3">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Paid from</label>
                    <select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} className={input}>
                      {accounts.length === 0 && <option value="">No asset accounts</option>}
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Payment date</label>
                    <input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} required className={input} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Payment method</label>
                    <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={input}>
                      {PAYMENT_METHODS.map((m) => (
                        <option key={m} value={m}>{m}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Payment confirmation # <span className="text-gray-400">(optional)</span>
                    </label>
                    <input type="text" value={paymentConfirmation} onChange={(e) => setPaymentConfirmation(e.target.value)} className={input} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {PAYMENT_FIELDS[formType].map((f) => (
                    <div key={f.key}>
                      <label className="block text-sm font-medium text-gray-700">{f.label}</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={components[f.key] ?? ''}
                        onChange={(e) => setComponents((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        className={`${input} text-right tabular-nums`}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-between border-t border-gray-200 pt-2 text-sm">
                  <span className="text-gray-700">Payment total</span>
                  <span className="font-semibold tabular-nums">{money(paymentTotal)}</span>
                </div>
                {Math.abs(paymentTotal - balanceDue) >= 0.01 && (
                  <p className="text-xs text-amber-700">
                    This doesn&apos;t equal the return&apos;s balance due ({money(balanceDue)}). That&apos;s
                    fine if part was already paid outside CV Books — otherwise check the amounts.
                  </p>
                )}
              </div>
            )}
            {unpaidWarning && (
              <p className="mt-2 flex gap-2 text-xs text-amber-800">
                <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-600" />
                No payments are recorded for this quarter. Until you record one, your books will show
                the full balance as still owed.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving || !preview}
            className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {saving ? 'Filing…' : refile ? 'File again' : 'Mark filed'}
          </button>
        </div>
      </form>
    </div>
  );
}
