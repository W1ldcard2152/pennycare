'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClipboardIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';

interface PartA {
  employeeCounts: [number, number, number];
  line1TotalRemuneration: number;
  line2ExcessRemuneration: number;
  line3WagesSubjectToContribution: number;
  line4aUiRate: number;
  line4UiContributionsDue: number;
  line5ReemploymentServiceFund: number;
  line6Subtotal: number;
}

interface PartB {
  line13TotalTaxWithheld: number;
  line15Nys1Payments: number;
  line17TotalPayments: number;
  line20TotalWtDue: number;
  line21TotalWtOverpaid: number;
  line24TotalAllTaxWithheld: number;
  nysTaxWithheld: number;
  nycTaxWithheld: number;
  yonkersTaxWithheld: number;
}

interface PartCRow {
  employeeId: string;
  ssn: string;
  ssnOnFile: boolean;
  lastName: string;
  firstName: string;
  middleInitial: string;
  wageType: 'R' | 'O';
  uiRemuneration: number;
  grossFederalWages: number;
  nysTaxWithheld: number;
  nycTaxWithheld: number;
  yonkersTaxWithheld: number;
  uiExcess: number;
  uiSubject: number;
  bookedSUI: number;
  uiCovered: boolean;
}

interface NYS45Data {
  company: {
    companyName: string;
    legalBusinessName: string | null;
    fein: string | null;
    stateUIClientId: string | null;
    stateTaxId: string | null;
    suiRate: number | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
  };
  quarter: number;
  year: number;
  dateRange: { start: string; end: string };
  wageBase: number;
  wageBaseIsExact: boolean;
  rsfRate: number;
  partA: PartA;
  partB: PartB;
  partC: PartCRow[];
  warnings: Array<{ code: string; message: string }>;
  bookedSUI: number;
  deposits: Array<{
    id: string;
    depositDate: string;
    paymentMethod: string;
    confirmationNumber: string | null;
    taxAuthority: string;
    amount: number;
  }>;
  depositTotals: { withholding: number; ui: number; sdiPfl: number };
  notOnForm: { nySDI: number; nyPFL: number };
  filing: {
    id: string;
    status: string;
    filedDate: string | null;
    confirmationNumber: string | null;
    filingMethod: string | null;
  } | null;
  recordCount: number;
}

const quarters = [
  { value: 1, label: 'Q1 (Jan-Mar)', dueDate: 'April 30' },
  { value: 2, label: 'Q2 (Apr-Jun)', dueDate: 'July 31' },
  { value: 3, label: 'Q3 (Jul-Sep)', dueDate: 'October 31' },
  { value: 4, label: 'Q4 (Oct-Dec)', dueDate: 'January 31' },
];

/**
 * The quarter you are most likely filing right now is the one that just ended,
 * not the one you are standing in — NYS-45 is due the month after quarter close.
 */
function getDefaultQuarter(): { year: number; quarter: number } {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const prior = currentQuarter - 1;
  return prior === 0
    ? { year: now.getFullYear() - 1, quarter: 4 }
    : { year: now.getFullYear(), quarter: prior };
}

function getAvailableYears(): number[] {
  const currentYear = new Date().getFullYear();
  return [currentYear, currentYear - 1, currentYear - 2];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Amounts on this page exist to be re-typed into NY Online Services, so every
 * figure is click-to-copy as a bare number.
 */
function CopyableAmount({ value, bold }: { value: number; bold?: boolean }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value.toFixed(2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard unavailable (non-secure context) — the number is still visible.
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy value"
      className={`group inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 tabular-nums hover:bg-blue-50 ${
        bold ? 'text-base font-bold' : 'text-sm font-medium'
      } text-gray-900`}
    >
      {formatCurrency(value)}
      {copied ? (
        <CheckCircleIcon className="h-3.5 w-3.5 text-green-600" />
      ) : (
        <ClipboardIcon className="h-3.5 w-3.5 text-gray-300 group-hover:text-blue-500" />
      )}
    </button>
  );
}

function FormLine({
  line,
  label,
  value,
  hint,
  emphasis,
  manual,
}: {
  line: string;
  label: string;
  value?: number;
  hint?: string;
  emphasis?: 'blue' | 'green' | 'none';
  manual?: boolean;
}) {
  const bg =
    emphasis === 'blue' ? 'bg-blue-50' : emphasis === 'green' ? 'bg-green-50' : '';
  return (
    <tr className={bg}>
      <td className="py-2.5 pl-4 pr-2 text-sm text-gray-500 w-16 align-top">{line}</td>
      <td className="py-2.5 pr-4 text-sm text-gray-900 align-top">
        {label}
        {hint && <div className="mt-0.5 text-xs text-gray-500">{hint}</div>}
      </td>
      <td className="py-2.5 pr-4 text-right align-top whitespace-nowrap">
        {manual ? (
          <span className="text-sm italic text-gray-400">enter manually</span>
        ) : (
          <CopyableAmount value={value ?? 0} bold={emphasis !== undefined && emphasis !== 'none'} />
        )}
      </td>
    </tr>
  );
}

function NYS45Content() {
  const searchParams = useSearchParams();
  const fallback = getDefaultQuarter();
  const initialYear = searchParams.get('year') ? parseInt(searchParams.get('year')!) : fallback.year;
  const initialQuarter = searchParams.get('quarter')
    ? parseInt(searchParams.get('quarter')!)
    : fallback.quarter;

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedQuarter, setSelectedQuarter] = useState(initialQuarter);
  const [data, setData] = useState<NYS45Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilingModal, setShowFilingModal] = useState(false);
  const [showNoDepositsWarning, setShowNoDepositsWarning] = useState(false);
  const [acknowledgedNoDeposits, setAcknowledgedNoDeposits] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/tax-forms/nys-45?year=${selectedYear}&quarter=${selectedQuarter}&preview=true`
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

  // Total NYS-45 liability = UI subtotal (Part A line 6) + withholding (line 13).
  // SDI and PFL are premiums owed to a carrier, not to NYS, and are excluded.
  const totalLiability = data
    ? data.partA.line6Subtotal + data.partB.line13TotalTaxWithheld
    : 0;
  const totalDeposits = data ? data.depositTotals.withholding + data.depositTotals.ui : 0;

  const handleMarkFiledClick = () => {
    if (!data) return;
    if (totalLiability > 0 && data.deposits.length === 0) {
      setShowNoDepositsWarning(true);
    } else {
      setAcknowledgedNoDeposits(false);
      setShowFilingModal(true);
    }
  };

  const handleUnfile = async () => {
    if (!data?.filing) return;
    if (
      !confirm(
        `Unfile Q${selectedQuarter} ${selectedYear} NYS-45? The filing record will be removed and the deadline reminder will return.`
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
    window.open(`/api/tax-forms/nys-45?year=${selectedYear}&quarter=${selectedQuarter}`, '_blank');
  };

  const quarterInfo = quarters.find((q) => q.value === selectedQuarter);

  return (
    <div className="space-y-6">
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

      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-100">
          <DocumentTextIcon className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">NYS-45</h1>
          <p className="text-gray-600">
            Quarterly Combined Withholding, Wage Reporting and Unemployment Insurance Return
          </p>
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
            href="https://my.ny.gov/LoginV4/login.xhtml?APP=nyappdtf"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            File with NYS DTF
          </a>
        </div>
        {quarterInfo && (
          <p className="mt-3 text-sm text-gray-500">
            Due date:{' '}
            <span className="font-medium">
              {quarterInfo.dueDate}, {selectedQuarter === 4 ? selectedYear + 1 : selectedYear}
            </span>
          </p>
        )}
      </div>

      {loading && (
        <div className="rounded-lg border bg-white p-8 shadow-sm text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading form data...</p>
        </div>
      )}

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

      {!loading && !error && data && data.recordCount === 0 && (
        <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-6">
          <div className="flex gap-3">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-yellow-800">No payroll data found</h3>
              <p className="mt-1 text-sm text-yellow-700">
                There are no active payroll records for Q{selectedQuarter} {selectedYear}. Voided and
                corrected records are excluded from the return.
              </p>
            </div>
          </div>
        </div>
      )}

      {!loading && !error && data && data.recordCount > 0 && (
        <div className="space-y-6">
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

          {/* Header info the form asks for */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Return Header</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {formatDate(data.dateRange.start)} – {formatDate(data.dateRange.end)} ·{' '}
                {data.recordCount} payroll record{data.recordCount === 1 ? '' : 's'}
              </p>
            </div>
            <div className="p-6">
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <HeaderField label="Employer legal name" value={data.company.legalBusinessName || data.company.companyName} />
                <HeaderField label="UI Employer registration #" value={data.company.stateUIClientId} required />
                <HeaderField label="Withholding ID number" value={data.company.stateTaxId} required />
                <HeaderField label="FEIN" value={data.company.fein} />
                <HeaderField
                  label="UI rate (line 4a)"
                  value={data.company.suiRate ? `${data.company.suiRate.toFixed(3)}%` : null}
                  required
                />
                <HeaderField label="UI wage base used" value={`$${data.wageBase.toLocaleString()} (${data.year})`} />
              </dl>
            </div>
          </div>

          {/* Part A */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Part A — Unemployment insurance (UI) information
              </h2>
            </div>
            <div className="border-b bg-gray-50 px-6 py-4">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Number of employees
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                Covered employees who worked during or received pay for the week containing the 12th
                of each month. Derived from hire and termination dates plus payroll activity in that
                week — confirm it matches who was actually working.
              </p>
              <div className="mt-3 grid grid-cols-3 gap-4 max-w-md">
                {['a. First month', 'b. Second month', 'c. Third month'].map((label, i) => (
                  <div key={label}>
                    <div className="text-xs text-gray-500">{label}</div>
                    <div className="text-lg font-bold text-gray-900 tabular-nums">
                      {data.partA.employeeCounts[i]}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <table className="min-w-full">
              <tbody className="divide-y divide-gray-200">
                <FormLine line="1" label="Total remuneration paid this quarter" value={data.partA.line1TotalRemuneration} />
                <FormLine
                  line="2"
                  label="Remuneration paid this quarter in excess of the UI wage base since January 1"
                  hint={`Wages above $${data.wageBase.toLocaleString()} per employee, year to date.`}
                  value={data.partA.line2ExcessRemuneration}
                />
                <FormLine
                  line="3"
                  label="Wages subject to contribution"
                  hint="Line 1 minus line 2"
                  value={data.partA.line3WagesSubjectToContribution}
                />
                <FormLine
                  line="4"
                  label="UI contributions due"
                  hint={`Line 3 × ${data.partA.line4aUiRate.toFixed(3)}% (line 4a)`}
                  value={data.partA.line4UiContributionsDue}
                />
                <FormLine
                  line="5"
                  label="Re-employment service fund"
                  hint={`Line 3 × ${(data.rsfRate * 100).toFixed(3)}%`}
                  value={data.partA.line5ReemploymentServiceFund}
                />
                <FormLine line="6" label="Subtotal" hint="Line 4 + line 5" value={data.partA.line6Subtotal} emphasis="green" />
                <FormLine line="7–9" label="UI previously underpaid / overpaid, with interest" manual />
                <FormLine line="10" label="Total UI amounts due" hint="Line 6 adjusted by lines 7–9" manual />
              </tbody>
            </table>
          </div>

          {/* Part B */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Part B — Withholding tax (WT) information
              </h2>
            </div>
            <table className="min-w-full">
              <tbody className="divide-y divide-gray-200">
                <FormLine
                  line="13"
                  label="Total tax withheld"
                  hint={`NYS ${formatCurrency(data.partB.nysTaxWithheld)} · NYC ${formatCurrency(
                    data.partB.nycTaxWithheld
                  )} · Yonkers ${formatCurrency(data.partB.yonkersTaxWithheld)}`}
                  value={data.partB.line13TotalTaxWithheld}
                  emphasis="blue"
                />
                <FormLine line="14" label="WT credit from previous quarter's return" manual />
                <FormLine
                  line="15"
                  label="Form NYS-1 payments made for quarter"
                  hint="From recorded NY withholding tax deposits"
                  value={data.partB.line15Nys1Payments}
                />
                <FormLine line="16" label="WT payments made with Forms NYS-45" manual />
                <FormLine line="17" label="Total payments" value={data.partB.line17TotalPayments} />
                {data.partB.line21TotalWtOverpaid > 0 ? (
                  <FormLine line="21" label="Total WT overpaid" value={data.partB.line21TotalWtOverpaid} emphasis="green" />
                ) : (
                  <FormLine line="20" label="Total WT amount due" value={data.partB.line20TotalWtDue} emphasis="blue" />
                )}
                <FormLine
                  line="24"
                  label="Total of all New York State, New York City, and Yonkers tax withheld"
                  hint="Must equal the column h + i + j totals in Part C"
                  value={data.partB.line24TotalAllTaxWithheld}
                />
              </tbody>
            </table>
            <div className="border-t bg-gray-50 px-6 py-3 text-xs text-gray-600 flex gap-2">
              <InformationCircleIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
              <span>
                Lines 14, 16, and 18 depend on prior-quarter returns and are not derived from your
                payroll data. Check last quarter&apos;s NYS-45 before entering them.
              </span>
            </div>
          </div>

          {/* Part C */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                Part C — Quarterly employee/payee wage reporting and withholding information
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                One row per employee. Column f is total UI remuneration paid this quarter — the full
                amount paid, not the taxable portion.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3 text-left font-medium">a · SSN</th>
                    <th className="px-4 py-3 text-left font-medium">b/c/d · Name</th>
                    <th className="px-4 py-3 text-center font-medium">e · Type</th>
                    <th className="px-4 py-3 text-right font-medium">f · UI remuneration</th>
                    <th className="px-4 py-3 text-right font-medium">g · Gross federal wages</th>
                    <th className="px-4 py-3 text-right font-medium">h · NYS tax</th>
                    <th className="px-4 py-3 text-right font-medium">i · NYC tax</th>
                    <th className="px-4 py-3 text-right font-medium">j · Yonkers tax</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.partC.map((emp) => (
                    <tr key={emp.employeeId}>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-500 tabular-nums">
                        {emp.ssnOnFile ? (
                          emp.ssn
                        ) : (
                          <span className="text-red-600">missing</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                        {emp.lastName}, {emp.firstName} {emp.middleInitial}
                        {!emp.uiCovered && (
                          <span className="ml-2 rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600">
                            UI exempt
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500">{emp.wageType}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <CopyableAmount value={emp.uiRemuneration} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <CopyableAmount value={emp.grossFederalWages} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <CopyableAmount value={emp.nysTaxWithheld} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <CopyableAmount value={emp.nycTaxWithheld} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <CopyableAmount value={emp.yonkersTaxWithheld} />
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr className="font-semibold text-gray-900">
                    <td colSpan={3} className="px-4 py-3">
                      Totals (line 23)
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(data.partA.line1TotalRemuneration)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(
                        data.partC.reduce((s, e) => s + e.grossFederalWages, 0)
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(data.partB.nysTaxWithheld)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(data.partB.nycTaxWithheld)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(data.partB.yonkersTaxWithheld)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="border-t bg-gray-50 px-6 py-3 text-xs text-gray-600 flex gap-2">
              <InformationCircleIcon className="h-4 w-4 flex-shrink-0 text-gray-400" />
              <span>
                The column f total ties to Part A line 1. Columns h + i + j tie to line 24. SSNs are
                masked here and written in full only into the generated PDF.
              </span>
            </div>
          </div>

          {/* Per-employee wage base detail */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">
                UI wage base detail (worksheet)
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Not on the form — this shows how each employee&apos;s remuneration splits across
                lines 2 and 3, and how the derived contribution compares to what payroll booked.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr className="text-xs uppercase tracking-wider text-gray-500">
                    <th className="px-4 py-3 text-left font-medium">Employee</th>
                    <th className="px-4 py-3 text-right font-medium">Remuneration</th>
                    <th className="px-4 py-3 text-right font-medium">Excess (line 2)</th>
                    <th className="px-4 py-3 text-right font-medium">Subject (line 3)</th>
                    <th className="px-4 py-3 text-right font-medium">SUI booked</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.partC.map((emp) => (
                    <tr key={emp.employeeId}>
                      <td className="px-4 py-3 whitespace-nowrap text-gray-900">
                        {emp.lastName}, {emp.firstName}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {formatCurrency(emp.uiRemuneration)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                        {formatCurrency(emp.uiExcess)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-900">
                        {formatCurrency(emp.uiSubject)}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums text-gray-500">
                        {formatCurrency(emp.bookedSUI)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr className="font-semibold text-gray-900">
                    <td className="px-4 py-3">Total</td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(data.partA.line1TotalRemuneration)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(data.partA.line2ExcessRemuneration)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(data.partA.line3WagesSubjectToContribution)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      {formatCurrency(data.bookedSUI)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* Not reported on this form */}
          <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
            <div className="flex gap-3">
              <InformationCircleIcon className="h-5 w-5 text-gray-400 flex-shrink-0" />
              <div className="text-sm text-gray-700">
                <h3 className="font-medium text-gray-900">Not reported on the NYS-45</h3>
                <p className="mt-1">
                  NYS SDI ({formatCurrency(data.notOnForm.nySDI)}) and NY PFL (
                  {formatCurrency(data.notOnForm.nyPFL)}) withheld this quarter are premiums remitted
                  to your disability/PFL carrier, not New York State withholding. Do not add them to
                  line 13.
                </p>
              </div>
            </div>
          </div>

          {/* Filing Status */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Filing Status</h2>
              {data.filing?.status === 'filed' ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-medium">
                    <CheckCircleIcon className="h-4 w-4" />
                    Filed
                  </span>
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
                  onClick={handleMarkFiledClick}
                  className="rounded-md bg-green-600 hover:bg-green-700 px-3 py-1.5 text-sm font-medium text-white"
                >
                  Mark NYS-45 Filed
                </button>
              )}
            </div>
            <div className="p-6 text-sm">
              {data.filing?.status === 'filed' ? (
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <dt className="text-gray-500">Filed Date</dt>
                    <dd className="font-medium text-gray-900">
                      {data.filing.filedDate ? formatDate(data.filing.filedDate) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Filing Method</dt>
                    <dd className="font-medium text-gray-900">{data.filing.filingMethod || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-gray-500">Confirmation #</dt>
                    <dd className="font-medium text-gray-900">
                      {data.filing.confirmationNumber || '—'}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-gray-600">
                  NYS-45 has not been recorded as filed for Q{selectedQuarter} {selectedYear}. Once
                  you submit the form to NY DTF, click <strong>Mark NYS-45 Filed</strong> to capture
                  the confirmation # and clear the deadline alert.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {showNoDepositsWarning && data && (
        <NoDepositsWarningModalNYS45
          year={selectedYear}
          quarter={selectedQuarter}
          onClose={() => setShowNoDepositsWarning(false)}
          onMarkFiledAnyway={() => {
            setShowNoDepositsWarning(false);
            setAcknowledgedNoDeposits(true);
            setShowFilingModal(true);
          }}
        />
      )}

      {showFilingModal && data && (
        <MarkNYS45FiledModal
          year={selectedYear}
          quarter={selectedQuarter}
          totalLiability={totalLiability}
          totalDeposits={totalDeposits}
          acknowledgedNoDeposits={acknowledgedNoDeposits}
          onClose={() => {
            setShowFilingModal(false);
            setAcknowledgedNoDeposits(false);
          }}
          onSaved={() => {
            setShowFilingModal(false);
            setAcknowledgedNoDeposits(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

function HeaderField({
  label,
  value,
  required,
}: {
  label: string;
  value: string | null;
  required?: boolean;
}) {
  const missing = !value;
  return (
    <div>
      <dt className="text-sm text-gray-500">{label}</dt>
      <dd
        className={`text-sm font-medium ${
          missing && required ? 'text-red-600' : missing ? 'text-gray-400' : 'text-gray-900'
        }`}
      >
        {value || (required ? 'Required — not set' : 'Not set')}
      </dd>
    </div>
  );
}

function NoDepositsWarningModalNYS45({
  year,
  quarter,
  onClose,
  onMarkFiledAnyway,
}: {
  year: number;
  quarter: number;
  onClose: () => void;
  onMarkFiledAnyway: () => void;
}) {
  const depositsHref = `/bookkeeping/tax-deposits/new?authority=ny_withholding&year=${year}&quarter=Q${quarter}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 text-red-600 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">No NY deposits recorded in books</h3>
            <p className="mt-2 text-sm text-gray-700">
              Q{quarter} {year} has NY payroll liability but no NY tax deposits (withholding, SUI,
              SDI, or PFL) recorded in the books for this quarter.
            </p>
            <p className="mt-2 text-sm text-gray-700">
              Marking NYS-45 filed without those deposits leaves your books showing the full
              liability outstanding while the return claims it&apos;s paid. Record the deposit(s)
              first to keep them in sync.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <Link
            href={depositsHref}
            className="rounded-md bg-blue-600 hover:bg-blue-700 px-3 py-1.5 text-sm font-medium text-white"
          >
            Record Deposits Now
          </Link>
          <button
            type="button"
            onClick={onMarkFiledAnyway}
            className="rounded-md border border-red-300 bg-white hover:bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700"
          >
            Mark Filed Anyway
          </button>
        </div>
      </div>
    </div>
  );
}

function MarkNYS45FiledModal({
  year,
  quarter,
  totalLiability,
  totalDeposits,
  acknowledgedNoDeposits,
  onClose,
  onSaved,
}: {
  year: number;
  quarter: number;
  totalLiability: number;
  totalDeposits: number;
  acknowledgedNoDeposits: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [filedDate, setFiledDate] = useState(today);
  const [filingMethod, setFilingMethod] = useState<'NY Online Services' | 'Mail' | 'Other'>(
    'NY Online Services'
  );
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const balanceDue = totalLiability - totalDeposits;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/bookkeeping/tax-filings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType: 'NYS-45',
          taxPeriodYear: year,
          taxPeriodQuarter: `Q${quarter}`,
          filedDate,
          filingMethod,
          confirmationNumber: confirmationNumber || null,
          totalLiability,
          totalDeposits,
          balanceDue,
          notes: notes || null,
          ...(acknowledgedNoDeposits && { acknowledgedNoDeposits: true }),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Failed to save filing');
      }
      onSaved();
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">
          Mark NYS-45 filed — Q{quarter} {year}
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Records the filing for audit history and clears the deadline alert.
        </p>

        {err && (
          <div className="mt-3 rounded-md bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
            {err}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700">Filed Date</label>
            <input
              type="date"
              value={filedDate}
              onChange={(e) => setFiledDate(e.target.value)}
              required
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Filing Method</label>
            <select
              value={filingMethod}
              onChange={(e) => setFilingMethod(e.target.value as typeof filingMethod)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            >
              <option value="NY Online Services">NY Online Services</option>
              <option value="Mail">Mail</option>
              <option value="Other">Other</option>
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
          <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-700 space-y-1">
            <div className="flex justify-between">
              <span>NYS-45 liability (line 6 + line 13):</span>
              <span>${totalLiability.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span>NY deposits (withholding + UI):</span>
              <span>${totalDeposits.toFixed(2)}</span>
            </div>
            <div className="flex justify-between font-medium border-t border-gray-200 pt-1">
              <span>Balance due:</span>
              <span>${balanceDue.toFixed(2)}</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2"
            />
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-md bg-green-600 hover:bg-green-700 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save filing'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default function NYS45Page() {
  return (
    <Suspense
      fallback={
        <div className="rounded-lg border bg-white p-8 shadow-sm text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      }
    >
      <NYS45Content />
    </Suspense>
  );
}
