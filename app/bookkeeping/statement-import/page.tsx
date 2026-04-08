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
        });
      } else {
        setDropdownPos({
          top: rect.bottom + window.scrollY + 4,
          left: rect.left + window.scrollX,
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
            <button onClick={handleClear} className="text-gray-400 hover:text-gray-600 p-0.5" title="Clear">
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
                onClick={() => { setIsOpen(false); setSearch(''); onAddNew(); }}
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
  included: boolean;
  category?: 'payment' | 'credit';
}

type InputMode = 'csv' | 'text';
type Step = 'input' | 'parsing' | 'preview' | 'importing' | 'results';

export default function StatementImportPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [inputMode, setInputMode] = useState<InputMode>('csv');
  const [step, setStep] = useState<Step>('input');
  const [error, setError] = useState('');

  // Common state
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [batchName, setBatchName] = useState('');

  // CSV mode state
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Text extract mode state
  const [format, setFormat] = useState<'capital_one' | 'chase' | 'paypal_credit' | 'esl_bank'>('capital_one');
  const [statementEndDate, setStatementEndDate] = useState('');
  const [interestAmount, setInterestAmount] = useState('');
  const [interestAccountId, setInterestAccountId] = useState('');
  const [paymentsText, setPaymentsText] = useState('');
  const [transactionsText, setTransactionsText] = useState('');

  // Parsed results (for text extract preview)
  const [parsedPayments, setParsedPayments] = useState<ParsedTransaction[]>([]);
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [parseErrors, setParseErrors] = useState<string[]>([]);

  // CSV upload results
  const [csvUploadResult, setCsvUploadResult] = useState<{
    imported: number;
    duplicates: number;
    matched: number;
    unmatched: number;
    batchName: string;
  } | null>(null);

  // Text extract submission results
  const [textSubmitResult, setTextSubmitResult] = useState<{
    interestBooked: boolean;
    paymentsBooked: number;
    creditsMatched: number;
    creditsUnmatched: number;
    transactionsMatched: number;
    transactionsUnmatched: number;
    duplicatesSkipped: number;
    batchName: string;
  } | null>(null);

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
  }, []);

  // Auto-generate batch name for text extract mode
  useEffect(() => {
    if (inputMode === 'text' && sourceAccountId && statementEndDate) {
      const account = accounts.find(a => a.id === sourceAccountId);
      if (account) {
        const date = new Date(statementEndDate);
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const cardName = account.name.toLowerCase().replace(/\s+/g, '-').substring(0, 20);
        setBatchName(`cc-${cardName}-${year}-${month}`);
      }
    }
  }, [inputMode, sourceAccountId, statementEndDate, accounts]);

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

  // CSV mode handlers
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCsvFile(file);
      const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
      setBatchName(nameWithoutExt + ' - ' + new Date().toLocaleDateString('en-US', { timeZone: 'UTC' }));
    }
  };

  const handleCsvUpload = async () => {
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
        setStep('input');
        return;
      }

      setCsvUploadResult(data);
      setStep('results');
    } catch {
      setError('Network error during upload');
      setStep('input');
    }
  };

  // Text extract mode handlers
  const handleTextParse = async () => {
    if (!sourceAccountId) {
      setError('Please select an account');
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

      // Apply rules to transactions
      if (transactionsWithIncluded.length > 0 || paymentsWithIncluded.length > 0) {
        await applyRulesToParsed(transactionsWithIncluded, paymentsWithIncluded);
      } else {
        setStep('preview');
      }
    } catch {
      setError('Network error during parsing');
      setStep('input');
    }
  };

  const applyRulesToParsed = async (
    transactions: ParsedTransaction[],
    payments: ParsedTransaction[]
  ) => {
    try {
      const allDescriptions = [
        ...transactions.map(t => t.description),
        ...payments.map(p => p.description),
      ];

      if (allDescriptions.length === 0) {
        setStep('preview');
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

        const paymentStartIndex = transactions.length;
        const updatedPayments = payments.map((p, i) => {
          const matchIndex = paymentStartIndex + i;
          const match = matches[matchIndex];

          if (match) {
            return {
              ...p,
              category: 'credit' as const,
              targetAccountId: match.targetAccountId,
              matchedRuleId: match.ruleId,
              matchedRuleName: match.targetAccountName,
            };
          }
          return p;
        });
        setParsedPayments(updatedPayments);
      }
      setStep('preview');
    } catch {
      setStep('preview');
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

  const togglePaymentCategory = (index: number) => {
    setParsedPayments(prev => {
      const updated = [...prev];
      const current = updated[index];
      const newCategory = current.category === 'payment' ? 'credit' : 'payment';
      updated[index] = {
        ...current,
        category: newCategory,
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

  const handleTextSubmit = async () => {
    if (!sourceAccountId) {
      setError('Please select an account');
      return;
    }
    if (!batchName) {
      setError('Please provide a batch name');
      return;
    }

    const paymentsToSubmit = parsedPayments.filter(p => p.included && p.category === 'payment');
    const creditsToSubmit = parsedPayments.filter(p => p.included && p.category === 'credit');
    const transactionsToSubmit = parsedTransactions.filter(t => t.included);

    if (paymentsToSubmit.length === 0 && creditsToSubmit.length === 0 && transactionsToSubmit.length === 0 && (!interestAmount || parseFloat(interestAmount) === 0)) {
      setError('No items selected to import');
      return;
    }

    setError('');
    setStep('importing');

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
        setStep('preview');
        return;
      }

      setTextSubmitResult(data);
      setStep('results');
    } catch {
      setError('Network error during submission');
      setStep('preview');
    }
  };

  const goBackToEdit = () => {
    setStep('input');
  };

  const resetForm = () => {
    setStep('input');
    setSourceAccountId('');
    setBatchName('');
    setCsvFile(null);
    setFormat('capital_one');
    setStatementEndDate('');
    setInterestAmount('');
    setPaymentsText('');
    setTransactionsText('');
    setParsedPayments([]);
    setParsedTransactions([]);
    setParseErrors([]);
    setCsvUploadResult(null);
    setTextSubmitResult(null);
    setError('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Account creation handlers - use shared ACCOUNT_GROUPS from lib/account-codes.ts
  const getGroupOptions = (type: string): { value: string; label: string }[] => {
    const groups = ACCOUNT_GROUPS[type as AccountType] || [];
    return groups.map(g => ({ value: g, label: g }));
  };

  const openAccountModal = () => {
    const defaultType = 'expense';
    const defaultGroup = ACCOUNT_GROUPS['expense'][0] || '';
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
    const groups = ACCOUNT_GROUPS[type as AccountType];
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

      await fetchAccounts();
      closeAccountModal();
    } catch {
      setAccountError('Network error creating account');
    } finally {
      setAccountCreating(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  };

  // Filter accounts
  const bankAccounts = accounts.filter(a =>
    (a.type === 'asset' && a.accountGroup === 'Cash') ||
    a.type === 'credit_card'
  );
  const creditCardAccounts = accounts.filter(a => a.type === 'credit_card');
  const expenseAccounts = accounts.filter(a => a.type === 'expense');
  const targetAccounts = accounts.filter(a =>
    a.type === 'expense' || a.type === 'asset' || a.type === 'liability' || a.type === 'equity' || a.type === 'revenue'
  );

  // Calculations for text extract preview
  const actualPayments = parsedPayments.filter(p => p.category === 'payment');
  const actualCredits = parsedPayments.filter(p => p.category === 'credit');
  const includedPayments = actualPayments.filter(p => p.included);
  const includedCredits = actualCredits.filter(c => c.included);
  const includedTransactions = parsedTransactions.filter(t => t.included);

  const totalCharges = includedTransactions.filter(t => !t.isCredit).reduce((sum, t) => sum + t.amount, 0);
  const totalTransactionCredits = includedTransactions.filter(t => t.isCredit).reduce((sum, t) => sum + t.amount, 0);
  const totalPayments = includedPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalCredits = includedCredits.reduce((sum, c) => c.amount + sum, 0);
  const interest = parseFloat(interestAmount) || 0;
  const netBalanceChange = totalCharges - totalTransactionCredits - totalPayments - totalCredits + interest;

  const selectedCard = accounts.find(a => a.id === sourceAccountId);
  const interestAccountName = accounts.find(a => a.id === interestAccountId)?.name || '';

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
              Import bank or credit card statements via CSV upload or text extraction
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/bookkeeping/rules"
              target="_blank"
              className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
            >
              Manage Rules
            </Link>
            <Link
              href="/bookkeeping/transaction-review"
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium text-sm transition-colors"
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
            {/* Mode Tabs */}
            <div className="bg-white border rounded-lg shadow-sm">
              <div className="flex border-b">
                <button
                  onClick={() => setInputMode('csv')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                    inputMode === 'csv'
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    CSV Upload
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Upload CSV files from your bank</p>
                </button>
                <button
                  onClick={() => setInputMode('text')}
                  className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
                    inputMode === 'text'
                      ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center justify-center gap-2">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Text Extract
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Copy/paste from PDF statements</p>
                </button>
              </div>

              {/* CSV Upload Form */}
              {inputMode === 'csv' && (
                <div className="p-6">
                  <div className="space-y-4">
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Statement File
                      </label>
                      <div className="mb-2 p-3 bg-blue-50 rounded-lg text-sm text-blue-800 max-w-xl">
                        <p className="font-medium mb-1">Accepted formats: CSV, XLS, XLSX</p>
                        <p className="font-mono text-xs">Account Number, Post Date, Check, Description, Debit, Credit, Status, Balance</p>
                        <p className="text-xs mt-1">Standard bank export format. Debit column = money out, Credit column = money in.</p>
                      </div>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.xls,.xlsx"
                        onChange={handleFileChange}
                        className="block w-full max-w-md text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 file:cursor-pointer"
                      />
                      {csvFile && (
                        <p className="mt-2 text-sm text-gray-600">Selected: {csvFile.name}</p>
                      )}
                    </div>

                    <button
                      onClick={handleCsvUpload}
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
              )}

              {/* Text Extract Form */}
              {inputMode === 'text' && (
                <div className="p-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Account Name
                        </label>
                        <select
                          value={sourceAccountId}
                          onChange={(e) => {
                            const accountId = e.target.value;
                            setSourceAccountId(accountId);
                            // Auto-select format based on account name
                            const account = bankAccounts.find(a => a.id === accountId);
                            if (account) {
                              const name = account.name.toLowerCase();
                              if (name.includes('capital one') || name.includes('capitalone')) {
                                setFormat('capital_one');
                              } else if (name.includes('chase')) {
                                setFormat('chase');
                              } else if (name.includes('paypal')) {
                                setFormat('paypal_credit');
                              } else if (name.includes('esl')) {
                                setFormat('esl_bank');
                              }
                            }
                          }}
                          className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                        >
                          <option value="">Select account...</option>
                          {bankAccounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.code} — {a.name} ({a.type === 'credit_card' ? 'Credit Card' : 'Bank'})
                            </option>
                          ))}
                        </select>
                      </div>

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
                      </div>

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
                          </div>
                        </div>
                      </div>
                    </div>
                    )}
                  </div>

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
                  </div>
                  )}

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
                  </div>

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
                          <p>Credits: <code className="bg-blue-100 px-1 rounded">CA-73.88</code></p>
                        </>
                      )}
                      {format === 'paypal_credit' && (
                        <>
                          <p>PayPal: <code className="bg-blue-100 px-1 rounded">01/08/25 01/08/25 P9283... EBAY $126.74</code></p>
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

                  <div className="mt-6">
                    <button
                      onClick={handleTextParse}
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
              )}
            </div>
          </div>
        )}

        {/* Step: Parsing/Importing */}
        {(step === 'parsing' || step === 'importing') && (
          <div className="bg-white border rounded-lg p-12 shadow-sm text-center">
            <div className="animate-pulse text-gray-500 text-lg">
              {step === 'parsing' ? 'Parsing statement...' : 'Importing transactions...'}
            </div>
          </div>
        )}

        {/* Step: Preview (Text Extract) */}
        {step === 'preview' && (
          <div className="space-y-6">
            {parseErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="font-medium text-red-800 mb-2">Parsing Errors</h3>
                <ul className="text-sm text-red-700 space-y-1 font-mono bg-red-100 p-2 rounded max-h-40 overflow-y-auto">
                  {parseErrors.map((err, i) => (
                    <li key={i} className="break-all">{err}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Summary Header */}
            <div className="bg-white border rounded-lg shadow-sm">
              <div className="px-6 py-4 border-b bg-gradient-to-r from-slate-50 to-slate-100">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">Statement Preview</h2>
                    <div className="mt-1 text-sm text-gray-600">
                      <span className="font-medium">{selectedCard?.name || 'Credit Card'}</span>
                      {statementEndDate && <span> • Period ending {formatDate(statementEndDate)}</span>}
                    </div>
                  </div>
                  <button
                    onClick={goBackToEdit}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm transition-colors"
                  >
                    Edit
                  </button>
                </div>
              </div>

              {/* Totals */}
              <div className="px-6 py-4 bg-gray-50 border-b">
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                  <div className="bg-white rounded-lg p-3 border">
                    <div className="text-xs text-gray-500 uppercase">Charges</div>
                    <div className="text-lg font-bold text-red-600">{formatCurrency(totalCharges)}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border">
                    <div className="text-xs text-gray-500 uppercase">Credits</div>
                    <div className="text-lg font-bold text-green-600">-{formatCurrency(totalCredits + totalTransactionCredits)}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border">
                    <div className="text-xs text-gray-500 uppercase">Payments</div>
                    <div className="text-lg font-bold text-blue-600">-{formatCurrency(totalPayments)}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border">
                    <div className="text-xs text-gray-500 uppercase">Interest</div>
                    <div className="text-lg font-bold text-orange-600">{formatCurrency(interest)}</div>
                  </div>
                  <div className="bg-white rounded-lg p-3 border border-gray-300">
                    <div className="text-xs text-gray-500 uppercase">Net Change</div>
                    <div className={`text-lg font-bold ${netBalanceChange >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {netBalanceChange >= 0 ? '+' : ''}{formatCurrency(netBalanceChange)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Payments Table */}
            {actualPayments.length > 0 && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b bg-blue-50">
                  <h2 className="font-semibold text-blue-900">Payments ({includedPayments.length} selected)</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 w-10"></th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Type</th>
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
                            <td className="px-4 py-2 font-mono text-xs">{formatDate(payment.postDate || payment.transDate)}</td>
                            <td className="px-4 py-2 text-gray-900">{payment.description}</td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-blue-600">-{formatCurrency(payment.amount)}</td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => togglePaymentCategory(i)}
                                className="px-2 py-1 text-xs font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-full"
                              >
                                Payment
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Credits Table */}
            {actualCredits.length > 0 && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b bg-green-50">
                  <h2 className="font-semibold text-green-900">Credits & Returns ({includedCredits.length} selected)</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 w-10"></th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-64">Category</th>
                        <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {parsedPayments.map((credit, i) => {
                        if (credit.category !== 'credit') return null;
                        return (
                          <tr key={i} className={`${!credit.included ? 'bg-gray-50 opacity-50' : ''} ${credit.included && !credit.targetAccountId ? 'bg-amber-50' : ''}`}>
                            <td className="px-3 py-2 text-center">
                              <input
                                type="checkbox"
                                checked={credit.included}
                                onChange={() => togglePaymentIncluded(i)}
                                className="rounded border-gray-300"
                              />
                            </td>
                            <td className="px-4 py-2 font-mono text-xs">{formatDate(credit.postDate || credit.transDate)}</td>
                            <td className="px-4 py-2 text-gray-900">{credit.description}</td>
                            <td className="px-4 py-2 text-right font-mono font-medium text-green-600">-{formatCurrency(credit.amount)}</td>
                            <td className="px-4 py-1">
                              <SearchableSelect
                                value={credit.targetAccountId || ''}
                                onChange={(value) => updateCreditTarget(i, value || null)}
                                options={targetAccounts}
                                placeholder="Select category..."
                                className="flex-1"
                                onAddNew={openAccountModal}
                              />
                            </td>
                            <td className="px-4 py-2 text-center">
                              <button
                                onClick={() => togglePaymentCategory(i)}
                                className="px-2 py-1 text-xs font-medium text-green-700 bg-green-100 hover:bg-green-200 rounded-full"
                              >
                                Credit
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Transactions Table */}
            {parsedTransactions.length > 0 && (
              <div className="bg-white border rounded-lg shadow-sm">
                <div className="px-4 py-3 border-b">
                  <h2 className="font-semibold text-gray-900">Transactions ({includedTransactions.length} selected)</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 w-10"></th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase w-72">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {parsedTransactions.map((txn, i) => (
                        <tr key={i} className={`${!txn.included ? 'bg-gray-50 opacity-50' : ''} ${txn.included && !txn.targetAccountId ? 'bg-amber-50' : ''}`}>
                          <td className="px-3 py-2 text-center">
                            <input
                              type="checkbox"
                              checked={txn.included}
                              onChange={() => toggleTransactionIncluded(i)}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">{formatDate(txn.postDate || txn.transDate)}</td>
                          <td className="px-4 py-2">
                            <div className="text-gray-900">{txn.description}</div>
                            {txn.matchedRuleName && (
                              <div className="text-xs text-green-600">Rule: {txn.matchedRuleName}</div>
                            )}
                          </td>
                          <td className="px-4 py-2 text-right font-mono font-medium">
                            <span className={txn.isCredit ? 'text-green-600' : 'text-red-600'}>
                              {txn.isCredit ? '-' : ''}{formatCurrency(txn.amount)}
                            </span>
                          </td>
                          <td className="px-4 py-1">
                            <SearchableSelect
                              value={txn.targetAccountId || ''}
                              onChange={(value) => updateTransactionTarget(i, value || null)}
                              options={targetAccounts}
                              placeholder="Select category..."
                              className="flex-1"
                              onAddNew={openAccountModal}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
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
                    <div className="text-sm text-gray-600">Account: {interestAccountName}</div>
                  </div>
                  <div className="font-mono font-bold text-orange-600 text-lg">{formatCurrency(interest)}</div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="bg-white border rounded-lg p-4 shadow-sm flex items-center justify-between">
              <div className="text-sm text-gray-600">
                Ready to import {includedPayments.length} payments, {includedTransactions.length} transactions
                {interest > 0 && <>, and {formatCurrency(interest)} interest</>}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={goBackToEdit}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium text-sm"
                >
                  Back to Edit
                </button>
                <button
                  onClick={handleTextSubmit}
                  disabled={includedPayments.length === 0 && includedTransactions.length === 0 && interest === 0}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white px-6 py-2 rounded-lg font-medium text-sm"
                >
                  Import Statement
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Results */}
        {step === 'results' && (
          <div className="bg-white border rounded-lg p-8 shadow-sm">
            <div className="text-center">
              <div className="text-green-600 text-5xl mb-4">✓</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Import Complete</h2>

              {inputMode === 'csv' && csvUploadResult && (
                <>
                  <p className="text-gray-600 mb-4">
                    Imported <span className="font-semibold">{csvUploadResult.imported}</span> transactions
                    {csvUploadResult.duplicates > 0 && (
                      <span className="text-gray-500"> ({csvUploadResult.duplicates} duplicates skipped)</span>
                    )}
                  </p>
                  <div className="flex gap-4 justify-center mb-6">
                    <div className="bg-green-50 px-4 py-2 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{csvUploadResult.matched}</div>
                      <div className="text-sm text-green-700">Auto-matched</div>
                    </div>
                    <div className="bg-amber-50 px-4 py-2 rounded-lg">
                      <div className="text-2xl font-bold text-amber-600">{csvUploadResult.unmatched}</div>
                      <div className="text-sm text-amber-700">Need Review</div>
                    </div>
                  </div>
                </>
              )}

              {inputMode === 'text' && textSubmitResult && (
                <>
                  <p className="text-gray-600 mb-4">
                    Batch: <span className="font-semibold">{textSubmitResult.batchName}</span>
                  </p>
                  <div className="flex gap-4 justify-center mb-6 flex-wrap">
                    {textSubmitResult.interestBooked && (
                      <div className="bg-orange-50 px-4 py-2 rounded-lg">
                        <div className="text-2xl font-bold text-orange-600">✓</div>
                        <div className="text-sm text-orange-700">Interest Booked</div>
                      </div>
                    )}
                    <div className="bg-blue-50 px-4 py-2 rounded-lg">
                      <div className="text-2xl font-bold text-blue-600">{textSubmitResult.paymentsBooked}</div>
                      <div className="text-sm text-blue-700">Payments</div>
                    </div>
                    <div className="bg-green-50 px-4 py-2 rounded-lg">
                      <div className="text-2xl font-bold text-green-600">{textSubmitResult.transactionsMatched + textSubmitResult.creditsMatched}</div>
                      <div className="text-sm text-green-700">Categorized</div>
                    </div>
                    <div className="bg-amber-50 px-4 py-2 rounded-lg">
                      <div className="text-2xl font-bold text-amber-600">{textSubmitResult.transactionsUnmatched + textSubmitResult.creditsUnmatched}</div>
                      <div className="text-sm text-amber-700">Need Review</div>
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-3 justify-center">
                <Link
                  href="/bookkeeping/transaction-review"
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  Review Pending Transactions
                </Link>
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

        {/* Account Creation Modal */}
        {accountModalOpen && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
              <div className="px-6 py-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">Add New Account</h3>
              </div>

              <div className="px-6 py-4 space-y-4">
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
                  <p className="mt-1 text-xs text-gray-500">Next available code suggested based on account type</p>
                </div>

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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Account Type</label>
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

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Group</label>
                  <select
                    value={newAccountGroup}
                    onChange={(e) => handleAccountGroupChange(e.target.value)}
                    className="w-full border rounded-lg px-3 py-2 text-sm text-gray-900"
                  >
                    {getGroupOptions(newAccountType).map((g) => (
                      <option key={g.value} value={g.value}>{g.label}</option>
                    ))}
                  </select>
                </div>

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

                {accountError && (
                  <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">{accountError}</div>
                )}
              </div>

              <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
                <button
                  onClick={closeAccountModal}
                  disabled={accountCreating}
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateAccount}
                  disabled={accountCreating || !newAccountCode.trim() || !newAccountName.trim()}
                  className={`px-4 py-2 text-sm font-medium rounded-lg ${
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
