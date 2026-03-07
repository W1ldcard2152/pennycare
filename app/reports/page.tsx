'use client';

import Link from 'next/link';
import {
  DocumentTextIcon,
  UsersIcon,
  CurrencyDollarIcon,
  BuildingOffice2Icon,
  ClipboardDocumentListIcon,
  ClockIcon,
  ArrowRightIcon,
  CalculatorIcon,
} from '@heroicons/react/24/outline';

const reports = [
  {
    title: 'Payroll Summary',
    description: 'Aggregate payroll data by period — gross pay, deductions, taxes, net pay, and employer costs.',
    href: '/reports/payroll-summary',
    icon: DocumentTextIcon,
    color: 'blue',
  },
  {
    title: 'Employee Earnings',
    description: 'Per-employee earnings breakdown over a date range with hours, pay, taxes, and deductions.',
    href: '/reports/employee-earnings',
    icon: UsersIcon,
    color: 'green',
  },
  {
    title: 'Tax Summary',
    description: 'Federal, state, and local tax liability by period — Form 941, NYS-45, and FUTA.',
    href: '/payroll/tax-liability',
    icon: BuildingOffice2Icon,
    color: 'red',
  },
  {
    title: 'Deductions',
    description: 'Breakdown of all pre-tax and post-tax deductions across employees for a period.',
    href: '/reports/deductions',
    icon: CalculatorIcon,
    color: 'orange',
  },
  {
    title: 'Employer Costs',
    description: 'Total employer burden — FICA, SUI, FUTA, workers comp, and burden rate analysis.',
    href: '/reports/employer-costs',
    icon: CurrencyDollarIcon,
    color: 'purple',
  },
  {
    title: 'Payroll Register',
    description: 'Detailed payroll register for a pay period with all employee columns and totals.',
    href: '/payroll/register',
    icon: ClipboardDocumentListIcon,
    color: 'teal',
  },
  {
    title: 'Payroll History',
    description: 'View all processed payroll records with employee filtering and pay stub links.',
    href: '/payroll/history',
    icon: ClockIcon,
    color: 'gray',
  },
];

const colorClasses: Record<string, { bg: string; icon: string; hover: string }> = {
  blue: { bg: 'bg-blue-50', icon: 'text-blue-600', hover: 'hover:border-blue-300' },
  green: { bg: 'bg-green-50', icon: 'text-green-600', hover: 'hover:border-green-300' },
  red: { bg: 'bg-red-50', icon: 'text-red-600', hover: 'hover:border-red-300' },
  orange: { bg: 'bg-orange-50', icon: 'text-orange-600', hover: 'hover:border-orange-300' },
  purple: { bg: 'bg-purple-50', icon: 'text-purple-600', hover: 'hover:border-purple-300' },
  teal: { bg: 'bg-teal-50', icon: 'text-teal-600', hover: 'hover:border-teal-300' },
  gray: { bg: 'bg-gray-100', icon: 'text-gray-600', hover: 'hover:border-gray-300' },
};

export default function ReportsPage() {
  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="mt-2 text-gray-600">
          Generate and view standard payroll reports
        </p>
      </div>

      {/* Report Cards Grid */}
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {reports.map((report) => {
          const colors = colorClasses[report.color] || colorClasses.gray;
          return (
            <Link
              key={report.title}
              href={report.href}
              className={`group relative rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md ${colors.hover}`}
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className={`flex h-12 w-12 items-center justify-center rounded-lg ${colors.bg}`}>
                    <report.icon className={`h-6 w-6 ${colors.icon}`} />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {report.title}
                    </h3>
                    <ArrowRightIcon className="h-5 w-5 text-gray-400 group-hover:translate-x-1 group-hover:text-blue-600 transition-all" />
                  </div>
                  <p className="mt-2 text-sm text-gray-600">
                    {report.description}
                  </p>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
