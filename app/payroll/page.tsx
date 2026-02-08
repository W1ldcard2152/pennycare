'use client';

import { useState } from 'react';
import { CalendarIcon, CurrencyDollarIcon, ChevronDownIcon, ChevronUpIcon, UserIcon, ClockIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { formatCurrency, PayrollResult } from '@/lib/payrollCalculations';

interface PayrollPreview {
  employeeId: string;
  employeeName: string;
  employeeNumber: string;
  position: string;
  payType: string;
  hourlyRate: number | null;
  annualSalary: number | null;
  regularHours: number | null;
  overtimeHours: number | null;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
  details: PayrollResult;
}

export default function PayrollPage() {
  const [selectedWeek, setSelectedWeek] = useState<Date>(getStartOfWeek(new Date()));
  const [payrollPreview, setPayrollPreview] = useState<PayrollPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [expandedEmployee, setExpandedEmployee] = useState<string | null>(null);

  const generatePreview = async () => {
    setLoading(true);
    try {
      const startDate = formatDate(selectedWeek);
      const endDate = formatDate(getEndOfWeek(selectedWeek));

      const res = await fetch(`/api/payroll/preview?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setPayrollPreview(data);
      } else {
        console.error('Unexpected response:', data);
        alert(data.error || 'Failed to generate preview');
      }
    } catch (error) {
      console.error('Error generating preview:', error);
    } finally {
      setLoading(false);
    }
  };

  const processPayroll = async () => {
    if (!confirm('Are you sure you want to process payroll for this week? This action cannot be undone.')) {
      return;
    }

    setProcessing(true);
    try {
      const startDate = formatDate(selectedWeek);
      const endDate = formatDate(getEndOfWeek(selectedWeek));

      const res = await fetch('/api/payroll/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate,
          endDate,
          payDate: formatDate(getEndOfWeek(selectedWeek)),
        }),
      });

      if (res.ok) {
        alert('Payroll processed successfully!');
        setPayrollPreview([]);
      } else {
        const error = await res.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error processing payroll:', error);
      alert('Failed to process payroll');
    } finally {
      setProcessing(false);
    }
  };

  const toggleEmployeeDetails = (employeeId: string) => {
    setExpandedEmployee(expandedEmployee === employeeId ? null : employeeId);
  };

  const totalGross = payrollPreview.reduce((sum, p) => sum + p.grossPay, 0);
  const totalNet = payrollPreview.reduce((sum, p) => sum + p.netPay, 0);
  const totalDeductions = payrollPreview.reduce((sum, p) => sum + p.totalDeductions, 0);
  const totalEmployerCost = payrollPreview.reduce((sum, p) => sum + (p.details?.totalEmployerCost || 0), 0);

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Payroll</h1>
          <p className="mt-2 text-gray-600">
            Process payroll and manage employee payments for New York State
          </p>
        </div>
        <div className="flex gap-3">
          <a
            href="/payroll/register"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Payroll Register
          </a>
          <a
            href="/payroll/tax-liability"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Tax Liability
          </a>
          <a
            href="/payroll/history"
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Payroll History
          </a>
        </div>
      </div>

      {/* Week Selector */}
      <div className="mb-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Select Pay Period</h2>
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
              {formatDateDisplay(selectedWeek)} - {formatDateDisplay(getEndOfWeek(selectedWeek))}
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
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            Current Week
          </button>
        </div>

        <div className="mt-4">
          <button
            onClick={generatePreview}
            disabled={loading}
            className="rounded-lg bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:bg-gray-400"
          >
            {loading ? 'Generating...' : 'Generate Payroll Preview'}
          </button>
        </div>
      </div>

      {/* Payroll Preview */}
      {payrollPreview.length > 0 && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="Gross Pay"
              amount={totalGross}
              icon={<CurrencyDollarIcon className="h-6 w-6 text-white" />}
              bgColor="bg-blue-500"
            />
            <SummaryCard
              title="Total Deductions"
              amount={totalDeductions}
              icon={<DocumentTextIcon className="h-6 w-6 text-white" />}
              bgColor="bg-orange-500"
            />
            <SummaryCard
              title="Net Pay"
              amount={totalNet}
              icon={<CurrencyDollarIcon className="h-6 w-6 text-white" />}
              bgColor="bg-green-500"
            />
            <SummaryCard
              title="Total Employer Cost"
              amount={totalEmployerCost}
              icon={<UserIcon className="h-6 w-6 text-white" />}
              bgColor="bg-purple-500"
            />
          </div>

          {/* Employee Payroll Cards */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold text-gray-900">Employee Payroll Details</h3>

            {payrollPreview.map((employee) => (
              <div key={employee.employeeId} className="overflow-hidden rounded-lg bg-white shadow">
                {/* Employee Header */}
                <div
                  className="flex cursor-pointer items-center justify-between bg-gray-50 px-6 py-4 hover:bg-gray-100"
                  onClick={() => toggleEmployeeDetails(employee.employeeId)}
                >
                  <div className="flex items-center space-x-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100">
                      <UserIcon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900">{employee.employeeName}</h4>
                      <p className="text-sm text-gray-500">
                        {employee.position} | #{employee.employeeNumber} |{' '}
                        {employee.payType === 'salary'
                          ? `${formatCurrency(employee.annualSalary || 0)}/yr`
                          : `${formatCurrency(employee.hourlyRate || 0)}/hr`
                        }
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-6">
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Gross</p>
                      <p className="font-semibold text-gray-900">{formatCurrency(employee.grossPay)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-gray-500">Net</p>
                      <p className="font-semibold text-green-600">{formatCurrency(employee.netPay)}</p>
                    </div>
                    {expandedEmployee === employee.employeeId ? (
                      <ChevronUpIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <ChevronDownIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </div>
                </div>

                {/* Expanded Details */}
                {expandedEmployee === employee.employeeId && employee.details && (
                  <div className="border-t border-gray-200 px-6 py-4">
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                      {/* Earnings */}
                      <div>
                        <h5 className="mb-3 font-semibold text-gray-900 border-b pb-2">Earnings</h5>
                        <div className="space-y-2 text-sm">
                          {employee.payType === 'salary' ? (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Weekly Salary ({formatCurrency((employee.annualSalary || 0) / 52)}/wk)</span>
                              <span className="font-medium">{formatCurrency(employee.details.regularPay)}</span>
                            </div>
                          ) : (
                            <>
                              <div className="flex justify-between">
                                <span className="text-gray-600">Regular Hours ({employee.regularHours} hrs)</span>
                                <span className="font-medium">{formatCurrency(employee.details.regularPay)}</span>
                              </div>
                              {(employee.overtimeHours || 0) > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-gray-600">Overtime Hours ({employee.overtimeHours} hrs)</span>
                                  <span className="font-medium">{formatCurrency(employee.details.overtimePay)}</span>
                                </div>
                              )}
                            </>
                          )}
                          <div className="flex justify-between border-t pt-2 font-semibold">
                            <span>Gross Pay</span>
                            <span>{formatCurrency(employee.details.grossPay)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Pre-Tax Deductions */}
                      <div>
                        <h5 className="mb-3 font-semibold text-gray-900 border-b pb-2">Pre-Tax Deductions</h5>
                        <div className="space-y-2 text-sm">
                          {employee.details.preTaxDeductions.length > 0 ? (
                            <>
                              {employee.details.preTaxDeductions.map((d, idx) => (
                                <div key={idx} className="flex justify-between">
                                  <span className="text-gray-600">{d.name}</span>
                                  <span className="font-medium text-red-600">-{formatCurrency(d.amount)}</span>
                                </div>
                              ))}
                              <div className="flex justify-between border-t pt-2 font-semibold">
                                <span>Total Pre-Tax</span>
                                <span className="text-red-600">-{formatCurrency(employee.details.totalPreTaxDeductions)}</span>
                              </div>
                              <div className="flex justify-between text-blue-600">
                                <span>Taxable Wages</span>
                                <span className="font-medium">{formatCurrency(employee.details.taxableWages)}</span>
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
                            <span className="text-gray-600">Federal Income Tax</span>
                            <span className="font-medium text-red-600">-{formatCurrency(employee.details.federalIncomeTax)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">NY State Income Tax</span>
                            <span className="font-medium text-red-600">-{formatCurrency(employee.details.stateIncomeTax)}</span>
                          </div>
                          {employee.details.localTax > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Local Tax (NYC/Yonkers)</span>
                              <span className="font-medium text-red-600">-{formatCurrency(employee.details.localTax)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-600">Social Security (6.2%)</span>
                            <span className="font-medium text-red-600">-{formatCurrency(employee.details.socialSecurityEmployee)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Medicare (1.45%)</span>
                            <span className="font-medium text-red-600">-{formatCurrency(employee.details.medicareEmployee)}</span>
                          </div>
                          {employee.details.additionalMedicare > 0 && (
                            <div className="flex justify-between">
                              <span className="text-gray-600">Additional Medicare (0.9%)</span>
                              <span className="font-medium text-red-600">-{formatCurrency(employee.details.additionalMedicare)}</span>
                            </div>
                          )}
                          <div className="flex justify-between">
                            <span className="text-gray-600">NY SDI (Disability)</span>
                            <span className="font-medium text-red-600">-{formatCurrency(employee.details.nySDI)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">NY PFL (Paid Family Leave)</span>
                            <span className="font-medium text-red-600">-{formatCurrency(employee.details.nyPFL)}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2 font-semibold">
                            <span>Total Taxes</span>
                            <span className="text-red-600">-{formatCurrency(employee.details.totalTaxWithholdings)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Post-Tax Deductions and Employer Costs */}
                    <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                      {/* Post-Tax Deductions */}
                      {employee.details.postTaxDeductions.length > 0 && (
                        <div>
                          <h5 className="mb-3 font-semibold text-gray-900 border-b pb-2">Post-Tax Deductions</h5>
                          <div className="space-y-2 text-sm">
                            {employee.details.postTaxDeductions.map((d, idx) => (
                              <div key={idx} className="flex justify-between">
                                <span className="text-gray-600">{d.name}</span>
                                <span className="font-medium text-red-600">-{formatCurrency(d.amount)}</span>
                              </div>
                            ))}
                            <div className="flex justify-between border-t pt-2 font-semibold">
                              <span>Total Post-Tax</span>
                              <span className="text-red-600">-{formatCurrency(employee.details.totalPostTaxDeductions)}</span>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Employer Costs */}
                      <div>
                        <h5 className="mb-3 font-semibold text-gray-900 border-b pb-2">Employer Costs</h5>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-gray-600">Employer Social Security</span>
                            <span className="font-medium">{formatCurrency(employee.details.socialSecurityEmployer)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">Employer Medicare</span>
                            <span className="font-medium">{formatCurrency(employee.details.medicareEmployer)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">NY SUI (Unemployment)</span>
                            <span className="font-medium">{formatCurrency(employee.details.suiEmployer)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">FUTA (Federal Unemployment)</span>
                            <span className="font-medium">{formatCurrency(employee.details.futaEmployer)}</span>
                          </div>
                          <div className="flex justify-between border-t pt-2 font-semibold">
                            <span>Total Employer Cost</span>
                            <span className="text-purple-600">{formatCurrency(employee.details.totalEmployerCost)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Net Pay Summary */}
                    <div className="mt-6 rounded-lg bg-green-50 p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-600">Total Deductions</p>
                          <p className="text-lg font-semibold text-red-600">-{formatCurrency(employee.details.totalDeductions)}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-600">Net Pay</p>
                          <p className="text-2xl font-bold text-green-600">{formatCurrency(employee.details.netPay)}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Process Button */}
          <div className="flex justify-end space-x-4 rounded-lg bg-white p-6 shadow">
            <button
              onClick={() => setPayrollPreview([])}
              className="rounded-lg border border-gray-300 px-6 py-2 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={processPayroll}
              disabled={processing}
              className="rounded-lg bg-green-600 px-6 py-2 text-white hover:bg-green-700 disabled:bg-gray-400"
            >
              {processing ? 'Processing...' : 'Process Payroll'}
            </button>
          </div>
        </div>
      )}

      {/* Empty State */}
      {payrollPreview.length === 0 && !loading && (
        <div className="mt-8 rounded-lg bg-white p-12 text-center shadow">
          <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-4 text-lg font-medium text-gray-900">No Payroll Preview</h3>
          <p className="mt-2 text-gray-500">
            Select a pay period and click &quot;Generate Payroll Preview&quot; to see employee payroll details.
          </p>
        </div>
      )}
    </div>
  );
}

// Summary Card Component
function SummaryCard({ title, amount, icon, bgColor }: { title: string; amount: number; icon: React.ReactNode; bgColor: string }) {
  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="p-5">
        <div className="flex items-center">
          <div className={`flex-shrink-0 rounded-md ${bgColor} p-3`}>
            {icon}
          </div>
          <div className="ml-5">
            <dt className="text-sm font-medium text-gray-500">{title}</dt>
            <dd className="text-2xl font-semibold text-gray-900">
              {formatCurrency(amount)}
            </dd>
          </div>
        </div>
      </div>
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

function formatDateDisplay(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
