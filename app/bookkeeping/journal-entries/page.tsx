'use client';

import { useEffect, useState, useMemo, useRef } from 'react';
import Link from 'next/link';

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

  // Close on click outside
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

  // Focus input when opening and calculate position
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

  // Hidden input for form validation when required
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
        className={`flex items-center justify-between border rounded px-2 py-1.5 text-sm cursor-pointer bg-white ${
          !value && required ? 'border-gray-300' : 'border-gray-300'
        }`}
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
            width: Math.max(dropdownPos.width, 280),
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

// Sorting types
type SortKey = 'entryNumber' | 'date' | 'memo' | 'source' | 'status' | 'amount';
type SortDir = 'asc' | 'desc';
type SortEntry = { key: SortKey; dir: SortDir };

// Default sort directions for each column (first click)
const DEFAULT_SORT_DIR: Record<SortKey, SortDir> = {
  entryNumber: 'desc', // newest first
  date: 'desc',        // newest first
  memo: 'asc',         // A-Z
  source: 'asc',       // A-Z
  status: 'asc',       // Posted before Voided
  amount: 'desc',      // largest first
};

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

const SOURCE_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'manual', label: 'Manual' },
  { value: 'payroll', label: 'Payroll' },
  { value: 'ebay_import', label: 'eBay Import' },
  { value: 'statement_import', label: 'Statement Import' },
  { value: 'cc_import', label: 'CC Import' },
  { value: 'opening_balance', label: 'Opening Balance' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'posted', label: 'Posted' },
  { value: 'voided', label: 'Voided' },
];

export default function JournalEntriesPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formError, setFormError] = useState('');

  // Filters
  const [filterSearch, setFilterSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [filterSource, setFilterSource] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterAccount, setFilterAccount] = useState('');

  // Pagination
  const [offset, setOffset] = useState(0);
  const limit = 50;

  // Hierarchical sorting (up to 3 tiers)
  const [sortStack, setSortStack] = useState<SortEntry[]>([]);

  // Void modal
  const [voidingEntry, setVoidingEntry] = useState<JournalEntry | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [voidLoading, setVoidLoading] = useState(false);
  const [voidError, setVoidError] = useState('');

  // Create form
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
    fetchAccounts();
  }, []);

  // Debounce search input (300ms)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);
  useEffect(() => {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => setDebouncedSearch(filterSearch), 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
  }, [filterSearch]);

  useEffect(() => {
    setOffset(0);
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, filterSource, filterStatus, filterStartDate, filterEndDate, filterAccount]);

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offset]);

  const fetchEntries = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (filterSource) params.set('source', filterSource);
      if (filterStatus) params.set('status', filterStatus);
      if (filterStartDate) params.set('startDate', filterStartDate);
      if (filterEndDate) params.set('endDate', filterEndDate);
      if (filterAccount) params.set('accountId', filterAccount);

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

  const clearFilters = () => {
    setFilterSearch('');
    setDebouncedSearch('');
    setFilterSource('');
    setFilterStatus('');
    setFilterStartDate('');
    setFilterEndDate('');
    setFilterAccount('');
    setOffset(0);
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
    // Clear the other field when entering a value
    if (field === 'debit' && value) {
      updated[index].credit = '';
    } else if (field === 'credit' && value) {
      updated[index].debit = '';
    }
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
      setFormDate(new Date().toISOString().split('T')[0]);
      setFormLines([
        { accountId: '', description: '', debit: '', credit: '' },
        { accountId: '', description: '', debit: '', credit: '' },
      ]);
      fetchEntries();
    } catch {
      setFormError('Failed to create entry');
    }
  };

  const openVoidModal = (entry: JournalEntry) => {
    setVoidingEntry(entry);
    setVoidReason('');
    setVoidError('');
  };

  const closeVoidModal = () => {
    setVoidingEntry(null);
    setVoidReason('');
    setVoidError('');
  };

  const confirmVoid = async () => {
    if (!voidingEntry) return;
    if (!voidReason.trim()) {
      setVoidError('A reason is required to void a journal entry');
      return;
    }

    setVoidLoading(true);
    setVoidError('');

    try {
      const res = await fetch(`/api/bookkeeping/journal-entries/${voidingEntry.id}/void`, {
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
      // Update the entry in place without refetching
      setEntries((prev) =>
        prev.map((e) => (e.id === updated.id ? { ...e, ...updated } : e))
      );
      closeVoidModal();
    } catch {
      setVoidError('Failed to void entry');
    } finally {
      setVoidLoading(false);
    }
  };

  const formatCurrency = (amount: number) =>
    amount === 0 ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (dateString: string) =>
    new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

  const getEntryTotal = (entry: JournalEntry) =>
    entry.lines.reduce((sum, l) => sum + l.debit, 0);

  // Hierarchical sort handler
  const handleSort = (key: SortKey) => {
    setSortStack((prev) => {
      const existingIndex = prev.findIndex((s) => s.key === key);

      if (existingIndex === -1) {
        // Not in stack - add at the end (as lowest priority) with default direction
        return [...prev, { key, dir: DEFAULT_SORT_DIR[key] }].slice(0, 3);
      }

      // Already in stack - cycle through: default -> reversed -> removed
      const current = prev[existingIndex];
      if (current.dir === DEFAULT_SORT_DIR[key]) {
        // Currently at default direction, reverse it
        const updated = [...prev];
        updated[existingIndex] = { key, dir: current.dir === 'asc' ? 'desc' : 'asc' };
        return updated;
      } else {
        // Already reversed, remove it (others shift up in priority)
        return prev.filter((s) => s.key !== key);
      }
    });
  };

  // Get sort indicator for column header
  const getSortIndicator = (key: SortKey) => {
    const idx = sortStack.findIndex((s) => s.key === key);
    if (idx === -1) return null;

    const arrow = sortStack[idx].dir === 'asc' ? '\u25B2' : '\u25BC';
    const priority = idx === 0 ? '' : `${idx + 1}`;

    return (
      <span className={`ml-1 ${idx === 0 ? 'text-blue-600' : 'text-gray-400'}`}>
        {arrow}
        {priority && <sup className="text-[9px] ml-0.5">{priority}</sup>}
      </span>
    );
  };

  // Compare two entries based on a sort key
  const compareByKey = (a: JournalEntry, b: JournalEntry, key: SortKey): number => {
    switch (key) {
      case 'entryNumber':
        return a.entryNumber - b.entryNumber;
      case 'date':
        return new Date(a.date).getTime() - new Date(b.date).getTime();
      case 'memo':
        return a.memo.localeCompare(b.memo);
      case 'source':
        return a.source.localeCompare(b.source);
      case 'status':
        return a.status.localeCompare(b.status);
      case 'amount':
        return getEntryTotal(a) - getEntryTotal(b);
      default:
        return 0;
    }
  };

  // Apply hierarchical sorting
  const sortedEntries = useMemo(() => {
    if (sortStack.length === 0) return entries;

    return [...entries].sort((a, b) => {
      for (const { key, dir } of sortStack) {
        const cmp = compareByKey(a, b, key);
        if (cmp !== 0) {
          return dir === 'asc' ? cmp : -cmp;
        }
      }
      return 0;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, sortStack]);

  const getSourceLink = (entry: JournalEntry) => {
    if (!entry.sourceId) return null;
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

  const totalPages = Math.ceil(total / limit);
  const currentPage = Math.floor(offset / limit) + 1;

  if (loading && entries.length === 0) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-7xl mx-auto">
          <p className="text-gray-600">Loading journal entries...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">Dashboard</Link>
              <span className="text-gray-400">/</span>
              <span className="text-gray-600 text-sm">Journal Entries</span>
            </div>
            <h1 className="text-3xl font-bold text-gray-900">Journal Entries</h1>
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
            <h2 className="text-lg font-semibold mb-4 text-gray-900">New Journal Entry</h2>
            {formError && <div className="mb-3 p-2 bg-red-50 text-red-600 rounded text-sm">{formError}</div>}
            <form onSubmit={createEntry}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                  <input type="date" required value={formDate} onChange={(e) => setFormDate(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Memo *</label>
                  <input type="text" required value={formMemo} onChange={(e) => setFormMemo(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400" placeholder="Description of this entry" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference #</label>
                  <input type="text" value={formRef} onChange={(e) => setFormRef(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400" placeholder="Optional" />
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
                          <SearchableSelect
                            required
                            value={line.accountId}
                            onChange={(val) => updateLine(idx, 'accountId', val)}
                            options={accounts}
                            placeholder="Select account..."
                          />
                        </td>
                        <td className="py-1 px-2">
                          <input type="text" value={line.description} onChange={(e) => updateLine(idx, 'description', e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm text-gray-900 placeholder-gray-400" placeholder="Line description" />
                        </td>
                        <td className="py-1 px-2">
                          <input type="number" step="0.01" min="0" value={line.debit} onChange={(e) => updateLine(idx, 'debit', e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm text-right text-gray-900 placeholder-gray-400" placeholder="0.00" />
                        </td>
                        <td className="py-1 px-2">
                          <input type="number" step="0.01" min="0" value={line.credit} onChange={(e) => updateLine(idx, 'credit', e.target.value)}
                            className="w-full border rounded px-2 py-1.5 text-sm text-right text-gray-900 placeholder-gray-400" placeholder="0.00" />
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
                <div className={`mt-2 text-sm font-medium px-2 py-1 rounded inline-block ${isBalanced ? 'bg-green-50 text-green-700' : totalDebits === 0 && totalCredits === 0 ? 'bg-gray-50 text-gray-500' : 'bg-red-50 text-red-700'}`}>
                  {isBalanced ? 'Balanced' : totalDebits === 0 && totalCredits === 0 ? 'Enter amounts' : `Off by ${formatCurrency(Math.abs(totalDebits - totalCredits))}`}
                </div>
              </div>

              <button type="submit" disabled={!isBalanced}
                className={`px-6 py-2 rounded-lg font-medium transition-colors ${isBalanced ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}>
                Create Journal Entry
              </button>
            </form>
          </div>
        )}

        {/* Filter Bar */}
        <div className="mb-4 bg-white border rounded-lg p-4 shadow-sm">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px] max-w-sm">
              <label className="block text-xs text-gray-500 mb-1">Search</label>
              <input
                type="text"
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
                placeholder="Entry #, memo, reference, description..."
                className="w-full border rounded-lg px-3 py-1.5 text-sm text-gray-900 placeholder-gray-400"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Start Date</label>
              <input
                type="date"
                value={filterStartDate}
                onChange={(e) => setFilterStartDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">End Date</label>
              <input
                type="date"
                value={filterEndDate}
                onChange={(e) => setFilterEndDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Source</label>
              <select
                value={filterSource}
                onChange={(e) => setFilterSource(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm text-gray-900"
              >
                {SOURCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Status</label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm text-gray-900"
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Account</label>
              <select
                value={filterAccount}
                onChange={(e) => setFilterAccount(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm text-gray-900"
              >
                <option value="">All Accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                ))}
              </select>
            </div>
            {(filterSearch || filterSource || filterStatus || filterStartDate || filterEndDate || filterAccount) && (
              <button
                onClick={clearFilters}
                className="text-gray-500 hover:text-gray-700 text-sm underline"
              >
                Clear filters
              </button>
            )}
          </div>
          {/* Sort hint and clear */}
          <div className="mt-3 pt-3 border-t flex justify-between items-center text-xs text-gray-400">
            <span>Click column headers to sort. Click again to reverse. Third click removes sort.</span>
            {sortStack.length > 0 && (
              <button
                onClick={() => setSortStack([])}
                className="text-gray-500 hover:text-gray-700 underline"
              >
                Clear sort
              </button>
            )}
          </div>
        </div>

        {/* Entries List */}
        {entries.length === 0 ? (
          <div className="text-center py-16 bg-gray-50 rounded-lg">
            <p className="text-gray-600 text-lg">No journal entries</p>
            <p className="text-gray-500 mt-2">Create a manual entry or process payroll to generate automatic entries.</p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div className="bg-white border rounded-lg shadow-sm overflow-hidden">
              <div className="hidden md:flex items-center px-4 py-2 bg-gray-50 border-b text-xs font-medium text-gray-500 uppercase">
                <div
                  className="w-16 cursor-pointer select-none hover:text-gray-700 transition-colors"
                  onClick={() => handleSort('entryNumber')}
                >
                  Entry #{getSortIndicator('entryNumber')}
                </div>
                <div
                  className="w-28 cursor-pointer select-none hover:text-gray-700 transition-colors"
                  onClick={() => handleSort('date')}
                >
                  Date{getSortIndicator('date')}
                </div>
                <div
                  className="flex-1 cursor-pointer select-none hover:text-gray-700 transition-colors"
                  onClick={() => handleSort('memo')}
                >
                  Memo{getSortIndicator('memo')}
                </div>
                <div
                  className="w-28 cursor-pointer select-none hover:text-gray-700 transition-colors"
                  onClick={() => handleSort('source')}
                >
                  Source{getSortIndicator('source')}
                </div>
                <div
                  className="w-20 cursor-pointer select-none hover:text-gray-700 transition-colors"
                  onClick={() => handleSort('status')}
                >
                  Status{getSortIndicator('status')}
                </div>
                <div
                  className="w-28 text-right cursor-pointer select-none hover:text-gray-700 transition-colors"
                  onClick={() => handleSort('amount')}
                >
                  Amount{getSortIndicator('amount')}
                </div>
                <div className="w-24 text-right">Actions</div>
              </div>

              {/* Entry Rows */}
              <div className="divide-y">
                {sortedEntries.map((entry) => (
                  <div key={entry.id} className={`${entry.status === 'voided' ? 'bg-gray-50' : 'bg-white'}`}>
                    {/* Entry Header Row */}
                    <div
                      className="flex flex-col md:flex-row md:items-center px-4 py-3 cursor-pointer hover:bg-gray-50"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <div className="flex items-center gap-3 md:w-16">
                        <span className={`text-sm font-mono ${entry.status === 'voided' ? 'text-gray-400 line-through' : 'text-gray-600'}`}>
                          #{entry.entryNumber}
                        </span>
                      </div>
                      <div className={`md:w-28 text-sm ${entry.status === 'voided' ? 'text-gray-400' : 'text-gray-600'}`}>
                        {formatDate(entry.date)}
                      </div>
                      <div className={`flex-1 text-sm font-medium ${entry.status === 'voided' ? 'text-gray-400 line-through' : 'text-gray-900'}`}>
                        <Link
                          href={`/bookkeeping/journal-entries/${entry.id}`}
                          className="hover:text-blue-600"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {entry.memo}
                        </Link>
                        {entry.referenceNumber && (
                          <span className="text-gray-400 ml-2 text-xs">Ref: {entry.referenceNumber}</span>
                        )}
                      </div>
                      <div className="md:w-28 mt-2 md:mt-0">
                        {(() => {
                          const sourceLink = getSourceLink(entry);
                          const badge = (
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${SOURCE_COLORS[entry.source] || 'bg-gray-100 text-gray-700'}`}>
                              {SOURCE_LABELS[entry.source] || entry.source}
                            </span>
                          );
                          return sourceLink ? (
                            <Link href={sourceLink} onClick={(e) => e.stopPropagation()} className="hover:opacity-80">
                              {badge}
                            </Link>
                          ) : badge;
                        })()}
                      </div>
                      <div className="md:w-20 mt-2 md:mt-0">
                        {entry.status === 'voided' ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">Voided</span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Posted</span>
                        )}
                      </div>
                      <div className={`md:w-28 text-sm text-right font-medium ${entry.status === 'voided' ? 'text-gray-400' : 'text-gray-900'}`}>
                        {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(getEntryTotal(entry))}
                      </div>
                      <div className="md:w-24 text-right flex items-center justify-end gap-2">
                        <Link
                          href={`/bookkeeping/journal-entries/${entry.id}`}
                          className="text-blue-600 hover:text-blue-700 text-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          View
                        </Link>
                        <span className="text-gray-300">|</span>
                        <span className="text-gray-400 text-sm">
                          {expandedId === entry.id ? '\u25B2' : '\u25BC'}
                        </span>
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
                                <td className="py-1.5">
                                  <Link
                                    href={`/bookkeeping/accounts/${line.account.id}`}
                                    className="text-blue-600 hover:text-blue-700"
                                  >
                                    <span className="font-mono text-xs text-gray-500 mr-1">{line.account.code}</span>
                                    {line.account.name}
                                  </Link>
                                </td>
                                <td className="py-1.5 text-gray-500">{line.description || ''}</td>
                                <td className="py-1.5 text-right font-medium">{formatCurrency(line.debit)}</td>
                                <td className="py-1.5 text-right font-medium">{formatCurrency(line.credit)}</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot className="border-t border-gray-300">
                            <tr className="font-semibold text-gray-700">
                              <td className="py-2" colSpan={2}>Totals</td>
                              <td className="py-2 text-right">
                                {formatCurrency(entry.lines.reduce((sum, l) => sum + l.debit, 0))}
                              </td>
                              <td className="py-2 text-right">
                                {formatCurrency(entry.lines.reduce((sum, l) => sum + l.credit, 0))}
                              </td>
                            </tr>
                          </tfoot>
                        </table>

                        {entry.voidReason && (
                          <div className="mt-3 p-2 bg-red-50 rounded text-sm">
                            <span className="font-medium text-red-700">Void Reason:</span>{' '}
                            <span className="text-red-600">{entry.voidReason}</span>
                            {entry.voidedAt && (
                              <span className="text-red-400 ml-2">
                                ({formatDate(entry.voidedAt)})
                              </span>
                            )}
                          </div>
                        )}

                        {entry.notes && (
                          <p className="mt-2 text-xs text-gray-500">
                            <span className="font-medium">Notes:</span> {entry.notes}
                          </p>
                        )}

                        <div className="mt-3 flex gap-4">
                          <Link
                            href={`/bookkeeping/journal-entries/${entry.id}`}
                            className="text-blue-600 hover:text-blue-700 text-xs font-medium"
                          >
                            View Full Details
                          </Link>
                          {entry.status === 'posted' && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openVoidModal(entry);
                              }}
                              className="text-red-600 hover:text-red-700 text-xs font-medium"
                            >
                              Void Entry
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex justify-between items-center">
                <p className="text-sm text-gray-500">
                  Showing {offset + 1} - {Math.min(offset + limit, total)} of {total} entries
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="px-3 py-1 border rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1 text-sm text-gray-500">
                    Page {currentPage} of {totalPages}
                  </span>
                  <button
                    onClick={() => setOffset(Math.min((totalPages - 1) * limit, offset + limit))}
                    disabled={currentPage >= totalPages}
                    className="px-3 py-1 border rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Void Modal */}
      {voidingEntry && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b">
              <h3 className="text-lg font-semibold text-gray-900">
                Void Journal Entry #{voidingEntry.entryNumber}
              </h3>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-4">
                You are about to void the entry: <strong>{voidingEntry.memo}</strong>
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
