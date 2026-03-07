'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, CurrencyDollarIcon, ChevronDownIcon, ChevronUpIcon, UserIcon, DocumentTextIcon, ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';
import Link from 'next/link';
import { formatCurrency } from '@/lib/payrollCalculations';

interface PayrollRecord {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  totalPreTaxDeductions: number;
  taxableWages: number | null;
  federalTax: number;
  stateTax: number;
  localTax: number;
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  nySDI: number;
  nyPFL: number;
  totalTaxWithholdings: number;
  totalPostTaxDeductions: number;
  totalDeductions: number;
  netPay: number;
  totalEmployerCost: number;
  ytdGrossPay: number;
  ytdFederalTax: number;
  ytdStateTax: number;
  ytdSocialSecurity: number;
  ytdMedicare: number;
  ytdNetPay: number;
  isPaid: boolean;
  paymentMethod: string | null;
  employee: {
    id: string;
    firstName: string;
    lastName: string;
    employeeNumber: string;
    position: string;
  };
}

interface HistorySummary {
  totalRecords: number;
  totalGrossPay: number;
  totalNetPay: number;
  totalDeductions: number;
  totalEmployerCost: number;
}

export default function PayrollHistoryPage() {
  const [records, setRecords] = useState<PayrollRecord[]>([]);
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRecord, setExpandedRecord] = useState<string | null>(null);
  const [filterEmployee, setFilterEmployee] = useState<string>('');

  useEffect(() => {
    fetchHistory();
  }, []);

  const fetchHistory = async (employeeId?: string) => {
    setLoading(true);
    try {
      let url = '/api/payroll/history';
      if (employeeId) {
        url += `?employeeId=${employeeId}`;
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.records) {
        setRecords(data.records);
        setSummary(data.summary);
      }
    } catch (error) {
      console.error('Error fetching payroll history:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleRecordDetails = (recordId: string) => {
    setExpandedRecord(expandedRecord === recordId ? null : recordId);
  };

  const formatDateRange = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return `${startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  };

  // Get unique employees for filter
  const uniqueEmployees = Array.from(
    new Map(records.map((r) => [r.employee.id, r.employee])).values()
  );

  const handleFilterChange = (employeeId: string) => {
    setFilterEmployee(employeeId);
    fetchHistory(employeeId || undefined);
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <Link
          href="/payroll"
          className="mb-4 inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeftIcon className="mr-1 h-4 w-4" />
          Back to Payroll
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Payroll History</h1>
        <p className="mt-2 text-gray-600">
          View past payroll records and year-to-date totals
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-lg bg-white p-4 shadow">
        <div className="flex items-center space-x-4">
          <label className="text-sm font-medium text-gray-700">Filter by Employee:</label>
          <select
            value={filterEmployee}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">All Employees</option>
            {uniqueEmployees.map((emp) => (
              <option key={emp.id} value={emp.id}>
                {emp.firstName} {emp.lastName}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <SummaryCard
            title="Total Records"
            value={summary.totalRecords.toString()}
            icon={<DocumentTextIcon className="h-6 w-6 text-white" />}
            bgColor="bg-gray-500"
          />
          <SummaryCard
            title="Total Gross Pay"
            value={formatCurrency(summary.totalGrossPay)}
            icon={<CurrencyDollarIcon className="h-6 w-6 text-white" />}
            bgColor="bg-blue-500"
          />
          <SummaryCard
            title="Total Deductions"
            value={formatCurrency(summary.totalDeductions)}
            icon={<DocumentTextIcon className="h-6 w-6 text-white" />}
            bgColor="bg-orange-500"
          />
          <SummaryCard
            title="Total Net Pay"
            value={formatCurrency(summary.totalNetPay)}
            icon={<CurrencyDollarIcon className="h-6 w-6 text-white" />}
            bgColor="bg-green-500"
          />
          <SummaryCard
            title="Total Employer Cost"
            value={formatCurrency(summary.totalEmployerCost)}
            icon={<UserIcon className="h-6 w-6 text-white" />}
            bgColor="bg-purple-500"
          />
        </div>
      )}

      {/* Records List */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-gray-500">Loading payroll history...</p>
        </div>
      ) : records.length === 0 ? (
        <div className="rounded-lg bg-white p-12 text-center shadow">
          <CalendarIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Payroll Records</h3>
          <p className="mt-2 text-gray-500">
            No payroll has been processed yet. Process your first payroll to see history here.
          </p>
          <Link
            href="/payroll"
            className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
          >
            Go to Payroll
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {records.map((record) => (
            <div key={record.id} className="overflow-hidden rounded-lg bg-white shadow">
              {/* Record Header */}
              <div
                className="flex cursor-pointer items-center justify-between bg-gray-50 px-6 py-4 hover:bg-gray-100"
                onClick={() => toggleRecordDetails(record.id)}
              >
                <div className="flex items-center space-x-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                    <UserIcon className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">
                      {record.employee.firstName} {record.employee.lastName}
                    </h4>
                    <p className="text-sm text-gray-500">
                      {formatDateRange(record.payPeriodStart, record.payPeriodEnd)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-6">
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Gross</p>
                    <p className="font-semibold text-gray-900">{formatCurrency(record.grossPay)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Net</p>
                    <p className="font-semibold text-green-600">{formatCurrency(record.netPay)}</p>
                  </div>
                  <div className="text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        record.isPaid
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {record.isPaid ? 'Paid' : 'Pending'}
                    </span>
                  </div>
                  {expandedRecord === record.id ? (
                    <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                  ) : (
                    <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                  )}
                </div>
              </div>

              {/* Expanded Details */}
              {expandedRecord === record.id && (
                <div className="border-t border-gray-200 px-6 py-4">
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
                    {/* Earnings */}
                    <div>
                      <h5 className="mb-3 font-semibold text-gray-900 border-b pb-2">Earnings</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Regular ({record.regularHours} hrs)</span>
                          <span className="font-medium">{formatCurrency(record.regularPay)}</span>
                        </div>
                        {record.overtimeHours > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Overtime ({record.overtimeHours} hrs)</span>
                            <span className="font-medium">{formatCurrency(record.overtimePay)}</span>
                          </div>
                        )}
                        <div className="flex justify-between border-t pt-2 font-semibold">
                          <span>Gross Pay</span>
                          <span>{formatCurrency(record.grossPay)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Pre-Tax Deductions */}
                    <div>
                      <h5 className="mb-3 font-semibold text-gray-900 border-b pb-2">Pre-Tax Deductions</h5>
                      <div className="space-y-2 text-sm">
                        {record.totalPreTaxDeductions > 0 ? (
                          <>
                            <div className="flex justify-between font-semibold">
                              <span>Total Pre-Tax</span>
                              <span className="text-red-600">-{formatCurrency(record.totalPreTaxDeductions)}</span>
                            </div>
                            <div className="flex justify-between text-blue-600">
                              <span>Taxable Wages</span>
                              <span className="font-medium">{formatCurrency(record.taxableWages || 0)}</span>
                            </div>
                          </>
                        ) : (
                          <p className="text-gray-500 italic">No pre-tax deductions</p>
                        )}
                      </div>
                    </div>

                    {/* Tax Withholdings */}
                    <div>
                      <h5 className="mb-3 font-semibold text-gray-900 border-b pb-2">Tax Withholdings</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">Federal</span>
                          <span className="text-red-600">-{formatCurrency(record.federalTax)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">NY State</span>
                          <span className="text-red-600">-{formatCurrency(record.stateTax)}</span>
                        </div>
                        {record.localTax > 0 && (
                          <div className="flex justify-between">
                            <span className="text-gray-600">Local</span>
                            <span className="text-red-600">-{formatCurrency(record.localTax)}</span>
                          </div>
                        )}
                        <div className="flex justify-between">
                          <span className="text-gray-600">Social Security</span>
                          <span className="text-red-600">-{formatCurrency(record.socialSecurity)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">Medicare</span>
                          <span className="text-red-600">-{formatCurrency(record.medicare)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">NY SDI</span>
                          <span className="text-red-600">-{formatCurrency(record.nySDI)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">NY PFL</span>
                          <span className="text-red-600">-{formatCurrency(record.nyPFL)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2 font-semibold">
                          <span>Total Taxes</span>
                          <span className="text-red-600">-{formatCurrency(record.totalTaxWithholdings)}</span>
                        </div>
                      </div>
                    </div>

                    {/* YTD Totals */}
                    <div>
                      <h5 className="mb-3 font-semibold text-gray-900 border-b pb-2">Year-to-Date</h5>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-600">YTD Gross</span>
                          <span className="font-medium">{formatCurrency(record.ytdGrossPay)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">YTD Federal Tax</span>
                          <span className="font-medium">{formatCurrency(record.ytdFederalTax)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">YTD State Tax</span>
                          <span className="font-medium">{formatCurrency(record.ytdStateTax)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">YTD Social Security</span>
                          <span className="font-medium">{formatCurrency(record.ytdSocialSecurity)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">YTD Medicare</span>
                          <span className="font-medium">{formatCurrency(record.ytdMedicare)}</span>
                        </div>
                        <div className="flex justify-between border-t pt-2 font-semibold text-green-600">
                          <span>YTD Net Pay</span>
                          <span>{formatCurrency(record.ytdNetPay)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Payment Info & Actions */}
                  <div className="mt-4 flex items-center justify-between rounded-lg bg-gray-50 p-4">
                    <div className="flex items-center space-x-6">
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">Payment Method:</span>
                        <span className="font-medium capitalize">{record.paymentMethod?.replace('_', ' ') || 'Check'}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-600">Pay Date:</span>
                        <span className="font-medium">
                          {new Date(record.payDate).toLocaleDateString('en-US', {
                            month: 'long',
                            day: 'numeric',
                            year: 'numeric',
                          })}
                        </span>
                      </div>
                    </div>
                    <Link
                      href={`/payroll/pay-stub/${record.id}`}
                      className="flex items-center space-x-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <PrinterIcon className="h-4 w-4" />
                      <span>View Pay Stub</span>
                    </Link>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Summary Card Component
function SummaryCard({ title, value, icon, bgColor }: { title: string; value: string; icon: React.ReactNode; bgColor: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`flex-shrink-0 rounded-md ${bgColor} p-3`}>
            {icon}
          </div>
          <div className="ml-5">
            <dt className="text-sm font-medium text-gray-500">{title}</dt>
            <dd className="text-xl font-semibold text-gray-900">{value}</dd>
          </div>
        </div>
      </div>
    </div>
  );
}
