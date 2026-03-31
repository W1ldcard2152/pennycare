'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { computeSuggestedCodes, getSuggestedCode, ACCOUNT_GROUPS, ACCOUNT_TYPE_LABELS } from '@/lib/account-codes';
import type { AccountType } from '@/lib/account-codes';

// Searchable select component for category dropdown
function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select...',
  className = '',
  onAddNew,
}: {
  value: string;
  onChange: (value: string) => void;
  options: { id: string; code: string; name: string }[];
  placeholder?: string;
  className?: string;
  onAddNew?: () => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [dropdownPos, setDropdownPos] = useState<{ top?: number; bottom?: number; left: number }>({ left: 0 });
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
      const dropdownHeight = 220; // Approximate height: search box + max-h-48 (192px) + padding
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;

      // Open upward if not enough space below and more space above
      const shouldOpenUpward = spaceBelow < dropdownHeight && spaceAbove > spaceBelow;
      setOpenUpward(shouldOpenUpward);

      if (shouldOpenUpward) {
        // Use bottom positioning so dropdown stays anchored when content shrinks
        setDropdownPos({
          bottom: window.innerHeight - rect.top + 4,
          left: rect.left + window.scrollX,
        });
      } else {
        setDropdownPos({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
        });
      }
      // Focus after position is set
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const handleSelect = (id: string) => {
    onChange(id);
    setIsOpen(false);
    setSearch('');
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setIsOpen(false);
    setSearch('');
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center justify-between border rounded px-2 py-1 text-xs cursor-pointer bg-white ${
          !value ? 'border-amber-400' : 'border-gray-300'
        }`}
      >
        <span className={`truncate ${selectedOption ? 'text-gray-900' : 'text-gray-400'}`}>
          {selectedOption ? `${selectedOption.code} — ${selectedOption.name}` : placeholder}
        </span>
        <div className="flex items-center gap-1 ml-1">
          {value && (
            <button
              onClick={handleClear}
              className="text-gray-400 hover:text-gray-600 p-0.5"
              title="Clear"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <svg className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {isOpen && (
        <div
          ref={dropdownRef}
          className={`fixed z-[100] w-64 bg-white border border-gray-200 rounded-lg shadow-lg flex ${openUpward ? 'flex-col-reverse' : 'flex-col'}`}
          style={{
            left: dropdownPos.left,
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
              className="w-full border rounded px-2 py-1 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filteredOptions.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-500">No matches found</div>
            ) : (
              filteredOptions.map((option) => (
                <div
                  key={option.id}
                  onClick={() => handleSelect(option.id)}
                  className={`px-3 py-1.5 text-xs cursor-pointer hover:bg-blue-50 ${
                    option.id === value ? 'bg-blue-100 text-blue-800' : 'text-gray-700'
                  }`}
                >
                  <span className="font-medium">{option.code}</span> — {option.name}
                </div>
              ))
            )}
            {onAddNew && (
              <div
                onClick={() => {
                  setIsOpen(false);
                  setSearch('');
                  onAddNew();
                }}
                className="px-3 py-1.5 text-xs cursor-pointer hover:bg-green-50 text-green-700 border-t border-gray-100 flex items-center gap-1"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add new account...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  accountGroup?: string | null;
}

interface StatementImport {
  id: string;
  postDate: string;
  description: string;
  amount: number;
  isDebit: boolean;
  status: 'pending' | 'booked' | 'skipped';
  memo: string | null;
  importBatch: string;
  sourceAccount: { id: string; code: string; name: string };
  targetAccount: { id: string; code: string; name: string } | null;
  matchedRule: { id: string; matchText: string; matchType: string } | null;
  journalEntry: { id: string; entryNumber: string } | null;
}

interface BatchSummary {
  batchName: string;
  sourceAccount: { id: string; code: string; name: string };
  totalCount: number;
  pendingCount: number;
  bookedCount: number;
  skippedCount: number;
  matchedCount: number;
  unmatchedCount: number;
  importedAt: string;
  earliestDate?: string;
  latestDate?: string;
  totalAmount?: number;
}

type Step = 'upload' | 'preview' | 'review' | 'importing' | 'results';

export default function StatementsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [step, setStep] = useState<Step>('upload');
  const [error, setError] = useState('');

  // Upload state
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [batchName, setBatchName] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Preview/results state
  const [uploadResult, setUploadResult] = useState<{
    imported: number;
    duplicates: number;
    matched: number;
    unmatched: number;
    batchName: string;
  } | null>(null);

  // Review state
  const [pendingImports, setPendingImports] = useState<StatementImport[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [selectedBatch, setSelectedBatch] = useState('');
  const [bulkTargetAccountId, setBulkTargetAccountId] = useState('');
  const [isBooking, setIsBooking] = useState(false);

  // Full history state
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [allBatches, setAllBatches] = useState<BatchSummary[]>([]);
  const [historyFilterAccountId, setHistoryFilterAccountId] = useState('');
  const [historyFilterStartDate, setHistoryFilterStartDate] = useState('');
  const [historyFilterEndDate, setHistoryFilterEndDate] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Rule creation state
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleImportId, setRuleImportId] = useState<string | null>(null);
  const [ruleMatchText, setRuleMatchText] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<'starts_with' | 'contains' | 'ends_with'>('starts_with');
  const [ruleTargetAccountId, setRuleTargetAccountId] = useState('');
  const [ruleApplyToAllAccounts, setRuleApplyToAllAccounts] = useState(false);
  const [ruleCreating, setRuleCreating] = useState(false);
  const [ruleSuccessMessage, setRuleSuccessMessage] = useState('');
  const [isApplyingRules, setIsApplyingRules] = useState(false);
  const [applyRulesMessage, setApplyRulesMessage] = useState('');

  // Account creation state
  const [accountModalOpen, setAccountModalOpen] = useState(false);
  const [newAccountCode, setNewAccountCode] = useState('');
  const [newAccountName, setNewAccountName] = useState('');
  const [newAccountType, setNewAccountType] = useState<'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'credit_card'>('expense');
  const [newAccountGroup, setNewAccountGroup] = useState(ACCOUNT_GROUPS['expense'][0] || '');
  const [newAccountDescription, setNewAccountDescription] = useState('');
  const [accountCreating, setAccountCreating] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [suggestedCodes, setSuggestedCodes] = useState<Record<string, string>>({});

  useEffect(() => {
    fetchAccounts();
    fetchBatches();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts?balances=false');
      const data = await res.json();
      const activeAccounts = data.filter((a: Account & { isActive?: boolean }) => a.isActive !== false);
      setAccounts(activeAccounts);
      setSuggestedCodes(computeSuggestedCodes(activeAccounts));
    } catch {
      // handled by empty state
    }
  };

  const fetchBatches = async () => {
    try {
      const res = await fetch('/api/bookkeeping/statements/pending?distinct=batch');
      const data = await res.json();
      // Get unique batch names from pending imports
      const batchNames = [...new Set(data.map((i: StatementImport) => i.importBatch))];

      // Fetch summary for each batch
      const summaries: BatchSummary[] = [];
      for (const batch of batchNames) {
        const batchRes = await fetch(`/api/bookkeeping/statements/batch/${encodeURIComponent(batch as string)}`);
        if (batchRes.ok) {
          summaries.push(await batchRes.json());
        }
      }
      setBatches(summaries);
    } catch {
      // handled by empty state
    }
  };

  const fetchFullHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (historyFilterAccountId) params.append('sourceAccountId', historyFilterAccountId);
      if (historyFilterStartDate) params.append('startDate', historyFilterStartDate);
      if (historyFilterEndDate) params.append('endDate', historyFilterEndDate);

      const res = await fetch(`/api/bookkeeping/statements/history?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setAllBatches(data);
      }
    } catch {
      // handled by empty state
    } finally {
      setLoadingHistory(false);
    }
  }, [historyFilterAccountId, historyFilterStartDate, historyFilterEndDate]);

  // Fetch full history when toggle is enabled or filters change
  useEffect(() => {
    if (showFullHistory) {
      fetchFullHistory();
    }
  }, [showFullHistory, fetchFullHistory]);

  const fetchPendingImports = useCallback(async (batchFilter?: string) => {
    try {
      let url = '/api/bookkeeping/statements/pending?status=pending';
      if (batchFilter) {
        url += `&batchName=${encodeURIComponent(batchFilter)}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      setPendingImports(data);
      setSelectedIds(new Set());
    } catch {
      // handled by empty state
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      // Auto-generate batch name from filename
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setBatchName(nameWithoutExt + ' - ' + new Date().toLocaleDateString('en-US', { timeZone: 'UTC' }));
    }
  };

  const handleUpload = async () => {
    if (!sourceAccountId || !csvFile || !batchName) {
      setError('Please select a source account, provide a batch name, and upload a CSV file');
      return;
    }

    setError('');
    setStep('importing');

    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('sourceAccountId', sourceAccountId);
      formData.append('batchName', batchName);

      const res = await fetch('/api/bookkeeping/statements/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Upload failed');
        setStep('upload');
        return;
      }

      setUploadResult(data);
      setStep('results');
      // Refresh batches list
      fetchBatches();
    } catch {
      setError('Network error during upload');
      setStep('upload');
    }
  };

  const goToReview = (batchNameToReview?: string) => {
    setStep('review');
    setSelectedBatch(batchNameToReview || uploadResult?.batchName || '');
    fetchPendingImports(batchNameToReview || uploadResult?.batchName);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === pendingImports.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(pendingImports.map((i) => i.id)));
    }
  };

  const updateImport = async (id: string, updates: { targetAccountId?: string | null; memo?: string | null; status?: string }) => {
    try {
      const res = await fetch(`/api/bookkeeping/statements/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (res.ok) {
        const updated = await res.json();
        setPendingImports((prev) =>
          prev.map((i) => (i.id === id ? { ...i, ...updated } : i))
        );
      }
    } catch {
      // Silent fail for inline updates
    }
  };

  const applyBulkTargetAccount = () => {
    if (!bulkTargetAccountId || selectedIds.size === 0) return;

    selectedIds.forEach((id) => {
      updateImport(id, { targetAccountId: bulkTargetAccountId });
    });
    setBulkTargetAccountId('');
  };

  const skipSelected = async () => {
    for (const id of selectedIds) {
      await updateImport(id, { status: 'skipped' });
    }
    // Refresh the list
    fetchPendingImports(selectedBatch);
  };

  const bookSelected = async () => {
    if (selectedIds.size === 0) return;

    // Check all selected have target accounts
    const selected = pendingImports.filter((i) => selectedIds.has(i.id));
    const unmatched = selected.filter((i) => !i.targetAccount);
    if (unmatched.length > 0) {
      setError(`${unmatched.length} selected transaction(s) don't have a target account assigned`);
      return;
    }

    setIsBooking(true);
    setError('');

    try {
      const res = await fetch('/api/bookkeeping/statements/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Booking failed');
      } else {
        // Refresh the list
        fetchPendingImports(selectedBatch);
        fetchBatches();
      }
    } catch {
      setError('Network error during booking');
    } finally {
      setIsBooking(false);
    }
  };

  const bookAllMatched = async () => {
    if (!selectedBatch) return;

    setIsBooking(true);
    setError('');

    try {
      const res = await fetch('/api/bookkeeping/statements/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchName: selectedBatch, bookMatched: true }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Booking failed');
      } else {
        // Refresh the list
        fetchPendingImports(selectedBatch);
        fetchBatches();
      }
    } catch {
      setError('Network error during booking');
    } finally {
      setIsBooking(false);
    }
  };

  const openRuleModal = (imp: StatementImport) => {
    if (!imp.targetAccount) return;

    setRuleImportId(imp.id);
    setRuleMatchText(imp.description);
    setRuleMatchType('starts_with');
    setRuleTargetAccountId(imp.targetAccount.id);
    setRuleApplyToAllAccounts(true);
    setRuleSuccessMessage('');
    setRuleModalOpen(true);
  };

  const closeRuleModal = () => {
    setRuleModalOpen(false);
    setRuleImportId(null);
    setRuleMatchText('');
    setRuleTargetAccountId('');
    setRuleCreating(false);
    setRuleSuccessMessage('');
  };

  const handleCreateRule = async () => {
    if (!ruleMatchText.trim() || !ruleTargetAccountId || !ruleImportId) {
      return;
    }

    const imp = pendingImports.find(i => i.id === ruleImportId);
    if (!imp) return;

    setRuleCreating(true);
    setRuleSuccessMessage('');

    try {
      // Create the rule
      const ruleRes = await fetch('/api/bookkeeping/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${ruleMatchText.substring(0, 30)}${ruleMatchText.length > 30 ? '...' : ''}`,
          matchType: ruleMatchType,
          matchText: ruleMatchText,
          targetAccountId: ruleTargetAccountId,
          sourceAccountId: ruleApplyToAllAccounts ? null : imp.sourceAccount.id,
          isActive: true,
          priority: 100,
        }),
      });

      if (!ruleRes.ok) {
        const data = await ruleRes.json();
        setError(data.error || 'Failed to create rule');
        setRuleCreating(false);
        return;
      }

      setRuleSuccessMessage('Rule created! Click "Apply Rules" to match transactions.');

      // Close modal after a short delay to show success message
      setTimeout(() => {
        closeRuleModal();
      }, 1500);

    } catch {
      setError('Network error creating rule');
      setRuleCreating(false);
    }
  };

  const applyRulesToUnmatched = async () => {
    const unmatchedImports = pendingImports.filter(i => !i.targetAccount);
    if (unmatchedImports.length === 0) {
      setApplyRulesMessage('No unmatched transactions to process.');
      setTimeout(() => setApplyRulesMessage(''), 3000);
      return;
    }

    // Get unique source accounts from unmatched imports
    const sourceAccountIds = [...new Set(unmatchedImports.map(i => i.sourceAccount.id))];

    setIsApplyingRules(true);
    setApplyRulesMessage('');
    setError('');

    try {
      let totalMatched = 0;

      // Process each source account separately (rules can be account-specific)
      for (const sourceAcctId of sourceAccountIds) {
        const importsForAccount = unmatchedImports.filter(i => i.sourceAccount.id === sourceAcctId);

        const testRes = await fetch('/api/bookkeeping/rules/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descriptions: importsForAccount.map(i => i.description),
            sourceAccountId: sourceAcctId,
          }),
        });

        if (testRes.ok) {
          const matches = await testRes.json();

          // Update matched imports in the database
          const updatePromises: Promise<void>[] = [];
          for (let i = 0; i < importsForAccount.length; i++) {
            const match = matches[i];
            if (match) {
              totalMatched++;
              const updatePromise = fetch(`/api/bookkeeping/statements/${importsForAccount[i].id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  targetAccountId: match.targetAccountId,
                  matchedRuleId: match.ruleId,
                }),
              }).then(() => {});
              updatePromises.push(updatePromise);
            }
          }

          await Promise.all(updatePromises);
        }
      }

      if (totalMatched > 0) {
        setApplyRulesMessage(`${totalMatched} transaction${totalMatched > 1 ? 's' : ''} matched!`);
        // Refresh the list
        await fetchPendingImports(selectedBatch);
      } else {
        setApplyRulesMessage('No new matches found.');
      }

      setTimeout(() => setApplyRulesMessage(''), 3000);
    } catch {
      setError('Network error applying rules');
    } finally {
      setIsApplyingRules(false);
    }
  };

  // Account creation handlers - use shared ACCOUNT_GROUPS from lib/account-codes.ts
  const getGroupOptions = (type: string): { value: string; label: string }[] => {
    const groups = ACCOUNT_GROUPS[type as AccountType] || [];
    return groups.map(g => ({ value: g, label: g }));
  };

  const openAccountModal = () => {
    const defaultType = 'expense';
    const defaultGroup = ACCOUNT_GROUPS[defaultType][0] || '';
    setNewAccountCode(getSuggestedCode(suggestedCodes, defaultGroup));
    setNewAccountName('');
    setNewAccountType(defaultType);
    setNewAccountGroup(defaultGroup);
    setNewAccountDescription('');
    setAccountError('');
    setAccountModalOpen(true);
  };

  const closeAccountModal = () => {
    setAccountModalOpen(false);
    setAccountError('');
  };

  const handleAccountTypeChange = (type: typeof newAccountType) => {
    setNewAccountType(type);
    const groups = ACCOUNT_GROUPS[type];
    if (groups && groups.length > 0) {
      const newGroup = groups[0];
      setNewAccountGroup(newGroup);
      setNewAccountCode(getSuggestedCode(suggestedCodes, newGroup));
    }
  };

  const handleAccountGroupChange = (group: string) => {
    setNewAccountGroup(group);
    setNewAccountCode(getSuggestedCode(suggestedCodes, group));
  };

  const handleCreateAccount = async () => {
    if (!newAccountCode.trim() || !newAccountName.trim()) {
      setAccountError('Code and name are required');
      return;
    }

    setAccountCreating(true);
    setAccountError('');

    try {
      const res = await fetch('/api/bookkeeping/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: newAccountCode.trim(),
          name: newAccountName.trim(),
          type: newAccountType,
          accountGroup: newAccountGroup,
          description: newAccountDescription.trim() || null,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setAccountError(data.error || 'Failed to create account');
        setAccountCreating(false);
        return;
      }

      // Refresh accounts list (this also updates suggested codes)
      await fetchAccounts();
      closeAccountModal();
    } catch {
      setAccountError('Network error creating account');
    } finally {
      setAccountCreating(false);
    }
  };

  const deleteBatch = async (batchToDelete: string) => {
    if (!confirm(`Delete batch "${batchToDelete}"? This will void any booked journal entries.`)) {
      return;
    }

    try {
      const res = await fetch(`/api/bookkeeping/statements/batch/${encodeURIComponent(batchToDelete)}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchBatches();
        if (selectedBatch === batchToDelete) {
          setSelectedBatch('');
          setPendingImports([]);
        }
      }
    } catch {
      setError('Failed to delete batch');
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { timeZone: 'UTC' });
  };

  // Filter accounts by type
  const bankAccounts = accounts.filter((a) =>
    (a.type === 'asset' && a.accountGroup === 'Cash') ||
    a.type === 'credit_card'
  );
  const targetAccounts = accounts.filter((a) =>
    a.type === 'expense' || a.type === 'asset' || a.type === 'liability'
  );

  const matchedCount = pendingImports.filter((i) => i.targetAccount).length;
  const unmatchedCount = pendingImports.length - matchedCount;

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">Dashboard</Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">Statement Import</span>
        </div>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-gray-900">Statement Import</h1>
            <p className="text-gray-600">
              Import bank or credit card statement CSVs and book transactions with auto-categorization
            </p>
          </div>
          <div className="flex items-center gap-2">
            {step === 'review' && unmatchedCount > 0 && (
              <button
                onClick={applyRulesToUnmatched}
                disabled={isApplyingRules}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
              >
                {isApplyingRules ? 'Applying...' : 'Apply Rules'}
              </button>
            )}
            <Link
              href="/bookkeeping/rules"
              target="_blank"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              Manage Rules
            </Link>
            <button
              onClick={openAccountModal}
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              + Add Account
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        {applyRulesMessage && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm font-medium">{applyRulesMessage}</div>
        )}

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-6">
            {/* Import History */}
            {(batches.length > 0 || showFullHistory || bankAccounts.length > 0) && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">
                    {showFullHistory ? 'Statement Import History' : 'Pending Batches'}
                  </h2>
                  <button
                    onClick={() => setShowFullHistory(!showFullHistory)}
                    className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                  >
                    {showFullHistory ? (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                        Show Pending Only
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                        Show All History
                      </>
                    )}
                  </button>
                </div>

                {/* Filters (only shown when full history is enabled) */}
                {showFullHistory && (
                  <div className="px-4 py-3 border-b bg-gray-50">
                    <div className="flex flex-wrap gap-4 items-end">
                      <div className="flex-1 min-w-[200px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Source Account
                        </label>
                        <select
                          value={historyFilterAccountId}
                          onChange={(e) => setHistoryFilterAccountId(e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm text-gray-900"
                        >
                          <option value="">All Accounts</option>
                          {bankAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-[140px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Start Date
                        </label>
                        <input
                          type="date"
                          value={historyFilterStartDate}
                          onChange={(e) => setHistoryFilterStartDate(e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm text-gray-900"
                        />
                      </div>
                      <div className="min-w-[140px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          End Date
                        </label>
                        <input
                          type="date"
                          value={historyFilterEndDate}
                          onChange={(e) => setHistoryFilterEndDate(e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm text-gray-900"
                        />
                      </div>
                      {(historyFilterAccountId || historyFilterStartDate || historyFilterEndDate) && (
                        <button
                          onClick={() => {
                            setHistoryFilterAccountId('');
                            setHistoryFilterStartDate('');
                            setHistoryFilterEndDate('');
                          }}
                          className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5"
                        >
                          Clear Filters
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* Loading state */}
                {showFullHistory && loadingHistory && (
                  <div className="px-4 py-8 text-center text-gray-500">
                    Loading history...
                  </div>
                )}

                {/* Batch list */}
                <div className="divide-y">
                  {(showFullHistory ? allBatches : batches).map((batch) => (
                    <div key={batch.batchName} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{batch.batchName}</div>
                        <div className="text-sm text-gray-500">
                          {batch.sourceAccount.code} — {batch.sourceAccount.name}
                          {showFullHistory && batch.earliestDate && batch.latestDate && (
                            <>
                              {' '}• {formatDate(batch.earliestDate)}
                              {batch.earliestDate !== batch.latestDate && ` to ${formatDate(batch.latestDate)}`}
                            </>
                          )}
                          {' '}• {batch.pendingCount} pending, {batch.bookedCount} booked
                          {batch.unmatchedCount > 0 && (
                            <span className="text-amber-600"> • {batch.unmatchedCount} need categorization</span>
                          )}
                          {showFullHistory && batch.totalAmount !== undefined && batch.totalAmount > 0 && (
                            <span className="ml-2 text-gray-500">
                              • Total: {formatCurrency(batch.totalAmount)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {batch.pendingCount > 0 && (
                          <button
                            onClick={() => goToReview(batch.batchName)}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium"
                          >
                            Review
                          </button>
                        )}
                        <button
                          onClick={() => deleteBatch(batch.batchName)}
                          className="text-red-600 hover:text-red-700 px-2 py-1.5 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}

                  {/* Empty state */}
                  {showFullHistory && !loadingHistory && allBatches.length === 0 && (
                    <div className="px-4 py-8 text-center text-gray-500 text-sm">
                      No import history found
                      {(historyFilterAccountId || historyFilterStartDate || historyFilterEndDate) && ' matching filters'}
                    </div>
                  )}
                  {!showFullHistory && batches.length === 0 && (
                    <div className="px-4 py-4 text-center text-gray-500 text-sm">
                      No pending batches
                    </div>
                  )}
                </div>

                {/* Footer with count */}
                {showFullHistory && allBatches.length > 0 && (
                  <div className="px-4 py-2 border-t bg-gray-50 text-xs text-gray-500">
                    Showing {allBatches.length} batch{allBatches.length !== 1 ? 'es' : ''}
                  </div>
                )}
              </div>
            )}

            {/* Upload Form */}
            <div className="bg-white border rounded-lg p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-4 text-gray-900">Upload New Statement</h2>

              <div className="space-y-4">
                {/* Source Account */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Account (Bank or Credit Card)
                  </label>
                  <select
                    value={sourceAccountId}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                    className="w-full max-w-md border rounded-lg px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">Select account...</option>
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.code} — {a.name} ({a.type === 'credit_card' ? 'Credit Card' : 'Bank'})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Batch Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Batch Name (for tracking)
                  </label>
                  <input
                    type="text"
                    value={batchName}
                    onChange={(e) => setBatchName(e.target.value)}
                    placeholder="e.g., Chase Checking Jan 2024"
                    className="w-full max-w-md border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
                  />
                </div>

                {/* File Upload */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    CSV File
                  </label>
                  <div className="mb-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 max-w-xl">
                    <p className="font-medium mb-1">Expected CSV format:</p>
                    <p className="font-mono text-xs">Account Number, Post Date, Check, Description, Debit, Credit, Status, Balance</p>
                    <p className="text-xs mt-1">Standard bank CSV export format. Debit column = money out, Credit column = money in.</p>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="block w-full max-w-md text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
                  />
                  {csvFile && (
                    <p className="mt-2 text-sm text-gray-600">Selected: {csvFile.name}</p>
                  )}
                </div>

                <button
                  onClick={handleUpload}
                  disabled={!sourceAccountId || !csvFile || !batchName}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    sourceAccountId && csvFile && batchName
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Upload & Process
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Importing */}
        {step === 'importing' && (
          <div className="bg-white border rounded-lg p-12 shadow-sm text-center">
            <div className="animate-pulse text-gray-500 text-lg">Processing statement...</div>
          </div>
        )}

        {/* Step: Results */}
        {step === 'results' && uploadResult && (
          <div className="bg-white border rounded-lg p-8 shadow-sm">
            <div className="text-center">
              <div className="text-green-600 text-5xl mb-4">✓</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Upload Complete</h2>
              <p className="text-gray-600 mb-4">
                Imported <span className="font-semibold">{uploadResult.imported}</span> transaction{uploadResult.imported !== 1 ? 's' : ''}
                {uploadResult.duplicates > 0 && (
                  <span className="text-gray-500"> ({uploadResult.duplicates} duplicate{uploadResult.duplicates !== 1 ? 's' : ''} skipped)</span>
                )}
              </p>
              <div className="flex gap-4 justify-center mb-6">
                <div className="bg-green-50 px-4 py-2 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">{uploadResult.matched}</div>
                  <div className="text-sm text-green-700">Auto-matched</div>
                </div>
                <div className="bg-amber-50 px-4 py-2 rounded-lg">
                  <div className="text-2xl font-bold text-amber-600">{uploadResult.unmatched}</div>
                  <div className="text-sm text-amber-700">Need Review</div>
                </div>
              </div>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => goToReview()}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Review & Book Transactions
                </button>
                <button
                  onClick={() => { setStep('upload'); setUploadResult(null); setCsvFile(null); setBatchName(''); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Upload Another
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === 'review' && (
          <div className="space-y-4">
            {/* Batch Selector & Actions */}
            <div className="bg-white border rounded-lg p-4 shadow-sm flex flex-wrap gap-4 items-center justify-between">
              <div className="flex items-center gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Batch</label>
                  <select
                    value={selectedBatch}
                    onChange={(e) => { setSelectedBatch(e.target.value); fetchPendingImports(e.target.value); }}
                    className="border rounded px-3 py-1.5 text-sm text-gray-900"
                  >
                    <option value="">All pending</option>
                    {batches.map((b) => (
                      <option key={b.batchName} value={b.batchName}>{b.batchName}</option>
                    ))}
                  </select>
                </div>
                <div className="text-sm text-gray-600">
                  {pendingImports.length} pending •
                  <span className="text-green-600 ml-1">{matchedCount} matched</span> •
                  <span className="text-amber-600 ml-1">{unmatchedCount} unmatched</span>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setStep('upload'); setSelectedBatch(''); setPendingImports([]); }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded text-sm font-medium"
                >
                  Back to Upload
                </button>
                {selectedBatch && matchedCount > 0 && (
                  <button
                    onClick={bookAllMatched}
                    disabled={isBooking}
                    className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm font-medium disabled:opacity-50"
                  >
                    {isBooking ? 'Booking...' : `Book All Matched (${matchedCount})`}
                  </button>
                )}
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedIds.size > 0 && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-wrap gap-3 items-center">
                <span className="text-sm font-medium text-blue-800">{selectedIds.size} selected</span>
                <div className="flex items-center gap-2">
                  <select
                    value={bulkTargetAccountId}
                    onChange={(e) => setBulkTargetAccountId(e.target.value)}
                    className="border rounded px-2 py-1 text-xs text-gray-900"
                  >
                    <option value="">Set category...</option>
                    {targetAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={applyBulkTargetAccount}
                    disabled={!bulkTargetAccountId}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                  >
                    Apply
                  </button>
                </div>
                <button
                  onClick={bookSelected}
                  disabled={isBooking}
                  className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-xs font-medium disabled:opacity-50"
                >
                  Book Selected
                </button>
                <button
                  onClick={skipSelected}
                  className="text-gray-600 hover:text-gray-800 px-3 py-1 text-xs font-medium"
                >
                  Skip Selected
                </button>
              </div>
            )}

            {/* Transactions Table */}
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedIds.size === pendingImports.length && pendingImports.length > 0}
                        onChange={toggleSelectAll}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">Amount</th>
                    <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase w-16">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-64">Category</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-24">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {pendingImports.map((imp) => (
                    <tr key={imp.id} className={`${!imp.targetAccount ? 'bg-amber-50' : ''}`}>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(imp.id)}
                          onChange={() => toggleSelect(imp.id)}
                          className="rounded"
                        />
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{formatDate(imp.postDate)}</td>
                      <td className="px-3 py-2">
                        <div className="text-gray-900">{imp.description}</div>
                        {imp.matchedRule && (
                          <div className="text-xs text-green-600">
                            Rule: {imp.matchedRule.matchType} &quot;{imp.matchedRule.matchText}&quot;
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-right font-medium">
                        <span className={imp.isDebit ? 'text-red-600' : 'text-green-600'}>
                          {imp.isDebit ? '-' : '+'}{formatCurrency(imp.amount)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${imp.isDebit ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                          {imp.isDebit ? 'OUT' : 'IN'}
                        </span>
                      </td>
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <SearchableSelect
                            value={imp.targetAccount?.id || ''}
                            onChange={(value) => updateImport(imp.id, { targetAccountId: value || null })}
                            options={targetAccounts}
                            placeholder="Select category..."
                            className="flex-1"
                            onAddNew={openAccountModal}
                          />
                          {imp.targetAccount && (
                            <button
                              onClick={() => openRuleModal(imp)}
                              className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                              title="Create a rule for this transaction"
                            >
                              + Rule
                            </button>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                          imp.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                          imp.status === 'booked' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {imp.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {pendingImports.length === 0 && (
                <div className="text-center py-12 text-gray-500">
                  {selectedBatch ? 'No pending transactions in this batch' : 'No pending transactions'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rule Creation Modal */}
        {ruleModalOpen && ruleImportId && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Create Transaction Rule</h3>
                <p className="text-sm text-gray-500 mt-1">
                  This rule will auto-categorize matching transactions in future imports.
                </p>
              </div>

              <div className="px-6 py-4 space-y-4">
                {/* Source Transaction Preview */}
                <div className="bg-gray-50 rounded-lg p-3 text-sm">
                  <div className="text-xs text-gray-500 uppercase mb-1">Source Transaction</div>
                  <div className="font-medium text-gray-900 truncate">
                    {pendingImports.find(i => i.id === ruleImportId)?.description}
                  </div>
                </div>

                {/* Match Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Match Type
                  </label>
                  <select
                    value={ruleMatchType}
                    onChange={(e) => setRuleMatchType(e.target.value as typeof ruleMatchType)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="starts_with">Starts with</option>
                    <option value="contains">Contains</option>
                    <option value="ends_with">Ends with</option>
                  </select>
                </div>

                {/* Match Text */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Match Text
                  </label>
                  <input
                    type="text"
                    value={ruleMatchText}
                    onChange={(e) => setRuleMatchText(e.target.value)}
                    placeholder="Text to match..."
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Transactions where description {ruleMatchType.replace('_', ' ')} this text will match.
                  </p>
                </div>

                {/* Target Account */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Target Category
                  </label>
                  <select
                    value={ruleTargetAccountId}
                    onChange={(e) => setRuleTargetAccountId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">Select category...</option>
                    {targetAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>

                {/* Scope Toggle */}
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id="ruleApplyAllAccounts"
                    checked={ruleApplyToAllAccounts}
                    onChange={(e) => setRuleApplyToAllAccounts(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="ruleApplyAllAccounts" className="text-sm text-gray-700">
                    Apply to all accounts
                  </label>
                </div>
                <p className="text-xs text-gray-500 -mt-2 ml-6">
                  {ruleApplyToAllAccounts
                    ? 'Rule will match transactions from any account'
                    : `Rule will only match transactions from ${pendingImports.find(i => i.id === ruleImportId)?.sourceAccount.name || 'this account'}`}
                </p>

                {/* Success Message */}
                {ruleSuccessMessage && (
                  <div className="bg-green-50 text-green-700 px-3 py-2 rounded-lg text-sm font-medium">
                    {ruleSuccessMessage}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={closeRuleModal}
                  disabled={ruleCreating}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateRule}
                  disabled={ruleCreating || !ruleMatchText.trim() || !ruleTargetAccountId}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    ruleCreating || !ruleMatchText.trim() || !ruleTargetAccountId
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 text-white'
                  }`}
                >
                  {ruleCreating ? 'Creating...' : 'Create Rule'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Account Creation Modal */}
        {accountModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Add New Account</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Create a new account for categorizing transactions.
                </p>
              </div>

              <div className="px-6 py-4 space-y-4">
                {/* Account Code */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Code <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newAccountCode}
                    onChange={(e) => setNewAccountCode(e.target.value)}
                    placeholder="e.g., 6100"
                    maxLength={10}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Next available code suggested based on account type
                  </p>
                </div>

                {/* Account Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newAccountName}
                    onChange={(e) => setNewAccountName(e.target.value)}
                    placeholder="e.g., Office Supplies"
                    maxLength={100}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </div>

                {/* Account Type */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Type
                  </label>
                  <select
                    value={newAccountType}
                    onChange={(e) => handleAccountTypeChange(e.target.value as typeof newAccountType)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="expense">Expense</option>
                    <option value="revenue">Revenue</option>
                    <option value="asset">Asset</option>
                    <option value="liability">Liability</option>
                    <option value="equity">Equity</option>
                    <option value="credit_card">Credit Card</option>
                  </select>
                </div>

                {/* Account Group */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Group
                  </label>
                  <select
                    value={newAccountGroup}
                    onChange={(e) => handleAccountGroupChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  >
                    {getGroupOptions(newAccountType).map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={newAccountDescription}
                    onChange={(e) => setNewAccountDescription(e.target.value)}
                    placeholder="Optional description..."
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                </div>

                {/* Error Message */}
                {accountError && (
                  <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">
                    {accountError}
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={closeAccountModal}
                  disabled={accountCreating}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAccount}
                  disabled={accountCreating || !newAccountCode.trim() || !newAccountName.trim()}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    accountCreating || !newAccountCode.trim() || !newAccountName.trim()
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-700 text-white'
                  }`}
                >
                  {accountCreating ? 'Creating...' : 'Create Account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
