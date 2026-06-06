'use client';

import { useState } from 'react';
import {
  WrenchScrewdriverIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

interface RepairResult {
  entryId: string;
  entryNumber: number;
  date: string;
  diffCents: number;
  status: 'patched' | 'skipped_closed_period' | 'skipped_too_large' | 'skipped_no_wage_line';
  patchedLineId?: string;
  patchedAccountCode?: string;
  oldDebit?: number;
  newDebit?: number;
}

interface RepairSummary {
  scanned: number;
  patched: number;
  skipped: number;
  results: RepairResult[];
}

const STATUS_LABEL: Record<RepairResult['status'], string> = {
  patched: 'Patched',
  skipped_closed_period: 'Skipped — closed period',
  skipped_too_large: 'Skipped — >5¢ (investigate)',
  skipped_no_wage_line: 'Skipped — no wage debit line',
};

const STATUS_STYLE: Record<RepairResult['status'], string> = {
  patched: 'bg-emerald-100 text-emerald-800',
  skipped_closed_period: 'bg-amber-100 text-amber-800',
  skipped_too_large: 'bg-red-100 text-red-800',
  skipped_no_wage_line: 'bg-gray-200 text-gray-800',
};

function formatDiff(cents: number): string {
  const sign = cents > 0 ? '+' : '';
  return `${sign}$${(cents / 100).toFixed(2)}`;
}

export default function IntegrityPage() {
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<RepairSummary | null>(null);
  const [error, setError] = useState('');

  const runRepair = async () => {
    setRunning(true);
    setError('');
    setSummary(null);
    try {
      const res = await fetch('/api/admin/repair-payroll-journals', { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Repair failed');
      }
      const data: RepairSummary = await res.json();
      setSummary(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Repair failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <WrenchScrewdriverIcon className="w-7 h-7 text-gray-700" />
          Data Integrity
        </h1>
        <p className="text-sm text-gray-600 mt-1">
          Tools for finding and repairing data drift in past records.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Payroll Journal Entry Balance Repair
        </h2>
        <p className="text-sm text-gray-700 mb-4">
          Scans every posted payroll journal entry for sub-penny imbalance caused by
          rounding drift across per-employee tax aggregations. Each drifted entry is
          rebalanced by adjusting the wage expense debit (account 6010 preferred,
          6000 as fallback) by the diff, with an audit log entry recorded per
          correction.
        </p>

        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4 flex gap-2">
          <InformationCircleIcon className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-900">
            <p className="font-medium">Safe to run.</p>
            <p className="mt-0.5">
              The tool only patches entries off by 1–5 cents (the known drift signature).
              Larger imbalances are reported but not changed — those require manual
              investigation. Entries in closed fiscal periods are also skipped; reopen
              the period first if you need to fix them. Re-running after a successful
              repair is a no-op.
            </p>
          </div>
        </div>

        <button
          onClick={runRepair}
          disabled={running}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-medium px-4 py-2 rounded-md flex items-center gap-2"
        >
          <WrenchScrewdriverIcon className="w-5 h-5" />
          {running ? 'Scanning…' : 'Scan and Repair'}
        </button>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-3 flex gap-2">
            <ExclamationTriangleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-red-900">{error}</div>
          </div>
        )}

        {summary && (
          <div className="mt-6">
            <div className="flex gap-4 mb-4">
              <div className="bg-gray-50 border border-gray-200 rounded-md px-4 py-3 flex-1">
                <div className="text-xs uppercase tracking-wide text-gray-500">Scanned</div>
                <div className="text-2xl font-bold text-gray-900">{summary.scanned}</div>
              </div>
              <div className="bg-emerald-50 border border-emerald-200 rounded-md px-4 py-3 flex-1">
                <div className="text-xs uppercase tracking-wide text-emerald-700">Patched</div>
                <div className="text-2xl font-bold text-emerald-900">{summary.patched}</div>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-md px-4 py-3 flex-1">
                <div className="text-xs uppercase tracking-wide text-amber-700">Skipped</div>
                <div className="text-2xl font-bold text-amber-900">{summary.skipped}</div>
              </div>
            </div>

            {summary.results.length === 0 ? (
              <div className="bg-emerald-50 border border-emerald-200 rounded-md p-3 flex gap-2">
                <CheckCircleIcon className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-emerald-900">
                  All {summary.scanned} payroll journal entries balance to the penny.
                  Nothing to repair.
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="text-left px-3 py-2 font-medium text-gray-700">JE #</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700">Date</th>
                      <th className="text-right px-3 py-2 font-medium text-gray-700">Diff</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700">Status</th>
                      <th className="text-left px-3 py-2 font-medium text-gray-700">Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.results.map((r) => (
                      <tr key={r.entryId} className="border-b border-gray-100">
                        <td className="px-3 py-2 font-mono">#{r.entryNumber}</td>
                        <td className="px-3 py-2">{r.date}</td>
                        <td className="px-3 py-2 text-right font-mono">{formatDiff(r.diffCents)}</td>
                        <td className="px-3 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${STATUS_STYLE[r.status]}`}>
                            {STATUS_LABEL[r.status]}
                          </span>
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-gray-700">
                          {r.status === 'patched' && r.oldDebit !== undefined && r.newDebit !== undefined
                            ? `${r.patchedAccountCode} ${r.oldDebit.toFixed(2)} → ${r.newDebit.toFixed(2)}`
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
