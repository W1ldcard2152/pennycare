'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon, CalendarIcon } from '@heroicons/react/24/outline';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  employeeNumber: string;
  position: string;
  department: string | null;
  payType: string;
  hourlyRate: number | null;
  annualSalary: number | null;
}

interface PayrollRecord {
  id: string;
  employee: Employee;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  otherEarnings: number;
  grossPay: number;
  preTax401k: number;
  preTaxHealthIns: number;
  preTaxDental: number;
  preTaxVision: number;
  preTaxHSA: number;
  preTaxFSA: number;
  totalPreTaxDeductions: number;
  federalTax: number;
  stateTax: number;
  localTax: number;
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  nySDI: number;
  nyPFL: number;
  totalTaxWithholdings: number;
  postTaxRoth401k: number;
  garnishments: number;
  childSupport: number;
  loanRepayments: number;
  totalPostTaxDeductions: number;
  totalDeductions: number;
  netPay: number;
  employerSocialSecurity: number;
  employerMedicare: number;
  employerSUI: number;
  employerFUTA: number;
  totalEmployerCost: number;
  isPaid: boolean;
  paymentMethod: string | null;
  checkNumber: string | null;
}

interface RegisterData {
  company: {
    companyName: string;
    legalBusinessName: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    fein: string | null;
  };
  payPeriod: {
    start: string;
    end: string;
    payDate: string;
  };
  records: PayrollRecord[];
  totals: {
    employeeCount: number;
    regularHours: number;
    overtimeHours: number;
    regularPay: number;
    overtimePay: number;
    grossPay: number;
    totalPreTaxDeductions: number;
    federalTax: number;
    stateTax: number;
    localTax: number;
    socialSecurity: number;
    medicare: number;
    nySDI: number;
    nyPFL: number;
    totalTaxWithholdings: number;
    totalPostTaxDeductions: number;
    totalDeductions: number;
    netPay: number;
    employerSocialSecurity: number;
    employerMedicare: number;
    employerSUI: number;
    employerFUTA: number;
    totalEmployerCost: number;
  } | null;
}

export default function PayrollRegisterPage() {
  const [selectedWeek, setSelectedWeek] = useState<Date>(getStartOfWeek(new Date()));
  const [registerData, setRegisterData] = useState<RegisterData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchRegister = async () => {
    setLoading(true);
    setError('');
    try {
      const startDate = formatDate(selectedWeek);
      const endDate = formatDate(getEndOfWeek(selectedWeek));

      const response = await fetch(`/api/payroll/register?startDate=${startDate}&endDate=${endDate}`);
      if (!response.ok) {
        throw new Error('Failed to fetch payroll register');
      }
      const data = await response.json();
      setRegisterData(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load payroll register');
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

  const formatDateDisplay = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Hidden in print */}
      <div className="print:hidden bg-white border-b px-4 py-4 mb-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Link
                href="/payroll"
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
              >
                <ArrowLeftIcon className="h-5 w-5" />
                Back to Payroll
              </Link>
              <h1 className="text-xl font-semibold">Payroll Register</h1>
            </div>
            {registerData?.records && registerData.records.length > 0 && (
              <button
                onClick={handlePrint}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
              >
                <PrinterIcon className="h-5 w-5" />
                Print
              </button>
            )}
          </div>

          {/* Week Selector */}
          <div className="flex flex-wrap items-center gap-4">
            <button
              onClick={() => setSelectedWeek(addWeeks(selectedWeek, -1))}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Previous Week
            </button>
            <div className="flex items-center space-x-2 text-lg font-semibold">
              <CalendarIcon className="h-5 w-5" />
              <span>
                {formatDateDisplay(formatDate(selectedWeek))} - {formatDateDisplay(formatDate(getEndOfWeek(selectedWeek)))}
              </span>
            </div>
            <button
              onClick={() => setSelectedWeek(addWeeks(selectedWeek, 1))}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              Next Week
            </button>
            <button
              onClick={() => setSelectedWeek(getStartOfWeek(new Date()))}
              className="rounded-lg bg-gray-600 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
            >
              Current Week
            </button>
            <button
              onClick={fetchRegister}
              disabled={loading}
              className="rounded-lg bg-green-600 px-6 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {loading ? 'Loading...' : 'Generate Register'}
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 print:px-2 print:max-w-none">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 p-4 rounded-lg mb-6 print:hidden">
            {error}
          </div>
        )}

        {!registerData && !loading && !error && (
          <div className="bg-white rounded-lg shadow p-12 text-center print:hidden">
            <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No Register Generated</h3>
            <p className="mt-2 text-gray-500">
              Select a pay period and click &quot;Generate Register&quot; to view the payroll register.
            </p>
          </div>
        )}

        {registerData && registerData.records.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center print:hidden">
            <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-4 text-lg font-medium text-gray-900">No Payroll Records</h3>
            <p className="mt-2 text-gray-500">
              No payroll was processed for this pay period.
            </p>
          </div>
        )}

        {registerData && registerData.records.length > 0 && (
          <div className="bg-white shadow-lg rounded-lg print:shadow-none print:rounded-none overflow-hidden">
            {/* Report Header */}
            <div className="border-b p-6 print:p-4">
              <div className="flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">
                    {registerData.company.legalBusinessName || registerData.company.companyName}
                  </h2>
                  {registerData.company.address && (
                    <p className="text-gray-600 mt-1">
                      {registerData.company.address}
                      {registerData.company.city && `, ${registerData.company.city}`}
                      {registerData.company.state && `, ${registerData.company.state}`}
                      {registerData.company.zipCode && ` ${registerData.company.zipCode}`}
                    </p>
                  )}
                  {registerData.company.fein && (
                    <p className="text-gray-600">FEIN: {registerData.company.fein}</p>
                  )}
                </div>
                <div className="text-right">
                  <h3 className="text-xl font-semibold text-gray-900">PAYROLL REGISTER</h3>
                  <p className="text-gray-600 mt-1">
                    Pay Period: {formatDateDisplay(registerData.payPeriod.start)} - {formatDateDisplay(registerData.payPeriod.end)}
                  </p>
                  {registerData.payPeriod.payDate && (
                    <p className="text-gray-600">
                      Pay Date: {formatDateDisplay(registerData.payPeriod.payDate)}
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Register Table */}
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 text-xs">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="sticky left-0 bg-gray-50 px-2 py-2 text-left font-semibold text-gray-900 border-r">
                      Employee
                    </th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900">Reg Hrs</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900">OT Hrs</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900 border-r">Gross Pay</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900">Fed Tax</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900">State Tax</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900">Soc Sec</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900">Medicare</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900">SDI</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900 border-r">PFL</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900">Pre-Tax</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900 border-r">Post-Tax</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900">Total Ded</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900 bg-green-50">Net Pay</th>
                    <th className="px-2 py-2 text-right font-semibold text-gray-900 bg-purple-50 border-l">ER Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {registerData.records.map((record) => (
                    <tr key={record.id} className="hover:bg-gray-50">
                      <td className="sticky left-0 bg-white px-2 py-2 border-r">
                        <div className="font-medium text-gray-900">
                          {record.employee.lastName}, {record.employee.firstName}
                        </div>
                        <div className="text-gray-500">#{record.employee.employeeNumber}</div>
                      </td>
                      <td className="px-2 py-2 text-right text-gray-900">{record.regularHours.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right text-gray-900">{record.overtimeHours.toFixed(2)}</td>
                      <td className="px-2 py-2 text-right font-medium text-gray-900 border-r">{formatCurrency(record.grossPay)}</td>
                      <td className="px-2 py-2 text-right text-red-600">{formatCurrency(record.federalTax)}</td>
                      <td className="px-2 py-2 text-right text-red-600">{formatCurrency(record.stateTax)}</td>
                      <td className="px-2 py-2 text-right text-red-600">{formatCurrency(record.socialSecurity)}</td>
                      <td className="px-2 py-2 text-right text-red-600">{formatCurrency(record.medicare)}</td>
                      <td className="px-2 py-2 text-right text-red-600">{formatCurrency(record.nySDI)}</td>
                      <td className="px-2 py-2 text-right text-red-600 border-r">{formatCurrency(record.nyPFL)}</td>
                      <td className="px-2 py-2 text-right text-orange-600">{formatCurrency(record.totalPreTaxDeductions)}</td>
                      <td className="px-2 py-2 text-right text-orange-600 border-r">{formatCurrency(record.totalPostTaxDeductions)}</td>
                      <td className="px-2 py-2 text-right font-medium text-red-600">{formatCurrency(record.totalDeductions)}</td>
                      <td className="px-2 py-2 text-right font-semibold text-green-600 bg-green-50">{formatCurrency(record.netPay)}</td>
                      <td className="px-2 py-2 text-right font-medium text-purple-600 bg-purple-50 border-l">{formatCurrency(record.totalEmployerCost)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-100 font-semibold">
                  <tr>
                    <td className="sticky left-0 bg-gray-100 px-2 py-3 border-r">
                      <div className="text-gray-900">TOTALS</div>
                      <div className="text-gray-600 font-normal">{registerData.totals?.employeeCount} employees</div>
                    </td>
                    <td className="px-2 py-3 text-right text-gray-900">{registerData.totals?.regularHours.toFixed(2)}</td>
                    <td className="px-2 py-3 text-right text-gray-900">{registerData.totals?.overtimeHours.toFixed(2)}</td>
                    <td className="px-2 py-3 text-right text-gray-900 border-r">{formatCurrency(registerData.totals?.grossPay || 0)}</td>
                    <td className="px-2 py-3 text-right text-red-600">{formatCurrency(registerData.totals?.federalTax || 0)}</td>
                    <td className="px-2 py-3 text-right text-red-600">{formatCurrency(registerData.totals?.stateTax || 0)}</td>
                    <td className="px-2 py-3 text-right text-red-600">{formatCurrency(registerData.totals?.socialSecurity || 0)}</td>
                    <td className="px-2 py-3 text-right text-red-600">{formatCurrency(registerData.totals?.medicare || 0)}</td>
                    <td className="px-2 py-3 text-right text-red-600">{formatCurrency(registerData.totals?.nySDI || 0)}</td>
                    <td className="px-2 py-3 text-right text-red-600 border-r">{formatCurrency(registerData.totals?.nyPFL || 0)}</td>
                    <td className="px-2 py-3 text-right text-orange-600">{formatCurrency(registerData.totals?.totalPreTaxDeductions || 0)}</td>
                    <td className="px-2 py-3 text-right text-orange-600 border-r">{formatCurrency(registerData.totals?.totalPostTaxDeductions || 0)}</td>
                    <td className="px-2 py-3 text-right text-red-600">{formatCurrency(registerData.totals?.totalDeductions || 0)}</td>
                    <td className="px-2 py-3 text-right text-green-700 bg-green-100">{formatCurrency(registerData.totals?.netPay || 0)}</td>
                    <td className="px-2 py-3 text-right text-purple-700 bg-purple-100 border-l">{formatCurrency(registerData.totals?.totalEmployerCost || 0)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {/* Summary Section */}
            <div className="border-t p-6 print:p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Earnings Summary */}
                <div className="bg-blue-50 rounded-lg p-4">
                  <h4 className="font-semibold text-blue-900 mb-3">Earnings</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Regular Pay:</span>
                      <span className="font-medium">{formatCurrency(registerData.totals?.regularPay || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Overtime Pay:</span>
                      <span className="font-medium">{formatCurrency(registerData.totals?.overtimePay || 0)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Gross Pay:</span>
                      <span>{formatCurrency(registerData.totals?.grossPay || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Tax Summary */}
                <div className="bg-red-50 rounded-lg p-4">
                  <h4 className="font-semibold text-red-900 mb-3">Employee Taxes</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Federal:</span>
                      <span className="font-medium">{formatCurrency(registerData.totals?.federalTax || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">State:</span>
                      <span className="font-medium">{formatCurrency(registerData.totals?.stateTax || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">FICA:</span>
                      <span className="font-medium">{formatCurrency((registerData.totals?.socialSecurity || 0) + (registerData.totals?.medicare || 0))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">SDI + PFL:</span>
                      <span className="font-medium">{formatCurrency((registerData.totals?.nySDI || 0) + (registerData.totals?.nyPFL || 0))}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Total Taxes:</span>
                      <span>{formatCurrency(registerData.totals?.totalTaxWithholdings || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Net Pay Summary */}
                <div className="bg-green-50 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 mb-3">Net Pay</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Gross Pay:</span>
                      <span className="font-medium">{formatCurrency(registerData.totals?.grossPay || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Deductions:</span>
                      <span className="font-medium text-red-600">-{formatCurrency(registerData.totals?.totalDeductions || 0)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold text-lg">
                      <span>Net Pay:</span>
                      <span className="text-green-700">{formatCurrency(registerData.totals?.netPay || 0)}</span>
                    </div>
                  </div>
                </div>

                {/* Employer Costs Summary */}
                <div className="bg-purple-50 rounded-lg p-4">
                  <h4 className="font-semibold text-purple-900 mb-3">Employer Costs</h4>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-600">ER Social Security:</span>
                      <span className="font-medium">{formatCurrency(registerData.totals?.employerSocialSecurity || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">ER Medicare:</span>
                      <span className="font-medium">{formatCurrency(registerData.totals?.employerMedicare || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">SUI:</span>
                      <span className="font-medium">{formatCurrency(registerData.totals?.employerSUI || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">FUTA:</span>
                      <span className="font-medium">{formatCurrency(registerData.totals?.employerFUTA || 0)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-1 font-semibold">
                      <span>Total ER Cost:</span>
                      <span className="text-purple-700">{formatCurrency(registerData.totals?.totalEmployerCost || 0)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Grand Total */}
              <div className="mt-6 bg-gray-900 text-white rounded-lg p-4 flex justify-between items-center">
                <div>
                  <span className="text-gray-300">Total Payroll Cost (Gross Pay + Employer Taxes):</span>
                </div>
                <div className="text-2xl font-bold">
                  {formatCurrency((registerData.totals?.grossPay || 0) + (registerData.totals?.totalEmployerCost || 0))}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="border-t p-4 text-center text-xs text-gray-500">
              <p>Generated on {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
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
          .print\\:p-4 {
            padding: 1rem !important;
          }
          .print\\:px-2 {
            padding-left: 0.5rem !important;
            padding-right: 0.5rem !important;
          }
          .print\\:max-w-none {
            max-width: none !important;
          }
          @page {
            size: landscape;
            margin: 0.5in;
          }
        }
      `}</style>
    </div>
  );
}

// Helper functions
function getStartOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;
  return new Date(d.setDate(diff));
}

function getEndOfWeek(date: Date): Date {
  const d = new Date(getStartOfWeek(date));
  d.setDate(d.getDate() + 6);
  return d;
}

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}
