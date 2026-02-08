'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  DocumentTextIcon,
  BuildingOffice2Icon,
  UserGroupIcon,
  CalendarDaysIcon,
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
} from '@heroicons/react/24/outline';

// Quarter options
const quarters = [
  { value: 1, label: 'Q1 (Jan-Mar)' },
  { value: 2, label: 'Q2 (Apr-Jun)' },
  { value: 3, label: 'Q3 (Jul-Sep)' },
  { value: 4, label: 'Q4 (Oct-Dec)' },
];

// Get current quarter
function getCurrentQuarter(): number {
  const month = new Date().getMonth();
  return Math.floor(month / 3) + 1;
}

// Get current year
function getCurrentYear(): number {
  return new Date().getFullYear();
}

// Get available years (current year and 2 prior years)
function getAvailableYears(): number[] {
  const currentYear = getCurrentYear();
  return [currentYear, currentYear - 1, currentYear - 2];
}

// Form definitions
const quarterlyForms = [
  {
    id: '941',
    name: 'Form 941',
    fullName: "Employer's Quarterly Federal Tax Return",
    description: 'Report wages paid, federal income tax withheld, and Social Security & Medicare taxes.',
    agency: 'IRS',
    frequency: 'Quarterly',
    icon: BuildingOffice2Icon,
    href: '/tax-forms/941',
    dueDates: 'Apr 30, Jul 31, Oct 31, Jan 31',
    filingUrl: 'https://www.irs.gov/e-file-providers/e-file-for-business-and-self-employed-taxpayers',
    filingLabel: 'File with IRS',
  },
  {
    id: 'nys-45',
    name: 'NYS-45',
    fullName: 'Quarterly Combined Withholding, Wage Reporting and Unemployment Insurance Return',
    description: 'Report NYS income tax withheld, wages, and unemployment insurance contributions.',
    agency: 'NYS Dept. of Taxation & Finance',
    frequency: 'Quarterly',
    icon: DocumentTextIcon,
    href: '/tax-forms/nys-45',
    dueDates: 'Apr 30, Jul 31, Oct 31, Jan 31',
    filingUrl: 'https://my.ny.gov/LoginV4/login.xhtml?APP=nyappdtf',
    filingLabel: 'File with NYS DTF',
  },
];

const annualForms = [
  {
    id: '940',
    name: 'Form 940',
    fullName: "Employer's Annual Federal Unemployment (FUTA) Tax Return",
    description: 'Report annual FUTA tax liability and payments made throughout the year.',
    agency: 'IRS',
    frequency: 'Annual',
    icon: BuildingOffice2Icon,
    href: null,
    dueDates: 'January 31',
    filingUrl: 'https://www.irs.gov/e-file-providers/e-file-for-business-and-self-employed-taxpayers',
    filingLabel: 'File with IRS',
  },
  {
    id: 'w2',
    name: 'Form W-2',
    fullName: 'Wage and Tax Statement',
    description: 'Annual statement of wages and taxes for each employee. Required for filing.',
    agency: 'SSA / IRS',
    frequency: 'Annual',
    icon: UserGroupIcon,
    href: null,
    dueDates: 'January 31 (to employees)',
    filingUrl: 'https://www.ssa.gov/employer/',
    filingLabel: 'File with SSA',
  },
];

export default function TaxFormsPage() {
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
  const [selectedYear, setSelectedYear] = useState(getCurrentYear());

  return (
    <div className="space-y-8 px-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tax Forms</h1>
        <p className="mt-1 text-sm text-gray-600">
          Generate pre-filled government tax forms using your payroll data
        </p>
      </div>

      {/* Period Selector */}
      <div className="rounded-lg border bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <CalendarDaysIcon className="h-5 w-5 text-gray-500" />
          <h2 className="text-lg font-semibold text-gray-900">Select Period</h2>
        </div>
        <div className="flex flex-wrap gap-4">
          <div>
            <label htmlFor="year" className="block text-sm font-medium text-gray-700 mb-1">
              Year
            </label>
            <select
              id="year"
              value={selectedYear}
              onChange={(e) => setSelectedYear(Number(e.target.value))}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {getAvailableYears().map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="quarter" className="block text-sm font-medium text-gray-700 mb-1">
              Quarter
            </label>
            <select
              id="quarter"
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(Number(e.target.value))}
              className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {quarters.map((q) => (
                <option key={q.value} value={q.value}>
                  {q.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Quarterly Forms */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Quarterly Forms</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {quarterlyForms.map((form) => (
            <div
              key={form.id}
              className="group relative rounded-lg border bg-white p-6 shadow-sm hover:shadow-md hover:border-blue-300 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 group-hover:bg-blue-100 transition-colors">
                    <form.icon className="h-6 w-6 text-blue-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <Link
                      href={`${form.href}?year=${selectedYear}&quarter=${selectedQuarter}`}
                      className="text-lg font-semibold text-gray-900 hover:text-blue-600 transition-colors"
                    >
                      {form.name}
                    </Link>
                    <Link
                      href={`${form.href}?year=${selectedYear}&quarter=${selectedQuarter}`}
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                    >
                      <ArrowRightIcon className="h-5 w-5 group-hover:translate-x-1 transition-all" />
                    </Link>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{form.fullName}</p>
                  <p className="text-sm text-gray-600 mt-2">{form.description}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1">
                      {form.agency}
                    </span>
                    <span>Due: {form.dueDates}</span>
                    {form.filingUrl && (
                      <a
                        href={form.filingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 font-medium"
                      >
                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                        {form.filingLabel}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Annual Forms */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Annual Forms ({selectedYear})</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {annualForms.map((form) => (
            <div
              key={form.id}
              className="group relative rounded-lg border bg-white p-6 shadow-sm hover:shadow-md hover:border-green-300 transition-all"
            >
              <div className="flex items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-green-50 group-hover:bg-green-100 transition-colors">
                    <form.icon className="h-6 w-6 text-green-600" />
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    {form.href ? (
                      <>
                        <Link
                          href={`${form.href}?year=${selectedYear}`}
                          className="text-lg font-semibold text-gray-900 hover:text-green-600 transition-colors"
                        >
                          {form.name}
                        </Link>
                        <Link
                          href={`${form.href}?year=${selectedYear}`}
                          className="text-gray-400 hover:text-green-600 transition-colors"
                        >
                          <ArrowRightIcon className="h-5 w-5 group-hover:translate-x-1 transition-all" />
                        </Link>
                      </>
                    ) : (
                      <span className="text-lg font-semibold text-gray-900">
                        {form.name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">{form.fullName}</p>
                  <p className="text-sm text-gray-600 mt-2">{form.description}</p>
                  <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-1">
                      {form.agency}
                    </span>
                    <span>Due: {form.dueDates}</span>
                    {form.filingUrl && (
                      <a
                        href={form.filingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-green-600 hover:text-green-800 font-medium"
                      >
                        <ArrowTopRightOnSquareIcon className="h-3 w-3" />
                        {form.filingLabel}
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Info Box */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <div className="flex gap-3">
          <div className="flex-shrink-0">
            <ExclamationTriangleIcon className="h-5 w-5 text-blue-600" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-blue-800">About Pre-Filled Forms</h3>
            <p className="mt-1 text-sm text-blue-700">
              Forms are pre-filled using your payroll data. Please review all information carefully before filing.
              You can download the filled PDF and make any necessary adjustments before submission.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
