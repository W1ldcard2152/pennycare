'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import QuarterPicker from '@/components/QuarterPicker';
import {
  PlusIcon,
  CheckCircleIcon,
  XCircleIcon,
  TrashIcon,
} from '@heroicons/react/24/outline';

interface TaxDeposit {
  id: string;
  taxAuthority: string;
  formReference: string;
  taxPeriodYear: number;
  taxPeriodQuarter: string | null;
  depositDate: string;
  paymentMethod: string;
  confirmationNumber: string | null;
  totalAmount: number;
  status: string;
  voidReason: string | null;
  journalEntry: { id: string; entryNumber: number; date: string; status: string } | null;
}

const AUTHORITY_LABELS: Record<string, string> = {
  federal_941: 'Federal 941 (FIT/FICA)',
  federal_940: 'Federal 940 (FUTA)',
  ny_withholding: 'NY Withholding',
  ny_sui: 'NY SUI',
  ny_dbl_pfl: 'NY DBL/PFL',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string): string {
  // Date strings from API are already YYYY-MM-DD; render as a UTC business date.
  const d = new Date(dateStr.length > 10 ? dateStr : dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function TaxDepositsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState<string>(String(currentYear));
  const [quarter, setQuarter] = useState<string>('');
  const [authority, setAuthority] = useState<string>('');
  const [deposits, setDeposits] = useState<TaxDeposit[]>([]);
  const [loading, setLoading] = useState(true);
  const [changing, setChanging] = useState<TaxDeposit | null>(null);

  const fetchDeposits = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (year) params.set('year', year);
      if (quarter) params.set('quarter', quarter);
      if (authority) params.set('authority', authority);
      const res = await fetch(`/api/bookkeeping/tax-deposits?${params.toString()}`);
      if (res.ok) {
        setDeposits(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [year, quarter, authority]);

  useEffect(() => {
    fetchDeposits();
  }, [fetchDeposits]);

  const handleVoid = async (id: string) => {
    const reason = prompt('Reason for voiding this deposit?');
    if (!reason) return;
    const res = await fetch(`/api/bookkeeping/tax-deposits/${id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.error || 'Failed to void deposit');
      return;
    }
    fetchDeposits();
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tax Deposits</h1>
          <p className="mt-1 text-sm text-gray-600">
            Record EFTPS / IRS Direct Pay / NY Online Services payments. Each deposit
            creates a journal entry that clears the corresponding liability accounts.
          </p>
        </div>
        <Link
          href="/bookkeeping/tax-deposits/new"
          className="inline-flex items-center gap-2 rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white"
        >
          <PlusIcon className="h-5 w-5" />
          Record New Deposit
        </Link>
      </div>

      {/* Filters */}
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
            <label className="block text-sm font-medium text-gray-700">Quarter</label>
            <select
              value={quarter}
              onChange={(e) => setQuarter(e.target.value)}
              className="mt-1 rounded-md border-gray-300"
            >
              <option value="">All</option>
              <option value="Q1">Q1</option>
              <option value="Q2">Q2</option>
              <option value="Q3">Q3</option>
              <option value="Q4">Q4</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Authority</label>
            <select
              value={authority}
              onChange={(e) => setAuthority(e.target.value)}
              className="mt-1 rounded-md border-gray-300"
            >
              <option value="">All</option>
              {Object.entries(AUTHORITY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="rounded-lg border bg-white shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading…</div>
        ) : deposits.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-600">No tax deposits found for this filter.</p>
            <Link
              href="/bookkeeping/tax-deposits/new"
              className="mt-3 inline-block text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              Record your first deposit →
            </Link>
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 text-xs uppercase tracking-wider text-gray-500">
              <tr>
                <th className="px-4 py-3 text-left">Date</th>
                <th className="px-4 py-3 text-left">Authority</th>
                <th className="px-4 py-3 text-left">Period</th>
                <th className="px-4 py-3 text-left">Method</th>
                <th className="px-4 py-3 text-left">Confirmation #</th>
                <th className="px-4 py-3 text-right">Amount</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 text-sm text-gray-900">
              {deposits.map((d) => (
                <tr key={d.id} className={d.status === 'voided' ? 'bg-gray-50 text-gray-400' : ''}>
                  <td className="px-4 py-3">{formatDate(d.depositDate)}</td>
                  <td className="px-4 py-3">
                    {AUTHORITY_LABELS[d.taxAuthority] || d.taxAuthority}
                  </td>
                  <td className="px-4 py-3">
                    {d.taxPeriodQuarter ? `${d.taxPeriodQuarter} ${d.taxPeriodYear}` : `${d.taxPeriodYear}`}
                  </td>
                  <td className="px-4 py-3">{d.paymentMethod}</td>
                  <td className="px-4 py-3 text-gray-500">{d.confirmationNumber || '—'}</td>
                  <td className="px-4 py-3 text-right font-medium">
                    {formatCurrency(d.totalAmount)}
                  </td>
                  <td className="px-4 py-3">
                    {d.status === 'recorded' ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                        <CheckCircleIcon className="h-3 w-3" />
                        Recorded
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-medium">
                        <XCircleIcon className="h-3 w-3" />
                        Voided
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {d.status === 'recorded' && d.taxPeriodQuarter && (
                      <button
                        type="button"
                        onClick={() => setChanging(d)}
                        className="mr-3 text-gray-600 hover:text-gray-900 text-xs"
                      >
                        Change quarter
                      </button>
                    )}
                    {d.status === 'recorded' && (
                      <button
                        type="button"
                        onClick={() => handleVoid(d.id)}
                        className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 text-xs"
                      >
                        <TrashIcon className="h-3 w-3" />
                        Void
                      </button>
                    )}
                    {d.journalEntry && (
                      <Link
                        href={`/bookkeeping/journal-entries/${d.journalEntry.id}`}
                        className="ml-3 text-blue-600 hover:text-blue-800 text-xs"
                      >
                        JE #{d.journalEntry.entryNumber}
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {changing && (
        <ChangeQuarterModal
          deposit={changing}
          onClose={() => setChanging(null)}
          onSaved={() => {
            setChanging(null);
            fetchDeposits();
          }}
        />
      )}
    </div>
  );
}

function ChangeQuarterModal({
  deposit,
  onClose,
  onSaved,
}: {
  deposit: TaxDeposit;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [period, setPeriod] = useState({
    year: deposit.taxPeriodYear,
    quarter: parseInt((deposit.taxPeriodQuarter || 'Q1').slice(1)),
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const unchanged = period.year === deposit.taxPeriodYear && `Q${period.quarter}` === deposit.taxPeriodQuarter;

  const save = async () => {
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/bookkeeping/tax-deposits/${deposit.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taxPeriodYear: period.year, taxPeriodQuarter: `Q${period.quarter}` }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to change quarter');
      }
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to change quarter');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Change quarter</h3>
        <p className="mt-1 text-sm text-gray-600">
          Which quarter does this {formatCurrency(deposit.totalAmount)} deposit (paid {formatDate(deposit.depositDate)}) pay for?
          Choose the quarter of the payroll it covers — June's withholding paid in July is a Q2 deposit.
        </p>

        {err && <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        <div className="mt-4">
          <QuarterPicker year={period.year} quarter={period.quarter} onChange={setPeriod} />
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={save}
            disabled={saving || unchanged}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : `Move to Q${period.quarter} ${period.year}`}
          </button>
        </div>
      </div>
    </div>
  );
}
