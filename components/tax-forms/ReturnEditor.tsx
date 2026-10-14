'use client';

/**
 * Shared editing UI for the quarterly returns (Form 941, NYS-45).
 *
 * The form pages render their own layout; every amount on them is a
 * <ReturnAmount k="lineKey" />, which reads from the editor context. Values
 * recompute live through lib/tax-return-values — the same code the server
 * uses to file — so what the filer sees is exactly what gets saved.
 */

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  /** Open the first return that loads in edit mode (?edit=1 from Tax Filings). */
  autoEdit?: boolean;
}) {
  const { defs, payload, formType, year, quarter, onSaved } = options;
  const autoEditPending = useRef(options.autoEdit ?? false);
  const [overrides, setOverrides] = useState<ReturnOverrides>(payload?.overrides ?? {});
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // A fresh load (period change, after saving or filing) resets the editor —
  // except the first one when the page was opened to edit.
  useEffect(() => {
    setOverrides(payload?.overrides ?? {});
    setEditing(Boolean(payload) && autoEditPending.current);
    if (payload) autoEditPending.current = false;
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
  returnPayments: Array<{ id: string; depositDate: string; totalAmount: number }>;
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

function formatIsoDate(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function money(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

const INPUT_CLASS =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none';

/** Local calendar date — toISOString() is already tomorrow after 8pm Eastern. */
function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

/** How a filed return was filed — what File again and Edit details start from. */
export interface FilingDetails {
  filedDate: string | null;
  filingMethod: string | null;
  confirmationNumber: string | null;
  notes: string | null;
}

/** A payment recorded with a return (TaxDeposit), as the form routes list it. */
export interface ReturnPaymentRow {
  id: string;
  depositDate: string;
  totalAmount: number;
  paymentMethod: string;
  confirmationNumber: string | null;
  status: string;
}

async function fetchFilingPreview(
  formType: ReturnFormApiType,
  year: number,
  quarter: number,
  overrides: ReturnOverrides
): Promise<FilingPreviewResponse> {
  const res = await fetch('/api/bookkeeping/tax-filings/preview', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formType, taxPeriodYear: year, taxPeriodQuarter: `Q${quarter}`, overrides }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Failed to preview the filing');
  return body as FilingPreviewResponse;
}

/** Payment sub-form shared by the file dialog and Record payment. */
function usePaymentForm(formType: ReturnFormApiType) {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [bankAccountId, setBankAccountId] = useState('');
  const [paymentDate, setPaymentDate] = useState(todayIso);
  const [paymentMethod, setPaymentMethod] = useState(formType === '941' ? 'EFTPS' : 'NY Online Services');
  const [confirmation, setConfirmation] = useState('');
  const [components, setComponents] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
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
  }, []);

  const amount = (key: keyof PaymentComponents) => parseFloat(components[key] ?? '0') || 0;
  const total = Math.round(PAYMENT_FIELDS[formType].reduce((s, f) => s + amount(f.key), 0) * 100) / 100;

  return {
    accounts,
    bankAccountId,
    setBankAccountId,
    paymentDate,
    setPaymentDate,
    paymentMethod,
    setPaymentMethod,
    confirmation,
    setConfirmation,
    components,
    setComponents,
    total,
    fill: (c: PaymentComponents) =>
      setComponents(Object.fromEntries(PAYMENT_FIELDS[formType].map((f) => [f.key, c[f.key].toFixed(2)]))),
    payload: () => {
      if (!bankAccountId) throw new Error('Choose the account the payment came from');
      return {
        bankAccountId,
        depositDate: paymentDate,
        paymentMethod,
        confirmationNumber: confirmation || null,
        components: Object.fromEntries(PAYMENT_FIELDS[formType].map((f) => [f.key, amount(f.key)])),
      };
    },
  };
}

type PaymentForm = ReturnType<typeof usePaymentForm>;

function PaymentFields({
  form,
  formType,
  balanceDue,
}: {
  form: PaymentForm;
  formType: ReturnFormApiType;
  /** Shown as a mismatch hint when the payment total differs from it. */
  balanceDue?: number;
}) {
  return (
    <div className="space-y-3 rounded-md border border-gray-200 p-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-700">Paid from</label>
          <select value={form.bankAccountId} onChange={(e) => form.setBankAccountId(e.target.value)} className={INPUT_CLASS}>
            {form.accounts.length === 0 && <option value="">No asset accounts</option>}
            {form.accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Payment date</label>
          <input type="date" value={form.paymentDate} onChange={(e) => form.setPaymentDate(e.target.value)} required className={INPUT_CLASS} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Payment method</label>
          <select value={form.paymentMethod} onChange={(e) => form.setPaymentMethod(e.target.value)} className={INPUT_CLASS}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Payment confirmation # <span className="text-gray-400">(optional)</span>
          </label>
          <input type="text" value={form.confirmation} onChange={(e) => form.setConfirmation(e.target.value)} className={INPUT_CLASS} />
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
              value={form.components[f.key] ?? ''}
              onChange={(e) => form.setComponents((prev) => ({ ...prev, [f.key]: e.target.value }))}
              className={`${INPUT_CLASS} text-right tabular-nums`}
            />
          </div>
        ))}
      </div>
      <div className="flex justify-between border-t border-gray-200 pt-2 text-sm">
        <span className="text-gray-700">Payment total</span>
        <span className="font-semibold tabular-nums">{money(form.total)}</span>
      </div>
      {balanceDue !== undefined && Math.abs(form.total - balanceDue) >= 0.01 && (
        <p className="text-xs text-amber-700">
          This doesn&apos;t equal the return&apos;s balance due ({money(balanceDue)}). That&apos;s
          fine if part was already paid outside CV Books — otherwise check the amounts.
        </p>
      )}
    </div>
  );
}

/** "Already recorded with this return" — warns harder when another is about to be added. */
function AlreadyPaidNote({
  payments,
  addingAnother,
  keptMessage,
}: {
  payments: Array<{ depositDate: string; totalAmount: number }>;
  addingAnother: boolean;
  keptMessage: string;
}) {
  if (payments.length === 0) return null;
  return (
    <p className={`mt-2 flex gap-2 text-xs ${addingAnother ? 'text-red-700' : 'text-gray-600'}`}>
      <ExclamationTriangleIcon className={`h-4 w-4 flex-shrink-0 ${addingAnother ? 'text-red-600' : 'text-gray-400'}`} />
      <span>
        Already recorded with this return:{' '}
        {payments.map((d) => `${money(d.totalAmount)} on ${formatIsoDate(d.depositDate)}`).join(', ')}.{' '}
        {addingAnother ? 'Recording another counts it twice unless you really paid again.' : keptMessage}
      </span>
    </p>
  );
}

function ModalShell({ children, onSubmit, wide }: { children: ReactNode; onSubmit: (e: React.FormEvent) => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form
        onSubmit={onSubmit}
        className={`max-h-[90vh] w-full ${wide ? 'max-w-2xl' : 'max-w-lg'} overflow-y-auto rounded-lg bg-white p-6 shadow-xl`}
      >
        {children}
      </form>
    </div>
  );
}

function ModalButtons({ saving, onClose, label, busyLabel, disabled }: {
  saving: boolean;
  onClose: () => void;
  label: string;
  busyLabel: string;
  disabled?: boolean;
}) {
  return (
    <div className="mt-6 flex justify-end gap-2">
      <button type="button" onClick={onClose} disabled={saving} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
        Cancel
      </button>
      <button
        type="submit"
        disabled={saving || disabled}
        className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
      >
        {saving ? busyLabel : label}
      </button>
    </div>
  );
}

function FilingDetailsFields({
  formType,
  details,
  onChange,
}: {
  formType: ReturnFormApiType;
  details: { filedDate: string; filingMethod: string; confirmationNumber: string; notes: string };
  onChange: (next: Partial<{ filedDate: string; filingMethod: string; confirmationNumber: string; notes: string }>) => void;
}) {
  const methods = FILING_METHODS[formType].includes(details.filingMethod)
    ? FILING_METHODS[formType]
    : [details.filingMethod, ...FILING_METHODS[formType]];
  return (
    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="block text-sm font-medium text-gray-700">Filed date</label>
        <input type="date" value={details.filedDate} onChange={(e) => onChange({ filedDate: e.target.value })} required className={INPUT_CLASS} />
        <p className="mt-1 text-xs text-gray-500">The day you submitted it — not today if you&apos;re catching up.</p>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Filing method</label>
        <select value={details.filingMethod} onChange={(e) => onChange({ filingMethod: e.target.value })} className={INPUT_CLASS}>
          {methods.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Confirmation # <span className="text-gray-400">(optional)</span>
        </label>
        <input type="text" value={details.confirmationNumber} onChange={(e) => onChange({ confirmationNumber: e.target.value })} className={INPUT_CLASS} />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">
          Notes <span className="text-gray-400">(optional)</span>
        </label>
        <input type="text" value={details.notes} onChange={(e) => onChange({ notes: e.target.value })} className={INPUT_CLASS} />
      </div>
    </div>
  );
}

function initialDetails(formType: ReturnFormApiType, existing: FilingDetails | null | undefined) {
  return {
    filedDate: existing?.filedDate || todayIso(),
    filingMethod: existing?.filingMethod || FILING_METHODS[formType][0],
    confirmationNumber: existing?.confirmationNumber ?? '',
    notes: existing?.notes ?? '',
  };
}

export function FileReturnModal({
  formType,
  formLabel,
  year,
  quarter,
  overrides,
  refile,
  existing,
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
  /** How the return was filed, when filing again — a correction keeps it. */
  existing?: FilingDetails | null;
  hasRecordedDeposits: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [preview, setPreview] = useState<FilingPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState('');
  const [details, setDetails] = useState(() => initialDetails(formType, existing));
  const [recordPayment, setRecordPayment] = useState(false);
  const pay = usePaymentForm(formType);
  const { fill } = pay;

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchFilingPreview(formType, year, quarter, overrides)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        // A payment already recorded with this return is never re-recorded by default.
        setRecordPayment(p.payment.total > 0 && p.returnPayments.length === 0);
        fill(p.payment.components);
      })
      .catch((e) => !cancelled && setPreviewError(e instanceof Error ? e.message : 'Failed to preview'));
    return () => {
      cancelled = true;
    };
    // `fill` is recreated each render; it only writes component state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formType, year, quarter, overrides]);

  const material = preview?.adjustments.filter((a) => Math.abs(a.amount) >= 0.005) ?? [];
  const netAdjustment = Math.round(material.reduce((s, a) => s + a.amount, 0) * 100) / 100;
  const balanceDue = preview?.payment.returnBalanceDue ?? 0;
  const unpaidWarning =
    !recordPayment && !hasRecordedDeposits && balanceDue > 0 && (preview?.returnPayments.length ?? 0) === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const payment = recordPayment ? pay.payload() : null;
      const res = await fetch('/api/bookkeeping/tax-filings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType,
          taxPeriodYear: year,
          taxPeriodQuarter: `Q${quarter}`,
          overrides,
          filedDate: details.filedDate,
          filingMethod: details.filingMethod,
          confirmationNumber: details.confirmationNumber || null,
          notes: details.notes || null,
          ...(unpaidWarning && { acknowledgedNoDeposits: true }),
          payment,
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

  return (
    <ModalShell onSubmit={handleSubmit} wide>
      <h3 className="text-lg font-semibold text-gray-900">
        {refile ? 'File again' : 'Mark filed'} — {formLabel} Q{quarter} {year}
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        Saves the return exactly as shown, updates your payroll tax accounts to match it, and
        clears the deadline alert.
        {refile && ' Only the dates or confirmation # wrong? Use Edit details on the form page instead — it leaves the books alone.'}
      </p>

      {err && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}

      <FilingDetailsFields formType={formType} details={details} onChange={(next) => setDetails((d) => ({ ...d, ...next }))} />

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
          <AlreadyPaidNote
            payments={preview.returnPayments}
            addingAnother={recordPayment}
            keptMessage="Filing again keeps it — no need to record it again."
          />
          {recordPayment && (
            <div className="mt-2">
              <PaymentFields form={pay} formType={formType} balanceDue={balanceDue} />
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

      <ModalButtons
        saving={saving}
        onClose={onClose}
        disabled={!preview}
        label={refile ? 'File again' : 'Mark filed'}
        busyLabel="Filing…"
      />
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Filed return: details and payments, without filing again
// ---------------------------------------------------------------------------

/** Correct the filed date, method, confirmation # or notes — the books are untouched. */
export function EditFilingDetailsModal({
  formType,
  formLabel,
  year,
  quarter,
  filingId,
  existing,
  onClose,
  onSaved,
}: {
  formType: ReturnFormApiType;
  formLabel: string;
  year: number;
  quarter: number;
  filingId: string;
  existing: FilingDetails;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [details, setDetails] = useState(() => initialDetails(formType, existing));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/bookkeeping/tax-filings/${filingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filedDate: details.filedDate,
          filingMethod: details.filingMethod,
          confirmationNumber: details.confirmationNumber || null,
          notes: details.notes || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save');
      }
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to save');
      setSaving(false);
    }
  };

  return (
    <ModalShell onSubmit={handleSubmit}>
      <h3 className="text-lg font-semibold text-gray-900">
        Filing details — {formLabel} Q{quarter} {year}
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        Corrects when and how the return was filed. The figures, the books and any payments stay as they are.
      </p>
      {err && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}
      <FilingDetailsFields formType={formType} details={details} onChange={(next) => setDetails((d) => ({ ...d, ...next }))} />
      <ModalButtons saving={saving} onClose={onClose} label="Save" busyLabel="Saving…" />
    </ModalShell>
  );
}

/** Record a payment for a filed return — the original remittance, or a later one. */
export function RecordReturnPaymentModal({
  formType,
  formLabel,
  year,
  quarter,
  filingId,
  overrides,
  onClose,
  onSaved,
}: {
  formType: ReturnFormApiType;
  formLabel: string;
  year: number;
  quarter: number;
  filingId: string;
  overrides: ReturnOverrides;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [preview, setPreview] = useState<FilingPreviewResponse | null>(null);
  const [previewError, setPreviewError] = useState('');
  const pay = usePaymentForm(formType);
  const { fill } = pay;
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchFilingPreview(formType, year, quarter, overrides)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        // Suggest the return's balance only when nothing is recorded yet; a
        // later payment is whatever amount was actually sent.
        fill(p.returnPayments.length === 0 ? p.payment.components : ZERO_COMPONENTS);
      })
      .catch((e) => !cancelled && setPreviewError(e instanceof Error ? e.message : 'Failed to load the return'));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formType, year, quarter, overrides]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/bookkeeping/tax-filings/${filingId}/payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pay.payload()),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to record the payment');
      }
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to record the payment');
      setSaving(false);
    }
  };

  const firstPayment = (preview?.returnPayments.length ?? 0) === 0;

  return (
    <ModalShell onSubmit={handleSubmit}>
      <h3 className="text-lg font-semibold text-gray-900">
        Record payment — {formLabel} Q{quarter} {year}
      </h3>
      <p className="mt-1 text-sm text-gray-600">
        Records money sent to {formType === '941' ? 'the IRS' : 'New York'} for this return, dated the day it
        left your account. Doesn&apos;t change the return or file it again.
      </p>
      {err && (
        <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
      )}
      {previewError && <p className="mt-3 text-sm text-red-700">{previewError}</p>}
      {!preview && !previewError && <p className="mt-3 text-sm text-gray-500">Loading…</p>}
      {preview && (
        <div className="mt-4">
          <AlreadyPaidNote payments={preview.returnPayments} addingAnother keptMessage="" />
          <div className="mt-2">
            <PaymentFields
              form={pay}
              formType={formType}
              balanceDue={firstPayment ? preview.payment.returnBalanceDue : undefined}
            />
          </div>
        </div>
      )}
      <ModalButtons saving={saving} onClose={onClose} disabled={!preview} label="Record payment" busyLabel="Recording…" />
    </ModalShell>
  );
}

const ZERO_COMPONENTS: PaymentComponents = {
  federalIncomeTaxWithheld: 0,
  socialSecurityTax: 0,
  medicareTax: 0,
  stateIncomeTaxWithheld: 0,
  stateUnemploymentTax: 0,
};

/**
 * "Payments with this return" for the Filing Status panel: each payment,
 * voided ones struck through, and a warning when nothing is recorded for a
 * balance due. Filing and paying are separate — voiding a payment never
 * unfiles the return — so both are shown side by side.
 */
export function ReturnPaymentsSummary({
  payments,
  balanceDue,
  onRecordPayment,
}: {
  payments: ReturnPaymentRow[];
  balanceDue: number;
  onRecordPayment: () => void;
}) {
  const recorded = payments.filter((p) => p.status === 'recorded');
  const paid = Math.round(recorded.reduce((s, p) => s + p.totalAmount, 0) * 100) / 100;
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <dt className="text-gray-500">Payments with this return</dt>
        <button type="button" onClick={onRecordPayment} className="text-xs font-medium text-blue-600 hover:text-blue-800">
          Record payment
        </button>
      </div>
      <dd className="mt-1 space-y-1">
        {payments.length === 0 && <p className="text-gray-500">None recorded</p>}
        {payments.map((p) => (
          <p key={p.id} className={p.status === 'recorded' ? 'text-gray-900' : 'text-gray-400 line-through'}>
            {money(p.totalAmount)} on {formatIsoDate(p.depositDate)} · {p.paymentMethod}
            {p.confirmationNumber ? ` · #${p.confirmationNumber}` : ''}
            {p.status !== 'recorded' && <span className="ml-1 no-underline">({p.status})</span>}
          </p>
        ))}
        {recorded.length === 0 && balanceDue > 0.005 && (
          <p className="flex gap-1.5 text-amber-800">
            <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-600" />
            No payment recorded — your books still show {money(balanceDue)} owed for this return.
          </p>
        )}
        {recorded.length > 0 && Math.abs(paid - balanceDue) >= 0.01 && (
          <p className="text-xs text-gray-500">
            {money(paid)} recorded against a balance due of {money(balanceDue)}.
          </p>
        )}
      </dd>
    </div>
  );
}
