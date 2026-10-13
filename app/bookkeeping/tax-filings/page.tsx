'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import QuarterPicker from '@/components/QuarterPicker';
import {
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';

interface TaxFiling {
  id: string;
  formType: string;
  year: number;
  quarter: number | null;
  status: string;
  filedDate: string | null;
  filingMethod: string | null;
  confirmationNumber: string | null;
  totalLiability: number | null;
  totalDeposits: number | null;
  balanceDue: number | null;
}

// Quarterly returns that can be moved to another quarter, and their form pages.
const MOVABLE_FORMS: Record<string, string> = { '941': '/tax-forms/941', nys45: '/tax-forms/nys-45' };

interface MoveResult {
  formType: string;
  swapped: boolean;
  moved: Array<{
    id: string;
    from: { year: number; quarter: number };
    to: { year: number; quarter: number };
    differsFromPayroll: string[];
  }>;
}

const FORM_TYPE_LABELS: Record<string, string> = {
  '941': 'Form 941',
  '940': 'Form 940',
  nys45: 'NYS-45',
  w2: 'Form W-2',
  w3: 'Form W-3',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr.length > 10 ? dateStr : dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function TaxFilingsPage() {
  const currentYear = new Date().getUTCFullYear();
  const [year, setYear] = useState<string>(String(currentYear));
  const [formType, setFormType] = useState<string>('');
  const [filings, setFilings] = useState<TaxFiling[]>([]);
  const [loading, setLoading] = useState(true);
  const [moving, setMoving] = useState<TaxFiling | null>(null);
  const [moveResult, setMoveResult] = useState<MoveResult | null>(null);

  const fetchFilings = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (year) params.set('year', year);
      if (formType) params.set('formType', formType);
      const res = await fetch(`/api/bookkeeping/tax-filings?${params.toString()}`);
      if (res.ok) {
        setFilings(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [year, formType]);

  useEffect(() => {
    fetchFilings();
  }, [fetchFilings]);

  return (
    <div className="px-4 sm:px-6 lg:px-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tax Filings</h1>
        <p className="mt-1 text-sm text-gray-600">
          History of quarterly and annual returns recorded in this app. Mark
          filings as filed from the corresponding form page (e.g. Form 941,
          NYS-45) to populate this table.
        </p>
      </div>

      {moveResult && <MoveResultBanner result={moveResult} onDismiss={() => setMoveResult(null)} />}

      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Year</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="mt-1 rounded-md border-gray-300"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Form Type</label>
            <select
              value={formType}
              onChange={(e) => setFormType(e.target.value)}
              className="mt-1 rounded-md border-gray-300"
            >
              <option value="">All</option>
              <option value="941">Form 941</option>
              <option value="940">Form 940</option>
              <option value="NYS-45">NYS-45</option>
              <option value="W-2">Form W-2</option>
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : filings.length === 0 ? (
          <div className="p-8 text-center text-gray-600">
            No filings recorded for this year.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Form</th>
                <th className="px-4 py-3 text-left">Period</th>
                <th className="px-4 py-3 text-left">Filed Date</th>
                <th className="px-4 py-3 text-left">Method</th>
                <th className="px-4 py-3 text-left">Confirmation #</th>
                <th className="px-4 py-3 text-right">Total Liability</th>
                <th className="px-4 py-3 text-right">Total Deposits</th>
                <th className="px-4 py-3 text-right">Balance Due</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm text-gray-900">
              {filings.map((f) => (
                <tr key={f.id} className={f.status === 'voided' ? 'bg-gray-50 text-gray-400' : ''}>
                  <td className="px-4 py-3 font-medium">
                    {FORM_TYPE_LABELS[f.formType] || f.formType}
                  </td>
                  <td className="px-4 py-3">
                    {f.quarter ? `Q${f.quarter} ${f.year}` : f.year}
                  </td>
                  <td className="px-4 py-3">{formatDate(f.filedDate)}</td>
                  <td className="px-4 py-3 text-gray-500">{f.filingMethod || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{f.confirmationNumber || '—'}</td>
                  <td className="px-4 py-3 text-right">
                    {f.totalLiability != null ? formatCurrency(f.totalLiability) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {f.totalDeposits != null ? formatCurrency(f.totalDeposits) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {f.balanceDue != null ? (
                      f.balanceDue > 0 ? (
                        <span className="text-red-700 font-medium">{formatCurrency(f.balanceDue)}</span>
                      ) : f.balanceDue < 0 ? (
                        <span className="text-amber-700 font-medium">({formatCurrency(-f.balanceDue)})</span>
                      ) : (
                        <span className="text-green-700 font-medium">$0.00</span>
                      )
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {f.status === 'filed' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                        <CheckCircleIcon className="h-3 w-3" />
                        Filed
                      </span>
                    )}
                    {f.status === 'pending' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                        <ExclamationTriangleIcon className="h-3 w-3" />
                        Draft — not filed
                      </span>
                    )}
                    {f.status === 'voided' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-medium">
                        <XCircleIcon className="h-3 w-3" />
                        Voided
                      </span>
                    )}
                    {f.status === 'amended' && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 text-blue-800 px-2 py-0.5 text-xs font-medium">
                        Amended
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {f.status === 'filed' && f.quarter && MOVABLE_FORMS[f.formType] && (
                      <button
                        type="button"
                        onClick={() => setMoving(f)}
                        className="text-xs font-medium text-blue-600 hover:text-blue-800"
                      >
                        Move to another quarter
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {moving && (
        <MoveFilingModal
          filing={moving}
          onClose={() => setMoving(null)}
          onMoved={(result) => {
            setMoving(null);
            setMoveResult(result);
            fetchFilings();
          }}
        />
      )}
    </div>
  );
}

function MoveFilingModal({
  filing,
  onClose,
  onMoved,
}: {
  filing: TaxFiling;
  onClose: () => void;
  onMoved: (result: MoveResult) => void;
}) {
  const label = FORM_TYPE_LABELS[filing.formType] || filing.formType;
  const [year, setYear] = useState(filing.year);
  const [quarter, setQuarter] = useState(filing.quarter === 4 ? 3 : (filing.quarter ?? 1) + 1);
  const [needsSwap, setNeedsSwap] = useState<string | null>(null); // the conflict message
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (swap: boolean) => {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/bookkeeping/tax-filings/${filing.id}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year, quarter, swap }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 409 && !swap && /swap/i.test(body.error || '')) {
        setNeedsSwap(body.error);
        return;
      }
      if (!res.ok) throw new Error(body.error || 'Could not move the filing');
      onMoved({ ...body, formType: filing.formType });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not move the filing');
    } finally {
      setSaving(false);
    }
  };

  const target = `Q${quarter} ${year}`;
  const sameSlot = year === filing.year && quarter === filing.quarter;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">
          Move {label} recorded for Q{filing.quarter} {filing.year}
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          For a return recorded under the wrong quarter. The filed figures, filed date and confirmation number move with it.
        </p>

        {err && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        <div className="mt-4">
          <QuarterPicker
            year={year}
            quarter={quarter}
            onChange={(next) => {
              setYear(next.year);
              setQuarter(next.quarter);
              setNeedsSwap(null);
            }}
          />
        </div>

        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-gray-600">
          <li>
            If this return adjusted the books, that adjustment is reversed in Q{filing.quarter} {filing.year} and redone at the end of {target}{' '}
            against {target} payroll. That voids a journal entry, so it needs the Approver role.
          </li>
          <li>Q{filing.quarter} {filing.year} will show as not filed until you file its own return.</li>
          <li>Payments recorded with this return keep their quarter — move them with Change quarter on Tax Deposits.</li>
        </ul>

        {needsSwap && (
          <div className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {needsSwap} Swapping moves that return to Q{filing.quarter} {filing.year} at the same time.
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          {needsSwap ? (
            <button
              type="button"
              onClick={() => submit(true)}
              disabled={saving}
              className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
            >
              {saving ? 'Swapping…' : `Swap Q${filing.quarter} and Q${quarter}`}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => submit(false)}
              disabled={saving || sameSlot}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? 'Moving…' : `Move to ${target}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MoveResultBanner({ result, onDismiss }: { result: MoveResult; onDismiss: () => void }) {
  const label = FORM_TYPE_LABELS[result.formType] || result.formType;
  const formPage = MOVABLE_FORMS[result.formType];
  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-900">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          {result.moved.map((m) => (
            <div key={m.id}>
              <p className="font-medium">
                {label} moved from Q{m.from.quarter} {m.from.year} to Q{m.to.quarter} {m.to.year}
                {result.swapped ? ' (swapped)' : ''}.
              </p>
              {m.differsFromPayroll.length > 0 && (
                <p className="text-amber-800">
                  Its filed figures differ from Q{m.to.quarter} {m.to.year} payroll on {m.differsFromPayroll.length} line
                  {m.differsFromPayroll.length !== 1 ? 's' : ''}. If the return you filed used Q{m.to.quarter}'s numbers,{' '}
                  <Link href={`${formPage}?year=${m.to.year}&quarter=${m.to.quarter}`} className="font-medium underline">
                    open the Q{m.to.quarter} {m.to.year} {label}
                  </Link>{' '}
                  and use Edit → File again so the record and the books match it.
                </p>
              )}
            </div>
          ))}
          <p className="text-green-800">
            Payments recorded with the return stay in their quarter —{' '}
            <Link href="/bookkeeping/tax-deposits" className="font-medium underline">
              review Tax Deposits
            </Link>{' '}
            and use Change quarter if they belong with it.
          </p>
        </div>
        <button type="button" onClick={onDismiss} className="text-green-700 hover:text-green-900">
          Dismiss
        </button>
      </div>
    </div>
  );
}
