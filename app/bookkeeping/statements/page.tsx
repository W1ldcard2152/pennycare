'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string;
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

  useEffect(() => {
    fetchAccounts();
    fetchBatches();
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts?balances=false');
      const data = await res.json();
      setAccounts(data.filter((a: Account & { isActive?: boolean }) => a.isActive !== false));
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
      setBatchName(nameWithoutExt + ' - ' + new Date().toLocaleDateString());
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
    return d.toLocaleDateString();
  };

  // Filter accounts by type
  const bankAccounts = accounts.filter((a) =>
    (a.type === 'asset' && (a.subtype === 'bank_checking' || a.subtype === 'bank_savings')) ||
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
          <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">Statement Import</span>
        </div>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2">Statement Import</h1>
            <p className="text-gray-600">
              Import bank or credit card statement CSVs and book transactions with auto-categorization
            </p>
          </div>
          <Link
            href="/bookkeeping/rules"
            className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            Manage Rules
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        {/* Step: Upload */}
        {step === 'upload' && (
          <div className="space-y-6">
            {/* Existing Batches */}
            {batches.length > 0 && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b">
                  <h2 className="font-semibold">Pending Batches</h2>
                </div>
                <div className="divide-y">
                  {batches.map((batch) => (
                    <div key={batch.batchName} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{batch.batchName}</div>
                        <div className="text-sm text-gray-500">
                          {batch.sourceAccount.code} — {batch.sourceAccount.name} •
                          {' '}{batch.pendingCount} pending, {batch.bookedCount} booked
                          {batch.unmatchedCount > 0 && (
                            <span className="text-amber-600"> • {batch.unmatchedCount} need categorization</span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => goToReview(batch.batchName)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium"
                        >
                          Review
                        </button>
                        <button
                          onClick={() => deleteBatch(batch.batchName)}
                          className="text-red-600 hover:text-red-700 px-2 py-1.5 text-sm font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upload Form */}
            <div className="bg-white border rounded-lg p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-4">Upload New Statement</h2>

              <div className="space-y-4">
                {/* Source Account */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Account (Bank or Credit Card)
                  </label>
                  <select
                    value={sourceAccountId}
                    onChange={(e) => setSourceAccountId(e.target.value)}
                    className="w-full max-w-md border rounded-lg px-3 py-2 text-sm"
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
                    className="w-full max-w-md border rounded-lg px-3 py-2 text-sm"
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
                    className="border rounded px-3 py-1.5 text-sm"
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
                    className="border rounded px-2 py-1 text-xs"
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
                        <select
                          value={imp.targetAccount?.id || ''}
                          onChange={(e) => updateImport(imp.id, { targetAccountId: e.target.value || null })}
                          className={`w-full border rounded px-2 py-1 text-xs ${!imp.targetAccount ? 'border-amber-400' : ''}`}
                        >
                          <option value="">Select category...</option>
                          {targetAccounts.map((a) => (
                            <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                          ))}
                        </select>
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
      </div>
    </div>
  );
}
