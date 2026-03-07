'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeftIcon,
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
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
  };
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
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
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

  useEffect(() => {
    async function fetchData() {
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
    }
    fetchData();
  }, [selectedYear, selectedQuarter]);

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
                </tbody>
              </table>
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
