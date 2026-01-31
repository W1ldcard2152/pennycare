'use client';

import { useState, useEffect } from 'react';
import { CalendarIcon, CurrencyDollarIcon } from '@heroicons/react/24/outline';
import { formatCurrency } from '@/lib/payrollCalculations';

interface PayrollPreview {
  employeeId: string;
  employeeName: string;
  regularHours: number;
  overtimeHours: number;
  grossPay: number;
  netPay: number;
  totalDeductions: number;
}

interface Company {
  overtimeMultiplier: number;
  suiRate: number;
}

export default function PayrollPage() {
  const [selectedWeek, setSelectedWeek] = useState<Date>(getStartOfWeek(new Date()));
  const [payrollPreview, setPayrollPreview] = useState<PayrollPreview[]>([]);
  const [loading, setLoading] = useState(false);
  const [processing, setProcessing] = useState(false);

  const generatePreview = async () => {
    setLoading(true);
    try {
      const startDate = formatDate(selectedWeek);
      const endDate = formatDate(getEndOfWeek(selectedWeek));

      const res = await fetch(`/api/payroll/preview?startDate=${startDate}&endDate=${endDate}`);
      const data = await res.json();
      setPayrollPreview(data);
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

  const totalGross = payrollPreview.reduce((sum, p) => sum + p.grossPay, 0);
  const totalNet = payrollPreview.reduce((sum, p) => sum + p.netPay, 0);
  const totalDeductions = payrollPreview.reduce((sum, p) => sum + p.totalDeductions, 0);

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Payroll</h1>
        <p className="mt-2 text-gray-600">
          Process payroll and manage employee payments
        </p>
      </div>

      {/* Week Selector */}
      <div className="mb-6 rounded-lg bg-white p-6 shadow">
        <h2 className="mb-4 text-lg font-semibold">Select Pay Period</h2>
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setSelectedWeek(addWeeks(selectedWeek, -1))}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Previous Week
          </button>
          <div className="flex items-center space-x-2 text-lg font-semibold">
            <CalendarIcon className="h-5 w-5" />
            <span>
              {formatDate(selectedWeek)} - {formatDate(getEndOfWeek(selectedWeek))}
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
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0 rounded-md bg-blue-500 p-3">
                    <CurrencyDollarIcon className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5">
                    <dt className="text-sm font-medium text-gray-500">Gross Pay</dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {formatCurrency(totalGross)}
                    </dd>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0 rounded-md bg-orange-500 p-3">
                    <CurrencyDollarIcon className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5">
                    <dt className="text-sm font-medium text-gray-500">Total Deductions</dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {formatCurrency(totalDeductions)}
                    </dd>
                  </div>
                </div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg bg-white shadow">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0 rounded-md bg-green-500 p-3">
                    <CurrencyDollarIcon className="h-6 w-6 text-white" />
                  </div>
                  <div className="ml-5">
                    <dt className="text-sm font-medium text-gray-500">Net Pay</dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {formatCurrency(totalNet)}
                    </dd>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Employee Details Table */}
          <div className="overflow-hidden rounded-lg bg-white shadow">
            <div className="px-6 py-4">
              <h3 className="text-lg font-semibold text-gray-900">Employee Payroll Details</h3>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Employee
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Regular Hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    OT Hours
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Gross Pay
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Deductions
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                    Net Pay
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {payrollPreview.map((employee) => (
                  <tr key={employee.employeeId}>
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {employee.employeeName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {employee.regularHours}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {employee.overtimeHours}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">
                      {formatCurrency(employee.grossPay)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {formatCurrency(employee.totalDeductions)}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-green-600">
                      {formatCurrency(employee.netPay)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900" colSpan={3}>
                    TOTAL
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">
                    {formatCurrency(totalGross)}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-900">
                    {formatCurrency(totalDeductions)}
                  </td>
                  <td className="px-6 py-4 text-sm font-bold text-green-600">
                    {formatCurrency(totalNet)}
                  </td>
                </tr>
              </tfoot>
            </table>
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
