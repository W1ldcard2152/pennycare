'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';

interface EmployeeCost {
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string | null; position: string | null };
  grossPay: number;
  employerSocialSecurity: number;
  employerMedicare: number;
  employerSUI: number;
  employerFUTA: number;
  employerWorkersComp: number;
  totalEmployerCost: number;
}

interface ReportData {
  company: { companyName: string; legalBusinessName: string | null; fein: string | null };
  dateRange: { start: string; end: string; period: string };
  costs: {
    employerSocialSecurity: number; employerMedicare: number;
    employerSUI: number; employerFUTA: number;
    employerWorkersComp: number; totalEmployerCost: number;
  };
  grossPayroll: number;
  burdenRate: number;
  byEmployee: EmployeeCost[];
  recordCount: number;
}

export default function EmployerCostsReport() {
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
      const res = await fetch(`/api/reports/employer-costs?${params}`);
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
              <h1 className="text-2xl font-bold text-gray-900">Employer Cost Report</h1>
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
              <h3 className="text-lg font-bold text-gray-900">EMPLOYER COST REPORT</h3>
              <p className="text-sm text-gray-600">{formatDate(data.dateRange.start)} — {formatDate(data.dateRange.end)}</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3 print:grid-cols-3">
            <div className="rounded-lg bg-white p-5 shadow print:shadow-none print:border print:rounded-none">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">FICA</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Social Security (6.2%)</span><span className="font-medium">{formatCurrency(data.costs.employerSocialSecurity)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">Medicare (1.45%)</span><span className="font-medium">{formatCurrency(data.costs.employerMedicare)}</span></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Total FICA</span><span className="text-purple-600">{formatCurrency(data.costs.employerSocialSecurity + data.costs.employerMedicare)}</span></div>
              </div>
            </div>
            <div className="rounded-lg bg-white p-5 shadow print:shadow-none print:border print:rounded-none">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">Unemployment</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">NYS SUI</span><span className="font-medium">{formatCurrency(data.costs.employerSUI)}</span></div>
                <div className="flex justify-between"><span className="text-gray-600">FUTA (0.6%)</span><span className="font-medium">{formatCurrency(data.costs.employerFUTA)}</span></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Total Unemployment</span><span className="text-purple-600">{formatCurrency(data.costs.employerSUI + data.costs.employerFUTA)}</span></div>
              </div>
            </div>
            <div className="rounded-lg bg-white p-5 shadow print:shadow-none print:border print:rounded-none">
              <h3 className="mb-3 text-lg font-semibold text-gray-900">Other</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-600">Workers Comp</span><span className="font-medium">{formatCurrency(data.costs.employerWorkersComp)}</span></div>
                <div className="flex justify-between border-t pt-2 font-semibold"><span>Total Other</span><span className="text-purple-600">{formatCurrency(data.costs.employerWorkersComp)}</span></div>
              </div>
            </div>
          </div>

          {/* Burden Rate */}
          <div className="mb-6 rounded-lg border-2 border-purple-200 bg-purple-50 p-4 print:border print:bg-white">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-purple-800">Employer Burden Rate</p>
                <p className="text-xs text-purple-600">Total employer cost as a percentage of gross payroll</p>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-purple-700">{data.burdenRate.toFixed(2)}%</p>
                <p className="text-xs text-purple-600">{formatCurrency(data.costs.totalEmployerCost)} on {formatCurrency(data.grossPayroll)} gross</p>
              </div>
            </div>
          </div>

          {/* Grand Total */}
          <div className="mb-6 rounded-lg bg-gray-800 p-4 text-white shadow print:bg-gray-900">
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">Total Employer Cost</span>
              <span className="text-2xl font-bold">{formatCurrency(data.costs.totalEmployerCost)}</span>
            </div>
          </div>

          {/* Per-Employee Table */}
          {data.byEmployee.length > 0 && (
            <div className="overflow-x-auto rounded-lg bg-white shadow print:shadow-none print:rounded-none">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold text-gray-900">Employee</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Gross Pay</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">ER SS</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">ER Med</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">SUI</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">FUTA</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">WC</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Total ER</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Burden %</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.byEmployee.map((e) => (
                    <tr key={e.employee.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{e.employee.lastName}, {e.employee.firstName}</div>
                        <div className="text-xs text-gray-500">
                          {e.employee.employeeNumber && `#${e.employee.employeeNumber}`}
                          {e.employee.position && ` · ${e.employee.position}`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right text-blue-600">{formatCurrency(e.grossPay)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.employerSocialSecurity)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.employerMedicare)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.employerSUI)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.employerFUTA)}</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(e.employerWorkersComp)}</td>
                      <td className="px-3 py-2 text-right font-bold text-purple-600">{formatCurrency(e.totalEmployerCost)}</td>
                      <td className="px-3 py-2 text-right">{e.grossPay > 0 ? ((e.totalEmployerCost / e.grossPay) * 100).toFixed(1) : '0.0'}%</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-3 py-3">TOTALS</td>
                    <td className="px-3 py-3 text-right text-blue-600">{formatCurrency(data.grossPayroll)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.costs.employerSocialSecurity)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.costs.employerMedicare)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.costs.employerSUI)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.costs.employerFUTA)}</td>
                    <td className="px-3 py-3 text-right">{formatCurrency(data.costs.employerWorkersComp)}</td>
                    <td className="px-3 py-3 text-right text-purple-600">{formatCurrency(data.costs.totalEmployerCost)}</td>
                    <td className="px-3 py-3 text-right">{data.burdenRate.toFixed(1)}%</td>
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
          .print\\:grid-cols-3 { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          .print\\:bg-gray-900 { background-color: #111827 !important; }
          .print\\:bg-white { background-color: white !important; }
          @page { size: portrait; margin: 0.5in; }
        }
      `}</style>
    </div>
  );
}
