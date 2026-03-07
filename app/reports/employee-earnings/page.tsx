'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';

interface EmployeeEarning {
  employee: { id: string; firstName: string; lastName: string; employeeNumber: string | null; position: string | null; department: string | null; payType: string };
  periodsWorked: number;
  totalRegularHours: number;
  totalOvertimeHours: number;
  totalRegularPay: number;
  totalOvertimePay: number;
  totalGrossPay: number;
  totalPreTaxDeductions: number;
  totalTaxWithholdings: number;
  totalPostTaxDeductions: number;
  totalDeductions: number;
  totalNetPay: number;
  ytdGrossPay: number;
  ytdNetPay: number;
}

interface ReportData {
  company: { companyName: string; legalBusinessName: string | null; fein: string | null };
  dateRange: { start: string; end: string; period: string };
  employees: EmployeeEarning[];
  grandTotals: {
    totalRegularHours: number; totalOvertimeHours: number; totalGrossPay: number;
    totalPreTaxDeductions: number; totalTaxWithholdings: number; totalPostTaxDeductions: number;
    totalDeductions: number; totalNetPay: number;
  };
  recordCount: number;
}

export default function EmployeeEarningsReport() {
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
      const res = await fetch(`/api/reports/employee-earnings?${params}`);
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
              <h1 className="text-2xl font-bold text-gray-900">Employee Earnings Report</h1>
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
              <h3 className="text-lg font-bold text-gray-900">EMPLOYEE EARNINGS REPORT</h3>
              <p className="text-sm text-gray-600">{formatDate(data.dateRange.start)} — {formatDate(data.dateRange.end)}</p>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4">
            {[
              { label: 'Total Gross Pay', value: data.grandTotals.totalGrossPay, color: 'blue' },
              { label: 'Total Taxes', value: data.grandTotals.totalTaxWithholdings, color: 'red' },
              { label: 'Total Deductions', value: data.grandTotals.totalPreTaxDeductions + data.grandTotals.totalPostTaxDeductions, color: 'orange' },
              { label: 'Total Net Pay', value: data.grandTotals.totalNetPay, color: 'green' },
            ].map((card) => (
              <div key={card.label} className="rounded-lg bg-white p-4 shadow print:shadow-none print:border print:rounded-none">
                <p className="text-sm text-gray-600">{card.label}</p>
                <p className={`text-xl font-bold text-${card.color}-600`}>{formatCurrency(card.value)}</p>
              </div>
            ))}
          </div>

          {/* Table */}
          {data.employees.length === 0 ? (
            <div className="rounded-lg bg-white p-12 text-center shadow">
              <p className="text-gray-500">No payroll records found for this period.</p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg bg-white shadow print:shadow-none print:rounded-none">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left font-semibold text-gray-900">Employee</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Periods</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Reg Hrs</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">OT Hrs</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Gross Pay</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Pre-Tax</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Taxes</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Post-Tax</th>
                    <th className="px-3 py-3 text-right font-semibold text-gray-900">Net Pay</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {data.employees.map((e) => (
                    <tr key={e.employee.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <div className="font-medium text-gray-900">{e.employee.lastName}, {e.employee.firstName}</div>
                        <div className="text-xs text-gray-500">
                          {e.employee.employeeNumber && `#${e.employee.employeeNumber}`}
                          {e.employee.position && ` · ${e.employee.position}`}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{e.periodsWorked}</td>
                      <td className="px-3 py-2 text-right">{e.totalRegularHours.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right">{e.totalOvertimeHours.toFixed(1)}</td>
                      <td className="px-3 py-2 text-right font-medium text-blue-600">{formatCurrency(e.totalGrossPay)}</td>
                      <td className="px-3 py-2 text-right text-orange-600">{formatCurrency(e.totalPreTaxDeductions)}</td>
                      <td className="px-3 py-2 text-right text-red-600">{formatCurrency(e.totalTaxWithholdings)}</td>
                      <td className="px-3 py-2 text-right text-orange-600">{formatCurrency(e.totalPostTaxDeductions)}</td>
                      <td className="px-3 py-2 text-right font-medium text-green-600">{formatCurrency(e.totalNetPay)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 font-semibold">
                  <tr>
                    <td className="px-3 py-3">TOTALS ({data.employees.length} employees)</td>
                    <td className="px-3 py-3 text-right"></td>
                    <td className="px-3 py-3 text-right">{data.grandTotals.totalRegularHours.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right">{data.grandTotals.totalOvertimeHours.toFixed(1)}</td>
                    <td className="px-3 py-3 text-right text-blue-600">{formatCurrency(data.grandTotals.totalGrossPay)}</td>
                    <td className="px-3 py-3 text-right text-orange-600">{formatCurrency(data.grandTotals.totalPreTaxDeductions)}</td>
                    <td className="px-3 py-3 text-right text-red-600">{formatCurrency(data.grandTotals.totalTaxWithholdings)}</td>
                    <td className="px-3 py-3 text-right text-orange-600">{formatCurrency(data.grandTotals.totalPostTaxDeductions)}</td>
                    <td className="px-3 py-3 text-right text-green-600">{formatCurrency(data.grandTotals.totalNetPay)}</td>
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
          .print\\:grid-cols-4 { grid-template-columns: repeat(4, minmax(0, 1fr)) !important; }
          @page { size: landscape; margin: 0.5in; }
        }
      `}</style>
    </div>
  );
}
