'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';

interface PeriodData {
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  employeeCount: number;
  totalHours: number;
  overtimeHours: number;
  grossPay: number;
  totalPreTaxDeductions: number;
  totalTaxWithholdings: number;
  totalPostTaxDeductions: number;
  totalDeductions: number;
  netPay: number;
  totalEmployerCost: number;
}

interface ReportData {
  company: { companyName: string; legalBusinessName: string | null; fein: string | null; address: string | null; city: string | null; state: string | null; zipCode: string | null };
  dateRange: { start: string; end: string; period: string };
  periods: PeriodData[];
  grandTotals: {
    employeeCount: number; totalHours: number; overtimeHours: number; grossPay: number;
    totalPreTaxDeductions: number; totalTaxWithholdings: number; totalPostTaxDeductions: number;
    totalDeductions: number; netPay: number; totalEmployerCost: number;
  };
  recordCount: number;
}

export default function PayrollSummaryReport() {
  const [period, setPeriod] = useState('quarter');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const formatDate = (dateStr: string) =>
    new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

  const fetchData = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (period === 'custom' && customStart && customEnd) {
        params.set('startDate', customStart);
        params.set('endDate', customEnd);
      } else {
        params.set('period', period);
      }
      const res = await fetch(`/api/reports/payroll-summary?${params}`);
      if (res.ok) {
        setData(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <div className="bg-white shadow print:hidden">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/reports" className="text-gray-500 hover:text-gray-700">
                <ArrowLeftIcon className="h-5 w-5" />
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Payroll Summary Report</h1>
            </div>
            <button onClick={() => window.print()} className="flex items-center gap-2 rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200">
              <PrinterIcon className="h-4 w-4" /> Print
            </button>
          </div>
        </div>
      </div>

      {/* Period Selector */}
      <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8 print:hidden">
        <div className="flex flex-wrap items-end gap-4 rounded-lg bg-white p-4 shadow">
          <div>
            <label className="block text-sm font-medium text-gray-700">Period</label>
            <select value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
              <option value="month">Current Month</option>
              <option value="quarter">Current Quarter</option>
              <option value="year">Current Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>
          {period === 'custom' && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Start Date</label>
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="mt-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End Date</label>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="mt-1 rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500" />
              </div>
            </>
          )}
          <button onClick={fetchData} disabled={loading} className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-gray-400">
            {loading ? 'Loading...' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* Report Content */}
      {data && (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 print:max-w-none print:px-4">
          {/* Report Header */}
          <div className="mb-6 flex items-start justify-between rounded-lg bg-white p-6 shadow print:shadow-none print:rounded-none print:p-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">{data.company.legalBusinessName || data.company.companyName}</h2>
              {data.company.address && <p className="text-sm text-gray-600">{data.company.address}{data.company.city ? `, ${data.company.city}` : ''}{data.company.state ? `, ${data.company.state}` : ''} {data.company.zipCode || ''}</p>}
              {data.company.fein && <p className="text-sm text-gray-600">FEIN: {data.company.fein}</p>}
            </div>
            <div className="text-right">
              <h3 className="text-lg font-bold text-gray-900">PAYROLL SUMMARY REPORT</h3>
              <p className="text-sm text-gray-600">{formatDate(data.dateRange.start)} — {formatDate(data.dateRange.end)}</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4">
            {[
              { label: 'Total Gross Pay', value: data.grandTotals.grossPay, color: 'blue' },
              { label: 'Total Deductions', value: data.grandTotals.totalDeductions, color: 'orange' },
              { label: 'Total Net Pay', value: data.grandTotals.netPay, color: 'green' },
              { label: 'Total Employer Cost', value: data.grandTotals.totalEmployerCost, color: 'purple' },
            ].map((card) => (
              <div key={card.label} className="rounded-lg bg-white p-4 shadow print:shadow-none print:border print:rounded-none">
                <p className="text-sm text-gray-600">{card.label}</p>
                <p className={`text-xl font-bold text-${card.color}-600`}>{formatCurrency(card.value)}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          {data.periods.length === 0 ? (
            <div className="rounded-lg bg-white p-12 text-center shadow">
              <p className="text-gray-500">No payroll records found for this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg bg-white shadow print:shadow-none print:rounded-none">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold text-gray-900">Pay Period</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900"># EEs</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Hours</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">OT Hrs</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Gross Pay</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Pre-Tax</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Taxes</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Post-Tax</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Net Pay</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">ER Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.periods.map((p) => (
                    <tr key={p.payPeriodStart} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{formatDate(p.payPeriodStart)} — {formatDate(p.payPeriodEnd)}</div>
                        <div className="text-xs text-gray-500">Paid: {formatDate(p.payDate)}</div>
                      </td>
                      <td className="px-3 py-2 text-right">{p.employeeCount}</td>
                      <td className="px-3 py-2 text-right">{p.totalHours.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">{p.overtimeHours.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right font-medium text-blue-600">{formatCurrency(p.grossPay)}</td>
                      <td className="px-3 py-2 text-right text-orange-600">{formatCurrency(p.totalPreTaxDeductions)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatCurrency(p.totalTaxWithholdings)}</td>
                      <td className="px-3 py-2 text-right text-orange-600">{formatCurrency(p.totalPostTaxDeductions)}</td>
                      <td className="px-3 py-2 text-right font-medium text-green-600">{formatCurrency(p.netPay)}</td>
                      <td className="px-3 py-2 text-right text-purple-600">{formatCurrency(p.totalEmployerCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-3 py-3">TOTALS</td>
                    <td className="px-3 py-3 text-right">{data.grandTotals.employeeCount}</td>
                    <td className="px-3 py-3 text-right">{data.grandTotals.totalHours.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right">{data.grandTotals.overtimeHours.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right text-blue-600">{formatCurrency(data.grandTotals.grossPay)}</td>
                    <td className="px-3 py-3 text-right text-orange-600">{formatCurrency(data.grandTotals.totalPreTaxDeductions)}</td>
                    <td className="px-3 py-3 text-right text-red-600">{formatCurrency(data.grandTotals.totalTaxWithholdings)}</td>
                    <td className="px-3 py-3 text-right text-orange-600">{formatCurrency(data.grandTotals.totalPostTaxDeductions)}</td>
                    <td className="px-3 py-3 text-right text-green-600">{formatCurrency(data.grandTotals.netPay)}</td>
                    <td className="px-3 py-3 text-right text-purple-600">{formatCurrency(data.grandTotals.totalEmployerCost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Grand Total */}
          <div className="mt-6 rounded-lg bg-gray-800 p-4 text-white shadow print:bg-gray-900">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">Total Payroll Cost (Gross + Employer Taxes)</span>
              <span className="text-2xl font-bold">{formatCurrency(data.grandTotals.grossPay + data.grandTotals.totalEmployerCost)}</span>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-4 text-center text-xs text-gray-400 print:mt-8">
            Generated {new Date().toLocaleString()}
          </div>
        </div>
      )}

      <style jsx global>{`
        @media print {
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:rounded-none { border-radius: 0 !important; }
          .print\\:max-w-none { max-width: none !important; }
          .print\\:px-4 { padding-left: 1rem !important; padding-right: 1rem !important; }
          .print\\:p-4 { padding: 1rem !important; }
          .print\\:border { border: 1px solid #e5e7eb !important; }
          .print\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
          .print\\:bg-gray-900 { background-color: #111827 !important; }
          @page { size: portrait; margin: 0.5in; }
        }
      `}</style>
    </div>
  );
}
