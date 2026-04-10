'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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
  skippedCount?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  importedAt?: string;
  earliestDate?: string | null;
  latestDate?: string | null;
  totalAmount?: number;
}

type Step = 'input' | 'parsing' | 'review' | 'submitting' | 'results';

export default function CCImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [step, setStep] = useState<Step>('input');
  const [error, setError] = useState('');

  // Form state
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [format, setFormat] = useState<'capital_one' | 'chase' | 'paypal_credit' | 'esl_bank'>('capital_one');
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
  const [showFullHistory, setShowFullHistory] = useState(false);
  const [allBatches, setAllBatches] = useState<BatchSummary[]>([]);
  const [historyFilterAccountId, setHistoryFilterAccountId] = useState('');
  const [historyFilterStartDate, setHistoryFilterStartDate] = useState('');
  const [historyFilterEndDate, setHistoryFilterEndDate] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(false);

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
      const activeAccounts = data.filter((a: Account & { isActive?: boolean }) => a.isActive !== false);
      setAccounts(activeAccounts);
      setSuggestedCodes(computeSuggestedCodes(activeAccounts));
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

  const fetchFullHistory = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const params = new URLSearchParams();
      if (historyFilterAccountId) params.append('sourceAccountId', historyFilterAccountId);
      if (historyFilterStartDate) params.append('startDate', historyFilterStartDate);
      if (historyFilterEndDate) params.append('endDate', historyFilterEndDate);

      const res = await fetch(`/api/bookkeeping/cc-import/history?${params.toString()}`);
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

  // For items in the Payments table: selecting a category auto-reclassifies the item as a credit
  // (routes it to StatementImport instead of the clearing account). Clearing reverts to payment.
  const updatePaymentTarget = (index: number, targetAccountId: string | null) => {
    setParsedPayments(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        targetAccountId,
        matchedRuleName: null,
        matchedRuleId: null,
        category: targetAccountId ? 'credit' : 'payment',
      };
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
    setRuleApplyToAllAccounts(true);
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

  // Account creation handlers - use ACCOUNT_GROUPS from lib/account-codes.ts
  const getGroupOptions = (type: string): { value: string; label: string }[] => {
    const groups = ACCOUNT_GROUPS[type as AccountType] || [];
    return groups.map(g => ({ value: g, label: g }));
  };

  const openAccountModal = () => {
    const defaultType = 'expense' as AccountType;
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

  const handleAccountTypeChange = (type: AccountType) => {
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
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };

  // Get selected card name
  const selectedCard = accounts.find(a => a.id === sourceAccountId);

  // Filter accounts
  const creditCardAccounts = accounts.filter(a => a.type === 'credit_card');
  const expenseAccounts = accounts.filter(a => a.type === 'expense');
  const targetAccounts = accounts.filter(a =>
    a.type === 'expense' || a.type === 'asset' || a.type === 'liability' || a.type === 'equity' || a.type === 'revenue'
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
          <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">Dashboard</Link>
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
              target="_blank"
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

        {/* Step: Input */}
        {step === 'input' && (
          <div className="space-y-6">
            {/* Import History */}
            {(batches.length > 0 || showFullHistory || creditCardAccounts.length > 0) && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900">
                    {showFullHistory ? 'CC Import History' : 'Recent CC Import Batches'}
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
                        Show Recent Only
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
                          Card Account
                        </label>
                        <select
                          value={historyFilterAccountId}
                          onChange={(e) => setHistoryFilterAccountId(e.target.value)}
                          className="w-full border rounded px-2 py-1.5 text-sm text-gray-900"
                        >
                          <option value="">All Cards</option>
                          {creditCardAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="min-w-[140px]">
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          From Date
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
                          To Date
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
                  {(showFullHistory ? allBatches : batches.slice(0, 5)).map((batch) => (
                    <div key={batch.batchName} className="px-4 py-3 flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-gray-900">{batch.batchName}</div>
                        <div className="text-sm text-gray-500">
                          {batch.sourceAccount.code} — {batch.sourceAccount.name}
                          {showFullHistory && batch.earliestDate && batch.latestDate && (
                            <>
                              {' '}• {formatDate(batch.earliestDate)}
                              {batch.earliestDate !== batch.latestDate && ` to ${formatDate(batch.latestDate)}`}
                            </>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">
                          {batch.pendingCount > 0 && (
                            <span className="text-amber-600">{batch.pendingCount} pending</span>
                          )}
                          {batch.pendingCount > 0 && batch.bookedCount > 0 && ', '}
                          {batch.bookedCount > 0 && (
                            <span className="text-green-600">{batch.bookedCount} booked</span>
                          )}
                          {showFullHistory && batch.totalAmount !== undefined && batch.totalAmount > 0 && (
                            <span className="ml-2 text-gray-500">
                              • Total: {formatCurrency(batch.totalAmount)}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-2">
                        {(batch.pendingCount > 0 || batch.bookedCount > 0) && (
                          <Link
                            href={`/bookkeeping/statements?batch=${encodeURIComponent(batch.batchName)}`}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded text-sm font-medium"
                          >
                            Review
                          </Link>
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
                      No recent imports
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
                      <option value="esl_bank">ESL Bank</option>
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

                {/* Right Column - Interest (CC only) */}
                {format !== 'esl_bank' && (
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
                )}
              </div>

              {/* Payments Textarea (CC only) */}
              {format !== 'esl_bank' && (
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
              )}

              {/* Transactions Textarea */}
              <div className="mt-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {format === 'esl_bank' ? 'Transactions' : 'Transactions (Charges)'}
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
                  {format === 'esl_bank' && (
                    <>
                      <p>ESL: <code className="bg-blue-100 px-1 rounded">01/02 ACH Deposit eBay ... 65.00 1,234.56</code></p>
                      <p>Include the Beginning Balance line — it&apos;s used to determine withdrawals vs deposits</p>
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
                      Actual payments go to CC Payments Pending. Assign a category to any returns — they&apos;ll move to Credits automatically.
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
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-64">Category if Return</th>
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
                            <td className="px-4 py-2 font-mono text-xs text-gray-900">
                              {formatDate(payment.postDate || payment.transDate)}
                            </td>
                            <td className="px-4 py-2 text-gray-900">{payment.description}</td>
                            <td className="px-4 py-1">
                              <SearchableSelect
                                value={payment.targetAccountId || ''}
                                onChange={(value) => updatePaymentTarget(i, value || null)}
                                options={targetAccounts}
                                placeholder="Leave blank if actual payment..."
                                className="flex-1"
                                onAddNew={openAccountModal}
                              />
                            </td>
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
                        <td colSpan={5} className="px-4 py-2 text-right font-medium text-gray-700">
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
                            <td className="px-4 py-2 font-mono text-xs text-gray-900">
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
                            <td className="px-4 py-1">
                              <div className="flex items-center gap-2">
                                <SearchableSelect
                                  value={credit.targetAccountId || ''}
                                  onChange={(value) => updateCreditTarget(i, value || null)}
                                  options={targetAccounts}
                                  placeholder="Select category..."
                                  className="flex-1"
                                  onAddNew={openAccountModal}
                                />
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
                          <td className="px-4 py-2 font-mono text-xs text-gray-900">
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
                          <td className="px-4 py-1">
                            <div className="flex items-center gap-2">
                              <SearchableSelect
                                value={txn.targetAccountId || ''}
                                onChange={(value) => updateTransactionTarget(i, value || null)}
                                options={targetAccounts}
                                placeholder="Select category..."
                                className="flex-1"
                                onAddNew={openAccountModal}
                              />
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
