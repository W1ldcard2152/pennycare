'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  BanknotesIcon,
  ClockIcon,
  DocumentTextIcon,
  ClipboardDocumentListIcon,
  CalculatorIcon,
  UsersIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from '@heroicons/react/24/outline';
import { formatCurrency } from '@/lib/payrollCalculations';

interface UnpaidRecord {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  grossPay: number;
  netPay: number;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
  };
}

interface RecentRecord {
  id: string;
  payPeriodEnd: string;
  payDate: string;
  netPay: number;
  isPaid: boolean;
  paidDate: string | null;
  employee: { firstName: string; lastName: string };
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

function formatDateDisplay(dateStr: string): string {
  const d = new Date(dateStr.length > 10 ? dateStr : dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export default function PayrollDashboardPage() {
  const [unpaid, setUnpaid] = useState<UnpaidRecord[]>([]);
  const [recent, setRecent] = useState<RecentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [markPaidOpen, setMarkPaidOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [unpaidRes, recentRes] = await Promise.all([
        fetch('/api/payroll/history?unpaidOnly=true&limit=100'),
        fetch('/api/payroll/history?limit=10'),
      ]);
      if (unpaidRes.ok) {
        const body = await unpaidRes.json();
        setUnpaid(Array.isArray(body) ? body : body.records || []);
      }
      if (recentRes.ok) {
        const body = await recentRes.json();
        setRecent(Array.isArray(body) ? body : body.records || []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Group unpaid by payDate so a "Mark all paid for this run" is one click.
  const unpaidByPayDate = unpaid.reduce<Record<string, UnpaidRecord[]>>((acc, r) => {
    const k = r.payDate.slice(0, 10);
    if (!acc[k]) acc[k] = [];
    acc[k].push(r);
    return acc;
  }, {});
  const unpaidPayDates = Object.keys(unpaidByPayDate).sort();

  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };
  const selectAllForDate = (date: string) => {
    const ids = unpaidByPayDate[date].map((r) => r.id);
    const next = new Set(selectedIds);
    ids.forEach((id) => next.add(id));
    setSelectedIds(next);
  };

  const selectedRecords = unpaid.filter((r) => selectedIds.has(r.id));
  const selectedTotal = selectedRecords.reduce((s, r) => s + r.netPay, 0);

  const handleOpenMarkPaid = () => {
    if (selectedIds.size === 0) return;
    setMarkPaidOpen(true);
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Payroll Dashboard</h1>
        <p className="mt-2 text-gray-600">Common payroll actions and pending items.</p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <DashboardCard
          href="/payroll/run"
          icon={<BanknotesIcon className="h-6 w-6" />}
          color="bg-green-500"
          title="Run Payroll"
          description="Generate this week's preview and process it"
        />
        <DashboardCard
          href="#unpaid"
          icon={<CheckCircleIcon className="h-6 w-6" />}
          color="bg-blue-500"
          title="Mark Payroll Paid"
          description={unpaid.length > 0 ? `${unpaid.length} record${unpaid.length !== 1 ? 's' : ''} awaiting` : 'All caught up'}
          onClick={() => document.getElementById('unpaid')?.scrollIntoView({ behavior: 'smooth' })}
        />
        <DashboardCard
          href="/payroll/tax-liability"
          icon={<CalculatorIcon className="h-6 w-6" />}
          color="bg-purple-500"
          title="Tax Liability"
          description="Quarterly federal + NY tax summary"
        />
        <DashboardCard
          href="/payroll/history"
          icon={<ClockIcon className="h-6 w-6" />}
          color="bg-orange-500"
          title="Payroll History"
          description="Past runs by date and employee"
        />
        <DashboardCard
          href="/payroll/register"
          icon={<ClipboardDocumentListIcon className="h-6 w-6" />}
          color="bg-gray-500"
          title="Payroll Register"
          description="Detailed per-period breakdown"
        />
        <DashboardCard
          href="/employees"
          icon={<UsersIcon className="h-6 w-6" />}
          color="bg-pink-500"
          title="Employees"
          description="Manage employees, tax settings, deductions"
        />
      </div>

      {/* Unpaid Payrolls */}
      <div id="unpaid" className="rounded-lg bg-white shadow">
        <div className="border-b px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Unpaid Payroll Runs</h2>
            <p className="text-sm text-gray-500">
              Records that have been processed but not yet marked paid. Marking
              paid creates a journal entry that clears Net Pay Payable (2100)
              against the chosen bank account.
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenMarkPaid}
            disabled={selectedIds.size === 0}
            className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Mark {selectedIds.size > 0 ? `${selectedIds.size} ` : ''}Paid
            {selectedIds.size > 0 && (
              <span className="ml-1 opacity-80">({formatCurrency(selectedTotal)})</span>
            )}
          </button>
        </div>
        <div className="p-6">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : unpaidPayDates.length === 0 ? (
            <p className="text-sm text-gray-600">
              <CheckCircleIcon className="inline h-5 w-5 text-green-500 mr-1" />
              All processed payroll records have been marked paid.
            </p>
          ) : (
            <div className="space-y-4">
              {unpaidPayDates.map((date) => {
                const rows = unpaidByPayDate[date];
                const total = rows.reduce((s, r) => s + r.netPay, 0);
                const allSelected = rows.every((r) => selectedIds.has(r.id));
                return (
                  <div key={date} className="border rounded-md">
                    <div className="flex items-center justify-between bg-gray-50 px-4 py-2">
                      <div className="text-sm">
                        <span className="font-semibold text-gray-900">
                          Pay date {formatDateDisplay(date)}
                        </span>
                        <span className="text-gray-500 ml-3">
                          {rows.length} employee{rows.length !== 1 ? 's' : ''} — Net pay {formatCurrency(total)}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => selectAllForDate(date)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        {allSelected ? 'Selected' : 'Select all'}
                      </button>
                    </div>
                    <table className="min-w-full text-sm">
                      <thead className="text-xs text-gray-500 uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-2 w-10"></th>
                          <th className="px-4 py-2 text-left">Employee</th>
                          <th className="px-4 py-2 text-left">Pay Period</th>
                          <th className="px-4 py-2 text-right">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {rows.map((r) => (
                          <tr key={r.id} className={selectedIds.has(r.id) ? 'bg-blue-50' : ''}>
                            <td className="px-4 py-2">
                              <input
                                type="checkbox"
                                checked={selectedIds.has(r.id)}
                                onChange={() => toggleSelect(r.id)}
                                className="h-4 w-4 rounded border-gray-300 text-blue-600"
                              />
                            </td>
                            <td className="px-4 py-2">
                              {r.employee.firstName} {r.employee.lastName}{' '}
                              <span className="text-gray-400 text-xs">#{r.employee.employeeNumber}</span>
                            </td>
                            <td className="px-4 py-2 text-gray-600">
                              {formatDateDisplay(r.payPeriodStart)} – {formatDateDisplay(r.payPeriodEnd)}
                            </td>
                            <td className="px-4 py-2 text-right font-medium">{formatCurrency(r.netPay)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Recent Payrolls */}
      <div className="rounded-lg bg-white shadow">
        <div className="border-b px-6 py-4">
          <h2 className="text-lg font-semibold text-gray-900">Recent Payroll</h2>
        </div>
        <div className="p-6">
          {loading ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : recent.length === 0 ? (
            <p className="text-sm text-gray-500">No payroll history yet. Run your first payroll →</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-xs text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="px-2 py-2 text-left">Pay Date</th>
                  <th className="px-2 py-2 text-left">Employee</th>
                  <th className="px-2 py-2 text-right">Net Pay</th>
                  <th className="px-2 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recent.map((r) => (
                  <tr key={r.id}>
                    <td className="px-2 py-2">{formatDateDisplay(r.payDate)}</td>
                    <td className="px-2 py-2">{r.employee.firstName} {r.employee.lastName}</td>
                    <td className="px-2 py-2 text-right font-medium">{formatCurrency(r.netPay)}</td>
                    <td className="px-2 py-2">
                      {r.isPaid ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-2 py-0.5 text-xs font-medium">
                          <CheckCircleIcon className="h-3 w-3" />
                          Paid {r.paidDate && formatDateDisplay(r.paidDate)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 px-2 py-0.5 text-xs font-medium">
                          <ExclamationTriangleIcon className="h-3 w-3" />
                          Unpaid
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

      {markPaidOpen && (
        <MarkPaidModal
          records={selectedRecords}
          totalNetPay={selectedTotal}
          onClose={() => setMarkPaidOpen(false)}
          onSaved={() => {
            setMarkPaidOpen(false);
            setSelectedIds(new Set());
            refresh();
          }}
        />
      )}
    </div>
  );
}

function DashboardCard({
  href,
  icon,
  color,
  title,
  description,
  onClick,
}: {
  href: string;
  icon: React.ReactNode;
  color: string;
  title: string;
  description: string;
  onClick?: () => void;
}) {
  const content = (
    <div className="rounded-lg bg-white shadow hover:shadow-md transition-shadow p-5">
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 rounded-md ${color} p-3 text-white`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500 mt-0.5">{description}</p>
        </div>
      </div>
    </div>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="text-left w-full">
        {content}
      </button>
    );
  }
  return <Link href={href}>{content}</Link>;
}

function MarkPaidModal({
  records,
  totalNetPay,
  onClose,
  onSaved,
}: {
  records: UnpaidRecord[];
  totalNetPay: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [paidDate, setPaidDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<'direct_deposit' | 'check'>('direct_deposit');
  const [checkNumber, setCheckNumber] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    fetch('/api/bookkeeping/accounts')
      .then((r) => r.json())
      .then((all: Account[]) => {
        const banks = all.filter((a) => a.type === 'asset');
        setAccounts(banks);
        if (banks.length > 0) setBankAccountId(banks[0].id);
      })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/payroll/mark-paid', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          payrollRecordIds: records.map((r) => r.id),
          paidDate,
          bankAccountId,
          paymentMethod,
          checkNumber: paymentMethod === 'check' ? checkNumber || null : null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to mark paid');
      }
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to mark paid');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">Mark Payroll Paid</h3>
        <p className="mt-1 text-sm text-gray-600">
          Records the disbursement of net pay and creates a journal entry that
          clears Net Pay Payable against the chosen bank account.
        </p>

        {err && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="mt-4 rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-sm space-y-1">
          <div className="flex justify-between">
            <span className="text-gray-600">Selected records:</span>
            <span className="font-medium">{records.length}</span>
          </div>
          <div className="flex justify-between font-semibold border-t border-gray-200 pt-1">
            <span>Total net pay:</span>
            <span>{formatCurrency(totalNetPay)}</span>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Paid Date</label>
            <input
              type="date"
              value={paidDate}
              onChange={(e) => setPaidDate(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Bank Account (credited)</label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            >
              {accounts.length === 0 && <option value="">Loading…</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Payment Method</label>
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as 'direct_deposit' | 'check')}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="direct_deposit">Direct Deposit</option>
              <option value="check">Check</option>
            </select>
          </div>
          {paymentMethod === 'check' && (
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Check Number <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={checkNumber}
                onChange={(e) => setCheckNumber(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
              />
            </div>
          )}
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
            type="submit"
            disabled={saving || !bankAccountId}
            className="rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Mark Paid'}
          </button>
        </div>
      </form>
    </div>
  );
}
