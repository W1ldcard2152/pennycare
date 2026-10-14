'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  BuildingOffice2Icon,
} from '@heroicons/react/24/outline';
import { FORM941_LINE_DEFS, PRIOR_PROVIDER_KEYS } from '@/lib/tax-return-values';

const PRIOR_941 = PRIOR_PROVIDER_KEYS['941'];
import {
  FileReturnModal,
  ReturnAmount,
  ReturnEditorBar,
  ReturnEditorProvider,
  useReturnEditor,
  EditFilingDetailsModal,
  RecordReturnPaymentModal,
  ReturnPaymentsSummary,
  type EditorPayload,
  type ReturnPaymentRow,
} from '@/components/tax-forms/ReturnEditor';

interface Form941Data {
  company: {
    companyName: string;
    legalBusinessName: string | null;
    fein: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  };
  quarter: number;
  year: number;
  dateRange: {
    start: string;
    end: string;
  };
  totals: {
    employeeCount: number;
    totalWages: number;
    federalTaxWithheld: number;
    socialSecurityWages: number;
    socialSecurityTax: number;
    medicareWages: number;
    medicareTax: number;
    additionalMedicareWages: number;
    additionalMedicareTax: number;
    totalTaxesBeforeAdjustments: number;
    totalTaxesAfterAdjustments: number;
    totalDeposits: number;
    balanceDue: number;
    overpayment: number;
  };
  deposits: Array<{
    id: string;
    depositDate: string;
    paymentMethod: string;
    confirmationNumber: string | null;
    amount: number;
  }>;
  lines: {
    line1EmployeeCount: number;
    line2Wages: number;
    line3FederalTaxWithheld: number;
    line5aSocialSecurityWages: number;
    line5aTax: number;
    line5cMedicareWages: number;
    line5cTax: number;
    line5dAdditionalMedicareWages: number;
    line5dTax: number;
    line5eTotal: number;
    line6TotalBeforeAdjustments: number;
    line7FractionsOfCents: number;
    line10TotalAfterAdjustments: number;
    line11NonrefundableCredits: number;
    line12TotalAfterCredits: number;
    line13TotalDeposits: number;
    line14BalanceDue: number;
    line15Overpayment: number;
  };
  socialSecurityWageBase: number;
  wageBaseIsExact: boolean;
  warnings: Array<{ code: string; message: string }>;
  booked: { socialSecurity: number; medicare: number; additionalMedicare: number; total: number };
  line16: {
    schedule: 'monthly' | 'semiweekly' | null;
    selection: 'monthly' | 'semiweekly' | 'unknown';
    requiresScheduleB: boolean;
    reportMonthlyLiabilities: boolean;
    under2500Eligible: boolean;
  };
  monthlyLiabilities: Array<{ month: number; monthName: string; liability: number }>;
  monthlyTotal: number;
  line1ReferenceDate: string;
  employeesPaidInQuarter: number;
  scheduleB: {
    dailyLiabilities: Array<{ payDate: string; liability: number }>;
    total: number;
    matchesLine12: boolean;
  };
  filing: {
    id: string;
    status: string;
    filedDate: string | null;
    confirmationNumber: string | null;
    filingMethod: string | null;
    totalLiability: number | null;
    totalDeposits: number | null;
    balanceDue: number | null;
    adjustmentEntry: { id: string; entryNumber: number; status: string } | null;
    notes: string | null;
    payments: ReturnPaymentRow[];
  } | null;
  editor: EditorPayload;
  recordCount: number;
}

const quarters = [
  { value: 1, label: 'Q1 (Jan-Mar)', dueDate: 'April 30' },
  { value: 2, label: 'Q2 (Apr-Jun)', dueDate: 'July 31' },
  { value: 3, label: 'Q3 (Jul-Sep)', dueDate: 'October 31' },
  { value: 4, label: 'Q4 (Oct-Dec)', dueDate: 'January 31' },
];

/**
 * The quarter you are most likely filing is the one that just ended, not the
 * one you are standing in — Form 941 is due the month after quarter close.
 */
function getDefaultPeriod(): { year: number; quarter: number } {
  const now = new Date();
  const prior = Math.floor(now.getMonth() / 3);
  return prior === 0
    ? { year: now.getFullYear() - 1, quarter: 4 }
    : { year: now.getFullYear(), quarter: prior };
}

function getCurrentYear(): number {
  return new Date().getFullYear();
}

function getAvailableYears(): number[] {
  const currentYear = getCurrentYear();
  return [currentYear, currentYear - 1, currentYear - 2];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Readable name for a line key — used by the "payroll changed since filing" note. */
function lineLabel(key: string): string {
  if (key.startsWith('month')) return 'line 16';
  return key.replace('line', 'line ').replace(/(Wages|Tax)$/, '');
}

/** One Part 1 line; the amount is editable while the return is being edited. */
function Line941({
  line,
  label,
  k,
  hint,
  emphasis,
}: {
  line: string;
  label: React.ReactNode;
  k: string;
  hint?: React.ReactNode;
  emphasis?: 'blue' | 'red' | 'amber';
}) {
  const tone =
    emphasis === 'blue'
      ? 'border-t-2 border-gray-300 bg-blue-50'
      : emphasis === 'red'
        ? 'border-t-2 border-gray-300 bg-red-50'
        : emphasis === 'amber'
          ? 'border-t-2 border-gray-300 bg-amber-50'
          : '';
  return (
    <tr className={tone}>
      <td className="py-3 text-sm text-gray-500 w-20 align-top">{line}</td>
      <td className="py-3 text-sm text-gray-900 align-top">
        {label}
        {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
      </td>
      <td className="py-3 text-right align-top whitespace-nowrap">
        <ReturnAmount k={k} bold={emphasis !== undefined} />
      </td>
    </tr>
  );
}

function Form941Content() {
  const searchParams = useSearchParams();
  const fallback = getDefaultPeriod();
  const initialYear = searchParams.get('year') ? parseInt(searchParams.get('year')!) : fallback.year;
  const initialQuarter = searchParams.get('quarter') ? parseInt(searchParams.get('quarter')!) : fallback.quarter;

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedQuarter, setSelectedQuarter] = useState(initialQuarter);
  const [data, setData] = useState<Form941Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilingModal, setShowFilingModal] = useState(false);
  const [filingDialog, setFilingDialog] = useState<'details' | 'payment' | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tax-forms/941?year=${selectedYear}&quarter=${selectedQuarter}&preview=true`
      );
      if (!response.ok) {
        throw new Error('Failed to load form data');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [selectedYear, selectedQuarter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const editor = useReturnEditor({
    defs: FORM941_LINE_DEFS,
    payload: data?.editor ?? null,
    formType: '941',
    year: selectedYear,
    quarter: selectedQuarter,
    onSaved: fetchData,
    autoEdit: searchParams.get('edit') === '1',
  });
  const v = editor.values;
  const isFiled = data?.filing?.status === 'filed';
  // Optional lines are shown when they carry an amount, or while editing so
  // they can be entered.
  const show = (key: string) => editor.editing || Math.abs(v[key] ?? 0) >= 0.005;
  const monthlyMatchesLine12 = useMemo(
    () => Math.abs((v.monthTotal ?? 0) - (v.line12 ?? 0)) < 0.01,
    [v]
  );
  const scheduleBMatchesLine12 = data
    ? Math.abs(data.scheduleB.total - (v.line12 ?? 0)) < 0.01
    : true;

  const handleUnfile = async () => {
    if (!data?.filing) return;
    const entry = data.filing.adjustmentEntry;
    if (
      !confirm(
        `Unfile Q${selectedQuarter} ${selectedYear} Form 941? The deadline reminder will return` +
          (entry && entry.status === 'posted'
            ? ` and its adjusting journal entry #${entry.entryNumber} will be voided`
            : '') +
          '. Your edits are kept as a draft. Payments recorded with the filing are not touched — void them under Tax Deposits if needed.'
      )
    )
      return;
    const res = await fetch(`/api/tax-filings/${data.filing.id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchData();
    } else {
      const body = await res.json().catch(() => ({}));
      alert(body.error || 'Failed to unfile');
    }
  };

  const handleDownload = () => {
    window.open(editor.pdfUrl('/api/tax-forms/941'), '_blank');
  };

  const quarterInfo = quarters.find(q => q.value === selectedQuarter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link
            href="/tax-forms"
            className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            Back to Tax Forms
          </Link>
        </div>
      </div>

      {/* Title */}
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
          <BuildingOffice2Icon className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Form 941</h1>
          <p className="text-gray-600">Employer&apos;s Quarterly Federal Tax Return</p>
        </div>
      </div>

      {/* Period Selector */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <select
              id="year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {getAvailableYears().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="quarter" className="block text-sm font-medium text-gray-700 mb-1">
              Quarter
            </label>
            <select
              id="quarter"
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(Number(e.target.value))}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {quarters.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={handleDownload}
            disabled={loading || !data || data.recordCount === 0}
            className="flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <ArrowDownTrayIcon className="h-4 w-4" />
            Download PDF
          </button>
          <a
            href="https://www.irs.gov/e-file-providers/e-file-for-business-and-self-employed-taxpayers"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            File with IRS
          </a>
        </div>
        {quarterInfo && (
          <p className="mt-3 text-sm text-gray-500">
            Due date: <span className="font-medium">{quarterInfo.dueDate}, {selectedQuarter === 4 ? selectedYear + 1 : selectedYear}</span>
          </p>
        )}
      </div>

      {/* Loading State */}
      {loading && (
        <div className="rounded-lg border bg-white p-8 shadow-sm text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading form data...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-red-800">Error loading form data</h3>
              <p className="mt-1 text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* No Data State */}
      {!loading && !error && data && data.recordCount === 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
          <div className="flex gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">No payroll data found</h3>
              <p className="mt-1 text-sm text-yellow-700">
                There are no payroll records for Q{selectedQuarter} {selectedYear}. Run payroll first to generate form data.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Form Preview */}
      {!loading && !error && data && data.recordCount > 0 && (
        <ReturnEditorProvider editor={editor}>
        <div className="space-y-6">
          {/* Company Info */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Company Information</h2>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <dt className="text-sm text-gray-500">Employer Name</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.company.legalBusinessName || data.company.companyName}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">EIN</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.company.fein || 'Not set'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-sm text-gray-500">Address</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {[data.company.address, data.company.city, data.company.state, data.company.zipCode].filter(Boolean).join(', ') || 'Not set'}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Period Summary */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Quarter Summary</h2>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-sm text-gray-500">Period</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {formatDate(data.dateRange.start)} - {formatDate(data.dateRange.end)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Employees Paid</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.employeesPaidInQuarter}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Payroll Records</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.recordCount}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Data-quality warnings */}
          {data.warnings.length > 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex gap-3">
                <ExclamationTriangleIcon className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-amber-800">
                    Review before filing ({data.warnings.length})
                  </h3>
                  <ul className="mt-2 space-y-1.5 text-sm text-amber-800 list-disc pl-4">
                    {data.warnings.map((w) => (
                      <li key={w.code}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <ReturnEditorBar
            editor={editor}
            formLabel="Form 941"
            filed={isFiled}
            onFileAgain={() => setShowFilingModal(true)}
            lineLabel={lineLabel}
          />

          {/* Form 941 Lines Preview */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Part 1 — Form 941 Values</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Social Security wage base used: ${data.socialSecurityWageBase.toLocaleString()} ({data.year})
              </p>
            </div>
            <div className="p-6">
              <table className="min-w-full">
                <tbody className="divide-y divide-gray-200">
                  <Line941
                    line="Line 1"
                    label="Number of employees who received wages"
                    hint={
                      <>
                        For the pay period including {formatDate(data.line1ReferenceDate)} — not
                        everyone paid during the quarter.
                      </>
                    }
                    k="line1"
                  />
                  <Line941
                    line="Line 2"
                    label="Wages, tips, and other compensation"
                    hint="Gross pay less pre-tax deductions."
                    k="line2"
                  />
                  <Line941 line="Line 3" label="Federal income tax withheld" k="line3" />
                  <Line941 line="Line 5a" label="Taxable Social Security wages (column 1)" k="line5aWages" />
                  <Line941 line="" label={<span className="text-gray-500">× 12.4% (column 2)</span>} k="line5aTax" />
                  {(show('line5bWages') || show('line5bTax')) && (
                    <>
                      <Line941 line="Line 5b" label="Taxable Social Security tips (column 1)" k="line5bWages" />
                      <Line941 line="" label={<span className="text-gray-500">× 12.4% (column 2)</span>} k="line5bTax" />
                    </>
                  )}
                  <Line941 line="Line 5c" label="Taxable Medicare wages & tips (column 1)" k="line5cWages" />
                  <Line941 line="" label={<span className="text-gray-500">× 2.9% (column 2)</span>} k="line5cTax" />
                  {(show('line5dWages') || show('line5dTax')) && (
                    <>
                      <Line941 line="Line 5d" label="Wages subject to Additional Medicare Tax (column 1)" k="line5dWages" />
                      <Line941 line="" label={<span className="text-gray-500">× 0.9% (column 2)</span>} k="line5dTax" />
                    </>
                  )}
                  <Line941 line="Line 5e" label="Total Social Security and Medicare taxes" k="line5e" />
                  {show('line5f') && (
                    <Line941 line="Line 5f" label="Section 3121(q) Notice and Demand — tax due on unreported tips" k="line5f" />
                  )}
                  <Line941 line="Line 6" label="Total taxes before adjustments" hint="Lines 3 + 5e + 5f" k="line6" />
                  <Line941
                    line="Line 7"
                    label="Current quarter's adjustment for fractions of cents"
                    hint="Difference between the rate arithmetic above and the amounts actually withheld per paycheck."
                    k="line7"
                  />
                  {show('line8') && <Line941 line="Line 8" label="Current quarter's adjustment for sick pay" k="line8" />}
                  {show('line9') && (
                    <Line941 line="Line 9" label="Current quarter's adjustments for tips and group-term life insurance" k="line9" />
                  )}
                  <Line941 line="Line 10" label="Total taxes after adjustments" k="line10" emphasis="blue" />
                  {show('line11') && <Line941 line="Line 11" label="Nonrefundable credits" k="line11" />}
                  <Line941 line="Line 12" label="Total taxes after adjustments and nonrefundable credits" k="line12" />
                  <Line941
                    line="Line 13"
                    label="Total deposits made for this quarter"
                    hint={`Recorded deposits: ${formatCurrency(data.lines.line13TotalDeposits)}`}
                    k="line13"
                  />
                  {(show(PRIOR_941.federalIncomeTax) || show(PRIOR_941.socialSecurity) || show(PRIOR_941.medicare)) && (
                    <>
                      <Line941
                        line=""
                        label="Of line 13: deposited by a prior payroll provider — federal income tax"
                        hint="Not on the form. If you switched payroll services this quarter, the deposits your old provider made, split as its tax report shows them. They never went through your books, so the adjustment leaves them out."
                        k={PRIOR_941.federalIncomeTax}
                      />
                      <Line941 line="" label={<span className="text-gray-500">— Social Security</span>} k={PRIOR_941.socialSecurity} />
                      <Line941 line="" label={<span className="text-gray-500">— Medicare</span>} k={PRIOR_941.medicare} />
                    </>
                  )}
                  {(v.line15 ?? 0) > 0 ? (
                    <Line941 line="Line 15" label="Overpayment" k="line15" emphasis="amber" />
                  ) : (
                    <Line941
                      line="Line 14"
                      label={(v.line14 ?? 0) > 0 ? 'Balance due' : 'Balance due — paid in full'}
                      k="line14"
                      emphasis={(v.line14 ?? 0) > 0 ? 'red' : 'blue'}
                    />
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Part 2 — deposit schedule and tax liability */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-gray-900">
                  Part 2 — Deposit schedule and tax liability (line 16)
                </h2>
                <span
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    data.line16.schedule === 'semiweekly'
                      ? 'bg-purple-100 text-purple-800'
                      : data.line16.schedule === 'monthly'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {data.line16.schedule === 'semiweekly'
                    ? 'Semiweekly depositor'
                    : data.line16.schedule === 'monthly'
                      ? 'Monthly depositor'
                      : 'Schedule not set'}
                </span>
              </div>
              <p className="mt-1 text-sm text-gray-500">
                {data.line16.schedule === null ? (
                  <>
                    Set your deposit schedule in{' '}
                    <Link href="/settings" className="text-blue-600 hover:underline">
                      Settings
                    </Link>{' '}
                    so line 16 marks the right box.
                  </>
                ) : data.line16.requiresScheduleB ? (
                  'The semiweekly box is marked and the monthly amounts are left blank, as the IRS requires. Report liability by day on Schedule B.'
                ) : (
                  'The monthly box is marked and these three amounts are entered on line 16.'
                )}
              </p>
            </div>

            {data.line16.reportMonthlyLiabilities && (
              <div className="p-6">
                <table className="min-w-full">
                  <tbody className="divide-y divide-gray-200">
                    {data.monthlyLiabilities.map((m) => (
                      <tr key={m.month}>
                        <td className="py-3 text-sm text-gray-500 w-24">Month {m.month}</td>
                        <td className="py-3 text-sm text-gray-900">{m.monthName}</td>
                        <td className="py-3 text-right">
                          <ReturnAmount k={`month${m.month}`} />
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 bg-gray-50">
                      <td className="py-3 text-sm font-medium text-gray-900" colSpan={2}>
                        Total liability for quarter
                      </td>
                      <td className="py-3 text-right">
                        <ReturnAmount k="monthTotal" bold />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {data.line16.requiresScheduleB && (
              <div className="p-6">
                <p className="text-sm text-gray-700">
                  Liability by day is in <strong>Schedule B</strong> below. Schedule B subtotals each
                  month, so those figures are shown here for cross-checking — they are{' '}
                  <em>not</em> entered on line 16.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3 text-sm">
                  {data.monthlyLiabilities.map((m) => (
                    <div key={m.month} className="rounded-md border border-gray-200 px-3 py-2">
                      <div className="text-xs text-gray-500">{m.monthName} subtotal</div>
                      <div className="font-medium text-gray-900 tabular-nums">
                        {formatCurrency(m.liability)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.line16.selection === 'unknown' && (
              <div className="p-6 text-sm text-gray-600">
                Line 16 is left blank on the generated PDF until a deposit schedule is set.
              </div>
            )}

            {(data.line16.reportMonthlyLiabilities ? !monthlyMatchesLine12 : !scheduleBMatchesLine12) && (
              <div className="border-t px-6 py-3">
                <p className="text-sm text-red-700">
                  Total liability does not equal line 12 ({formatCurrency(v.line12 ?? 0)}). The IRS
                  rejects returns where these disagree — resolve before filing.
                </p>
              </div>
            )}
          </div>

          {/* Deposits Applied */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Deposits Applied</h2>
              <Link
                href={`/bookkeeping/tax-deposits/new?authority=federal_941&year=${selectedYear}&quarter=Q${selectedQuarter}`}
                className="rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-sm font-medium text-white"
              >
                Record Deposit
              </Link>
            </div>
            <div className="p-6">
              {data.deposits.length === 0 ? (
                <p className="text-sm text-gray-500">
                  No deposits recorded for Q{selectedQuarter} {selectedYear}.
                  Record EFTPS deposits to reconcile against the quarterly liability above.
                </p>
              ) : (
                <table className="min-w-full">
                  <thead className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <tr>
                      <th className="pb-2">Deposit Date</th>
                      <th className="pb-2">Method</th>
                      <th className="pb-2">Confirmation #</th>
                      <th className="pb-2 text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200 text-sm text-gray-900">
                    {data.deposits.map((d) => (
                      <tr key={d.id}>
                        <td className="py-2">{formatDate(d.depositDate)}</td>
                        <td className="py-2">{d.paymentMethod}</td>
                        <td className="py-2 text-gray-500">{d.confirmationNumber || '—'}</td>
                        <td className="py-2 text-right font-medium">{formatCurrency(d.amount)}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-gray-300 font-semibold">
                      <td colSpan={3} className="py-2">Total Recorded Deposits</td>
                      <td className="py-2 text-right">{formatCurrency(data.lines.line13TotalDeposits)}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Schedule B — daily liability for semi-weekly depositors */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Schedule B — Daily Tax Liability</h2>
              <p className="mt-1 text-xs text-gray-500">
                Required attachment for semi-weekly depositors. Reports the federal income tax + FICA
                liability incurred on each pay date in the quarter.
              </p>
            </div>
            <div className="p-6">
              {data.scheduleB.dailyLiabilities.length === 0 ? (
                <p className="text-sm text-gray-500">No payroll runs in this quarter.</p>
              ) : (
                <>
                  <table className="min-w-full">
                    <thead className="text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      <tr>
                        <th className="pb-2">Pay Date</th>
                        <th className="pb-2 text-right">Liability</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 text-sm text-gray-900">
                      {data.scheduleB.dailyLiabilities.map((d) => (
                        <tr key={d.payDate}>
                          <td className="py-2">{formatDate(d.payDate)}</td>
                          <td className="py-2 text-right font-medium">{formatCurrency(d.liability)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-gray-300 font-semibold">
                        <td className="py-2">Quarterly Total</td>
                        <td className="py-2 text-right">{formatCurrency(data.scheduleB.total)}</td>
                      </tr>
                    </tbody>
                  </table>
                  {!scheduleBMatchesLine12 && (
                    <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                      ⚠ Schedule B total ({formatCurrency(data.scheduleB.total)}) doesn&apos;t match
                      Line 12 ({formatCurrency(v.line12 ?? 0)}). Review for voided payrolls or
                      rounding — or, if you edited the return, Schedule B must be adjusted to match.
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Filing Status / Mark Filed */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Filing Status</h2>
              {isFiled ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-medium">
                    <CheckCircleIcon className="h-4 w-4" />
                    Filed
                  </span>
                  <button
                    type="button"
                    onClick={() => setFilingDialog('details')}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Edit details
                  </button>
                  <button
                    type="button"
                    onClick={handleUnfile}
                    className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Unfile
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowFilingModal(true)}
                  className="rounded-md bg-green-600 hover:bg-green-700 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Mark Form 941 Filed
                </button>
              )}
            </div>
            <div className="p-6 text-sm">
              {isFiled && data.filing ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <dt className="text-gray-500">Filed Date</dt>
                    <dd className="font-medium text-gray-900">{data.filing.filedDate ? formatDate(data.filing.filedDate) : '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Filing Method</dt>
                    <dd className="font-medium text-gray-900">{data.filing.filingMethod || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Confirmation #</dt>
                    <dd className="font-medium text-gray-900">{data.filing.confirmationNumber || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Balance Due at Filing</dt>
                    <dd className="font-medium text-gray-900">{formatCurrency(data.filing.balanceDue || 0)}</dd>
                  </div>
                  <div className="sm:col-span-2">
                    <dt className="text-gray-500">Books adjustment</dt>
                    <dd className="font-medium text-gray-900">
                      {data.filing.adjustmentEntry ? (
                        <Link
                          href={`/bookkeeping/journal-entries/${data.filing.adjustmentEntry.id}`}
                          className="text-blue-600 hover:underline"
                        >
                          Journal entry #{data.filing.adjustmentEntry.entryNumber}
                        </Link>
                      ) : (
                        'None needed — payroll accruals already matched the return'
                      )}
                    </dd>
                  </div>
                  <div className="sm:col-span-2 border-t border-gray-100 pt-4">
                    <ReturnPaymentsSummary
                      payments={data.filing.payments}
                      balanceDue={data.filing.balanceDue ?? 0}
                      onRecordPayment={() => setFilingDialog('payment')}
                    />
                  </div>
                </dl>
              ) : (
                <p className="text-gray-600">
                  Form 941 has not been recorded as filed for Q{selectedQuarter} {selectedYear}.
                  Once you submit the form to the IRS, click <strong>Mark Form 941 Filed</strong>.
                  The return is saved exactly as shown above, your federal payroll tax accounts are
                  adjusted to match it, and you can record the balance-due payment in the same step.
                </p>
              )}
            </div>
          </div>

          {/* Note */}
          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <div className="flex gap-3">
              <DocumentTextIcon className="h-5 w-5 text-blue-600 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-blue-800">Review Before Filing</h3>
                <p className="mt-1 text-sm text-blue-700">
                  The downloaded PDF is filled with the values shown above, including any edits. Please
                  review all information carefully before filing with the IRS.
                </p>
              </div>
            </div>
          </div>
        </div>
        </ReturnEditorProvider>
      )}

      {showFilingModal && data && (
        <FileReturnModal
          formType="941"
          formLabel="Form 941"
          year={selectedYear}
          quarter={selectedQuarter}
          overrides={editor.overrides}
          refile={isFiled}
          existing={isFiled ? data.filing : null}
          hasRecordedDeposits={data.deposits.length > 0}
          onClose={() => setShowFilingModal(false)}
          onSaved={() => {
            setShowFilingModal(false);
            fetchData();
          }}
        />
      )}

      {filingDialog === 'details' && data?.filing && (
        <EditFilingDetailsModal
          formType="941"
          formLabel="Form 941"
          year={selectedYear}
          quarter={selectedQuarter}
          filingId={data.filing.id}
          existing={data.filing}
          onClose={() => setFilingDialog(null)}
          onSaved={() => {
            setFilingDialog(null);
            fetchData();
          }}
        />
      )}

      {filingDialog === 'payment' && data?.filing && (
        <RecordReturnPaymentModal
          formType="941"
          formLabel="Form 941"
          year={selectedYear}
          quarter={selectedQuarter}
          filingId={data.filing.id}
          overrides={editor.overrides}
          onClose={() => setFilingDialog(null)}
          onSaved={() => {
            setFilingDialog(null);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

export default function Form941Page() {
  return (
    <Suspense fallback={
      <div className="rounded-lg border bg-white p-8 shadow-sm text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    }>
      <Form941Content />
    </Suspense>
  );
}
