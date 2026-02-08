'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon, CalendarIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface TaxLiabilityData {
  company: {
    companyName: string;
    legalBusinessName: string | null;
    fein: string | null;
    stateUIClientId: string | null;
    stateTaxId: string | null;
  };
  dateRange: {
    start: string;
    end: string;
    period: string;
  };
  totals: {
    grossWages: number;
    federalTax: number;
    stateTax: number;
    localTax: number;
    socialSecurityEmployee: number;
    medicareEmployee: number;
    additionalMedicare: number;
    nySDI: number;
    nyPFL: number;
    totalEmployeeWithholdings: number;
    socialSecurityEmployer: number;
    medicareEmployer: number;
    employerSUI: number;
    employerFUTA: number;
    totalEmployerTaxes: number;
    totalFICA: number;
    total941Liability: number;
    totalStateLiability: number;
  };
  byPayDate: Array<{
    payDate: string;
    payPeriodStart: string;
    payPeriodEnd: string;
    grossWages: number;
    federalTax: number;
    stateTax: number;
    localTax: number;
    socialSecurityEmployee: number;
    medicareEmployee: number;
    additionalMedicare: number;
    nySDI: number;
    nyPFL: number;
    socialSecurityEmployer: number;
    medicareEmployer: number;
    employerSUI: number;
    employerFUTA: number;
  }>;
  depositInfo: {
    schedule: string;
    nextDepositDue: string;
    form941DueDate: string;
    nys45DueDate: string;
  };
  recordCount: number;
}

export default function TaxLiabilityPage() {
  const [period, setPeriod] = useState<string>('quarter');
  const [customStart, setCustomStart] = useState<string>('');
  const [customEnd, setCustomEnd] = useState<string>('');
  const [data, setData] = useState<TaxLiabilityData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      let url = `/api/payroll/tax-liability?period=${period}`;
      if (period === 'custom' && customStart && customEnd) {
        url = `/api/payroll/tax-liability?startDate=${customStart}&endDate=${customEnd}`;
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch tax liability data');
      }
      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getQuarterName = (start: string, end: string) => {
    const startDate = new Date(start);
    const quarter = Math.floor(startDate.getMonth() / 3) + 1;
    return `Q${quarter} ${startDate.getFullYear()}`;
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Hidden in print */}
      <div className="print:hidden bg-white border-b px-4 py-4 mb-6">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Link
                href="/payroll"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeftIcon className="h-5 w-5" />
                Back to Payroll
              </Link>
              <h1 className="text-xl font-semibold">Tax Liability Summary</h1>
            </div>
            {data && data.recordCount > 0 && (
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <PrinterIcon className="h-5 w-5" />
                Print
              </button>
            )}
          </div>

          {/* Period Selector */}
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
              <select
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                className="rounded-lg border border-gray-300 px-4 py-2"
              >
                <option value="month">Current Month</option>
                <option value="quarter">Current Quarter</option>
                <option value="year">Current Year</option>
                <option value="custom">Custom Range</option>
              </select>
            </div>

            {period === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                    className="rounded-lg border border-gray-300 px-4 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                    className="rounded-lg border border-gray-300 px-4 py-2"
                  />
                </div>
              </>
            )}

            <button
              onClick={fetchData}
              disabled={loading || (period === 'custom' && (!customStart || !customEnd))}
              className="rounded-lg bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? 'Loading...' : 'Generate Report'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 print:px-2 print:max-w-none">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg mb-6 print:hidden">
            {error}
          </div>
        )}

        {!data && !loading && !error && (
          <div className="bg-white rounded-lg shadow p-12 text-center print:hidden">
            <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No Report Generated</h3>
            <p className="mt-2 text-gray-500">
              Select a period and click &quot;Generate Report&quot; to view tax liability summary.
            </p>
          </div>
        )}

        {data && data.recordCount === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center print:hidden">
            <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No Payroll Records</h3>
            <p className="mt-2 text-gray-500">
              No payroll was processed for this period.
            </p>
          </div>
        )}

        {data && data.recordCount > 0 && (
          <div className="bg-white shadow-lg rounded-lg print:shadow-none print:rounded-none overflow-hidden">
            {/* Report Header */}
            <div className="border-b p-6 print:p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {data.company.legalBusinessName || data.company.companyName}
                  </h2>
                  {data.company.fein && (
                    <p className="text-gray-600 mt-1">FEIN: {data.company.fein}</p>
                  )}
                  {data.company.stateTaxId && (
                    <p className="text-gray-600">NYS Tax ID: {data.company.stateTaxId}</p>
                  )}
                  {data.company.stateUIClientId && (
                    <p className="text-gray-600">NYS UI Client ID: {data.company.stateUIClientId}</p>
                  )}
                </div>
                <div className="text-right">
                  <h3 className="text-xl font-semibold text-gray-900">TAX LIABILITY SUMMARY</h3>
                  <p className="text-gray-600 mt-1">
                    {data.dateRange.period === 'quarter'
                      ? getQuarterName(data.dateRange.start, data.dateRange.end)
                      : `${formatDate(data.dateRange.start)} - ${formatDate(data.dateRange.end)}`
                    }
                  </p>
                </div>
              </div>
            </div>

            {/* Deposit Due Dates Alert */}
            <div className="border-b bg-yellow-50 p-4 print:p-3">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-semibold text-yellow-800">Important Due Dates</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mt-2 text-yellow-700">
                    <div>
                      <span className="font-medium">Deposit Schedule:</span> {data.depositInfo.schedule}
                    </div>
                    <div>
                      <span className="font-medium">Form 941 Due:</span> {formatDate(data.depositInfo.form941DueDate)}
                    </div>
                    <div>
                      <span className="font-medium">NYS-45 Due:</span> {formatDate(data.depositInfo.nys45DueDate)}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="p-6 print:p-4 border-b">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Federal (Form 941) Liability */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-3">Federal Liability (Form 941)</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Federal Income Tax Withheld:</span>
                      <span className="font-medium">{formatCurrency(data.totals.federalTax)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Social Security (EE + ER):</span>
                      <span className="font-medium">{formatCurrency(data.totals.socialSecurityEmployee + data.totals.socialSecurityEmployer)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Medicare (EE + ER):</span>
                      <span className="font-medium">{formatCurrency(data.totals.medicareEmployee + data.totals.medicareEmployer + data.totals.additionalMedicare)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-semibold text-lg text-blue-900">
                      <span>Total 941 Liability:</span>
                      <span>{formatCurrency(data.totals.total941Liability)}</span>
                    </div>
                  </div>
                </div>

                {/* NYS Liability */}
                <div className="bg-purple-50 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-900 mb-3">NYS Liability (NYS-45)</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">NYS Income Tax Withheld:</span>
                      <span className="font-medium">{formatCurrency(data.totals.stateTax)}</span>
                    </div>
                    {data.totals.localTax > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Local Tax (NYC/Yonkers):</span>
                        <span className="font-medium">{formatCurrency(data.totals.localTax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">NY SDI:</span>
                      <span className="font-medium">{formatCurrency(data.totals.nySDI)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">NY PFL:</span>
                      <span className="font-medium">{formatCurrency(data.totals.nyPFL)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">NY SUI (Employer):</span>
                      <span className="font-medium">{formatCurrency(data.totals.employerSUI)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-semibold text-lg text-purple-900">
                      <span>Total NYS Liability:</span>
                      <span>{formatCurrency(data.totals.totalStateLiability)}</span>
                    </div>
                  </div>
                </div>

                {/* FUTA Liability */}
                <div className="bg-orange-50 rounded-lg p-4">
                  <h4 className="font-semibold text-orange-900 mb-3">Federal Unemployment (Form 940)</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Gross Wages:</span>
                      <span className="font-medium">{formatCurrency(data.totals.grossWages)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">FUTA Rate:</span>
                      <span className="font-medium">0.6%</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-semibold text-lg text-orange-900">
                      <span>FUTA Liability:</span>
                      <span>{formatCurrency(data.totals.employerFUTA)}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      * FUTA applies to first $7,000 per employee per year
                    </p>
                  </div>
                </div>
              </div>

              {/* Grand Total */}
              <div className="mt-6 bg-gray-900 text-white rounded-lg p-4 flex justify-between items-center">
                <div>
                  <span className="text-gray-300">Total Tax Liability (All Taxes):</span>
                </div>
                <div className="text-2xl font-bold">
                  {formatCurrency(
                    data.totals.total941Liability +
                    data.totals.totalStateLiability +
                    data.totals.employerFUTA
                  )}
                </div>
              </div>
            </div>

            {/* Detailed Breakdown */}
            <div className="p-6 print:p-4">
              <h4 className="font-semibold text-gray-900 mb-4">Breakdown by Employee vs Employer</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Employee Withholdings */}
                <div className="border rounded-lg p-4">
                  <h5 className="font-semibold text-gray-700 mb-3 border-b pb-2">Employee Withholdings</h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Federal Income Tax:</span>
                      <span className="font-medium">{formatCurrency(data.totals.federalTax)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">NY State Income Tax:</span>
                      <span className="font-medium">{formatCurrency(data.totals.stateTax)}</span>
                    </div>
                    {data.totals.localTax > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Local Tax:</span>
                        <span className="font-medium">{formatCurrency(data.totals.localTax)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">Social Security (6.2%):</span>
                      <span className="font-medium">{formatCurrency(data.totals.socialSecurityEmployee)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Medicare (1.45%):</span>
                      <span className="font-medium">{formatCurrency(data.totals.medicareEmployee)}</span>
                    </div>
                    {data.totals.additionalMedicare > 0 && (
                      <div className="flex justify-between">
                        <span className="text-gray-600">Additional Medicare (0.9%):</span>
                        <span className="font-medium">{formatCurrency(data.totals.additionalMedicare)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-gray-600">NY SDI:</span>
                      <span className="font-medium">{formatCurrency(data.totals.nySDI)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">NY PFL:</span>
                      <span className="font-medium">{formatCurrency(data.totals.nyPFL)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-semibold">
                      <span>Total Employee Withholdings:</span>
                      <span>{formatCurrency(data.totals.totalEmployeeWithholdings)}</span>
                    </div>
                  </div>
                </div>

                {/* Employer Taxes */}
                <div className="border rounded-lg p-4">
                  <h5 className="font-semibold text-gray-700 mb-3 border-b pb-2">Employer Taxes</h5>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Social Security (6.2%):</span>
                      <span className="font-medium">{formatCurrency(data.totals.socialSecurityEmployer)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Medicare (1.45%):</span>
                      <span className="font-medium">{formatCurrency(data.totals.medicareEmployer)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">NY SUI:</span>
                      <span className="font-medium">{formatCurrency(data.totals.employerSUI)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">FUTA:</span>
                      <span className="font-medium">{formatCurrency(data.totals.employerFUTA)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-semibold">
                      <span>Total Employer Taxes:</span>
                      <span>{formatCurrency(data.totals.totalEmployerTaxes)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Pay Date Detail Table */}
            {data.byPayDate.length > 1 && (
              <div className="p-6 print:p-4 border-t">
                <h4 className="font-semibold text-gray-900 mb-4">Liability by Pay Date</h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-xs">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left font-semibold">Pay Date</th>
                        <th className="px-3 py-2 text-right font-semibold">Gross</th>
                        <th className="px-3 py-2 text-right font-semibold">Fed Tax</th>
                        <th className="px-3 py-2 text-right font-semibold">State Tax</th>
                        <th className="px-3 py-2 text-right font-semibold">SS (EE+ER)</th>
                        <th className="px-3 py-2 text-right font-semibold">Med (EE+ER)</th>
                        <th className="px-3 py-2 text-right font-semibold">SDI</th>
                        <th className="px-3 py-2 text-right font-semibold">PFL</th>
                        <th className="px-3 py-2 text-right font-semibold">SUI</th>
                        <th className="px-3 py-2 text-right font-semibold">FUTA</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {data.byPayDate.map((pd) => (
                        <tr key={pd.payDate} className="hover:bg-gray-50">
                          <td className="px-3 py-2">{formatDate(pd.payDate)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(pd.grossWages)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(pd.federalTax)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(pd.stateTax)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(pd.socialSecurityEmployee + pd.socialSecurityEmployer)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(pd.medicareEmployee + pd.medicareEmployer + pd.additionalMedicare)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(pd.nySDI)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(pd.nyPFL)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(pd.employerSUI)}</td>
                          <td className="px-3 py-2 text-right">{formatCurrency(pd.employerFUTA)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="border-t p-4 text-center text-xs text-gray-500">
              <p>Generated on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
              <p className="mt-1">This report is for internal use only. Consult your tax advisor for filing requirements.</p>
            </div>
          </div>
        )}
      </div>

      {/* Print Styles */}
      <style jsx global>{`
        @media print {
          body {
            background: white !important;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          .print\\:hidden {
            display: none !important;
          }
          .print\\:shadow-none {
            box-shadow: none !important;
          }
          .print\\:rounded-none {
            border-radius: 0 !important;
          }
          .print\\:p-2 {
            padding: 0.5rem !important;
          }
          .print\\:p-3 {
            padding: 0.75rem !important;
          }
          .print\\:p-4 {
            padding: 1rem !important;
          }
          .print\\:max-w-none {
            max-width: none !important;
          }
        }
      `}</style>
    </div>
  );
}
