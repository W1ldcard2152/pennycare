'use client';

import { useEffect, useState, use } from 'react';
import Link from 'next/link';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface JournalEntryLine {
  id: string;
  accountId: string;
  description: string | null;
  debit: number;
  credit: number;
  account: Account;
}

interface JournalEntry {
  id: string;
  entryNumber: number;
  date: string;
  memo: string;
  referenceNumber: string | null;
  source: string;
  sourceId: string | null;
  status: string;
  voidedAt: string | null;
  voidedBy: string | null;
  voidReason: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lines: JournalEntryLine[];
}

const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-blue-100 text-blue-700',
  payroll: 'bg-green-100 text-green-700',
  expense: 'bg-orange-100 text-orange-700',
  ebay_import: 'bg-yellow-100 text-yellow-700',
  statement_import: 'bg-teal-100 text-teal-700',
  cc_import: 'bg-pink-100 text-pink-700',
  opening_balance: 'bg-purple-100 text-purple-700',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  payroll: 'Payroll',
  expense: 'Expense',
  ebay_import: 'eBay Import',
  statement_import: 'Statement Import',
  cc_import: 'CC Import',
  opening_balance: 'Opening Balance',
};

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

function formatDateTime(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export default function JournalEntryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const entryId = resolvedParams.id;

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Void modal state
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState('');

  useEffect(() => {
    fetchEntry();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  const fetchEntry = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/bookkeeping/journal-entries/${entryId}`);
      if (!res.ok) {
        const err = await res.json();
        setError(err.error || 'Failed to load journal entry');
        setEntry(null);
        return;
      }
      const data = await res.json();
      setEntry(data);
      setError('');
    } catch {
      setError('Failed to load journal entry');
      setEntry(null);
    } finally {
      setLoading(false);
    }
  };

  const getSourceLink = () => {
    if (!entry || !entry.sourceId) return null;
    switch (entry.source) {
      case 'ebay_import':
        return '/bookkeeping/ebay';
      case 'statement_import':
      case 'cc_import':
        return '/bookkeeping/transaction-review';
      case 'payroll':
        return '/payroll';
      case 'opening_balance':
        return `/bookkeeping/accounts/${entry.sourceId}`;
      default:
        return null;
    }
  };

  const openVoidModal = () => {
    setShowVoidModal(true);
    setVoidReason('');
    setVoidError('');
  };

  const closeVoidModal = () => {
    setShowVoidModal(false);
    setVoidReason('');
    setVoidError('');
  };

  const confirmVoid = async () => {
    if (!entry) return;
    if (!voidReason.trim()) {
      setVoidError('A reason is required to void a journal entry');
      return;
    }

    setVoidLoading(true);
    setVoidError('');

    try {
      const res = await fetch(`/api/bookkeeping/journal-entries/${entry.id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: voidReason.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        setVoidError(err.error || 'Failed to void entry');
        return;
      }

      const updated = await res.json();
      setEntry(updated);
      closeVoidModal();
    } catch {
      setVoidError('Failed to void entry');
    } finally {
      setVoidLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-5xl mx-auto">
          <p className="text-gray-600">Loading journal entry...</p>
        </div>
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-5xl mx-auto">
          <div className="bg-red-50 text-red-700 p-4 rounded-lg mb-4">
            {error || 'Journal entry not found'}
          </div>
          <Link href="/bookkeeping/journal-entries" className="text-blue-600 hover:text-blue-700">
            &larr; Back to Journal Entries
          </Link>
        </div>
      </div>
    );
  }

  const totalDebits = entry.lines.reduce((sum, l) => sum + l.debit, 0);
  const totalCredits = entry.lines.reduce((sum, l) => sum + l.credit, 0);
  const sourceLink = getSourceLink();

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-5xl mx-auto">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 mb-4">
          <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">
            Dashboard
          </Link>
          <span className="text-gray-400">/</span>
          <Link href="/bookkeeping/journal-entries" className="text-blue-600 hover:text-blue-700 text-sm">
            Journal Entries
          </Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">Entry #{entry.entryNumber}</span>
        </div>

        {/* Header Card */}
        <div className={`bg-white rounded-lg shadow p-6 mb-6 ${entry.status === 'voided' ? 'border-2 border-red-200' : ''}`}>
          <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
            <div className="flex-1">
              {/* Entry Number & Status */}
              <div className="flex items-center gap-3 mb-2">
                <h1 className={`text-2xl font-bold ${entry.status === 'voided' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                  Journal Entry #{entry.entryNumber}
                </h1>
                {entry.status === 'voided' ? (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-700">
                    Voided
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-700">
                    Posted
                  </span>
                )}
              </div>

              {/* Memo */}
              <p className={`text-lg ${entry.status === 'voided' ? 'text-gray-400' : 'text-gray-700'}`}>
                {entry.memo}
              </p>

              {/* Meta info */}
              <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Date</p>
                  <p className="text-gray-900">{formatDate(entry.date)}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Reference #</p>
                  <p className="text-gray-900">{entry.referenceNumber || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Source</p>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[entry.source] || 'bg-gray-100 text-gray-700'}`}>
                      {SOURCE_LABELS[entry.source] || entry.source}
                    </span>
                    {sourceLink && (
                      <Link href={sourceLink} className="text-blue-600 hover:text-blue-700 text-xs">
                        View
                      </Link>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Total</p>
                  <p className="text-gray-900 font-semibold">{formatCurrency(totalDebits)}</p>
                </div>
              </div>

              {/* Notes */}
              {entry.notes && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-gray-500 uppercase mb-1">Notes</p>
                  <p className="text-gray-700 text-sm">{entry.notes}</p>
                </div>
              )}
            </div>

            {/* Void Button */}
            {entry.status === 'posted' && (
              <div>
                <button
                  onClick={openVoidModal}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  Void Entry
                </button>
              </div>
            )}
          </div>

          {/* Void Info */}
          {entry.status === 'voided' && (
            <div className="mt-6 p-4 bg-red-50 rounded-lg border border-red-200">
              <h3 className="font-medium text-red-700 mb-2">Entry Voided</h3>
              <div className="text-sm text-red-600 space-y-1">
                <p><strong>Reason:</strong> {entry.voidReason}</p>
                {entry.voidedAt && (
                  <p><strong>Voided on:</strong> {formatDateTime(entry.voidedAt)}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Line Items */}
        <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h2 className="text-lg font-semibold text-gray-900">Line Items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Account</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">Debit</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase w-32">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {entry.lines.map((line) => (
                  <tr key={line.id} className={entry.status === 'voided' ? 'bg-gray-50 opacity-60' : ''}>
                    <td className="px-6 py-4 text-sm">
                      <Link
                        href={`/bookkeeping/accounts/${line.account.id}`}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        <span className="font-mono text-xs text-gray-500 mr-2">{line.account.code}</span>
                        <span className="font-medium">{line.account.name}</span>
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {line.description || '—'}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                      {line.debit > 0 ? formatCurrency(line.debit) : ''}
                    </td>
                    <td className="px-6 py-4 text-sm text-right font-medium text-gray-900">
                      {line.credit > 0 ? formatCurrency(line.credit) : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t-2 border-gray-300">
                <tr>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-700" colSpan={2}>
                    Totals
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                    {formatCurrency(totalDebits)}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                    {formatCurrency(totalCredits)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Audit Info */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Audit Information</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Created</p>
              <p className="text-gray-700">{formatDateTime(entry.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Last Updated</p>
              <p className="text-gray-700">{formatDateTime(entry.updatedAt)}</p>
            </div>
          </div>
        </div>

        {/* Back Link */}
        <div className="flex justify-between items-center">
          <Link href="/bookkeeping/journal-entries" className="text-blue-600 hover:text-blue-700 text-sm">
            &larr; Back to Journal Entries
          </Link>
          <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">
            Dashboard
          </Link>
        </div>
      </div>

      {/* Void Modal */}
      {showVoidModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Void Journal Entry #{entry.entryNumber}
              </h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-4">
                You are about to void the entry: <strong>{entry.memo}</strong>
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Voiding this entry will reverse its effect on account balances. This action cannot be undone.
              </p>

              {voidError && (
                <div className="mb-4 p-2 bg-red-50 text-red-600 rounded text-sm">{voidError}</div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for voiding *
                </label>
                <textarea
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  rows={3}
                  className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
                  placeholder="Enter the reason for voiding this entry..."
                  autoFocus
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3 rounded-b-lg">
              <button
                type="button"
                onClick={closeVoidModal}
                disabled={voidLoading}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmVoid}
                disabled={voidLoading || !voidReason.trim()}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {voidLoading ? 'Voiding...' : 'Void Entry'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
