'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  accountGroup?: string | null;
}

interface TransactionRule {
  id: string;
  matchType: 'starts_with' | 'contains' | 'ends_with';
  matchText: string;
  targetAccountId: string;
  targetAccount: { id: string; code: string; name: string; type: string };
  sourceAccountId: string | null;
  sourceAccount: { id: string; code: string; name: string; type: string } | null;
  defaultMemo: string | null;
  priority: number;
  isActive: boolean;
  createdAt: string;
}

interface TestResult {
  description: string;
  matchCount: number;
  appliedMatch: {
    ruleId: string;
    matchType: string;
    matchText: string;
    targetAccountId: string;
    targetAccountName: string;
    priority: number;
  } | null;
}

const MATCH_TYPE_LABELS: Record<string, string> = {
  starts_with: 'Starts with',
  contains: 'Contains',
  ends_with: 'Ends with',
};

export default function RulesPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [rules, setRules] = useState<TransactionRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Create/edit form state
  const [isEditing, setIsEditing] = useState(false);
  const [editingRule, setEditingRule] = useState<TransactionRule | null>(null);
  const [formData, setFormData] = useState({
    matchType: 'contains' as 'starts_with' | 'contains' | 'ends_with',
    matchText: '',
    targetAccountId: '',
    sourceAccountId: '',
    defaultMemo: '',
    priority: 0,
  });

  // Test rule state
  const [testDescription, setTestDescription] = useState('');
  const [testSourceAccountId, setTestSourceAccountId] = useState('');
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    fetchAccounts();
    fetchRules();
  }, [showInactive]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts?balances=false');
      const data = await res.json();
      setAccounts(data.filter((a: Account & { isActive?: boolean }) => a.isActive !== false));
    } catch {
      // handled by empty state
    }
  };

  const fetchRules = async () => {
    setLoading(true);
    try {
      const url = showInactive ? '/api/bookkeeping/rules?active=false' : '/api/bookkeeping/rules';
      const res = await fetch(url);
      const data = await res.json();
      setRules(data);
    } catch {
      setError('Failed to load rules');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      matchType: 'contains',
      matchText: '',
      targetAccountId: '',
      sourceAccountId: '',
      defaultMemo: '',
      priority: 0,
    });
    setEditingRule(null);
    setIsEditing(false);
  };

  const startEdit = (rule: TransactionRule) => {
    setEditingRule(rule);
    setFormData({
      matchType: rule.matchType,
      matchText: rule.matchText,
      targetAccountId: rule.targetAccountId,
      sourceAccountId: rule.sourceAccountId || '',
      defaultMemo: rule.defaultMemo || '',
      priority: rule.priority,
    });
    setIsEditing(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!formData.matchText.trim() || !formData.targetAccountId) {
      setError('Match text and target account are required');
      return;
    }

    try {
      const payload = {
        matchType: formData.matchType,
        matchText: formData.matchText.trim(),
        targetAccountId: formData.targetAccountId,
        sourceAccountId: formData.sourceAccountId || null,
        defaultMemo: formData.defaultMemo.trim() || null,
        priority: formData.priority,
      };

      const url = editingRule
        ? `/api/bookkeeping/rules/${editingRule.id}`
        : '/api/bookkeeping/rules';
      const method = editingRule ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to save rule');
        return;
      }

      fetchRules();
      resetForm();
    } catch {
      setError('Network error');
    }
  };

  const toggleActive = async (rule: TransactionRule) => {
    try {
      const res = await fetch(`/api/bookkeeping/rules/${rule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !rule.isActive }),
      });

      if (res.ok) {
        fetchRules();
      }
    } catch {
      // Silent fail
    }
  };

  const deleteRule = async (rule: TransactionRule) => {
    if (!confirm(`Delete rule "${rule.matchText}"?`)) return;

    try {
      const res = await fetch(`/api/bookkeeping/rules/${rule.id}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchRules();
      }
    } catch {
      setError('Failed to delete rule');
    }
  };

  const testRules = async () => {
    if (!testDescription.trim()) return;

    setIsTesting(true);
    setTestResult(null);

    try {
      const res = await fetch('/api/bookkeeping/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: testDescription,
          sourceAccountId: testSourceAccountId || null,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setTestResult(data);
      }
    } catch {
      // Silent fail
    } finally {
      setIsTesting(false);
    }
  };

  // Filter accounts by type
  const bankAccounts = accounts.filter((a) =>
    (a.type === 'asset' && a.accountGroup === 'Cash') ||
    a.type === 'credit_card'
  );
  const targetAccounts = accounts.filter((a) =>
    a.type === 'expense' || a.type === 'asset' || a.type === 'liability' || a.type === 'revenue'
  );

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">Dashboard</Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">Transaction Rules</span>
        </div>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-gray-900">Transaction Rules</h1>
            <p className="text-gray-600">
              Create rules to auto-categorize imported transactions based on description patterns
            </p>
          </div>
          <Link
            href="/bookkeeping/statement-import"
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
          >
            Import Statements
          </Link>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column: Create/Edit Form + Test */}
          <div className="space-y-6">
            {/* Create/Edit Form */}
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              <h2 className="font-semibold mb-4 text-gray-900">{editingRule ? 'Edit Rule' : 'Create Rule'}</h2>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Match Type</label>
                  <select
                    value={formData.matchType}
                    onChange={(e) => setFormData({ ...formData, matchType: e.target.value as 'starts_with' | 'contains' | 'ends_with' })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="contains">Contains</option>
                    <option value="starts_with">Starts with</option>
                    <option value="ends_with">Ends with</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Match Text</label>
                  <input
                    type="text"
                    value={formData.matchText}
                    onChange={(e) => setFormData({ ...formData, matchText: e.target.value })}
                    placeholder="e.g., AMAZON, SHELL, WALMART"
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
                  />
                  <p className="text-xs text-gray-500 mt-1">Case-insensitive matching</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Target Account (Category)</label>
                  <select
                    value={formData.targetAccountId}
                    onChange={(e) => setFormData({ ...formData, targetAccountId: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">Select account...</option>
                    {targetAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Account <span className="text-gray-400">(optional)</span>
                  </label>
                  <select
                    value={formData.sourceAccountId}
                    onChange={(e) => setFormData({ ...formData, sourceAccountId: e.target.value })}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">All accounts (global rule)</option>
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-500 mt-1">Limit rule to a specific bank/card</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Default Memo <span className="text-gray-400">(optional)</span>
                  </label>
                  <input
                    type="text"
                    value={formData.defaultMemo}
                    onChange={(e) => setFormData({ ...formData, defaultMemo: e.target.value })}
                    placeholder="Optional memo for journal entry"
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                  <input
                    type="number"
                    value={formData.priority}
                    onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                    min="0"
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  />
                  <p className="text-xs text-gray-500 mt-1">Higher priority rules match first</p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    {editingRule ? 'Update Rule' : 'Create Rule'}
                  </button>
                  {editingRule && (
                    <button
                      type="button"
                      onClick={resetForm}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>

            {/* Test Rules */}
            <div className="bg-white border rounded-lg p-4 shadow-sm">
              <h2 className="font-semibold mb-4 text-gray-900">Test Rules</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description to test</label>
                  <input
                    type="text"
                    value={testDescription}
                    onChange={(e) => setTestDescription(e.target.value)}
                    placeholder="e.g., AMAZON.COM*123456"
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
                    onKeyDown={(e) => { if (e.key === 'Enter') testRules(); }}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Source Account <span className="text-gray-400">(optional)</span>
                  </label>
                  <select
                    value={testSourceAccountId}
                    onChange={(e) => setTestSourceAccountId(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  >
                    <option value="">Any</option>
                    {bankAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={testRules}
                  disabled={!testDescription.trim() || isTesting}
                  className="w-full bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
                >
                  {isTesting ? 'Testing...' : 'Test'}
                </button>

                {testResult && (
                  <div className={`p-3 rounded-lg text-sm ${testResult.appliedMatch ? 'bg-green-50' : 'bg-amber-50'}`}>
                    {testResult.appliedMatch ? (
                      <>
                        <div className="font-medium text-green-800">Match found!</div>
                        <div className="text-green-700 mt-1">
                          {MATCH_TYPE_LABELS[testResult.appliedMatch.matchType]} &quot;{testResult.appliedMatch.matchText}&quot;
                        </div>
                        <div className="text-green-700">
                          → {testResult.appliedMatch.targetAccountName}
                        </div>
                      </>
                    ) : (
                      <div className="text-amber-800">No matching rules found</div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Rules List */}
          <div className="lg:col-span-2">
            <div className="bg-white border rounded-lg shadow-sm">
              <div className="px-4 py-3 border-b flex justify-between items-center">
                <h2 className="font-semibold text-gray-900">Rules ({rules.length})</h2>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={showInactive}
                    onChange={(e) => setShowInactive(e.target.checked)}
                    className="rounded"
                  />
                  Show inactive
                </label>
              </div>

              {loading ? (
                <div className="p-8 text-center text-gray-500">Loading...</div>
              ) : rules.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  No rules yet. Create one to auto-categorize imported transactions.
                </div>
              ) : (
                <div className="divide-y">
                  {rules.map((rule) => (
                    <div key={rule.id} className={`px-4 py-3 ${!rule.isActive ? 'bg-gray-50 opacity-60' : ''}`}>
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-900">
                              {MATCH_TYPE_LABELS[rule.matchType]} &quot;{rule.matchText}&quot;
                            </span>
                            {rule.priority > 0 && (
                              <span className="bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded text-xs">
                                P{rule.priority}
                              </span>
                            )}
                            {!rule.isActive && (
                              <span className="bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded text-xs">
                                Inactive
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-gray-600 mt-1">
                            → <span className="font-medium">{rule.targetAccount.code} — {rule.targetAccount.name}</span>
                          </div>
                          {rule.sourceAccount && (
                            <div className="text-xs text-gray-500 mt-1">
                              Only for: {rule.sourceAccount.code} — {rule.sourceAccount.name}
                            </div>
                          )}
                          {rule.defaultMemo && (
                            <div className="text-xs text-gray-500 mt-1">
                              Memo: {rule.defaultMemo}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-1 ml-4">
                          <button
                            onClick={() => startEdit(rule)}
                            className="text-blue-600 hover:text-blue-700 px-2 py-1 text-sm"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => toggleActive(rule)}
                            className="text-gray-500 hover:text-gray-700 px-2 py-1 text-sm"
                          >
                            {rule.isActive ? 'Disable' : 'Enable'}
                          </button>
                          <button
                            onClick={() => deleteRule(rule)}
                            className="text-red-500 hover:text-red-700 px-2 py-1 text-sm"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
