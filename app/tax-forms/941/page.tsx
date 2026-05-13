'use client';

import { useCallback, useEffect, useState, Suspense } from 'react';
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
  } | null;
  recordCount: number;
}

const quarters = [
  { value: 1, label: 'Q1 (Jan-Mar)', dueDate: 'April 30' },
  { value: 2, label: 'Q2 (Apr-Jun)', dueDate: 'July 31' },
  { value: 3, label: 'Q3 (Jul-Sep)', dueDate: 'October 31' },
  { value: 4, label: 'Q4 (Oct-Dec)', dueDate: 'January 31' },
];

function getCurrentQuarter(): number {
  const month = new Date().getMonth();
  return Math.floor(month / 3) + 1;
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

function Form941Content() {
  const searchParams = useSearchParams();
  const initialYear = searchParams.get('year') ? parseInt(searchParams.get('year')!) : getCurrentYear();
  const initialQuarter = searchParams.get('quarter') ? parseInt(searchParams.get('quarter')!) : getCurrentQuarter();

  const [selectedYear, setSelectedYear] = useState(initialYear);
  const [selectedQuarter, setSelectedQuarter] = useState(initialQuarter);
  const [data, setData] = useState<Form941Data | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showFilingModal, setShowFilingModal] = useState(false);
  const [showNoDepositsWarning, setShowNoDepositsWarning] = useState(false);
  const [acknowledgedNoDeposits, setAcknowledgedNoDeposits] = useState(false);

  // Gate the Mark Filed action when the form shows a real quarterly liability
  // but no deposits are recorded in the books — books and filing would diverge
  // silently otherwise. See the audit trail's tax_filing.mark_filed_without_deposits
  // action for any cases the user chose to file anyway.
  const handleMarkFiledClick = () => {
    if (!data) return;
    const hasLiability = data.totals.totalTaxesAfterAdjustments > 0;
    const noDeposits = data.deposits.length === 0;
    if (hasLiability && noDeposits) {
      setShowNoDepositsWarning(true);
    } else {
      setAcknowledgedNoDeposits(false);
      setShowFilingModal(true);
    }
  };

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

  const handleDownload = () => {
    window.open(`/api/tax-forms/941?year=${selectedYear}&quarter=${selectedQuarter}`, '_blank');
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
                  <dd className="text-sm font-medium text-gray-900">{data.totals.employeeCount}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Payroll Records</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.recordCount}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Form 941 Lines Preview */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Form 941 Values</h2>
            </div>
            <div className="p-6">
              <table className="min-w-full">
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="py-3 text-sm text-gray-500 w-20">Line 1</td>
                    <td className="py-3 text-sm text-gray-900">Number of employees who received wages</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{data.totals.employeeCount}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-sm text-gray-500">Line 2</td>
                    <td className="py-3 text-sm text-gray-900">Wages, tips, and other compensation</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(data.totals.totalWages)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-sm text-gray-500">Line 3</td>
                    <td className="py-3 text-sm text-gray-900">Federal income tax withheld</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(data.totals.federalTaxWithheld)}</td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-3 text-sm text-gray-500">Line 5a</td>
                    <td className="py-3 text-sm text-gray-900">
                      Taxable Social Security wages
                      <span className="text-gray-500 ml-2">× 12.4%</span>
                    </td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(data.totals.socialSecurityWages)} → {formatCurrency(data.totals.socialSecurityTax)}
                    </td>
                  </tr>
                  <tr className="bg-gray-50">
                    <td className="py-3 text-sm text-gray-500">Line 5c</td>
                    <td className="py-3 text-sm text-gray-900">
                      Taxable Medicare wages
                      <span className="text-gray-500 ml-2">× 2.9%</span>
                    </td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(data.totals.medicareWages)} → {formatCurrency(data.totals.medicareTax)}
                    </td>
                  </tr>
                  {data.totals.additionalMedicareTax > 0 && (
                    <tr className="bg-gray-50">
                      <td className="py-3 text-sm text-gray-500">Line 5d</td>
                      <td className="py-3 text-sm text-gray-900">
                        Additional Medicare Tax
                        <span className="text-gray-500 ml-2">× 0.9%</span>
                      </td>
                      <td className="py-3 text-sm font-medium text-gray-900 text-right">
                        {formatCurrency(data.totals.additionalMedicareWages)} → {formatCurrency(data.totals.additionalMedicareTax)}
                      </td>
                    </tr>
                  )}
                  <tr>
                    <td className="py-3 text-sm text-gray-500">Line 5e</td>
                    <td className="py-3 text-sm text-gray-900">Total Social Security and Medicare taxes</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">
                      {formatCurrency(data.totals.socialSecurityTax + data.totals.medicareTax + data.totals.additionalMedicareTax)}
                    </td>
                  </tr>
                  <tr className="border-t-2 border-gray-300">
                    <td className="py-3 text-sm text-gray-500">Line 6</td>
                    <td className="py-3 text-sm text-gray-900">Total taxes before adjustments</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(data.totals.totalTaxesBeforeAdjustments)}</td>
                  </tr>
                  <tr className="border-t-2 border-gray-300 bg-blue-50">
                    <td className="py-3 text-sm font-medium text-blue-900">Line 10</td>
                    <td className="py-3 text-sm font-medium text-blue-900">Total taxes after adjustments</td>
                    <td className="py-3 text-lg font-bold text-blue-900 text-right">{formatCurrency(data.totals.totalTaxesAfterAdjustments)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-sm text-gray-500">Line 13</td>
                    <td className="py-3 text-sm text-gray-900">Total deposits made for this quarter</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(data.totals.totalDeposits)}</td>
                  </tr>
                  {data.totals.balanceDue > 0 && (
                    <tr className="border-t-2 border-gray-300 bg-red-50">
                      <td className="py-3 text-sm font-medium text-red-900">Line 14</td>
                      <td className="py-3 text-sm font-medium text-red-900">Balance due</td>
                      <td className="py-3 text-lg font-bold text-red-900 text-right">{formatCurrency(data.totals.balanceDue)}</td>
                    </tr>
                  )}
                  {data.totals.overpayment > 0 && (
                    <tr className="border-t-2 border-gray-300 bg-amber-50">
                      <td className="py-3 text-sm font-medium text-amber-900">Line 15</td>
                      <td className="py-3 text-sm font-medium text-amber-900">Overpayment</td>
                      <td className="py-3 text-lg font-bold text-amber-900 text-right">{formatCurrency(data.totals.overpayment)}</td>
                    </tr>
                  )}
                  {data.totals.balanceDue === 0 && data.totals.overpayment === 0 && (
                    <tr className="border-t-2 border-gray-300 bg-green-50">
                      <td className="py-3 text-sm font-medium text-green-900">Balance</td>
                      <td className="py-3 text-sm font-medium text-green-900">Paid in full — no balance due</td>
                      <td className="py-3 text-lg font-bold text-green-900 text-right">$0.00</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
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
                      <td colSpan={3} className="py-2">Total Deposits (Line 13)</td>
                      <td className="py-2 text-right">{formatCurrency(data.totals.totalDeposits)}</td>
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
                  {!data.scheduleB.matchesLine12 && (
                    <div className="mt-3 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                      ⚠ Schedule B total ({formatCurrency(data.scheduleB.total)}) doesn&apos;t match
                      Line 10 ({formatCurrency(data.totals.totalTaxesAfterAdjustments)}). Review for
                      voided payrolls or rounding.
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
              {data.filing?.status === 'filed' ? (
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-100 text-green-800 px-3 py-1 text-xs font-medium">
                    <CheckCircleIcon className="h-4 w-4" />
                    Filed
                  </span>
                  <button
                    type="button"
                    onClick={async () => {
                      if (!data.filing) return;
                      if (!confirm(
                        `Unfile Q${selectedQuarter} ${selectedYear} Form 941? The filing record will be removed and the deadline reminder will return. The audit trail keeps the original Mark Filed event.`
                      )) return;
                      const res = await fetch(`/api/tax-filings/${data.filing.id}`, { method: 'DELETE' });
                      if (res.ok) {
                        fetchData();
                      } else {
                        const body = await res.json().catch(() => ({}));
                        alert(body.error || 'Failed to unfile');
                      }
                    }}
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
                  Mark Form 941 Filed
                </button>
              )}
            </div>
            <div className="p-6 text-sm">
              {data.filing?.status === 'filed' ? (
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
                </dl>
              ) : (
                <p className="text-gray-600">
                  Form 941 has not been recorded as filed for Q{selectedQuarter} {selectedYear}.
                  Once you submit the form to the IRS, click <strong>Mark Form 941 Filed</strong> to
                  capture the confirmation # and clear the deadline alert.
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
                  The downloaded PDF will be pre-filled with the values shown above. Please review all information
                  carefully and make any necessary adjustments before filing with the IRS.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showNoDepositsWarning && data && (
        <NoDepositsWarningModal
          year={selectedYear}
          quarter={selectedQuarter}
          totalLiability={data.totals.totalTaxesAfterAdjustments}
          onClose={() => setShowNoDepositsWarning(false)}
          onMarkFiledAnyway={() => {
            setShowNoDepositsWarning(false);
            setAcknowledgedNoDeposits(true);
            setShowFilingModal(true);
          }}
        />
      )}

      {showFilingModal && data && (
        <Mark941FiledModal
          year={selectedYear}
          quarter={selectedQuarter}
          totalLiability={data.totals.totalTaxesAfterAdjustments}
          totalDeposits={data.totals.totalDeposits}
          balanceDue={data.totals.totalTaxesAfterAdjustments - data.totals.totalDeposits}
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

function NoDepositsWarningModal({
  year,
  quarter,
  totalLiability,
  onClose,
  onMarkFiledAnyway,
}: {
  year: number;
  quarter: number;
  totalLiability: number;
  onClose: () => void;
  onMarkFiledAnyway: () => void;
}) {
  const depositsHref = `/bookkeeping/tax-deposits/new?authority=federal_941&year=${year}&quarter=Q${quarter}`;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
        <div className="flex items-start gap-3">
          <ExclamationTriangleIcon className="h-6 w-6 flex-shrink-0 text-red-600 mt-0.5" />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">No deposits recorded in books</h3>
            <p className="mt-2 text-sm text-gray-700">
              The Form 941 for <strong>Q{quarter} {year}</strong> shows a total liability of{' '}
              <strong>{formatCurrency(totalLiability)}</strong>, but no deposit records exist
              in the books for this quarter.
            </p>
            <p className="mt-2 text-sm text-gray-700">
              If you paid the IRS via EFTPS (or any other method) without recording it here,
              your books and your filed 941 will not agree — the 941 will show paid in full
              while the books show the full liability still outstanding. Record the deposit(s)
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

function Mark941FiledModal({
  year,
  quarter,
  totalLiability,
  totalDeposits,
  balanceDue,
  acknowledgedNoDeposits,
  onClose,
  onSaved,
}: {
  year: number;
  quarter: number;
  totalLiability: number;
  totalDeposits: number;
  balanceDue: number;
  acknowledgedNoDeposits: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [filedDate, setFiledDate] = useState(today);
  const [filingMethod, setFilingMethod] = useState<'EFTPS' | 'IRS e-file' | 'Mail' | 'Other'>('IRS e-file');
  const [confirmationNumber, setConfirmationNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErr('');
    try {
      const res = await fetch('/api/bookkeeping/tax-filings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType: '941',
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
          Mark Form 941 filed — Q{quarter} {year}
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
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Filing Method</label>
            <select
              value={filingMethod}
              onChange={(e) => setFilingMethod(e.target.value as typeof filingMethod)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            >
              <option value="IRS e-file">IRS e-file</option>
              <option value="EFTPS">EFTPS</option>
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
              placeholder="e.g. submission ID from IRS"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>
          <div className="rounded-md bg-gray-50 border border-gray-200 px-3 py-2 text-xs text-gray-700 space-y-1">
            <div className="flex justify-between"><span>Total liability (Line 10):</span><span>${totalLiability.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Total deposits (Line 13):</span><span>${totalDeposits.toFixed(2)}</span></div>
            <div className="flex justify-between font-medium border-t border-gray-200 pt-1"><span>Balance due:</span><span>${balanceDue.toFixed(2)}</span></div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
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
