'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  subtype?: string;
}

interface ParsedTransaction {
  transDate: string;
  postDate: string;
  description: string;
  amount: number;
  isCredit: boolean;
  transactionId?: string;
  targetAccountId?: string | null;
  matchedRuleId?: string | null;
  matchedRuleName?: string | null;
  included: boolean;  // For checkbox selection
  category?: 'payment' | 'credit';  // For payment-section items
}

interface BatchSummary {
  batchName: string;
  sourceAccount: { id: string; code: string; name: string };
  totalCount: number;
  pendingCount: number;
  bookedCount: number;
}

type Step = 'input' | 'parsing' | 'review' | 'submitting' | 'results';

export default function CCImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [step, setStep] = useState<Step>('input');
  const [error, setError] = useState('');

  // Form state
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [format, setFormat] = useState<'capital_one' | 'chase' | 'paypal_credit'>('capital_one');
  const [statementEndDate, setStatementEndDate] = useState('');
  const [batchName, setBatchName] = useState('');
  const [interestAmount, setInterestAmount] = useState('');
  const [interestAccountId, setInterestAccountId] = useState('');
  const [paymentsText, setPaymentsText] = useState('');
  const [transactionsText, setTransactionsText] = useState('');

  // Parsed results
  const [parsedPayments, setParsedPayments] = useState<ParsedTransaction[]>([]);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  // Submission results
  const [submitResult, setSubmitResult] = useState<{
    interestBooked: boolean;
    paymentsBooked: number;
    creditsMatched: number;
    creditsUnmatched: number;
    transactionsMatched: number;
    transactionsUnmatched: number;
    duplicatesSkipped: number;
    batchName: string;
  } | null>(null);

  // Import history
  const [batches, setBatches] = useState<BatchSummary[]>([]);

  // Rule creation state
  const [ruleModalOpen, setRuleModalOpen] = useState(false);
  const [ruleTransactionIndex, setRuleTransactionIndex] = useState<number | null>(null);
  const [ruleIsCredit, setRuleIsCredit] = useState(false);  // true = editing a credit, false = editing a transaction
  const [ruleMatchText, setRuleMatchText] = useState('');
  const [ruleMatchType, setRuleMatchType] = useState<'starts_with' | 'contains' | 'ends_with'>('starts_with');
  const [ruleTargetAccountId, setRuleTargetAccountId] = useState('');
  const [ruleApplyToAllAccounts, setRuleApplyToAllAccounts] = useState(false);
  const [ruleCreating, setRuleCreating] = useState(false);
  const [ruleSuccessMessage, setRuleSuccessMessage] = useState('');

  useEffect(() => {
    fetchAccounts();
    fetchBatches();
  }, []);

  // Auto-generate batch name when account and date change
  useEffect(() => {
    if (sourceAccountId && statementEndDate) {
      const account = accounts.find(a => a.id === sourceAccountId);
      if (account) {
        const date = new Date(statementEndDate);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const cardName = account.name.toLowerCase().replace(/\s+/g, '-').substring(0, 20);
        setBatchName(`cc-${cardName}-${year}-${month}`);
      }
    }
  }, [sourceAccountId, statementEndDate, accounts]);

  // Set default interest account
  useEffect(() => {
    if (accounts.length > 0 && !interestAccountId) {
      const defaultInterest = accounts.find(a => a.code === '6300');
      if (defaultInterest) {
        setInterestAccountId(defaultInterest.id);
      }
    }
  }, [accounts, interestAccountId]);

  const fetchAccounts = async () => {
    try {
      const res = await fetch('/api/bookkeeping/accounts?balances=false');
      const data = await res.json();
      setAccounts(data.filter((a: Account & { isActive?: boolean }) => a.isActive !== false));
    } catch {
      // handled by empty state
    }
  };

  const fetchBatches = useCallback(async () => {
    try {
      const res = await fetch('/api/bookkeeping/statements/pending?distinct=batch');
      const data = await res.json();
      // Filter to CC batches only
      const ccBatches = data.filter((i: { importBatch: string }) =>
        i.importBatch.startsWith('cc-')
      );
      const batchNames = [...new Set(ccBatches.map((i: { importBatch: string }) => i.importBatch))];

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
  }, []);

  const handleParse = async () => {
    if (!sourceAccountId) {
      setError('Please select a credit card account');
      return;
    }
    if (!format || !statementEndDate) {
      setError('Please select format and statement end date');
      return;
    }

    if (!transactionsText.trim() && !paymentsText.trim()) {
      setError('Please paste transactions or payments text');
      return;
    }

    setError('');
    setStep('parsing');

    try {
      const res = await fetch('/api/bookkeeping/cc-import/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          format,
          transactionsText,
          paymentsText,
          statementEndDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Parse failed');
        setStep('input');
        return;
      }

      // Add included flag to all parsed items (payments keep their category from parser)
      const paymentsWithIncluded = (data.payments || []).map((p: ParsedTransaction) => ({
        ...p,
        included: true,
      }));
      const transactionsWithIncluded = (data.transactions || []).map((t: ParsedTransaction) => ({
        ...t,
        included: true,
      }));

      setParsedPayments(paymentsWithIncluded);
      setParsedTransactions(transactionsWithIncluded);
      setParseErrors(data.errors || []);

      // Apply rules to transactions AND all payment-section items
      // Payment items that match rules will be reclassified as credits
      const allItemsNeedingRules = [...transactionsWithIncluded, ...paymentsWithIncluded];

      if (allItemsNeedingRules.length > 0 && sourceAccountId) {
        await applyRulesToTransactionsAndCredits(transactionsWithIncluded, paymentsWithIncluded);
      } else {
        setStep('review');
      }
    } catch {
      setError('Network error during parsing');
      setStep('input');
    }
  };

  const applyRulesToTransactionsAndCredits = async (
    transactions: ParsedTransaction[],
    payments: ParsedTransaction[]
  ) => {
    try {
      // Apply rules to ALL payment-section items (both payments and credits)
      // If a "payment" matches a rule, it should be reclassified as "credit"
      // because rules are for expense categorization, not payment clearing

      // Combine all descriptions for rule matching
      const allDescriptions = [
        ...transactions.map(t => t.description),
        ...payments.map(p => p.description),  // All payments, not just credits
      ];

      if (allDescriptions.length === 0) {
        setStep('review');
        return;
      }

      const res = await fetch('/api/bookkeeping/rules/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          descriptions: allDescriptions,
          sourceAccountId,
        }),
      });

      if (res.ok) {
        const matches = await res.json();

        // Update transactions with matched rules
        const updatedTransactions = transactions.map((t, i) => {
          const match = matches[i];
          if (match) {
            return {
              ...t,
              targetAccountId: match.targetAccountId,
              matchedRuleId: match.ruleId,
              matchedRuleName: match.targetAccountName,
            };
          }
          return t;
        });
        setParsedTransactions(updatedTransactions);

        // Update ALL payment-section items with matched rules
        // If a rule matches, reclassify as 'credit' (rules imply expense categorization)
        const paymentStartIndex = transactions.length;
        const updatedPayments = payments.map((p, i) => {
          const matchIndex = paymentStartIndex + i;
          const match = matches[matchIndex];

          if (match) {
            // Rule matched - this should be treated as a credit/return, not a payment
            return {
              ...p,
              category: 'credit' as const,  // Reclassify as credit
              targetAccountId: match.targetAccountId,
              matchedRuleId: match.ruleId,
              matchedRuleName: match.targetAccountName,
            };
          }
          return p;
        });
        setParsedPayments(updatedPayments);
      }
      setStep('review');
    } catch {
      // Silent fail - rules will just not be applied
      setStep('review');
    }
  };

  const togglePaymentIncluded = (index: number) => {
    setParsedPayments(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], included: !updated[index].included };
      return updated;
    });
  };

  const toggleTransactionIncluded = (index: number) => {
    setParsedTransactions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], included: !updated[index].included };
      return updated;
    });
  };

  const toggleAllPayments = (included: boolean) => {
    setParsedPayments(prev => prev.map(p => ({ ...p, included })));
  };

  const toggleAllTransactions = (included: boolean) => {
    setParsedTransactions(prev => prev.map(t => ({ ...t, included })));
  };

  const togglePaymentCategory = (index: number) => {
    setParsedPayments(prev => {
      const updated = [...prev];
      const current = updated[index];
      // Toggle between 'payment' and 'credit'
      const newCategory = current.category === 'payment' ? 'credit' : 'payment';
      updated[index] = {
        ...current,
        category: newCategory,
        // Clear target account when switching to payment (not needed)
        // Keep target account when switching to credit (may have been set)
        targetAccountId: newCategory === 'payment' ? null : current.targetAccountId,
        matchedRuleId: newCategory === 'payment' ? null : current.matchedRuleId,
        matchedRuleName: newCategory === 'payment' ? null : current.matchedRuleName,
      };
      return updated;
    });
  };

  const updateCreditTarget = (index: number, targetAccountId: string | null) => {
    setParsedPayments(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], targetAccountId, matchedRuleName: null, matchedRuleId: null };
      return updated;
    });
  };

  const updateTransactionTarget = (index: number, targetAccountId: string | null) => {
    setParsedTransactions(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], targetAccountId, matchedRuleName: null, matchedRuleId: null };
      return updated;
    });
  };

  const openRuleModal = (index: number, isCredit: boolean = false) => {
    const item = isCredit ? parsedPayments[index] : parsedTransactions[index];
    if (!item) return;

    // Pre-fill the rule form with transaction/credit data
    setRuleTransactionIndex(index);
    setRuleIsCredit(isCredit);
    setRuleMatchText(item.description);
    setRuleMatchType('starts_with');
    setRuleTargetAccountId(item.targetAccountId || '');
    setRuleApplyToAllAccounts(false);
    setRuleSuccessMessage('');
    setRuleModalOpen(true);
  };

  const closeRuleModal = () => {
    setRuleModalOpen(false);
    setRuleTransactionIndex(null);
    setRuleIsCredit(false);
    setRuleMatchText('');
    setRuleTargetAccountId('');
    setRuleCreating(false);
  };

  const handleCreateRule = async () => {
    if (!ruleMatchText.trim() || !ruleTargetAccountId) {
      return;
    }

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
          sourceAccountId: ruleApplyToAllAccounts ? null : sourceAccountId,
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

      // Re-apply rules to all unmatched transactions
      const unmatchedTransactions = parsedTransactions.filter(t => !t.targetAccountId);
      if (unmatchedTransactions.length > 0) {
        const testRes = await fetch('/api/bookkeeping/rules/test', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            descriptions: parsedTransactions.map(t => t.description),
            sourceAccountId,
          }),
        });

        if (testRes.ok) {
          const matches = await testRes.json();
          let newlyMatchedCount = 0;

          // Update transactions with newly matched rules (only for those that didn't have a target)
          const updated = parsedTransactions.map((t, i) => {
            // If already has a target, keep it
            if (t.targetAccountId) return t;

            const match = matches[i];
            if (match) {
              newlyMatchedCount++;
              return {
                ...t,
                targetAccountId: match.targetAccountId,
                matchedRuleId: match.ruleId,
                matchedRuleName: match.targetAccountName,
              };
            }
            return t;
          });

          setParsedTransactions(updated);

          if (newlyMatchedCount > 0) {
            setRuleSuccessMessage(`Rule created! ${newlyMatchedCount} transaction${newlyMatchedCount > 1 ? 's' : ''} matched.`);
          } else {
            setRuleSuccessMessage('Rule created successfully.');
          }
        } else {
          setRuleSuccessMessage('Rule created successfully.');
        }
      } else {
        setRuleSuccessMessage('Rule created successfully.');
      }

      // Close modal after a short delay to show success message
      setTimeout(() => {
        closeRuleModal();
      }, 1500);

    } catch {
      setError('Network error creating rule');
      setRuleCreating(false);
    }
  };

  const goBackToEdit = () => {
    // Preserve the pasted text so user doesn't have to re-paste
    setStep('input');
  };

  const handleSubmit = async () => {
    if (!sourceAccountId) {
      setError('Please select a credit card account');
      return;
    }
    if (!batchName) {
      setError('Please provide a batch name');
      return;
    }

    // Filter to only included items, separating payments from credits
    const paymentsToSubmit = parsedPayments.filter(p => p.included && p.category === 'payment');
    const creditsToSubmit = parsedPayments.filter(p => p.included && p.category === 'credit');
    const transactionsToSubmit = parsedTransactions.filter(t => t.included);

    if (paymentsToSubmit.length === 0 && creditsToSubmit.length === 0 && transactionsToSubmit.length === 0 && (!interestAmount || parseFloat(interestAmount) === 0)) {
      setError('No items selected to import');
      return;
    }

    setError('');
    setStep('submitting');

    try {
      const res = await fetch('/api/bookkeeping/cc-import/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceAccountId,
          format,
          statementEndDate,
          batchName,
          interestAmount: parseFloat(interestAmount) || 0,
          interestAccountId: interestAmount && parseFloat(interestAmount) > 0 ? interestAccountId : null,
          payments: paymentsToSubmit.map(p => ({
            date: p.postDate || p.transDate,
            description: p.description,
            amount: p.amount,
          })),
          credits: creditsToSubmit.map(c => ({
            date: c.postDate || c.transDate,
            description: c.description,
            amount: c.amount,
            targetAccountId: c.targetAccountId,
          })),
          transactions: transactionsToSubmit.map(t => ({
            date: t.postDate || t.transDate,
            description: t.description,
            amount: t.amount,
            isCredit: t.isCredit,
            targetAccountId: t.targetAccountId,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Submit failed');
        setStep('review');
        return;
      }

      setSubmitResult(data);
      setStep('results');
      fetchBatches();
    } catch {
      setError('Network error during submission');
      setStep('review');
    }
  };

  const resetForm = () => {
    setStep('input');
    setSourceAccountId('');
    setFormat('capital_one');
    setStatementEndDate('');
    setBatchName('');
    setInterestAmount('');
    setPaymentsText('');
    setTransactionsText('');
    setParsedPayments([]);
    setParsedTransactions([]);
    setParseErrors([]);
    setSubmitResult(null);
    setError('');
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
      }
    } catch {
      setError('Failed to delete batch');
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  // Get selected card name
  const selectedCard = accounts.find(a => a.id === sourceAccountId);

  // Filter accounts
  const creditCardAccounts = accounts.filter(a => a.type === 'credit_card');
  const expenseAccounts = accounts.filter(a => a.type === 'expense');
  const targetAccounts = accounts.filter(a =>
    a.type === 'expense' || a.type === 'asset' || a.type === 'liability' || a.type === 'revenue'
  );

  // Separate payments from credits in the payments array
  const actualPayments = parsedPayments.filter(p => p.category === 'payment');
  const actualCredits = parsedPayments.filter(p => p.category === 'credit');

  // Calculate totals for included items
  const includedPayments = actualPayments.filter(p => p.included);
  const includedCredits = actualCredits.filter(c => c.included);
  const includedTransactions = parsedTransactions.filter(t => t.included);

  const totalCharges = includedTransactions.filter(t => !t.isCredit).reduce((sum, t) => sum + t.amount, 0);
  const totalTransactionCredits = includedTransactions.filter(t => t.isCredit).reduce((sum, t) => sum + t.amount, 0);
  const totalPayments = includedPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalCredits = includedCredits.reduce((sum, c) => c.amount + sum, 0);
  const interest = parseFloat(interestAmount) || 0;
  // Credits reduce the balance (they're returns/cash back)
  const netBalanceChange = totalCharges - totalTransactionCredits - totalPayments - totalCredits + interest;

  // Count matched items (transactions + credits that need categorization)
  const matchedTransactionCount = parsedTransactions.filter(t => t.targetAccountId).length;
  const unmatchedTransactionCount = parsedTransactions.length - matchedTransactionCount;
  const matchedCreditCount = actualCredits.filter(c => c.targetAccountId).length;
  const unmatchedCreditCount = actualCredits.length - matchedCreditCount;
  const totalMatched = matchedTransactionCount + matchedCreditCount;
  const totalUnmatched = unmatchedTransactionCount + unmatchedCreditCount;
  const totalNeedingRules = parsedTransactions.length + actualCredits.length;

  // Get interest account name
  const interestAccountName = accounts.find(a => a.id === interestAccountId)?.name || '';

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Link href="/bookkeeping" className="text-blue-600 hover:text-blue-700 text-sm">Bookkeeping</Link>
          <span className="text-gray-400">/</span>
          <span className="text-gray-600 text-sm">Credit Card Import</span>
        </div>
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-2 text-gray-900">Credit Card Statement Import</h1>
            <p className="text-gray-600">
              Paste credit card statement text to import transactions with auto-categorization
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href="/bookkeeping/rules"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              Manage Rules
            </Link>
            <Link
              href="/bookkeeping/statements"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              Review Pending
            </Link>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>
        )}

        {/* Step: Input */}
        {step === 'input' && (
          <div className="space-y-6">
            {/* Import History */}
            {batches.length > 0 && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b">
                  <h2 className="font-semibold text-gray-900">Recent CC Import Batches</h2>
                </div>
                <div className="divide-y">
                  {batches.slice(0, 5).map((batch) => (
                    <div key={batch.batchName} className="px-4 py-3 flex items-center justify-between">
                      <div>
                        <div className="font-medium text-gray-900">{batch.batchName}</div>
                        <div className="text-sm text-gray-500">
                          {batch.sourceAccount.code} — {batch.sourceAccount.name} •
                          {' '}{batch.pendingCount} pending, {batch.bookedCount} booked
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Link
                          href={`/bookkeeping/statements?batch=${encodeURIComponent(batch.batchName)}`}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium"
                        >
                          Review
                        </Link>
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

            {/* Main Form */}
            <div className="bg-white border rounded-lg p-6 shadow-sm">
              <h2 className="text-lg font-semibold mb-4 text-gray-900">Import Credit Card Statement</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-4">
                  {/* Card Account */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Credit Card Account
                    </label>
                    <select
                      value={sourceAccountId}
                      onChange={(e) => setSourceAccountId(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="">Select credit card...</option>
                      {creditCardAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                    {creditCardAccounts.length === 0 && (
                      <p className="mt-1 text-xs text-amber-600">
                        No credit card accounts found. Add one in Chart of Accounts first.
                      </p>
                    )}
                  </div>

                  {/* Statement Format */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Statement Format
                    </label>
                    <select
                      value={format}
                      onChange={(e) => setFormat(e.target.value as typeof format)}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                    >
                      <option value="capital_one">Capital One</option>
                      <option value="chase">Chase</option>
                      <option value="paypal_credit">PayPal Credit</option>
                    </select>
                  </div>

                  {/* Statement End Date */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Statement Period End Date
                    </label>
                    <input
                      type="date"
                      value={statementEndDate}
                      onChange={(e) => setStatementEndDate(e.target.value)}
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                    />
                    <p className="mt-1 text-xs text-gray-500">
                      Used to infer year for transaction dates
                    </p>
                  </div>

                  {/* Batch Name */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Batch Name
                    </label>
                    <input
                      type="text"
                      value={batchName}
                      onChange={(e) => setBatchName(e.target.value)}
                      placeholder="cc-cardname-YYYY-MM"
                      className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                    />
                  </div>
                </div>

                {/* Right Column - Interest */}
                <div className="space-y-4">
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">Interest (Optional)</h3>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Interest Amount
                        </label>
                        <div className="relative">
                          <span className="absolute left-3 top-2 text-gray-500">$</span>
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={interestAmount}
                            onChange={(e) => setInterestAmount(e.target.value)}
                            placeholder="0.00"
                            className="w-full border rounded-lg pl-7 pr-3 py-2 text-sm text-gray-900"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Interest Account
                        </label>
                        <select
                          value={interestAccountId}
                          onChange={(e) => setInterestAccountId(e.target.value)}
                          className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                        >
                          <option value="">Select account...</option>
                          {expenseAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                          Defaults to Credit Card Interest (6300)
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Payments Textarea */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payments, Credits & Adjustments
                </label>
                <textarea
                  value={paymentsText}
                  onChange={(e) => setPaymentsText(e.target.value)}
                  placeholder="Paste the payments/credits section from your statement..."
                  rows={4}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-gray-900"
                />
                <p className="mt-1 text-xs text-gray-500">
                  All items here will be booked as credits to the CC Payments Pending clearing account
                </p>
              </div>

              {/* Transactions Textarea */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Transactions (Charges)
                </label>
                <textarea
                  value={transactionsText}
                  onChange={(e) => setTransactionsText(e.target.value)}
                  placeholder="Paste the transactions section from your statement..."
                  rows={6}
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono text-gray-900"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Transactions will be matched against rules and staged for review
                </p>
              </div>

              {/* Format Help */}
              <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
                <p className="font-medium text-blue-900 mb-1">Format Tips:</p>
                <div className="text-blue-800 text-xs space-y-1">
                  {format === 'capital_one' && (
                    <>
                      <p>Capital One: <code className="bg-blue-100 px-1 rounded">Dec 16 Dec 17 USPS STAMPS ENDICIA $100.00</code></p>
                      <p>Credits have space: <code className="bg-blue-100 px-1 rounded">- $208.51</code></p>
                    </>
                  )}
                  {format === 'chase' && (
                    <>
                      <p>Chase: <code className="bg-blue-100 px-1 rounded">01/25     E-Z*PASSNY REBILL NY 50.00</code></p>
                      <p>Credits: <code className="bg-blue-100 px-1 rounded">CA-73.88</code> (negative attached)</p>
                    </>
                  )}
                  {format === 'paypal_credit' && (
                    <>
                      <p>PayPal: <code className="bg-blue-100 px-1 rounded">01/08/25 01/08/25 P9283... EBAY $126.74</code></p>
                      <p>Two dates, transaction ID, then description and amount</p>
                    </>
                  )}
                </div>
              </div>

              {/* Parse Button */}
              <div className="mt-6">
                <button
                  onClick={handleParse}
                  disabled={!sourceAccountId || !format || !statementEndDate || (!transactionsText.trim() && !paymentsText.trim())}
                  className={`px-6 py-2 rounded-lg font-medium transition-colors ${
                    sourceAccountId && format && statementEndDate && (transactionsText.trim() || paymentsText.trim())
                      ? 'bg-blue-600 hover:bg-blue-700 text-white'
                      : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                  }`}
                >
                  Parse & Preview
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Parsing */}
        {step === 'parsing' && (
          <div className="bg-white border rounded-lg p-12 shadow-sm text-center">
            <div className="animate-pulse text-gray-500 text-lg">Parsing statement...</div>
          </div>
        )}

        {/* Step: Review/Preview */}
        {step === 'review' && (
          <div className="space-y-6">
            {/* Parse Errors */}
            {parseErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-medium text-red-800 mb-2">Parsing Errors</h3>
                <p className="text-sm text-red-700 mb-2">
                  The following lines could not be parsed. Check your statement format and try again:
                </p>
                <ul className="text-sm text-red-700 space-y-1 font-mono bg-red-100 p-2 rounded max-h-40 overflow-y-auto">
                  {parseErrors.map((err, i) => (
                    <li key={i} className="break-all">{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Statement Summary Header */}
            <div className="bg-white border rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-slate-100">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Statement Preview</h2>
                    <div className="mt-1 text-sm text-gray-600">
                      <span className="font-medium">{selectedCard?.name || 'Credit Card'}</span>
                      {statementEndDate && (
                        <span> • Period ending {formatDate(statementEndDate)}</span>
                      )}
                      <span> • Format: {format.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={goBackToEdit}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                    >
                      Edit
                    </button>
                  </div>
                </div>
              </div>

              {/* Verification Totals */}
              <div className="px-6 py-4 bg-gray-50 border-b">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
                  Verify Against Your Statement
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg p-3 border">
                    <div className="text-xs text-gray-500 uppercase">Total Charges</div>
                    <div className="text-lg font-bold text-red-600">{formatCurrency(totalCharges)}</div>
                    <div className="text-xs text-gray-400">{includedTransactions.filter(t => !t.isCredit).length} items</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border">
                    <div className="text-xs text-gray-500 uppercase">Credits/Returns</div>
                    <div className="text-lg font-bold text-green-600">-{formatCurrency(totalCredits + totalTransactionCredits)}</div>
                    <div className="text-xs text-gray-400">{includedCredits.length + includedTransactions.filter(t => t.isCredit).length} items</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border">
                    <div className="text-xs text-gray-500 uppercase">Payments</div>
                    <div className="text-lg font-bold text-blue-600">-{formatCurrency(totalPayments)}</div>
                    <div className="text-xs text-gray-400">{includedPayments.length} items</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border">
                    <div className="text-xs text-gray-500 uppercase">Interest</div>
                    <div className="text-lg font-bold text-orange-600">{formatCurrency(interest)}</div>
                    {interest > 0 && (
                      <div className="text-xs text-gray-400">{interestAccountName}</div>
                    )}
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-300">
                    <div className="text-xs text-gray-500 uppercase">Net Balance Change</div>
                    <div className={`text-lg font-bold ${netBalanceChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {netBalanceChange >= 0 ? '+' : ''}{formatCurrency(netBalanceChange)}
                    </div>
                    <div className="text-xs text-gray-400">to card balance</div>
                  </div>
                </div>
              </div>

              {/* Rule Match Summary */}
              <div className="px-6 py-3 border-b flex items-center justify-between bg-white">
                <div className="text-sm">
                  <span className="text-gray-600">Rule Matching: </span>
                  <span className="font-semibold text-green-600">{totalMatched}</span>
                  <span className="text-gray-400"> of </span>
                  <span className="font-semibold text-gray-900">{totalNeedingRules}</span>
                  <span className="text-gray-600"> items matched</span>
                  {totalUnmatched > 0 && (
                    <span className="ml-2 text-amber-600">({totalUnmatched} need category assignment)</span>
                  )}
                </div>
              </div>
            </div>

            {/* Payments Review (actual payments only) */}
            {actualPayments.length > 0 && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b bg-blue-50 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-blue-900">
                      Payments ({includedPayments.length} of {actualPayments.length} selected)
                    </h2>
                    <p className="text-xs text-blue-700 mt-1">
                      Will be booked to CC Payments Pending clearing account
                      <span className="text-blue-500 ml-2">(click type badge to reclassify as credit)</span>
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 w-10"></th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-28">Amount</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase w-24">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {parsedPayments.map((payment, i) => {
                        if (payment.category !== 'payment') return null;
                        return (
                          <tr key={i} className={payment.included ? '' : 'bg-gray-50 opacity-50'}>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={payment.included}
                                onChange={() => togglePaymentIncluded(i)}
                                className="rounded border-gray-300"
                              />
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-gray-700">
                              {formatDate(payment.postDate || payment.transDate)}
                            </td>
                            <td className="px-4 py-2 text-gray-900">{payment.description}</td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-blue-600">
                              -{formatCurrency(payment.amount)}
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => togglePaymentCategory(i)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-full cursor-pointer transition-colors"
                                title="Click to reclassify as credit/return"
                              >
                                Payment
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-blue-50">
                      <tr>
                        <td colSpan={4} className="px-4 py-2 text-right font-medium text-gray-700">
                          Total Selected Payments:
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-blue-700">
                          -{formatCurrency(totalPayments)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Credits/Returns Review (need categorization like transactions) */}
            {actualCredits.length > 0 && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b bg-green-50 flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-green-900">
                      Credits & Returns ({includedCredits.length} of {actualCredits.length} selected)
                    </h2>
                    <p className="text-xs text-green-700 mt-1">
                      Select category for each — will reduce expense accounts or add income
                      <span className="text-green-500 ml-2">(click type badge to reclassify as payment)</span>
                    </p>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 w-10"></th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-28">Amount</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-72">Category</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase w-24">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {parsedPayments.map((credit, i) => {
                        if (credit.category !== 'credit') return null;
                        return (
                          <tr
                            key={i}
                            className={`${!credit.included ? 'bg-gray-50 opacity-50' : ''} ${credit.included && !credit.targetAccountId ? 'bg-amber-50' : ''}`}
                          >
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={credit.included}
                                onChange={() => togglePaymentIncluded(i)}
                                className="rounded border-gray-300"
                              />
                            </td>
                            <td className="px-4 py-2 font-mono text-xs text-gray-700">
                              {formatDate(credit.postDate || credit.transDate)}
                            </td>
                            <td className="px-4 py-2">
                              <div className="text-gray-900">{credit.description}</div>
                              {credit.matchedRuleName && (
                                <div className="text-xs text-green-600 flex items-center gap-1">
                                  <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                                  Rule: {credit.matchedRuleName}
                                </div>
                              )}
                            </td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-green-600">
                              -{formatCurrency(credit.amount)}
                            </td>
                            <td className="px-4 py-2">
                              <div className="flex items-center gap-2">
                                <select
                                  value={credit.targetAccountId || ''}
                                  onChange={(e) => updateCreditTarget(i, e.target.value || null)}
                                  className={`flex-1 border rounded px-2 py-1.5 text-xs text-gray-900 ${
                                    !credit.targetAccountId && credit.included ? 'border-amber-400 bg-amber-50' : ''
                                  }`}
                                >
                                  <option value="">Select category...</option>
                                  {targetAccounts.map((a) => (
                                    <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                                  ))}
                                </select>
                                {credit.targetAccountId && (
                                  <button
                                    onClick={() => openRuleModal(i, true)}
                                    className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap px-2 py-1.5 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                                    title="Create a rule for this credit"
                                  >
                                    + Rule
                                  </button>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => togglePaymentCategory(i)}
                                className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-full cursor-pointer transition-colors"
                                title="Click to reclassify as payment"
                              >
                                Credit
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                                </svg>
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-green-50">
                      <tr>
                        <td colSpan={5} className="px-4 py-2 text-right font-medium text-gray-700">
                          Total Selected Credits:
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-green-700">
                          -{formatCurrency(totalCredits)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Transactions Review */}
            {parsedTransactions.length > 0 && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">
                      Transactions ({includedTransactions.length} of {parsedTransactions.length} selected)
                    </h2>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleAllTransactions(true)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Select All
                    </button>
                    <span className="text-gray-300">|</span>
                    <button
                      onClick={() => toggleAllTransactions(false)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 w-10"></th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-28">Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase w-28">Amount</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-80">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {parsedTransactions.map((txn, i) => (
                        <tr
                          key={i}
                          className={`${!txn.included ? 'bg-gray-50 opacity-50' : ''} ${txn.included && !txn.targetAccountId ? 'bg-amber-50' : ''}`}
                        >
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={txn.included}
                              onChange={() => toggleTransactionIncluded(i)}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-gray-700">
                            {formatDate(txn.postDate || txn.transDate)}
                          </td>
                          <td className="px-4 py-2">
                            <div className="text-gray-900">{txn.description}</div>
                            {txn.matchedRuleName && (
                              <div className="text-xs text-green-600 flex items-center gap-1">
                                <span className="inline-block w-2 h-2 bg-green-500 rounded-full"></span>
                                Rule: {txn.matchedRuleName}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-medium">
                            <span className={txn.isCredit ? 'text-green-600' : 'text-red-600'}>
                              {txn.isCredit ? '-' : ''}{formatCurrency(txn.amount)}
                            </span>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <select
                                value={txn.targetAccountId || ''}
                                onChange={(e) => updateTransactionTarget(i, e.target.value || null)}
                                className={`flex-1 border rounded px-2 py-1.5 text-xs text-gray-900 ${
                                  !txn.targetAccountId && txn.included ? 'border-amber-400 bg-amber-50' : ''
                                }`}
                              >
                                <option value="">Select category...</option>
                                {targetAccounts.map((a) => (
                                  <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
                                ))}
                              </select>
                              {txn.targetAccountId && (
                                <button
                                  onClick={() => openRuleModal(i)}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium whitespace-nowrap px-2 py-1.5 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
                                  title="Create a rule for this transaction"
                                >
                                  + Rule
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-50">
                      <tr>
                        <td colSpan={3} className="px-4 py-2 text-right font-medium text-gray-700">
                          Total Selected:
                        </td>
                        <td className="px-4 py-2 text-right font-mono font-bold text-gray-900">
                          {formatCurrency(totalCharges - totalCredits)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {/* Interest Line */}
            {interest > 0 && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b bg-orange-50">
                  <h2 className="font-semibold text-orange-900">Interest Charge</h2>
                </div>
                <div className="px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-gray-900 font-medium">Credit Card Interest</div>
                    <div className="text-sm text-gray-600">
                      Posted: {statementEndDate ? formatDate(statementEndDate) : 'Statement end date'} •
                      Account: {interestAccountName || 'Not selected'}
                    </div>
                  </div>
                  <div className="text-right font-mono font-bold text-orange-600 text-lg">
                    {formatCurrency(interest)}
                  </div>
                </div>
              </div>
            )}

            {parsedPayments.length === 0 && parsedTransactions.length === 0 && (
              <div className="bg-white border rounded-lg p-12 shadow-sm text-center text-gray-500">
                No transactions were parsed. Please check your input and try again.
              </div>
            )}

            {/* Import Button */}
            <div className="bg-white border rounded-lg p-4 shadow-sm flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Ready to import{' '}
                <span className="font-semibold">{includedPayments.length}</span> payments,{' '}
                <span className="font-semibold">{includedTransactions.length}</span> transactions
                {interest > 0 && <>, and <span className="font-semibold">{formatCurrency(interest)}</span> interest</>}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={goBackToEdit}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  Back to Edit
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!sourceAccountId || (includedPayments.length === 0 && includedTransactions.length === 0 && interest === 0)}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  Import Statement
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Submitting */}
        {step === 'submitting' && (
          <div className="bg-white border rounded-lg p-12 shadow-sm text-center">
            <div className="animate-pulse text-gray-500 text-lg">Importing statement...</div>
          </div>
        )}

        {/* Step: Results */}
        {step === 'results' && submitResult && (
          <div className="bg-white border rounded-lg p-8 shadow-sm">
            <div className="text-center">
              <div className="text-green-600 text-5xl mb-4">&#10003;</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete</h2>
              <p className="text-gray-600 mb-4">
                Batch: <span className="font-semibold">{submitResult.batchName}</span>
              </p>

              <div className="flex gap-4 justify-center mb-6 flex-wrap">
                {submitResult.interestBooked && (
                  <div className="bg-orange-50 px-4 py-2 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">&#10003;</div>
                    <div className="text-sm text-orange-700">Interest Booked</div>
                  </div>
                )}
                <div className="bg-blue-50 px-4 py-2 rounded-lg">
                  <div className="text-2xl font-bold text-blue-600">{submitResult.paymentsBooked}</div>
                  <div className="text-sm text-blue-700">Payments Booked</div>
                </div>
                <div className="bg-green-50 px-4 py-2 rounded-lg">
                  <div className="text-2xl font-bold text-green-600">
                    {submitResult.transactionsMatched + submitResult.creditsMatched}
                  </div>
                  <div className="text-sm text-green-700">Categorized</div>
                </div>
                <div className="bg-amber-50 px-4 py-2 rounded-lg">
                  <div className="text-2xl font-bold text-amber-600">
                    {submitResult.transactionsUnmatched + submitResult.creditsUnmatched}
                  </div>
                  <div className="text-sm text-amber-700">Need Review</div>
                </div>
                {submitResult.duplicatesSkipped > 0 && (
                  <div className="bg-gray-50 px-4 py-2 rounded-lg">
                    <div className="text-2xl font-bold text-gray-600">{submitResult.duplicatesSkipped}</div>
                    <div className="text-sm text-gray-700">Duplicates Skipped</div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 justify-center">
                {(submitResult.transactionsUnmatched > 0 || submitResult.creditsUnmatched > 0 ||
                  submitResult.transactionsMatched > 0 || submitResult.creditsMatched > 0) && (
                  <Link
                    href="/bookkeeping/statements"
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                  >
                    Review Pending Transactions
                  </Link>
                )}
                <button
                  onClick={resetForm}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Import Another
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Rule Creation Modal */}
        {ruleModalOpen && ruleTransactionIndex !== null && (
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
                  <div className="text-xs text-gray-500 uppercase mb-1">
                    Source {ruleIsCredit ? 'Credit' : 'Transaction'}
                  </div>
                  <div className="font-medium text-gray-900 truncate">
                    {ruleIsCredit
                      ? parsedPayments[ruleTransactionIndex]?.description
                      : parsedTransactions[ruleTransactionIndex]?.description}
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
                    Apply to all credit cards
                  </label>
                </div>
                <p className="text-xs text-gray-500 -mt-2 ml-6">
                  {ruleApplyToAllAccounts
                    ? 'Rule will match transactions from any account'
                    : `Rule will only match transactions from ${selectedCard?.name || 'this card'}`}
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
      </div>
    </div>
  );
}
