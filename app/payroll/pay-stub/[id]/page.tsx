'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeftIcon, PrinterIcon } from '@heroicons/react/24/outline';

interface PayStubData {
  id: string;
  payPeriodStart: string;
  payPeriodEnd: string;
  payDate: string;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  otherEarnings: number;
  grossPay: number;
  taxableWages: number | null;

  // Pre-tax deductions
  preTax401k: number;
  preTaxHealthIns: number;
  preTaxDental: number;
  preTaxVision: number;
  preTaxHSA: number;
  preTaxFSA: number;
  preTaxOther: number;
  totalPreTaxDeductions: number;

  // Tax withholdings
  federalTax: number;
  stateTax: number;
  localTax: number;
  socialSecurity: number;
  medicare: number;
  additionalMedicare: number;
  nySDI: number;
  nyPFL: number;
  totalTaxWithholdings: number;

  // Post-tax deductions
  postTaxRoth401k: number;
  garnishments: number;
  childSupport: number;
  loanRepayments: number;
  postTaxOther: number;
  totalPostTaxDeductions: number;

  totalDeductions: number;
  netPay: number;

  // Payment info
  isPaid: boolean;
  paidDate: string | null;
  paymentMethod: string | null;
  checkNumber: string | null;

  employee: {
    id: string;
    firstName: string;
    lastName: string;
    middleName: string | null;
    employeeNumber: string;
    position: string;
    department: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    payType: string;
    hourlyRate: number | null;
    annualSalary: number | null;
    ssnLast4: string | null;
  };

  company: {
    companyName: string;
    legalBusinessName: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
    zipCode: string | null;
    phone: string | null;
    fein: string | null;
  };

  ytdTotals: {
    grossPay: number;
    netPay: number;
    federalTax: number;
    stateTax: number;
    localTax: number;
    socialSecurity: number;
    medicare: number;
    additionalMedicare: number;
    nySDI: number;
    nyPFL: number;
    preTax401k: number;
    preTaxHealthIns: number;
    preTaxDental: number;
    preTaxVision: number;
    preTaxHSA: number;
    preTaxFSA: number;
    postTaxRoth401k: number;
    garnishments: number;
    regularHours: number;
    overtimeHours: number;
  };
}

export default function PayStubPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const router = useRouter();
  const [payStub, setPayStub] = useState<PayStubData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPayStub = async () => {
      try {
        const response = await fetch(`/api/payroll/${resolvedParams.id}`);
        if (!response.ok) {
          throw new Error('Failed to load pay stub');
        }
        const data = await response.json();
        setPayStub(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pay stub');
      } finally {
        setLoading(false);
      }
    };
    fetchPayStub();
  }, [resolvedParams.id]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading pay stub...</div>
      </div>
    );
  }

  if (error || !payStub) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <div className="text-lg text-red-600 mb-4">{error || 'Pay stub not found'}</div>
        <Link href="/payroll" className="text-blue-600 hover:underline">
          Return to Payroll
        </Link>
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatHours = (hours: number) => {
    return hours.toFixed(2);
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header - Hidden in print */}
      <div className="print:hidden bg-white border-b px-4 py-4 mb-6">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/payroll"
              className="flex items-center gap-2 text-gray-600 hover:text-gray-900"
            >
              <ArrowLeftIcon className="h-5 w-5" />
              Back to Payroll
            </Link>
            <h1 className="text-xl font-semibold">Pay Stub</h1>
          </div>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
          >
            <PrinterIcon className="h-5 w-5" />
            Print
          </button>
        </div>
      </div>

      {/* Pay Stub Content */}
      <div className="max-w-4xl mx-auto px-4 print:px-0 print:max-w-none">
        <div className="bg-white shadow-lg rounded-lg print:shadow-none print:rounded-none">
          {/* Company Header */}
          <div className="border-b p-6 print:p-4">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {payStub.company.legalBusinessName || payStub.company.companyName}
                </h2>
                {payStub.company.address && (
                  <p className="text-gray-600 mt-1">
                    {payStub.company.address}
                    {payStub.company.city && `, ${payStub.company.city}`}
                    {payStub.company.state && `, ${payStub.company.state}`}
                    {payStub.company.zipCode && ` ${payStub.company.zipCode}`}
                  </p>
                )}
                {payStub.company.phone && (
                  <p className="text-gray-600">{payStub.company.phone}</p>
                )}
              </div>
              <div className="text-right">
                <h3 className="text-xl font-semibold text-gray-900">EARNINGS STATEMENT</h3>
                <p className="text-gray-600 mt-1">Pay Date: {formatDate(payStub.payDate)}</p>
              </div>
            </div>
          </div>

          {/* Employee Info & Pay Period */}
          <div className="border-b p-6 print:p-4">
            <div className="grid grid-cols-2 gap-8">
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Employee</h4>
                <p className="font-semibold text-gray-900">
                  {payStub.employee.firstName} {payStub.employee.middleName ? `${payStub.employee.middleName} ` : ''}{payStub.employee.lastName}
                </p>
                <p className="text-gray-600">Employee #: {payStub.employee.employeeNumber}</p>
                <p className="text-gray-600">{payStub.employee.position}</p>
                {payStub.employee.department && (
                  <p className="text-gray-600">{payStub.employee.department}</p>
                )}
                {payStub.employee.address && (
                  <p className="text-gray-600 mt-2">
                    {payStub.employee.address}
                    {payStub.employee.city && <><br />{payStub.employee.city}</>}
                    {payStub.employee.state && `, ${payStub.employee.state}`}
                    {payStub.employee.zipCode && ` ${payStub.employee.zipCode}`}
                  </p>
                )}
                {payStub.employee.ssnLast4 && (
                  <p className="text-gray-600 mt-2">SSN: ***-**-{payStub.employee.ssnLast4}</p>
                )}
              </div>
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase mb-2">Pay Period</h4>
                <p className="text-gray-900">
                  {formatDate(payStub.payPeriodStart)} - {formatDate(payStub.payPeriodEnd)}
                </p>
                <p className="text-gray-600 mt-2">
                  Pay Type: {payStub.employee.payType === 'salary' ? 'Salary' : 'Hourly'}
                </p>
                {payStub.employee.payType === 'hourly' && payStub.employee.hourlyRate && (
                  <p className="text-gray-600">Rate: {formatCurrency(payStub.employee.hourlyRate)}/hr</p>
                )}
                {payStub.employee.payType === 'salary' && payStub.employee.annualSalary && (
                  <p className="text-gray-600">Annual: {formatCurrency(payStub.employee.annualSalary)}</p>
                )}
                {payStub.paymentMethod && (
                  <p className="text-gray-600 mt-2">
                    Payment: {payStub.paymentMethod === 'direct_deposit' ? 'Direct Deposit' : 'Check'}
                    {payStub.checkNumber && ` #${payStub.checkNumber}`}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Main Content - Earnings, Deductions, Taxes */}
          <div className="p-6 print:p-4">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Earnings */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3 border-b pb-2">Earnings</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left font-medium">Description</th>
                      <th className="text-right font-medium">Hours</th>
                      <th className="text-right font-medium">Current</th>
                      <th className="text-right font-medium">YTD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payStub.employee.payType === 'salary' ? (
                      <tr>
                        <td className="py-1">Salary</td>
                        <td className="text-right">-</td>
                        <td className="text-right">{formatCurrency(payStub.regularPay)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.grossPay)}</td>
                      </tr>
                    ) : (
                      <>
                        <tr>
                          <td className="py-1">Regular</td>
                          <td className="text-right">{formatHours(payStub.regularHours)}</td>
                          <td className="text-right">{formatCurrency(payStub.regularPay)}</td>
                          <td className="text-right text-gray-500">{formatHours(payStub.ytdTotals.regularHours)}</td>
                        </tr>
                        {payStub.overtimeHours > 0 && (
                          <tr>
                            <td className="py-1">Overtime</td>
                            <td className="text-right">{formatHours(payStub.overtimeHours)}</td>
                            <td className="text-right">{formatCurrency(payStub.overtimePay)}</td>
                            <td className="text-right text-gray-500">{formatHours(payStub.ytdTotals.overtimeHours)}</td>
                          </tr>
                        )}
                      </>
                    )}
                    {payStub.otherEarnings > 0 && (
                      <tr>
                        <td className="py-1">Other Earnings</td>
                        <td className="text-right">-</td>
                        <td className="text-right">{formatCurrency(payStub.otherEarnings)}</td>
                        <td className="text-right">-</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold border-t border-gray-300">
                      <td className="py-2" colSpan={2}>Gross Pay</td>
                      <td className="text-right">{formatCurrency(payStub.grossPay)}</td>
                      <td className="text-right">{formatCurrency(payStub.ytdTotals.grossPay)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Taxes */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3 border-b pb-2">Taxes</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left font-medium">Description</th>
                      <th className="text-right font-medium">Current</th>
                      <th className="text-right font-medium">YTD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {payStub.federalTax > 0 && (
                      <tr>
                        <td className="py-1">Federal Income Tax</td>
                        <td className="text-right">{formatCurrency(payStub.federalTax)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.federalTax)}</td>
                      </tr>
                    )}
                    {payStub.stateTax > 0 && (
                      <tr>
                        <td className="py-1">NY State Income Tax</td>
                        <td className="text-right">{formatCurrency(payStub.stateTax)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.stateTax)}</td>
                      </tr>
                    )}
                    {payStub.localTax > 0 && (
                      <tr>
                        <td className="py-1">Local Tax (NYC/Yonkers)</td>
                        <td className="text-right">{formatCurrency(payStub.localTax)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.localTax)}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="py-1">Social Security</td>
                      <td className="text-right">{formatCurrency(payStub.socialSecurity)}</td>
                      <td className="text-right">{formatCurrency(payStub.ytdTotals.socialSecurity)}</td>
                    </tr>
                    <tr>
                      <td className="py-1">Medicare</td>
                      <td className="text-right">{formatCurrency(payStub.medicare)}</td>
                      <td className="text-right">{formatCurrency(payStub.ytdTotals.medicare)}</td>
                    </tr>
                    {payStub.additionalMedicare > 0 && (
                      <tr>
                        <td className="py-1">Additional Medicare</td>
                        <td className="text-right">{formatCurrency(payStub.additionalMedicare)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.additionalMedicare)}</td>
                      </tr>
                    )}
                    {payStub.nySDI > 0 && (
                      <tr>
                        <td className="py-1">NY Disability (SDI)</td>
                        <td className="text-right">{formatCurrency(payStub.nySDI)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.nySDI)}</td>
                      </tr>
                    )}
                    {payStub.nyPFL > 0 && (
                      <tr>
                        <td className="py-1">NY Paid Family Leave</td>
                        <td className="text-right">{formatCurrency(payStub.nyPFL)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.nyPFL)}</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold border-t border-gray-300">
                      <td className="py-2">Total Taxes</td>
                      <td className="text-right">{formatCurrency(payStub.totalTaxWithholdings)}</td>
                      <td className="text-right">
                        {formatCurrency(
                          payStub.ytdTotals.federalTax +
                          payStub.ytdTotals.stateTax +
                          payStub.ytdTotals.localTax +
                          payStub.ytdTotals.socialSecurity +
                          payStub.ytdTotals.medicare +
                          payStub.ytdTotals.additionalMedicare +
                          payStub.ytdTotals.nySDI +
                          payStub.ytdTotals.nyPFL
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* Deductions */}
              <div>
                <h4 className="text-sm font-semibold text-gray-500 uppercase mb-3 border-b pb-2">Deductions</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-500">
                      <th className="text-left font-medium">Description</th>
                      <th className="text-right font-medium">Current</th>
                      <th className="text-right font-medium">YTD</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {/* Pre-tax deductions */}
                    {payStub.preTax401k > 0 && (
                      <tr>
                        <td className="py-1">401(k)</td>
                        <td className="text-right">{formatCurrency(payStub.preTax401k)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.preTax401k)}</td>
                      </tr>
                    )}
                    {payStub.preTaxHealthIns > 0 && (
                      <tr>
                        <td className="py-1">Health Insurance</td>
                        <td className="text-right">{formatCurrency(payStub.preTaxHealthIns)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.preTaxHealthIns)}</td>
                      </tr>
                    )}
                    {payStub.preTaxDental > 0 && (
                      <tr>
                        <td className="py-1">Dental Insurance</td>
                        <td className="text-right">{formatCurrency(payStub.preTaxDental)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.preTaxDental)}</td>
                      </tr>
                    )}
                    {payStub.preTaxVision > 0 && (
                      <tr>
                        <td className="py-1">Vision Insurance</td>
                        <td className="text-right">{formatCurrency(payStub.preTaxVision)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.preTaxVision)}</td>
                      </tr>
                    )}
                    {payStub.preTaxHSA > 0 && (
                      <tr>
                        <td className="py-1">HSA Contribution</td>
                        <td className="text-right">{formatCurrency(payStub.preTaxHSA)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.preTaxHSA)}</td>
                      </tr>
                    )}
                    {payStub.preTaxFSA > 0 && (
                      <tr>
                        <td className="py-1">FSA Contribution</td>
                        <td className="text-right">{formatCurrency(payStub.preTaxFSA)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.preTaxFSA)}</td>
                      </tr>
                    )}
                    {/* Post-tax deductions */}
                    {payStub.postTaxRoth401k > 0 && (
                      <tr>
                        <td className="py-1">Roth 401(k)</td>
                        <td className="text-right">{formatCurrency(payStub.postTaxRoth401k)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.postTaxRoth401k)}</td>
                      </tr>
                    )}
                    {payStub.garnishments > 0 && (
                      <tr>
                        <td className="py-1">Garnishments</td>
                        <td className="text-right">{formatCurrency(payStub.garnishments)}</td>
                        <td className="text-right">{formatCurrency(payStub.ytdTotals.garnishments)}</td>
                      </tr>
                    )}
                    {payStub.childSupport > 0 && (
                      <tr>
                        <td className="py-1">Child Support</td>
                        <td className="text-right">{formatCurrency(payStub.childSupport)}</td>
                        <td className="text-right">-</td>
                      </tr>
                    )}
                    {payStub.loanRepayments > 0 && (
                      <tr>
                        <td className="py-1">Loan Repayment</td>
                        <td className="text-right">{formatCurrency(payStub.loanRepayments)}</td>
                        <td className="text-right">-</td>
                      </tr>
                    )}
                    {payStub.totalPreTaxDeductions === 0 && payStub.totalPostTaxDeductions === 0 && (
                      <tr>
                        <td className="py-1 text-gray-500" colSpan={3}>No deductions</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="font-semibold border-t border-gray-300">
                      <td className="py-2">Total Deductions</td>
                      <td className="text-right">{formatCurrency(payStub.totalPreTaxDeductions + payStub.totalPostTaxDeductions)}</td>
                      <td className="text-right">
                        {formatCurrency(
                          payStub.ytdTotals.preTax401k +
                          payStub.ytdTotals.preTaxHealthIns +
                          payStub.ytdTotals.preTaxDental +
                          payStub.ytdTotals.preTaxVision +
                          payStub.ytdTotals.preTaxHSA +
                          payStub.ytdTotals.preTaxFSA +
                          payStub.ytdTotals.postTaxRoth401k +
                          payStub.ytdTotals.garnishments
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Net Pay Summary */}
            <div className="mt-8 pt-6 border-t-2 border-gray-300">
              <div className="flex justify-between items-center">
                <div>
                  <p className="text-sm text-gray-500">Total Deductions</p>
                  <p className="text-lg font-semibold text-gray-900">{formatCurrency(payStub.totalDeductions)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">Net Pay</p>
                  <p className="text-3xl font-bold text-green-600">{formatCurrency(payStub.netPay)}</p>
                </div>
              </div>
              <div className="mt-4 flex justify-between text-sm text-gray-600">
                <span>YTD Gross: {formatCurrency(payStub.ytdTotals.grossPay)}</span>
                <span>YTD Net: {formatCurrency(payStub.ytdTotals.netPay)}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t p-4 text-center text-xs text-gray-500">
            <p>This is an official earnings statement. Please retain for your records.</p>
            <p className="mt-1">Questions? Contact your employer.</p>
          </div>
        </div>
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
          .print\\:p-4 {
            padding: 1rem !important;
          }
          .print\\:px-0 {
            padding-left: 0 !important;
            padding-right: 0 !important;
          }
          .print\\:max-w-none {
            max-width: none !important;
          }
        }
      `}</style>
    </div>
  );
}
