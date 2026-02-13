'use client';

import { useEffect, useState } from 'react';
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
  voidReason: string | null;
  notes: string | null;
  lines: JournalEntryLine[];
}

const SOURCE_COLORS: Record<string, string> = {
  manual: 'bg-blue-100 text-blue-700',
  payroll: 'bg-green-100 text-green-700',
  expense: 'bg-orange-100 text-orange-700',
};

export default function JournalEntriesPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [filterSource, setFilterSource] = useState('');

  const [formDate, setFormDate] = useState(new Date().toISOString().split('T')[0]);
  const [formMemo, setFormMemo] = useState('');
  const [formRef, setFormRef] = useState('');
  const [formLines, setFormLines] = useState<Array<{
    accountId: string; description: string; debit: string; credit: string;
  }>>([
    { accountId: '', description: '', debit: '', credit: '' },
    { accountId: '', description: '', debit: '', credit: '' },
  ]);

  useEffect(() => {
    fetchEntries();
    fetchAccounts();
  }, []);

  const fetchEntries = async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filterSource) params.set('source', filterSource);
      const res = await fetch(`/api/bookkeeping/journal-entries?${params}`);
      const data = await res.json();
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch {
      // handled by empty state
    } finally {
      setLoading(false);
    }
  };

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts');
      const data = await res.json();
      setAccounts(data.filter((a: Account & { isActive?: boolean }) => a.isActive !== false));
    } catch {
      // handled by empty state
    }
  };

  const applyFilter = () => {
    setLoading(true);
    fetchEntries();
  };

  const totalDebits = formLines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const totalCredits = formLines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01 && totalDebits > 0;

  const addLine = () => {
    setFormLines([...formLines, { accountId: '', description: '', debit: '', credit: '' }]);
  };

  const removeLine = (index: number) => {
    if (formLines.length <= 2) return;
    setFormLines(formLines.filter((_, i) => i !== index));
  };

  const updateLine = (index: number, field: string, value: string) => {
    const updated = [...formLines];
    updated[index] = { ...updated[index], [field]: value };
    setFormLines(updated);
  };

  const createEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!isBalanced) {
      setFormError('Debits must equal credits');
      return;
    }

    try {
      const res = await fetch('/api/bookkeeping/journal-entries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: formDate,
          memo: formMemo,
          referenceNumber: formRef || null,
          lines: formLines.map((l) => ({
            accountId: l.accountId,
            description: l.description || null,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || 'Failed to create entry');
        return;
      }
      setShowForm(false);
      setFormMemo('');
      setFormRef('');
      setFormLines([
        { accountId: '', description: '', debit: '', credit: '' },
        { accountId: '', description: '', debit: '', credit: '' },
      ]);
      fetchEntries();
    } catch {
      setFormError('Failed to create entry');
    }
  };

  const voidEntry = async (id: string, entryNumber: number) => {
    const reason = prompt(`Reason for voiding journal entry #${entryNumber}:`);
    if (!reason) return;
    try {
      const res = await fetch(`/api/bookkeeping/journal-entries/${id}/void`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Failed to void entry');
        return;
      }
      fetchEntries();
    } catch {
      alert('Failed to void entry');
    }
  };

  const formatCurrency = (amount: number) =>
    amount === 0 ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const getEntryTotal = (entry: JournalEntry) =>
    entry.lines.reduce((sum, l) => sum + l.debit, 0);

  if (loading) return <div className="p-8"><p className="text-gray-600">Loading journal entries...</p></div>;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-600 text-sm">Journal Entries</span>
            </div>
            <h1 className="text-3xl font-bold">Journal Entries</h1>
            <p className="text-gray-600 mt-1">{total} entr{total !== 1 ? 'ies' : 'y'}</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            {showForm ? 'Cancel' : 'New Journal Entry'}
          </button>
        </div>

        {/* Create Form */}
        {showForm && (
          <div className="mb-6 bg-white border rounded-lg p-6 shadow-sm">
            <h2 className="text-lg font-semibold mb-4">New Journal Entry</h2>
            {formError && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded text-sm">{formError}</div>}
            <form onSubmit={createEntry}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input type="date" required value={formDate} onChange={(e) => setFormDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Memo *</label>
                  <input type="text" required value={formMemo} onChange={(e) => setFormMemo(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Description of this entry" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference #</label>
                  <input type="text" value={formRef} onChange={(e) => setFormRef(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm" />
                </div>
              </div>

              {/* Lines */}
              <div className="mb-4">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-2 font-medium text-gray-700">Account</th>
                      <th className="text-left py-2 px-2 font-medium text-gray-700">Description</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-700 w-32">Debit</th>
                      <th className="text-right py-2 px-2 font-medium text-gray-700 w-32">Credit</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {formLines.map((line, idx) => (
                      <tr key={idx} className="border-b border-gray-100">
                        <td className="py-1 px-2">
                          <select required value={line.accountId} onChange={(e) => updateLine(idx, 'accountId', e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm">
                            <option value="">Select account...</option>
                            {accounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                          </select>
                        </td>
                        <td className="py-1 px-2">
                          <input type="text" value={line.description} onChange={(e) => updateLine(idx, 'description', e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm" placeholder="Line description" />
                        </td>
                        <td className="py-1 px-2">
                          <input type="number" step="0.01" min="0" value={line.debit} onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm text-right" placeholder="0.00" />
                        </td>
                        <td className="py-1 px-2">
                          <input type="number" step="0.01" min="0" value={line.credit} onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm text-right" placeholder="0.00" />
                        </td>
                        <td className="py-1 px-1">
                          {formLines.length > 2 && (
                            <button type="button" onClick={() => removeLine(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold">
                      <td className="py-2 px-2" colSpan={2}>
                        <button type="button" onClick={addLine} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                          + Add Line
                        </button>
                      </td>
                      <td className={`py-2 px-2 text-right ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(totalDebits) || '$0.00'}
                      </td>
                      <td className={`py-2 px-2 text-right ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(totalCredits) || '$0.00'}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
                <div className={`mt-1 text-xs font-medium ${isBalanced ? 'text-green-600' : 'text-red-600'}`}>
                  {isBalanced ? 'Balanced' : totalDebits === 0 && totalCredits === 0 ? 'Enter amounts' : `Out of balance by ${formatCurrency(Math.abs(totalDebits - totalCredits))}`}
                </div>
              </div>

              <button type="submit" disabled={!isBalanced}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${isBalanced ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                Post Journal Entry
              </button>
            </form>
          </div>
        )}

        {/* Filter */}
        <div className="mb-4 flex gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Source</label>
            <select value={filterSource} onChange={(e) => setFilterSource(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm">
              <option value="">All Sources</option>
              <option value="manual">Manual</option>
              <option value="payroll">Payroll</option>
              <option value="expense">Expense</option>
            </select>
          </div>
          <button onClick={applyFilter} className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-1.5 rounded-lg text-sm font-medium transition-colors">
            Apply
          </button>
        </div>

        {/* Entries List */}
        {entries.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-lg">
            <p className="text-gray-600 text-lg">No journal entries</p>
            <p className="text-gray-500 mt-2">Create a manual entry or process payroll to generate automatic entries.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className={`bg-white border rounded-lg shadow-sm overflow-hidden ${entry.status === 'voided' ? 'opacity-60' : ''}`}>
                {/* Entry Header Row */}
                <div
                  className="flex items-center px-4 py-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                >
                  <div className="w-16 text-sm font-mono text-gray-500">#{entry.entryNumber}</div>
                  <div className="w-28 text-sm text-gray-600">{new Date(entry.date).toLocaleDateString()}</div>
                  <div className="flex-1 text-sm text-gray-900 font-medium">{entry.memo}</div>
                  <div className="w-24">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[entry.source] || 'bg-gray-100 text-gray-700'}`}>
                      {entry.source.charAt(0).toUpperCase() + entry.source.slice(1)}
                    </span>
                  </div>
                  <div className="w-20 text-sm text-center">
                    {entry.status === 'voided' ? (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Voided</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Posted</span>
                    )}
                  </div>
                  <div className="w-28 text-sm text-right font-medium">
                    {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(getEntryTotal(entry))}
                  </div>
                  <div className="w-8 text-center text-gray-400">
                    {expandedId === entry.id ? '\u25B2' : '\u25BC'}
                  </div>
                </div>

                {/* Expanded Lines */}
                {expandedId === entry.id && (
                  <div className="border-t bg-gray-50 px-4 py-3">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-xs text-gray-500 uppercase">
                          <th className="text-left py-1">Account</th>
                          <th className="text-left py-1">Description</th>
                          <th className="text-right py-1 w-28">Debit</th>
                          <th className="text-right py-1 w-28">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entry.lines.map((line) => (
                          <tr key={line.id} className="border-t border-gray-200">
                            <td className="py-1.5 text-gray-700">
                              <span className="font-mono text-xs text-gray-500 mr-1">{line.account.code}</span>
                              {line.account.name}
                            </td>
                            <td className="py-1.5 text-gray-500">{line.description || ''}</td>
                            <td className="py-1.5 text-right font-medium">{formatCurrency(line.debit)}</td>
                            <td className="py-1.5 text-right font-medium">{formatCurrency(line.credit)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {entry.voidReason && (
                      <p className="mt-2 text-xs text-red-600">Void reason: {entry.voidReason}</p>
                    )}
                    {entry.notes && (
                      <p className="mt-1 text-xs text-gray-500">Notes: {entry.notes}</p>
                    )}
                    {entry.status === 'posted' && (
                      <div className="mt-3">
                        <button
                          onClick={() => voidEntry(entry.id, entry.entryNumber)}
                          className="text-red-600 hover:text-red-700 text-xs font-medium"
                        >
                          Void Entry
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
