'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';

interface EmployeeDeduction {
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string | null };
  preTax401k: number; preTaxHealthIns: number; preTaxDental: number; preTaxVision: number;
  preTaxHSA: number; preTaxFSA: number; preTaxOther: number; totalPreTax: number;
  postTaxRoth401k: number; garnishments: number; childSupport: number;
  loanRepayments: number; postTaxOther: number; totalPostTax: number;
  totalDeductions: number;
}

interface ReportData {
  company: { companyName: string; legalBusinessName: string | null; fein: string | null };
  dateRange: { start: string; end: string; period: string };
  preTaxDeductions: {
    preTax401k: number; preTaxHealthIns: number; preTaxDental: number; preTaxVision: number;
    preTaxHSA: number; preTaxFSA: number; preTaxOther: number; total: number;
  };
  postTaxDeductions: {
    postTaxRoth401k: number; garnishments: number; childSupport: number;
    loanRepayments: number; postTaxOther: number; total: number;
  };
  grandTotal: number;
  byEmployee: EmployeeDeduction[];
  recordCount: number;
}

export default function DeductionsReport() {
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
      const res = await fetch(`/api/reports/deductions?${params}`);
      if (res.ok) setData(await res.json());
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
              <h1 className="text-2xl font-bold text-gray-900">Deductions Report</h1>
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
                <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="mt-1 rounded-md border-gray-300 shadow-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">End Date</label>
                <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="mt-1 rounded-md border-gray-300 shadow-sm" />
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
              {data.company.fein && <p className="text-sm text-gray-600">FEIN: {data.company.fein}</p>}
            </div>
            <div className="text-right">
              <h3 className="text-lg font-bold text-gray-900">DEDUCTIONS REPORT</h3>
              <p className="text-sm text-gray-600">{formatDate(data.dateRange.start)} — {formatDate(data.dateRange.end)}</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 print:grid-cols-2">
            {/* Pre-Tax */}
            <div className="rounded-lg bg-white p-5 shadow print:shadow-none print:border print:rounded-none">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">Pre-Tax Deductions</h3>
              <div className="space-y-2 text-sm">
                {[
                  { label: '401(k)', value: data.preTaxDeductions.preTax401k },
                  { label: 'Health Insurance', value: data.preTaxDeductions.preTaxHealthIns },
                  { label: 'Dental', value: data.preTaxDeductions.preTaxDental },
                  { label: 'Vision', value: data.preTaxDeductions.preTaxVision },
                  { label: 'HSA', value: data.preTaxDeductions.preTaxHSA },
                  { label: 'FSA', value: data.preTaxDeductions.preTaxFSA },
                  { label: 'Other Pre-Tax', value: data.preTaxDeductions.preTaxOther },
                ].filter(item => item.value > 0).map((item) => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="font-medium">{formatCurrency(item.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total Pre-Tax</span>
                  <span className="text-orange-600">{formatCurrency(data.preTaxDeductions.total)}</span>
                </div>
              </div>
            </div>

            {/* Post-Tax */}
            <div className="rounded-lg bg-white p-5 shadow print:shadow-none print:border print:rounded-none">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">Post-Tax Deductions</h3>
              <div className="space-y-2 text-sm">
                {[
                  { label: 'Roth 401(k)', value: data.postTaxDeductions.postTaxRoth401k },
                  { label: 'Garnishments', value: data.postTaxDeductions.garnishments },
                  { label: 'Child Support', value: data.postTaxDeductions.childSupport },
                  { label: 'Loan Repayments', value: data.postTaxDeductions.loanRepayments },
                  { label: 'Other Post-Tax', value: data.postTaxDeductions.postTaxOther },
                ].filter(item => item.value > 0).map((item) => (
                  <div key={item.label} className="flex justify-between">
                    <span className="text-gray-600">{item.label}</span>
                    <span className="font-medium">{formatCurrency(item.value)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-2 font-semibold">
                  <span>Total Post-Tax</span>
                  <span className="text-orange-600">{formatCurrency(data.postTaxDeductions.total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Grand Total */}
          <div className="mb-6 rounded-lg bg-gray-800 p-4 text-white shadow print:bg-gray-900">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">Total Deductions</span>
              <span className="text-2xl font-bold">{formatCurrency(data.grandTotal)}</span>
            </div>
          </div>

          {/* Per-Employee Table */}
          {data.byEmployee.length > 0 && (
            <div className="overflow-x-auto rounded-lg bg-white shadow print:shadow-none print:rounded-none">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold text-gray-900">Employee</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">401k</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Health</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Dental/Vision</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">HSA/FSA</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Pre-Tax</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Roth</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Garn/CS</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Post-Tax</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.byEmployee.map((e) => (
                    <tr key={e.employee.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{e.employee.lastName}, {e.employee.firstName}</div>
                        {e.employee.employeeNumber && <div className="text-xs text-gray-500">#{e.employee.employeeNumber}</div>}
                      </td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.preTax401k)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.preTaxHealthIns)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.preTaxDental + e.preTaxVision)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.preTaxHSA + e.preTaxFSA)}</td>
                      <td className="px-3 py-2 text-right font-medium text-orange-600">{formatCurrency(e.totalPreTax)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.postTaxRoth401k)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.garnishments + e.childSupport)}</td>
                      <td className="px-3 py-2 text-right font-medium text-orange-600">{formatCurrency(e.totalPostTax)}</td>
                      <td className="px-3 py-2 text-right font-bold">{formatCurrency(e.totalDeductions)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-3 py-3">TOTALS</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.preTaxDeductions.preTax401k)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.preTaxDeductions.preTaxHealthIns)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.preTaxDeductions.preTaxDental + data.preTaxDeductions.preTaxVision)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.preTaxDeductions.preTaxHSA + data.preTaxDeductions.preTaxFSA)}</td>
                    <td className="px-3 py-3 text-right text-orange-600">{formatCurrency(data.preTaxDeductions.total)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.postTaxDeductions.postTaxRoth401k)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.postTaxDeductions.garnishments + data.postTaxDeductions.childSupport)}</td>
                    <td className="px-3 py-3 text-right text-orange-600">{formatCurrency(data.postTaxDeductions.total)}</td>
                    <td className="px-3 py-3 text-right font-bold">{formatCurrency(data.grandTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

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
          .print\\:grid-cols-2 { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; }
          .print\\:bg-gray-900 { background-color: #111827 !important; }
          @page { size: landscape; margin: 0.5in; }
        }
      `}</style>
    </div>
  );
}
