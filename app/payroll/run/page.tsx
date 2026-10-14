'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  CalendarIcon,
  CurrencyDollarIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  UserIcon,
  ClockIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
} from '@heroicons/react/24/outline';
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
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [processDialogOpen, setProcessDialogOpen] = useState(false);
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

  const toggleEmployeeDetails = (employeeId: string) => {
    setExpandedEmployee(expandedEmployee === employeeId ? null : employeeId);
  };

  const totalGross = payrollPreview.reduce((sum, p) => sum + p.grossPay, 0);
  const totalNet = payrollPreview.reduce((sum, p) => sum + p.netPay, 0);
  const totalDeductions = payrollPreview.reduce((sum, p) => sum + p.totalDeductions, 0);
  const totalEmployerCost = payrollPreview.reduce((sum, p) => sum + (p.details?.totalEmployerCost || 0), 0);
  const totalCashRequired = totalGross + totalEmployerCost;

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <a href="/payroll" className="text-sm text-gray-500 hover:text-gray-700">
          ← Payroll Dashboard
        </a>
        <h1 className="mt-2 text-3xl font-bold text-gray-900">Run Payroll</h1>
        <p className="mt-2 text-gray-600">
          Generate a preview for the selected week and process payroll.
        </p>
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

          {/* Total Employer Cash Requirement — gross pay + employer-side taxes */}
          <div className="rounded-lg border-2 border-indigo-300 bg-indigo-50 p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-indigo-900">
                  Total Employer Cash Requirement
                </p>
                <p className="mt-1 text-xs text-indigo-700">
                  Gross pay {formatCurrency(totalGross)} + employer taxes {formatCurrency(totalEmployerCost)} (FICA match, SUI, FUTA)
                </p>
              </div>
              <p className="text-3xl font-bold text-indigo-900">
                {formatCurrency(totalCashRequired)}
              </p>
            </div>
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

                {/* Setup warnings (e.g. no IT-2104, undated YTD seed) — shown
                    without expanding, since they change the numbers above. */}
                {employee.details?.warnings?.length > 0 && (
                  <div className="border-t border-amber-200 bg-amber-50 px-6 py-2 text-sm text-amber-800">
                    {employee.details.warnings.map((w, i) => (
                      <p key={i}>⚠ {w}</p>
                    ))}
                  </div>
                )}

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
                          <CapStatus
                            label="SS wage base"
                            ytd={employee.details.ytdGrossPayAfter}
                            cap={employee.details.ssWageBase}
                          />
                          <div className="flex justify-between">
                            <span className="text-gray-600">Employer Medicare</span>
                            <span className="font-medium">{formatCurrency(employee.details.medicareEmployer)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">NY SUI (Unemployment)</span>
                            <span className="font-medium">{formatCurrency(employee.details.suiEmployer)}</span>
                          </div>
                          <CapStatus
                            label="NY SUI wage base"
                            ytd={employee.details.ytdGrossPayAfter}
                            cap={employee.details.suiWageBase}
                          />
                          <div className="flex justify-between">
                            <span className="text-gray-600">NY Re-employment Service Fund</span>
                            <span className="font-medium">{formatCurrency(employee.details.nyRSFEmployer)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-600">FUTA (Federal Unemployment)</span>
                            <span className="font-medium">{formatCurrency(employee.details.futaEmployer)}</span>
                          </div>
                          <CapStatus
                            label="FUTA wage base"
                            ytd={employee.details.ytdGrossPayAfter}
                            cap={employee.details.futaWageBase}
                          />
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
              onClick={() => setProcessDialogOpen(true)}
              className="rounded-lg bg-green-600 px-6 py-2 text-white hover:bg-green-700"
            >
              Process Payroll
            </button>
          </div>
        </div>
      )}

      {processDialogOpen && (
        <ProcessPayrollDialog
          periodStart={formatDate(selectedWeek)}
          periodEnd={formatDate(getEndOfWeek(selectedWeek))}
          previewTotals={summarize(payrollPreview)}
          onClose={() => setProcessDialogOpen(false)}
          onProcessed={(count, payDate) => router.push(`/payroll?processed=${count}&payDate=${payDate}`)}
        />
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

interface RunTotals {
  employees: number;
  gross: number;
  net: number;
  employerCost: number;
}

function summarize(rows: PayrollPreview[]): RunTotals {
  return {
    employees: rows.length,
    gross: rows.reduce((s, p) => s + p.grossPay, 0),
    net: rows.reduce((s, p) => s + p.netPay, 0),
    employerCost: rows.reduce((s, p) => s + (p.details?.totalEmployerCost || 0), 0),
  };
}

function quarterOf(iso: string): { year: number; quarter: number } {
  return { year: Number(iso.slice(0, 4)), quarter: Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1 };
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDate(d);
}

function displayIso(iso: string): string {
  return formatDateDisplay(new Date(`${iso}T12:00:00Z`));
}

/**
 * Process Payroll → pay date → confirmation. The pay date decides the tax
 * year (YTD, wage bases) and the 941 / NYS-45 quarter the wages land in, so
 * the confirmation step re-runs the preview at that date and shows the totals
 * that will actually be saved.
 */
function ProcessPayrollDialog({
  periodStart,
  periodEnd,
  previewTotals,
  onClose,
  onProcessed,
}: {
  periodStart: string;
  periodEnd: string;
  previewTotals: RunTotals;
  onClose: () => void;
  onProcessed: (count: number, payDate: string) => void;
}) {
  // Local calendar date — toISOString() is already tomorrow after 8pm Eastern.
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  const [step, setStep] = useState<'date' | 'confirm'>('date');
  const [payDate, setPayDate] = useState(periodEnd);
  const [filedForms, setFiledForms] = useState<string[]>([]);
  const [laterPayroll, setLaterPayroll] = useState(false);
  const [totals, setTotals] = useState<RunTotals | null>(null);
  const [accountProblems, setAccountProblems] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(payDate);
  const beforePeriod = validDate && payDate < periodStart;
  const payQ = validDate ? quarterOf(payDate) : null;
  const workQ = quarterOf(periodEnd);
  const crossesQuarter = !!payQ && (payQ.year !== workQ.year || payQ.quarter !== workQ.quarter);

  // Payroll can't post if its wage / employer-tax account is wrong — say so up front.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/payroll/accounts')
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { roles: Array<{ role: string; status: string; message?: string }> } | null) => {
        if (cancelled || !body) return;
        setAccountProblems(
          body.roles
            .filter((r) => (r.role === 'wages' || r.role === 'employerTaxes') && r.status === 'problem')
            .map((r) => r.message ?? '')
        );
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Context for the chosen date: returns already filed for its quarter, and
  // payroll already processed after it (its YTD won't include this run).
  useEffect(() => {
    if (!validDate || beforePeriod) return;
    let cancelled = false;
    const { year, quarter } = quarterOf(payDate);
    fetch(`/api/bookkeeping/tax-filings?year=${year}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((list: Array<{ formType: string; quarter: number | null; status: string }>) => {
        if (cancelled || !Array.isArray(list)) return;
        setFiledForms(
          list
            .filter((f) => f.quarter === quarter && f.status === 'filed' && ['941', 'nys45'].includes(f.formType))
            .map((f) => (f.formType === 'nys45' ? 'NYS-45' : 'Form 941'))
        );
      })
      .catch(() => {});
    fetch(`/api/payroll/history?startDate=${addDaysIso(payDate, 1)}&limit=1`)
      .then((r) => (r.ok ? r.json() : []))
      .then((body) => {
        if (cancelled) return;
        const rows = Array.isArray(body) ? body : body.records || [];
        setLaterPayroll(rows.length > 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [payDate, validDate, beforePeriod]);

  const goToConfirm = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch(
        `/api/payroll/preview?startDate=${periodStart}&endDate=${periodEnd}&payDate=${payDate}`
      );
      const data = await res.json();
      if (!res.ok || !Array.isArray(data)) throw new Error(data.error || 'Failed to calculate payroll');
      if (data.length === 0) throw new Error('No employees have pay for this period');
      setTotals(summarize(data));
      setStep('confirm');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to calculate payroll');
    } finally {
      setBusy(false);
    }
  };

  const process = async () => {
    setBusy(true);
    setErr('');
    try {
      const res = await fetch('/api/payroll/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate: periodStart, endDate: periodEnd, payDate }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Failed to process payroll');
      onProcessed(body.recordsProcessed ?? 0, payDate);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to process payroll');
      setBusy(false);
    }
  };

  const differsFromPreview =
    !!totals &&
    (Math.abs(totals.gross - previewTotals.gross) >= 0.005 ||
      Math.abs(totals.net - previewTotals.net) >= 0.005 ||
      Math.abs(totals.employerCost - previewTotals.employerCost) >= 0.005);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-lg bg-white p-6 shadow-xl">
        <h3 className="text-lg font-semibold text-gray-900">
          {step === 'date' ? 'When are employees paid?' : 'Process payroll?'}
        </h3>
        <p className="mt-1 text-sm text-gray-600">
          Pay period {displayIso(periodStart)} – {displayIso(periodEnd)}
        </p>

        {err && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>
        )}

        {accountProblems.length > 0 && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {accountProblems.map((m) => (
              <p key={m}>{m}</p>
            ))}
            <p className="mt-1">
              <a href="/settings" className="font-medium underline">
                Open Settings
              </a>{' '}
              → Payroll tab → Payroll Accounts.
            </p>
          </div>
        )}

        {step === 'date' ? (
          <div className="mt-4 space-y-3">
            <div>
              <label htmlFor="payDate" className="block text-sm font-medium text-gray-700">
                Pay date
              </label>
              <input
                id="payDate"
                type="date"
                value={payDate}
                min={periodStart}
                onChange={(e) => setPayDate(e.target.value)}
                className="mt-1 block w-48 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              />
              <p className="mt-1 text-xs text-gray-500">
                The date the checks or deposits reach employees. It sets the tax year and the quarter
                the wages are reported in.
              </p>
            </div>

            {beforePeriod && (
              <p className="text-sm text-red-700">The pay date can&apos;t be before the pay period starts.</p>
            )}

            {payQ && !beforePeriod && (
              <div
                className={`flex gap-2 rounded-md border px-3 py-2 text-sm ${
                  crossesQuarter ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-gray-50 text-gray-700'
                }`}
              >
                <InformationCircleIcon className={`h-5 w-5 flex-shrink-0 ${crossesQuarter ? 'text-amber-600' : 'text-gray-400'}`} />
                <span>
                  Reported on the <strong>Q{payQ.quarter} {payQ.year}</strong> Form 941 and NYS-45
                  {crossesQuarter
                    ? ` — not Q${workQ.quarter} ${workQ.year}, when the work was done. Returns follow the date employees are paid.`
                    : '.'}
                  {payDate < today && ' This is a past date — use the day employees were actually paid.'}
                </span>
              </div>
            )}

            {validDate && !beforePeriod && filedForms.length > 0 && payQ && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-600" />
                <span>
                  The Q{payQ.quarter} {payQ.year} {filedForms.join(' and ')}{' '}
                  {filedForms.length > 1 ? 'are' : 'is'} already marked filed. This payroll changes that
                  quarter&apos;s figures — you may need an amended return.
                </span>
              </div>
            )}

            {validDate && !beforePeriod && laterPayroll && (
              <div className="flex gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                <ExclamationTriangleIcon className="h-5 w-5 flex-shrink-0 text-amber-600" />
                <span>
                  Payroll paid after {displayIso(payDate)} has already been processed. Those pay stubs&apos;
                  year-to-date totals, and the wage-base limits applied to them, won&apos;t include this run.
                </span>
              </div>
            )}
          </div>
        ) : (
          totals && (
            <div className="mt-4 space-y-3">
              <dl className="divide-y divide-gray-100 rounded-md border border-gray-200 text-sm">
                {(
                  [
                    ['Pay date', displayIso(payDate)],
                    ['Reported in', payQ ? `Q${payQ.quarter} ${payQ.year}` : '—'],
                    ['Employees', String(totals.employees)],
                    ['Gross pay', formatCurrency(totals.gross)],
                    ['Net pay', formatCurrency(totals.net)],
                    ['Employer taxes', formatCurrency(totals.employerCost)],
                    ['Total cash required', formatCurrency(totals.gross + totals.employerCost)],
                  ] as const
                ).map(([label, value]) => (
                  <div key={label} className="flex justify-between px-3 py-2">
                    <dt className="text-gray-600">{label}</dt>
                    <dd className="font-medium tabular-nums text-gray-900">{value}</dd>
                  </div>
                ))}
              </dl>
              {differsFromPreview && (
                <p className="flex gap-2 text-xs text-amber-800">
                  <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0 text-amber-600" />
                  These totals differ from the preview on the page because the pay date falls in a
                  different tax year — year-to-date amounts and wage bases restart each January.
                </p>
              )}
              <p className="text-xs text-gray-500">
                This creates the payroll records and their journal entry. To undo it, void the run from
                Payroll History.
              </p>
            </div>
          )
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={step === 'date' ? onClose : () => setStep('date')}
            disabled={busy}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {step === 'date' ? 'Cancel' : 'Back'}
          </button>
          {step === 'date' ? (
            <button
              type="button"
              onClick={goToConfirm}
              disabled={busy || !validDate || beforePeriod || accountProblems.length > 0}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? 'Calculating…' : 'Next'}
            </button>
          ) : (
            <button
              type="button"
              onClick={process}
              disabled={busy}
              className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
            >
              {busy ? 'Processing…' : 'Process payroll'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// Wage-base cap status line — shows whether YTD wages have reached a per-employee
// withholding cap (the SS / NY SUI / FUTA bases the calculation applied for the
// payroll's tax year) so $0 amounts above
// don't look like a bug.
function CapStatus({ label, ytd, cap }: { label: string; ytd: number; cap: number }) {
  const reached = ytd >= cap;
  const display = Math.min(ytd, cap);
  return (
    <div className="flex justify-between pl-4 -mt-1 text-xs">
      <span className={reached ? 'text-amber-700' : 'text-gray-500'}>
        {reached ? 'Contribution Capped' : label}
      </span>
      <span className={reached ? 'text-amber-700 font-medium' : 'text-gray-500'}>
        {formatCurrency(display)} / {formatCurrency(cap)}
      </span>
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
//
// Business dates carry no time-of-day. We anchor every week boundary to noon
// UTC of the user's LOCAL calendar day, then do all weekday math in UTC. This
// keeps toISOString() (formatDate) and timeZone:'UTC' rendering agreeing on the
// same calendar day regardless of what time of day the app is launched.
// Mixing local getDay()/setDate() with UTC serialization used to shift the pay
// period by a day when the app was opened in the evening (past 8pm ET, local
// time crosses into the next UTC day).
function toBusinessNoon(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0));
}

function getStartOfWeek(date: Date): Date {
  const d = toBusinessNoon(date);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

function getEndOfWeek(date: Date): Date {
  const d = getStartOfWeek(date);
  d.setUTCDate(d.getUTCDate() + 6);
  return d;
}

function addWeeks(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + weeks * 7);
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
    timeZone: 'UTC',
  });
}
