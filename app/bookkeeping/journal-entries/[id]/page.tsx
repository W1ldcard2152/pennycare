'use client';

import { useEffect, useState, useRef, use } from 'react';
import Link from 'next/link';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

// Searchable select component for account dropdown
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select account...',
  className = '',
  required = false,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; code: string; name: string }[];
  placeholder?: string;
  className?: string;
  required?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 0 });
  const [openUpward, setOpenUpward] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = options.find(o => o.id === value);

  const filteredOptions = search
    ? options.filter(o =>
        `${o.code} ${o.name}`.toLowerCase().includes(search.toLowerCase())
      )
    : options;

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const dropdownHeight = 220;
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      const shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      setOpenUpward(shouldOpenUpward);

      if (shouldOpenUpward) {
        setDropdownPos({
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      } else {
        setDropdownPos({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
          width: rect.width,
        });
      }
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {required && (
        <input
          type="text"
          required
          value={value}
          onChange={() => {}}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
        />
      )}
      <div
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center justify-between border rounded px-2 py-1.5 text-sm cursor-pointer bg-white border-gray-300"
      >
        <span className={`truncate ${selectedOption ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedOption ? `${selectedOption.code} — ${selectedOption.name}` : placeholder}
        </span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`fixed z-[100] bg-white border border-gray-200 rounded-lg shadow-lg flex ${openUpward ? 'flex-col-reverse' : 'flex-col'}`}
          style={{
            left: dropdownPos.left,
            width: Math.max(dropdownPos.width, 320),
            ...(openUpward ? { bottom: dropdownPos.bottom } : { top: dropdownPos.top }),
          }}
        >
          <div className={`p-2 ${openUpward ? 'border-t' : 'border-b'}`}>
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search..."
              className="w-full border rounded px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-sm text-gray-500">No matches found</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-blue-50 ${
                    option.id === value ? 'bg-blue-100 text-blue-800' : 'text-gray-700'
                  }`}
                >
                  <span className="font-medium">{option.code}</span> — {option.name}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface JournalEntryLine {
  id: string;
  accountId: string;
  description: string | null;
  debit: number;
  credit: number;
  isReconciled: boolean;
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
  });
}

export default function JournalEntryDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const entryId = resolvedParams.id;

  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edit mode state
  const [editing, setEditing] = useState(false);
  const [editDate, setEditDate] = useState('');
  const [editMemo, setEditMemo] = useState('');
  const [editRef, setEditRef] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editLines, setEditLines] = useState<Array<{
    accountId: string; description: string; debit: string; credit: string; isReconciled: boolean;
  }>>([]);
  const [editError, setEditError] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);

  // Void modal state
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState('');

  // Audit history
  const [auditLogs, setAuditLogs] = useState<Array<{
    id: string;
    action: string;
    userName: string;
    timestamp: string;
    metadata: Record<string, unknown> | null;
  }>>([]);

  useEffect(() => {
    fetchEntry();
    fetchAccounts();
    fetchAuditLogs();
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

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts');
      const data = await res.json();
      setAccounts(data.filter((a: Account & { isActive?: boolean }) => a.isActive !== false));
    } catch {
      // handled by empty state
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await fetch(`/api/bookkeeping/journal-entries/${entryId}/audit`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch {
      // non-critical, silent fail
    }
  };

  const startEditing = () => {
    if (!entry) return;
    setEditDate(new Date(entry.date).toISOString().split('T')[0]);
    setEditMemo(entry.memo);
    setEditRef(entry.referenceNumber || '');
    setEditNotes(entry.notes || '');
    setEditLines(entry.lines.map(l => ({
      accountId: l.accountId,
      description: l.description || '',
      debit: l.debit > 0 ? String(l.debit) : '',
      credit: l.credit > 0 ? String(l.credit) : '',
      isReconciled: l.isReconciled,
    })));
    setEditError('');
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
    setEditError('');
  };

  const addEditLine = () => {
    setEditLines([...editLines, { accountId: '', description: '', debit: '', credit: '' }]);
  };

  const removeEditLine = (index: number) => {
    if (editLines.length <= 2) return;
    if (editLines[index].isReconciled) return;
    setEditLines(editLines.filter((_, i) => i !== index));
  };

  const updateEditLine = (index: number, field: string, value: string) => {
    const updated = [...editLines];
    updated[index] = { ...updated[index], [field]: value };
    if (field === 'debit' && value) updated[index].credit = '';
    else if (field === 'credit' && value) updated[index].debit = '';
    setEditLines(updated);
  };

  const editTotalDebits = editLines.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  const editTotalCredits = editLines.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  const editIsBalanced = Math.abs(editTotalDebits - editTotalCredits) < 0.01 && editTotalDebits > 0;

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entry || !editIsBalanced) return;

    setEditSaving(true);
    setEditError('');

    try {
      const res = await fetch(`/api/bookkeeping/journal-entries/${entry.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: editDate,
          memo: editMemo,
          referenceNumber: editRef || null,
          notes: editNotes || null,
          lines: editLines.map(l => ({
            accountId: l.accountId,
            description: l.description || null,
            debit: parseFloat(l.debit) || 0,
            credit: parseFloat(l.credit) || 0,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setEditError(err.error || 'Failed to update entry');
        return;
      }

      const updated = await res.json();
      setEntry(updated);
      setEditing(false);
      fetchAuditLogs();
    } catch {
      setEditError('Failed to update entry');
    } finally {
      setEditSaving(false);
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

            {/* Action Buttons */}
            {entry.status === 'posted' && !editing && (
              <div className="flex gap-2">
                <button
                  onClick={startEditing}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  Edit Entry
                </button>
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

        {/* Line Items — Edit Mode */}
        {editing ? (
          <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
            <div className="px-6 py-4 border-b bg-blue-50">
              <h2 className="text-lg font-semibold text-gray-900">Edit Journal Entry</h2>
            </div>
            <form onSubmit={saveEdit} className="p-6">
              {editError && <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{editError}</div>}

              {editLines.some(l => l.isReconciled) && (
                <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                  Lines marked <span className="font-semibold">Reconciled</span> are locked — their account and amounts cannot be changed. Only unreconciled lines are editable.
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  {editLines.some(l => l.isReconciled) ? (
                    <div className="w-full border rounded-lg px-3 py-2 text-sm text-gray-500 bg-gray-50 cursor-not-allowed" title="Date cannot be changed while reconciled lines exist">
                      {editDate}
                    </div>
                  ) : (
                    <input type="date" required value={editDate} onChange={(e) => setEditDate(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Memo *</label>
                  <input type="text" required value={editMemo} onChange={(e) => setEditMemo(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference #</label>
                  <input type="text" value={editRef} onChange={(e) => setEditRef(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400" placeholder="Optional" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <input type="text" value={editNotes} onChange={(e) => setEditNotes(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400" placeholder="Optional" />
                </div>
              </div>

              <table className="w-full text-sm mb-4">
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
                  {editLines.map((line, idx) => (
                    <tr key={idx} className={`border-b border-gray-100 ${line.isReconciled ? 'bg-amber-50' : ''}`}>
                      <td className="py-1 px-2">
                        {line.isReconciled ? (
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-700">
                              {accounts.find(a => a.id === line.accountId)
                                ? `${accounts.find(a => a.id === line.accountId)!.code} — ${accounts.find(a => a.id === line.accountId)!.name}`
                                : line.accountId}
                            </span>
                            <span className="text-xs px-1.5 py-0.5 rounded bg-amber-200 text-amber-800 font-medium whitespace-nowrap">Reconciled</span>
                          </div>
                        ) : (
                          <SearchableSelect
                            required
                            value={line.accountId}
                            onChange={(val) => updateEditLine(idx, 'accountId', val)}
                            options={accounts}
                            placeholder="Select account..."
                          />
                        )}
                      </td>
                      <td className="py-1 px-2">
                        <input type="text" value={line.description}
                          onChange={(e) => !line.isReconciled && updateEditLine(idx, 'description', e.target.value)}
                          readOnly={line.isReconciled}
                          className={`w-full border rounded px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400 ${line.isReconciled ? 'bg-gray-50 text-gray-500 cursor-not-allowed' : ''}`}
                          placeholder="Line description" />
                      </td>
                      <td className="py-1 px-2">
                        {line.isReconciled ? (
                          <div className="px-2 py-1.5 text-sm text-right text-gray-500">
                            {line.debit ? formatCurrency(parseFloat(line.debit)) : ''}
                          </div>
                        ) : (
                          <input type="number" step="0.01" min="0" value={line.debit} onChange={(e) => updateEditLine(idx, 'debit', e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm text-right text-gray-900 placeholder-gray-400" placeholder="0.00" />
                        )}
                      </td>
                      <td className="py-1 px-2">
                        {line.isReconciled ? (
                          <div className="px-2 py-1.5 text-sm text-right text-gray-500">
                            {line.credit ? formatCurrency(parseFloat(line.credit)) : ''}
                          </div>
                        ) : (
                          <input type="number" step="0.01" min="0" value={line.credit} onChange={(e) => updateEditLine(idx, 'credit', e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm text-right text-gray-900 placeholder-gray-400" placeholder="0.00" />
                        )}
                      </td>
                      <td className="py-1 px-1">
                        {editLines.length > 2 && !line.isReconciled && (
                          <button type="button" onClick={() => removeEditLine(idx)} className="text-red-400 hover:text-red-600 text-lg leading-none">&times;</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="py-2 px-2" colSpan={2}>
                      <button type="button" onClick={addEditLine} className="text-blue-600 hover:text-blue-700 text-sm font-medium">
                        + Add Line
                      </button>
                    </td>
                    <td className={`py-2 px-2 text-right ${editIsBalanced ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(editTotalDebits) || '$0.00'}
                    </td>
                    <td className={`py-2 px-2 text-right ${editIsBalanced ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(editTotalCredits) || '$0.00'}
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>

              <div className={`mb-4 text-sm font-medium px-2 py-1 rounded inline-block ${editIsBalanced ? 'bg-green-50 text-green-700' : editTotalDebits === 0 && editTotalCredits === 0 ? 'bg-gray-50 text-gray-500' : 'bg-red-50 text-red-700'}`}>
                {editIsBalanced ? 'Balanced' : editTotalDebits === 0 && editTotalCredits === 0 ? 'Enter amounts' : `Off by ${formatCurrency(Math.abs(editTotalDebits - editTotalCredits))}`}
              </div>

              <div className="flex gap-3 mt-4">
                <button type="submit" disabled={!editIsBalanced || editSaving}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${editIsBalanced && !editSaving ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                  {editSaving ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={cancelEditing} disabled={editSaving}
                  className="px-6 py-2 rounded-lg font-medium text-gray-700 hover:text-gray-900 transition-colors disabled:opacity-50">
                  Cancel
                </button>
              </div>
            </form>
          </div>
        ) : (
        /* Line Items — View Mode */
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
        )}

        {/* Audit Info */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Audit History</h2>
          <div className="grid grid-cols-2 gap-4 text-sm mb-4">
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Created</p>
              <p className="text-gray-700">{formatDateTime(entry.createdAt)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-1">Last Updated</p>
              <p className="text-gray-700">{formatDateTime(entry.updatedAt)}</p>
            </div>
          </div>

          {auditLogs.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 uppercase mb-2">Change Log</p>
              <div className="space-y-3">
                {auditLogs.map(log => {
                  const changes = log.metadata?.changes as Record<string, { from: unknown; to: unknown }> | undefined;
                  const actionLabel: Record<string, string> = {
                    'journal_entry.edit': 'Edited',
                    'journal_entry.void': 'Voided',
                    'journal_entry.create': 'Created',
                  };
                  return (
                    <div key={log.id} className="flex gap-3 text-sm border-l-2 border-gray-200 pl-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900">{actionLabel[log.action] || log.action}</span>
                          <span className="text-gray-500">by {log.userName}</span>
                          <span className="text-gray-400 text-xs">{formatDateTime(log.timestamp)}</span>
                        </div>
                        {changes && Object.keys(changes).length > 0 && (
                          <div className="text-xs text-gray-600 space-y-0.5">
                            {Object.entries(changes).map(([field, val]) => (
                              <div key={field}>
                                <span className="font-medium capitalize">{field}:</span>{' '}
                                <span className="line-through text-gray-400">{String(val.from ?? '—')}</span>
                                {' → '}
                                <span>{String(val.to ?? '—')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
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
