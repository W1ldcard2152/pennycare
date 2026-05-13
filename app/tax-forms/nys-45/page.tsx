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
} from '@heroicons/react/24/outline';

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
  dateRange: {
    start: string;
    end: string;
  };
  totals: {
    employeeCount: number;
    totalWages: number;
    stateTaxWithheld: number;
    nySDI: number;
    nyPFL: number;
    grossWages: number;
    uiTaxableWages: number;
    employerSUI: number;
    totalDeposits: number;
  };
  deposits: Array<{
    id: string;
    depositDate: string;
    paymentMethod: string;
    confirmationNumber: string | null;
    taxAuthority: string;
    amount: number;
  }>;
  filing: {
    id: string;
    status: string;
    filedDate: string | null;
    confirmationNumber: string | null;
    filingMethod: string | null;
  } | null;
  employees: Array<{
    lastName: string;
    firstName: string;
    middleInitial: string;
    ssn: string;
    totalWages: number;
    uiWages: number;
  }>;
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

function NYS45Content() {
  const searchParams = useSearchParams();
  const initialYear = searchParams.get('year') ? parseInt(searchParams.get('year')!) : getCurrentYear();
  const initialQuarter = searchParams.get('quarter') ? parseInt(searchParams.get('quarter')!) : getCurrentQuarter();

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

  // Guard parity with Form 941: if the quarter shows real NY tax liability but
  // no recorded TaxDeposit rows for any NY authority, prompt before filing.
  const handleMarkFiledClick = () => {
    if (!data) return;
    const hasLiability =
      data.totals.stateTaxWithheld +
        data.totals.nySDI +
        data.totals.nyPFL +
        data.totals.employerSUI >
      0;
    const noDeposits = data.deposits.length === 0;
    if (hasLiability && noDeposits) {
      setShowNoDepositsWarning(true);
    } else {
      setAcknowledgedNoDeposits(false);
      setShowFilingModal(true);
    }
  };

  const handleUnfile = async () => {
    if (!data?.filing) return;
    if (!confirm(
      `Unfile Q${selectedQuarter} ${selectedYear} NYS-45? The filing record will be removed and the deadline reminder will return.`
    )) return;
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
          <DocumentTextIcon className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">NYS-45</h1>
          <p className="text-gray-600">Quarterly Combined Withholding, Wage Reporting and Unemployment Insurance Return</p>
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
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <dt className="text-sm text-gray-500">Employer Name</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.company.legalBusinessName || data.company.companyName}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">FEIN</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.company.fein || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">UI Employer Registration #</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.company.stateUIClientId || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Withholding ID</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.company.stateTaxId || 'Not set'}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">SUI Rate</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.company.suiRate ? `${(data.company.suiRate * 100).toFixed(2)}%` : 'Not set'}</dd>
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
                  <dt className="text-sm text-gray-500">Employees</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.totals.employeeCount}</dd>
                </div>
                <div>
                  <dt className="text-sm text-gray-500">Payroll Records</dt>
                  <dd className="text-sm font-medium text-gray-900">{data.recordCount}</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Part A - Withholding */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Part A - Withholding Information</h2>
            </div>
            <div className="p-6">
              <table className="min-w-full">
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="py-3 text-sm text-gray-900">Total Wages Paid</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(data.totals.totalWages)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-sm text-gray-900">NYS Income Tax Withheld</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(data.totals.stateTaxWithheld)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-sm text-gray-900">NYS SDI Withheld</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(data.totals.nySDI)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-sm text-gray-900">NYS PFL Withheld</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(data.totals.nyPFL)}</td>
                  </tr>
                  <tr className="bg-blue-50">
                    <td className="py-3 text-sm font-medium text-blue-900">Total NYS Withholdings</td>
                    <td className="py-3 text-lg font-bold text-blue-900 text-right">
                      {formatCurrency(data.totals.stateTaxWithheld + data.totals.nySDI + data.totals.nyPFL)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Part B - Unemployment Insurance */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Part B - Unemployment Insurance</h2>
            </div>
            <div className="p-6">
              <table className="min-w-full">
                <tbody className="divide-y divide-gray-200">
                  <tr>
                    <td className="py-3 text-sm text-gray-900">Gross Wages</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(data.totals.grossWages)}</td>
                  </tr>
                  <tr>
                    <td className="py-3 text-sm text-gray-900">UI Taxable Wages</td>
                    <td className="py-3 text-sm font-medium text-gray-900 text-right">{formatCurrency(data.totals.uiTaxableWages)}</td>
                  </tr>
                  <tr className="bg-green-50">
                    <td className="py-3 text-sm font-medium text-green-900">Employer SUI Contribution</td>
                    <td className="py-3 text-lg font-bold text-green-900 text-right">{formatCurrency(data.totals.employerSUI)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Part C - Employee Wage Detail */}
          <div className="rounded-lg border bg-white shadow-sm">
            <div className="border-b px-6 py-4">
              <h2 className="text-lg font-semibold text-gray-900">Part C - Employee Wage Detail</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Employee</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">SSN</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Wages</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">UI Wages</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.employees.map((emp, index) => (
                    <tr key={index}>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {emp.lastName}, {emp.firstName} {emp.middleInitial}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{emp.ssn}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(emp.totalWages)}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">{formatCurrency(emp.uiWages)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50">
                  <tr>
                    <td colSpan={2} className="px-6 py-3 text-sm font-medium text-gray-900">Total</td>
                    <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(data.totals.totalWages)}</td>
                    <td className="px-6 py-3 text-sm font-bold text-gray-900 text-right">{formatCurrency(data.totals.uiTaxableWages)}</td>
                  </tr>
                </tfoot>
              </table>
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
                </dl>
              ) : (
                <p className="text-gray-600">
                  NYS-45 has not been recorded as filed for Q{selectedQuarter} {selectedYear}.
                  Once you submit the form to NY DTF, click <strong>Mark NYS-45 Filed</strong> to
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
                  Please review all information carefully. The employee SSNs shown above are masked for security.
                  The actual SSNs will be included in the generated PDF.
                </p>
              </div>
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
          totalLiability={
            data.totals.stateTaxWithheld +
            data.totals.nySDI +
            data.totals.nyPFL +
            data.totals.employerSUI
          }
          totalDeposits={data.totals.totalDeposits}
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
              Q{quarter} {year} has NY payroll liability but no NY tax deposits
              (withholding, SUI, SDI, or PFL) recorded in the books for this quarter.
            </p>
            <p className="mt-2 text-sm text-gray-700">
              Marking NYS-45 filed without those deposits leaves your books showing
              the full liability outstanding while the return claims it&apos;s paid.
              Record the deposit(s) first to keep them in sync.
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
  const [filingMethod, setFilingMethod] = useState<'NY Online Services' | 'Mail' | 'Other'>('NY Online Services');
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
            <div className="flex justify-between"><span>Total NY liability:</span><span>${totalLiability.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Total NY deposits:</span><span>${totalDeposits.toFixed(2)}</span></div>
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
    <Suspense fallback={
      <div className="rounded-lg border bg-white p-8 shadow-sm text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    }>
      <NYS45Content />
    </Suspense>
  );
}
