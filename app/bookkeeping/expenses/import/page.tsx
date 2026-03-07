'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import Papa from 'papaparse';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

interface ParsedRow {
  index: number;
  selected: boolean;
  date: string;
  description: string;
  amount: string;
  debitAccountId: string;
  errors: string[];
}

interface ImportRule {
  id: string;
  pattern: string;
  debitAccountId: string;
}

const RULES_STORAGE_KEY = 'pennycare_import_rules';

function loadRules(): ImportRule[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveRules(rules: ImportRule[]) {
  localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(rules));
}

function isValidDate(dateStr: string): boolean {
  const d = new Date(dateStr);
  return !isNaN(d.getTime());
}

export default function ImportStatementsPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'results'>('upload');
  const [parseError, setParseError] = useState('');
  const [csvText, setCsvText] = useState('');
  const [importResult, setImportResult] = useState<{
    success: boolean;
    created: number;
    journalEntriesCreated: number;
    totalAmount: number;
    error?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Rules state
  const [rules, setRules] = useState<ImportRule[]>([]);
  const [newRulePattern, setNewRulePattern] = useState('');
  const [newRuleAccountId, setNewRuleAccountId] = useState('');
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    fetchAccounts();
    setRules(loadRules());
  }, []);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts');
      const data = await res.json();
      setAccounts(data.filter((a: Account & { isActive?: boolean }) => a.isActive !== false));
    } catch {
      // handled by empty state
    }
  };

  const validateRow = (row: ParsedRow): string[] => {
    const errors: string[] = [];
    if (!row.date || !isValidDate(row.date)) errors.push('Invalid date');
    if (!row.description.trim()) errors.push('Missing description');
    const amt = parseFloat(row.amount);
    if (isNaN(amt) || amt <= 0) errors.push('Invalid amount');
    if (!row.debitAccountId) errors.push('No expense account');
    return errors;
  };

  // Apply rules to a single row — returns the debitAccountId if a rule matches
  const applyRulesToRow = useCallback((description: string, currentRules: ImportRule[]): string => {
    const descLower = description.toLowerCase();
    for (const rule of currentRules) {
      if (descLower.includes(rule.pattern.toLowerCase())) {
        return rule.debitAccountId;
      }
    }
    return '';
  }, []);

  // Apply all rules to all rows
  const applyRulesToAllRows = useCallback((currentRules: ImportRule[]) => {
    setRows((prev) => prev.map((r) => {
      const ruleMatch = applyRulesToRow(r.description, currentRules);
      // Only apply rule if the row doesn't already have an account set,
      // or if the current account came from a previous rule application
      const updated = { ...r, debitAccountId: ruleMatch || r.debitAccountId };
      updated.errors = validateRow(updated);
      return updated;
    }));
  }, [applyRulesToRow]);

  const parseCSV = (text: string) => {
    setParseError('');

    const result = Papa.parse(text.trim(), {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header: string) => header.trim(),
    });

    if (result.errors.length > 0) {
      const criticalErrors = result.errors.filter((e) => e.type !== 'FieldMismatch');
      if (criticalErrors.length > 0) {
        setParseError(`CSV parse error: ${criticalErrors[0].message} (row ${criticalErrors[0].row})`);
        return;
      }
    }

    if (!result.data || result.data.length === 0) {
      setParseError('No data found in CSV');
      return;
    }

    const currentRules = loadRules();

    const parsed: ParsedRow[] = (result.data as Record<string, string>[]).map((row, idx) => {
      const date = row['Date'] || row['date'] || '';
      const description = row['Description'] || row['description'] || '';
      const amount = row['Amount'] || row['amount'] || '';

      // Apply rules to auto-assign debit account
      const ruleMatch = applyRulesToRow(description, currentRules);

      const parsedRow: ParsedRow = {
        index: idx,
        selected: true,
        date,
        description,
        amount,
        debitAccountId: ruleMatch,
        errors: [],
      };

      parsedRow.errors = validateRow(parsedRow);
      return parsedRow;
    });

    setRows(parsed);
    setStep('preview');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      setCsvText(text);
      parseCSV(text);
    };
    reader.readAsText(file);
  };

  const handlePasteAndParse = () => {
    if (!csvText.trim()) {
      setParseError('Please paste CSV data or upload a file');
      return;
    }
    parseCSV(csvText);
  };

  const updateRow = (index: number, field: keyof ParsedRow, value: string | boolean) => {
    setRows((prev) => prev.map((r) => {
      if (r.index !== index) return r;
      const updated = { ...r, [field]: value };
      updated.errors = validateRow(updated as ParsedRow);
      return updated as ParsedRow;
    }));
  };

  const toggleAll = (selected: boolean) => {
    setRows((prev) => prev.map((r) => ({ ...r, selected })));
  };

  // ---- Rule management ----
  const addRule = () => {
    const pattern = newRulePattern.trim();
    if (!pattern || !newRuleAccountId) return;

    const newRule: ImportRule = {
      id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      pattern,
      debitAccountId: newRuleAccountId,
    };

    const updated = [...rules, newRule];
    setRules(updated);
    saveRules(updated);
    setNewRulePattern('');
    setNewRuleAccountId('');

    // Auto-apply the new rule to existing rows
    applyRulesToAllRows(updated);
  };

  const deleteRule = (id: string) => {
    const updated = rules.filter((r) => r.id !== id);
    setRules(updated);
    saveRules(updated);
  };

  const reapplyAllRules = () => {
    // Reset all debit accounts and reapply from scratch
    setRows((prev) => prev.map((r) => {
      const ruleMatch = applyRulesToRow(r.description, rules);
      const updated = { ...r, debitAccountId: ruleMatch };
      updated.errors = validateRow(updated);
      return updated;
    }));
  };

  // Bulk: set account for all selected rows that don't have one yet
  const [bulkDebitAccountId, setBulkDebitAccountId] = useState('');
  const applyBulkDebitAccount = () => {
    if (!bulkDebitAccountId) return;
    setRows((prev) => prev.map((r) => {
      if (!r.selected) return r;
      const updated = { ...r, debitAccountId: bulkDebitAccountId };
      updated.errors = validateRow(updated);
      return updated;
    }));
    setBulkDebitAccountId('');
  };

  const selectedRows = rows.filter((r) => r.selected);
  const validSelectedRows = selectedRows.filter((r) => r.errors.length === 0);
  const selectedTotal = selectedRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
  const unmappedCount = selectedRows.filter((r) => !r.debitAccountId).length;

  const doImport = async () => {
    if (!sourceAccountId) {
      setParseError('Please select a source account');
      return;
    }

    setStep('importing');
    try {
      const payload = {
        sourceAccountId,
        expenses: validSelectedRows.map((r) => ({
          date: r.date,
          description: r.description,
          amount: parseFloat(r.amount),
          debitAccountId: r.debitAccountId,
          isPaid: true,
        })),
      };

      const res = await fetch('/api/bookkeeping/expenses/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        setImportResult({ success: false, created: 0, journalEntriesCreated: 0, totalAmount: 0, error: data.error });
      } else {
        setImportResult({
          success: true,
          created: data.created,
          journalEntriesCreated: data.journalEntriesCreated,
          totalAmount: data.totalAmount,
        });
      }
      setStep('results');
    } catch {
      setImportResult({ success: false, created: 0, journalEntriesCreated: 0, totalAmount: 0, error: 'Network error' });
      setStep('results');
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const expenseAccounts = accounts.filter((a) => a.type === 'expense');
  const allAccountsSorted = [...accounts].sort((a, b) => a.code.localeCompare(b.code));

  const getAccountLabel = (id: string) => {
    const acct = accounts.find((a) => a.id === id);
    return acct ? `${acct.code} — ${acct.name}` : '';
  };

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
          <span className="text-gray-400">/</span>
          <Link href="/bookkeeping/expenses" className="text-blue-600 hover:text-blue-700 text-sm">Expenses</Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">Import</span>
        </div>
        <h1 className="text-3xl font-bold mb-2">Upload Statements</h1>
        <p className="text-gray-600 mb-6">
          Upload a CSV extracted from a bank or credit card statement to import transactions.
        </p>

        {/* Source Account Selector - Always visible */}
        <div className="mb-6 bg-white border rounded-lg p-4 shadow-sm">
          <label className="block text-sm font-semibold text-gray-700 mb-1">
            Source Account — Where do these transactions come from?
          </label>
          <p className="text-xs text-gray-500 mb-2">
            This is the account being charged (e.g. your checking account or credit card). It becomes the credit side of each journal entry.
          </p>
          <select
            value={sourceAccountId}
            onChange={(e) => setSourceAccountId(e.target.value)}
            className="w-full max-w-md border rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Select source account...</option>
            {allAccountsSorted.map((a) => (
              <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
            ))}
          </select>
        </div>

        {parseError && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{parseError}</div>
        )}

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="bg-white border rounded-lg p-6 shadow-sm">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-semibold">Upload CSV</h2>
              <a
                href="/templates/expense-import-template.csv"
                download
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Download CSV Template
              </a>
            </div>

            {/* CSV Format Info */}
            <div className="mb-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-800">
              <p className="font-medium mb-1">Expected CSV columns:</p>
              <p className="font-mono text-xs">Date, Description, Amount</p>
              <p className="text-xs mt-1 text-blue-600">Use the Statement Extractor tool to generate this from raw statement text.</p>
            </div>

            {/* File Upload */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">Upload a .csv file</label>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-gray-200"></div>
              <span className="text-xs text-gray-400 uppercase">or paste CSV below</span>
              <div className="h-px flex-1 bg-gray-200"></div>
            </div>

            {/* Textarea */}
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder="Date,Description,Amount&#10;2024-01-15,Amazon - Office Supplies,45.67"
              className="w-full border rounded-lg px-3 py-2 text-sm font-mono h-40 mb-4"
            />

            <button
              onClick={handlePasteAndParse}
              disabled={!csvText.trim()}
              className={`px-6 py-2 rounded-lg font-medium transition-colors ${csvText.trim() ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
            >
              Parse CSV
            </button>
          </div>
        )}

        {/* Step 2: Preview & Map */}
        {step === 'preview' && (
          <div>
            {/* Transaction Rules Panel */}
            <div className="mb-4 bg-white border rounded-lg shadow-sm">
              <button
                onClick={() => setShowRules(!showRules)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-gray-900">Transaction Rules</span>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">{rules.length} rule{rules.length !== 1 ? 's' : ''}</span>
                  {unmappedCount > 0 && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">{unmappedCount} unmapped</span>
                  )}
                </div>
                <span className="text-gray-400 text-sm">{showRules ? '▲' : '▼'}</span>
              </button>

              {showRules && (
                <div className="border-t px-4 pb-4">
                  {/* Add new rule */}
                  <div className="flex items-end gap-3 mt-3 mb-4">
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">If description contains:</label>
                      <input
                        type="text"
                        value={newRulePattern}
                        onChange={(e) => setNewRulePattern(e.target.value)}
                        placeholder='e.g. "amazon", "advance auto"'
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        onKeyDown={(e) => { if (e.key === 'Enter') addRule(); }}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-medium text-gray-600 mb-1">Assign to account:</label>
                      <select
                        value={newRuleAccountId}
                        onChange={(e) => setNewRuleAccountId(e.target.value)}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="">Select account...</option>
                        {expenseAccounts.map((a) => (
                          <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={addRule}
                      disabled={!newRulePattern.trim() || !newRuleAccountId}
                      className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap"
                    >
                      Add Rule
                    </button>
                  </div>

                  {/* Existing rules */}
                  {rules.length > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-gray-500 uppercase">Active Rules</span>
                        <button
                          onClick={reapplyAllRules}
                          className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Re-apply All Rules
                        </button>
                      </div>
                      {rules.map((rule) => (
                        <div key={rule.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm">
                          <div>
                            <span className="text-gray-500">Contains</span>{' '}
                            <span className="font-medium text-gray-900">&quot;{rule.pattern}&quot;</span>{' '}
                            <span className="text-gray-500">→</span>{' '}
                            <span className="font-medium text-blue-700">{getAccountLabel(rule.debitAccountId)}</span>
                          </div>
                          <button
                            onClick={() => deleteRule(rule.id)}
                            className="text-red-400 hover:text-red-600 text-lg leading-none px-1"
                            title="Delete rule"
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {rules.length === 0 && (
                    <p className="text-xs text-gray-400 italic">
                      No rules yet. Add rules to auto-assign expense accounts based on description keywords. Rules persist across imports.
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Bulk Actions */}
            <div className="mb-4 flex flex-wrap gap-3 items-end bg-white border rounded-lg p-4 shadow-sm">
              <div className="flex items-center gap-2">
                <button onClick={() => toggleAll(true)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Select All</button>
                <span className="text-gray-300">|</span>
                <button onClick={() => toggleAll(false)} className="text-xs text-blue-600 hover:text-blue-700 font-medium">Deselect All</button>
              </div>

              <div className="h-6 w-px bg-gray-200"></div>

              <div className="flex items-center gap-2">
                <label className="text-xs text-gray-500">Set account for selected:</label>
                <select
                  value={bulkDebitAccountId}
                  onChange={(e) => setBulkDebitAccountId(e.target.value)}
                  className="border rounded px-2 py-1 text-xs"
                >
                  <option value="">Choose...</option>
                  {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
                <button onClick={applyBulkDebitAccount} disabled={!bulkDebitAccountId}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-3 py-1 rounded text-xs font-medium disabled:opacity-50 transition-colors">
                  Apply
                </button>
              </div>
            </div>

            {/* Preview Table */}
            <div className="bg-white rounded-lg shadow overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 w-10">
                      <input
                        type="checkbox"
                        checked={rows.every((r) => r.selected)}
                        onChange={(e) => toggleAll(e.target.checked)}
                        className="rounded"
                      />
                    </th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-6"></th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">Date</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase w-24">Amount</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase w-56">Expense Account</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {rows.map((row) => {
                    const hasErrors = row.errors.length > 0;
                    const missingAccount = !row.debitAccountId;
                    return (
                      <tr key={row.index} className={`${!row.selected ? 'bg-gray-50 opacity-50' : ''} ${hasErrors && row.selected ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={row.selected}
                            onChange={(e) => updateRow(row.index, 'selected', e.target.checked)}
                            className="rounded"
                          />
                        </td>
                        <td className="px-3 py-2 text-center">
                          {row.selected && (
                            hasErrors
                              ? <span className="text-red-500 cursor-help" title={row.errors.join(', ')}>&#10007;</span>
                              : <span className="text-green-500">&#10003;</span>
                          )}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs">{row.date}</td>
                        <td className="px-3 py-2 text-gray-900">{row.description}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatCurrency(parseFloat(row.amount) || 0)}</td>
                        <td className="px-3 py-1">
                          <select
                            value={row.debitAccountId}
                            onChange={(e) => updateRow(row.index, 'debitAccountId', e.target.value)}
                            className={`w-full border rounded px-2 py-1 text-xs ${missingAccount ? 'border-amber-400 bg-amber-50' : ''}`}
                          >
                            <option value="">Select account...</option>
                            {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Summary & Actions */}
            <div className="mt-4 flex justify-between items-center">
              <div className="text-sm text-gray-600">
                <span className="font-medium">{selectedRows.length}</span> of {rows.length} rows selected
                {unmappedCount > 0 && (
                  <span className="ml-2 text-amber-600">
                    ({unmappedCount} need an expense account)
                  </span>
                )}
                <span className="ml-4 font-medium">Total: {formatCurrency(selectedTotal)}</span>
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => { setStep('upload'); setRows([]); }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={doImport}
                  disabled={validSelectedRows.length === 0 || !sourceAccountId}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    validSelectedRows.length > 0 && sourceAccountId
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Import {validSelectedRows.length} Transaction{validSelectedRows.length !== 1 ? 's' : ''}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Importing */}
        {step === 'importing' && (
          <div className="bg-white border rounded-lg p-12 shadow-sm text-center">
            <div className="animate-pulse text-gray-500 text-lg">Importing transactions...</div>
          </div>
        )}

        {/* Results */}
        {step === 'results' && importResult && (
          <div className="bg-white border rounded-lg p-8 shadow-sm">
            {importResult.success ? (
              <div className="text-center">
                <div className="text-green-600 text-5xl mb-4">&#10003;</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete</h2>
                <p className="text-gray-600 mb-4">
                  Created <span className="font-semibold">{importResult.created}</span> transaction{importResult.created !== 1 ? 's' : ''} totaling{' '}
                  <span className="font-semibold">{formatCurrency(importResult.totalAmount)}</span>
                </p>
                <p className="text-gray-500 text-sm mb-6">
                  {importResult.journalEntriesCreated} journal entr{importResult.journalEntriesCreated !== 1 ? 'ies' : 'y'} created for double-entry bookkeeping.
                </p>
                <div className="flex gap-3 justify-center">
                  <Link href="/bookkeeping/expenses"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors">
                    View Expenses
                  </Link>
                  <button
                    onClick={() => { setStep('upload'); setRows([]); setCsvText(''); setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Import More
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center">
                <div className="text-red-600 text-5xl mb-4">&#10007;</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Failed</h2>
                <p className="text-red-600 mb-6">{importResult.error || 'An error occurred'}</p>
                <button
                  onClick={() => setStep('preview')}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Go Back & Fix
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
