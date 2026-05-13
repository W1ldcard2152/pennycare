'use client';

import { useEffect, useState, useCallback } from 'react';
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
                        Pending
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
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
