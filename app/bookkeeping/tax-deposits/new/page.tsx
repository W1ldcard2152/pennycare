'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, SparklesIcon } from '@heroicons/react/24/outline';

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
}

const AUTHORITY_OPTIONS: Array<{
  value: string;
  label: string;
  formReference: string;
  scope: 'federal' | 'state';
}> = [
  { value: 'federal_941', label: 'Federal 941 (FIT/FICA)', formReference: 'Form 941', scope: 'federal' },
  { value: 'federal_940', label: 'Federal 940 (FUTA)', formReference: 'Form 940', scope: 'federal' },
  { value: 'ny_withholding', label: 'NY Withholding', formReference: 'NYS-1', scope: 'state' },
  { value: 'ny_sui', label: 'NY SUI', formReference: 'NYS-45', scope: 'state' },
  { value: 'ny_dbl_pfl', label: 'NY DBL/PFL', formReference: 'NYS-45', scope: 'state' },
];

const PAYMENT_METHODS = ['EFTPS', 'IRS Direct Pay', 'NY Online Services', 'Check', 'Other'] as const;

interface BreakdownState {
  federalIncomeTaxWithheld: string;
  socialSecurityTax: string;
  medicareTax: string;
  additionalMedicareTax: string;
  stateIncomeTaxWithheld: string;
  stateUnemploymentTax: string;
  stateDisabilityTax: string;
  statePaidFamilyLeaveTax: string;
}

const ZERO_BREAKDOWN: BreakdownState = {
  federalIncomeTaxWithheld: '0',
  socialSecurityTax: '0',
  medicareTax: '0',
  additionalMedicareTax: '0',
  stateIncomeTaxWithheld: '0',
  stateUnemploymentTax: '0',
  stateDisabilityTax: '0',
  statePaidFamilyLeaveTax: '0',
};

function num(v: string): number {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

function NewTaxDepositContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const today = new Date().toISOString().slice(0, 10);

  const [authority, setAuthority] = useState<string>(searchParams.get('authority') || 'federal_941');
  const initialQuarter = searchParams.get('quarter');
  const [year, setYear] = useState<string>(searchParams.get('year') || String(new Date().getUTCFullYear()));
  const [quarter, setQuarter] = useState<string>(initialQuarter || `Q${Math.floor(new Date().getUTCMonth() / 3) + 1}`);
  const [depositDate, setDepositDate] = useState(today);
  const [paymentMethod, setPaymentMethod] = useState<typeof PAYMENT_METHODS[number]>('EFTPS');
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [breakdown, setBreakdown] = useState<BreakdownState>(ZERO_BREAKDOWN);
  const [bankAccountId, setBankAccountId] = useState('');
  const [bankAccounts, setBankAccounts] = useState<Account[]>([]);
  const [autoFilling, setAutoFilling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const authorityCfg = AUTHORITY_OPTIONS.find((a) => a.value === authority)!;
  const isFederal = authorityCfg.scope === 'federal';

  useEffect(() => {
    fetch('/api/bookkeeping/accounts')
      .then((r) => r.json())
      .then((accounts: Account[]) => {
        // Bank accounts = asset accounts (likely codes 1010, 1020 in default chart)
        const banks = accounts.filter((a) => a.type === 'asset');
        setBankAccounts(banks);
        if (banks.length > 0 && !bankAccountId) setBankAccountId(banks[0].id);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalAmount =
    num(breakdown.federalIncomeTaxWithheld) +
    num(breakdown.socialSecurityTax) +
    num(breakdown.medicareTax) +
    num(breakdown.additionalMedicareTax) +
    num(breakdown.stateIncomeTaxWithheld) +
    num(breakdown.stateUnemploymentTax) +
    num(breakdown.stateDisabilityTax) +
    num(breakdown.statePaidFamilyLeaveTax);

  const handleAutoFill = async () => {
    setAutoFilling(true);
    setErr('');
    try {
      const params = new URLSearchParams({
        authority,
        periodYear: year,
      });
      if (quarter) params.set('periodQuarter', quarter);
      const res = await fetch(`/api/bookkeeping/tax-deposits/suggested-amount?${params.toString()}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to fetch suggested amount');
      }
      const data = await res.json();
      setBreakdown((prev) => ({
        ...prev,
        federalIncomeTaxWithheld: (data.federalIncomeTaxWithheld ?? 0).toFixed(2),
        socialSecurityTax: (data.socialSecurityTax ?? 0).toFixed(2),
        medicareTax: (data.medicareTax ?? 0).toFixed(2),
        additionalMedicareTax: (data.additionalMedicareTax ?? 0).toFixed(2),
        stateIncomeTaxWithheld: (data.stateIncomeTaxWithheld ?? 0).toFixed(2),
        stateUnemploymentTax: (data.stateUnemploymentTax ?? 0).toFixed(2),
        stateDisabilityTax: (data.stateDisabilityTax ?? 0).toFixed(2),
        statePaidFamilyLeaveTax: (data.statePaidFamilyLeaveTax ?? 0).toFixed(2),
      }));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to auto-fill');
    } finally {
      setAutoFilling(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      if (totalAmount <= 0) throw new Error('Enter at least one positive tax component');
      if (!bankAccountId) throw new Error('Select a bank account');
      const res = await fetch('/api/bookkeeping/tax-deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          taxAuthority: authority,
          formReference: authorityCfg.formReference,
          taxPeriodYear: parseInt(year),
          taxPeriodQuarter: quarter || null,
          depositDate,
          paymentMethod,
          confirmationNumber: confirmationNumber || null,
          federalIncomeTaxWithheld: num(breakdown.federalIncomeTaxWithheld),
          socialSecurityTax: num(breakdown.socialSecurityTax),
          medicareTax: num(breakdown.medicareTax),
          additionalMedicareTax: num(breakdown.additionalMedicareTax),
          stateIncomeTaxWithheld: num(breakdown.stateIncomeTaxWithheld),
          stateUnemploymentTax: num(breakdown.stateUnemploymentTax),
          stateDisabilityTax: num(breakdown.stateDisabilityTax),
          statePaidFamilyLeaveTax: num(breakdown.statePaidFamilyLeaveTax),
          totalAmount: Math.round(totalAmount * 100) / 100,
          notes: notes || null,
          bankAccountId,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to record deposit');
      }
      router.push('/bookkeeping/tax-deposits');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to record deposit');
    } finally {
      setSaving(false);
    }
  };

  const setBreakdownField = (k: keyof BreakdownState, v: string) =>
    setBreakdown((prev) => ({ ...prev, [k]: v }));

  return (
    <div className="px-4 sm:px-6 lg:px-8 max-w-3xl space-y-6">
      <Link
        href="/bookkeeping/tax-deposits"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeftIcon className="h-4 w-4" />
        Back to Tax Deposits
      </Link>

      <div>
        <h1 className="text-2xl font-bold text-gray-900">Record Tax Deposit</h1>
        <p className="mt-1 text-sm text-gray-600">
          Records a tax payment and creates the matching journal entry to clear
          the corresponding liability accounts.
        </p>
      </div>

      {err && (
        <div className="rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* What & when */}
        <div className="rounded-lg border bg-white shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">What you&apos;re paying</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Tax Authority</label>
              <select
                value={authority}
                onChange={(e) => {
                  setAuthority(e.target.value);
                  setBreakdown(ZERO_BREAKDOWN);
                }}
                className="mt-1 block w-full rounded-md border-gray-300"
              >
                {AUTHORITY_OPTIONS.map((a) => (
                  <option key={a.value} value={a.value}>{a.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Tax Year</label>
              <input
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Quarter</label>
              <select
                value={quarter}
                onChange={(e) => setQuarter(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300"
              >
                <option value="">(annual)</option>
                <option value="Q1">Q1</option>
                <option value="Q2">Q2</option>
                <option value="Q3">Q3</option>
                <option value="Q4">Q4</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Deposit Date</label>
              <input
                type="date"
                value={depositDate}
                onChange={(e) => setDepositDate(e.target.value)}
                required
                className="mt-1 block w-full rounded-md border-gray-300"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Payment Method</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                className="mt-1 block w-full rounded-md border-gray-300"
              >
                {PAYMENT_METHODS.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Confirmation # <span className="text-gray-400">(optional)</span>
              </label>
              <input
                type="text"
                value={confirmationNumber}
                onChange={(e) => setConfirmationNumber(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300"
              />
            </div>
          </div>
        </div>

        {/* Breakdown */}
        <div className="rounded-lg border bg-white shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Tax Breakdown</h2>
            <button
              type="button"
              onClick={handleAutoFill}
              disabled={autoFilling}
              className="inline-flex items-center gap-1 rounded-md border border-blue-300 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 text-sm font-medium text-blue-700 disabled:opacity-50"
            >
              <SparklesIcon className="h-4 w-4" />
              {autoFilling ? 'Loading…' : 'Auto-fill from current liability'}
            </button>
          </div>

          {isFederal ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <BreakdownInput label="Federal Income Tax Withheld" value={breakdown.federalIncomeTaxWithheld} onChange={(v) => setBreakdownField('federalIncomeTaxWithheld', v)} />
              <BreakdownInput label="Social Security (EE + ER)" value={breakdown.socialSecurityTax} onChange={(v) => setBreakdownField('socialSecurityTax', v)} />
              <BreakdownInput label="Medicare (EE + ER)" value={breakdown.medicareTax} onChange={(v) => setBreakdownField('medicareTax', v)} />
              <BreakdownInput label="Additional Medicare" value={breakdown.additionalMedicareTax} onChange={(v) => setBreakdownField('additionalMedicareTax', v)} />
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <BreakdownInput label="NY Income Tax Withheld" value={breakdown.stateIncomeTaxWithheld} onChange={(v) => setBreakdownField('stateIncomeTaxWithheld', v)} />
              <BreakdownInput label="NY Unemployment (SUI)" value={breakdown.stateUnemploymentTax} onChange={(v) => setBreakdownField('stateUnemploymentTax', v)} />
              <BreakdownInput label="NY Disability (SDI)" value={breakdown.stateDisabilityTax} onChange={(v) => setBreakdownField('stateDisabilityTax', v)} />
              <BreakdownInput label="NY Paid Family Leave" value={breakdown.statePaidFamilyLeaveTax} onChange={(v) => setBreakdownField('statePaidFamilyLeaveTax', v)} />
            </div>
          )}

          <div className="border-t pt-3 flex justify-between text-sm">
            <span className="font-medium text-gray-700">Total Amount</span>
            <span className="text-lg font-bold text-gray-900">${totalAmount.toFixed(2)}</span>
          </div>
        </div>

        {/* Bank account + JE preview */}
        <div className="rounded-lg border bg-white shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-gray-900">Bookkeeping</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700">Bank Account (credit)</label>
            <select
              value={bankAccountId}
              onChange={(e) => setBankAccountId(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border-gray-300"
            >
              {bankAccounts.length === 0 && <option value="">Loading…</option>}
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>

          {/* JE Preview */}
          {totalAmount > 0 && bankAccountId && (
            <div className="rounded-md border border-gray-200 bg-gray-50 p-3 text-xs space-y-1">
              <div className="font-medium text-gray-700 mb-1">Journal entry preview</div>
              {num(breakdown.federalIncomeTaxWithheld) > 0 && (
                <div className="flex justify-between"><span>DR 2110 Federal Tax Payable</span><span>${num(breakdown.federalIncomeTaxWithheld).toFixed(2)}</span></div>
              )}
              {num(breakdown.socialSecurityTax) > 0 && (
                <div className="flex justify-between"><span>DR 2130 Social Security Payable</span><span>${num(breakdown.socialSecurityTax).toFixed(2)}</span></div>
              )}
              {(num(breakdown.medicareTax) + num(breakdown.additionalMedicareTax)) > 0 && (
                <div className="flex justify-between"><span>DR 2140 Medicare Payable</span><span>${(num(breakdown.medicareTax) + num(breakdown.additionalMedicareTax)).toFixed(2)}</span></div>
              )}
              {num(breakdown.stateIncomeTaxWithheld) > 0 && (
                <div className="flex justify-between"><span>DR 2120 State Tax Payable</span><span>${num(breakdown.stateIncomeTaxWithheld).toFixed(2)}</span></div>
              )}
              {num(breakdown.stateUnemploymentTax) > 0 && (
                <div className="flex justify-between"><span>DR 2160 SUI Payable</span><span>${num(breakdown.stateUnemploymentTax).toFixed(2)}</span></div>
              )}
              {num(breakdown.stateDisabilityTax) > 0 && (
                <div className="flex justify-between"><span>DR 2170 NY SDI Payable</span><span>${num(breakdown.stateDisabilityTax).toFixed(2)}</span></div>
              )}
              {num(breakdown.statePaidFamilyLeaveTax) > 0 && (
                <div className="flex justify-between"><span>DR 2180 NY PFL Payable</span><span>${num(breakdown.statePaidFamilyLeaveTax).toFixed(2)}</span></div>
              )}
              <div className="flex justify-between border-t border-gray-300 pt-1 mt-1 font-medium">
                <span>CR {bankAccounts.find((a) => a.id === bankAccountId)?.code} {bankAccounts.find((a) => a.id === bankAccountId)?.name}</span>
                <span>${totalAmount.toFixed(2)}</span>
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="mt-1 block w-full rounded-md border-gray-300"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Link
            href="/bookkeeping/tax-deposits"
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={saving || totalAmount <= 0}
            className="rounded-md bg-blue-600 hover:bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Record Deposit'}
          </button>
        </div>
      </form>
    </div>
  );
}

function BreakdownInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700">{label}</label>
      <input
        type="number"
        step="0.01"
        min="0"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 block w-full rounded-md border-gray-300"
      />
    </div>
  );
}

export default function NewTaxDepositPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-500">Loading…</div>}>
      <NewTaxDepositContent />
    </Suspense>
  );
}
