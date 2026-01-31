'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface Employee {
  id: string;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  employeeNumber: string;
  position: string;
  employmentType: string;
  department?: string;
  hireDate: string;
  terminationDate?: string;
  isActive: boolean;
  payType: string;
  hourlyRate?: number;
  annualSalary?: number;
  taxId?: string;

  // Federal Tax Settings
  w4FormType?: string;
  w4FilingStatus?: string;
  w4Allowances?: number;
  additionalWithholding?: number;
  additionalWithholdingPercentage?: number;
  overrideAmount?: number;
  overridePercentage?: number;
  federalTaxability?: string;
  federalTaxesWithheld?: boolean;
  federalResidency?: string;

  // Social Security & Medicare
  socialSecurityTaxability?: string;
  medicareTaxability?: string;

  // State Tax Settings
  stateFilingStatus?: string;
  stateResidency?: string;
  stateAllowances?: number;
  stateTaxesWithheld?: boolean;
  stateTaxability?: string;

  // State Unemployment
  unemploymentTaxability?: string;
  worksiteCode?: string;
  dependentHealthInsurance?: boolean;

  // State Disability
  disabilityTaxability?: string;
  disabilityTaxesWithheld?: boolean;

  // Paid Family Leave
  paidFamilyLeaveTaxability?: string;
  paidFamilyLeaveTaxesWithheld?: boolean;

  paymentInfo?: {
    paymentMethod: string;
    bankName?: string;
    accountType?: string;
    routingNumber?: string;
    accountNumber?: string;
  };
  emergencyContact?: {
    name: string;
    relationship: string;
    phone: string;
    alternatePhone?: string;
  };
}

export default function EditEmployeePage() {
  const params = useParams();
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEmployee();
  }, []);

  const fetchEmployee = async () => {
    try {
      const response = await fetch(`/api/employees/${params.id}`);
      if (!response.ok) throw new Error('Failed to fetch employee');
      const data = await response.json();
      setEmployee(data);
    } catch (error) {
      console.error('Error fetching employee:', error);
      setError('Failed to load employee data');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaving(true);
    setError('');

    const formData = new FormData(e.currentTarget);
    const data = Object.fromEntries(formData.entries());

    // Handle checkbox - if not checked, it won't be in formData
    if (!formData.has('dependentHealthInsurance')) {
      (data as any).dependentHealthInsurance = 'false';
    }

    console.log('Submitting data:', data);

    try {
      const response = await fetch(`/api/employees/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('Server error:', errorData);
        throw new Error(errorData.details || 'Failed to update employee');
      }

      router.push(`/employees/${params.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update employee. Please try again.');
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Loading employee...</p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600">Employee not found</p>
          <Link href="/employees" className="text-blue-600 hover:text-blue-700 mt-4 inline-block">
            ← Back to Employees
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href={`/employees/${employee.id}`} className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Back to Employee
          </Link>
          <h1 className="text-3xl font-bold">Edit Employee</h1>
          <p className="text-gray-600 mt-2">{employee.firstName} {employee.lastName} • Employee #{employee.employeeNumber}</p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Personal Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Personal Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  First Name *
                </label>
                <input
                  type="text"
                  name="firstName"
                  required
                  defaultValue={employee.firstName}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Last Name *
                </label>
                <input
                  type="text"
                  name="lastName"
                  required
                  defaultValue={employee.lastName}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  name="email"
                  defaultValue={employee.email || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                <input
                  type="tel"
                  name="phone"
                  defaultValue={employee.phone || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                <input
                  type="text"
                  name="address"
                  defaultValue={employee.address || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                <input
                  type="text"
                  name="city"
                  defaultValue={employee.city || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                <input
                  type="text"
                  name="state"
                  maxLength={2}
                  placeholder="CA"
                  defaultValue={employee.state || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">ZIP Code</label>
                <input
                  type="text"
                  name="zipCode"
                  defaultValue={employee.zipCode || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Employment Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Employment Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employee Number *
                </label>
                <input
                  type="text"
                  name="employeeNumber"
                  required
                  defaultValue={employee.employeeNumber}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hire Date *
                </label>
                <input
                  type="date"
                  name="hireDate"
                  required
                  defaultValue={employee.hireDate.split('T')[0]}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Position *
                </label>
                <input
                  type="text"
                  name="position"
                  required
                  placeholder="e.g., Mechanic, Office Manager"
                  defaultValue={employee.position}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Employment Type *
                </label>
                <select
                  name="employmentType"
                  required
                  defaultValue={employee.employmentType}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select type</option>
                  <option value="full-time">Full-time</option>
                  <option value="part-time">Part-time</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <input
                  type="text"
                  name="department"
                  placeholder="e.g., Service, Parts"
                  defaultValue={employee.department || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  name="isActive"
                  defaultValue={employee.isActive ? 'true' : 'false'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="true">Active</option>
                  <option value="false">Inactive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Pay Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Pay Information</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Pay Type *
                </label>
                <select
                  name="payType"
                  required
                  defaultValue={employee.payType}
                  onChange={(e) => {
                    const hourlyInput = document.querySelector<HTMLInputElement>('[name="hourlyRate"]');
                    const salaryInput = document.querySelector<HTMLInputElement>('[name="annualSalary"]');
                    if (e.target.value === 'hourly') {
                      hourlyInput?.removeAttribute('disabled');
                      salaryInput?.setAttribute('disabled', 'true');
                      salaryInput!.value = '';
                    } else {
                      salaryInput?.removeAttribute('disabled');
                      hourlyInput?.setAttribute('disabled', 'true');
                      hourlyInput!.value = '';
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select pay type</option>
                  <option value="hourly">Hourly</option>
                  <option value="salary">Salary</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Hourly Rate
                </label>
                <input
                  type="number"
                  name="hourlyRate"
                  step="0.01"
                  min="0"
                  disabled={employee.payType !== 'hourly'}
                  defaultValue={employee.hourlyRate || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Annual Salary
                </label>
                <input
                  type="number"
                  name="annualSalary"
                  step="0.01"
                  min="0"
                  disabled={employee.payType !== 'salary'}
                  defaultValue={employee.annualSalary || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>
            </div>
          </div>

          {/* Tax Information */}
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Tax Information</h2>
              <Link
                href={`/employees/${employee.id}/tax-settings`}
                className="text-blue-600 hover:text-blue-700 text-sm font-medium"
              >
                Advanced Tax Settings →
              </Link>
            </div>

            {/* SSN */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Social Security Number
              </label>
              <input
                type="text"
                name="taxId"
                placeholder="XXX-XX-XXXX"
                maxLength={11}
                defaultValue={employee.taxId || ''}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">Encrypted and secure</p>
            </div>

            {/* Federal Tax */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase">Federal Tax Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">W4 Form Type</label>
                  <select
                    name="w4FormType"
                    defaultValue={employee.w4FormType || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select type</option>
                    <option value="2019_prior">2019 & Prior</option>
                    <option value="2020_later">2020 & Later</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">W4 Filing Status</label>
                  <select
                    name="w4FilingStatus"
                    defaultValue={employee.w4FilingStatus || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select status</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="head_of_household">Head of Household</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">W4 Allowances</label>
                  <input
                    type="number"
                    name="w4Allowances"
                    min="0"
                    defaultValue={employee.w4Allowances || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Additional Withholding</label>
                  <input
                    type="number"
                    name="additionalWithholding"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    defaultValue={employee.additionalWithholding || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Federal Taxability</label>
                  <select
                    name="federalTaxability"
                    defaultValue={employee.federalTaxability || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="taxable">Taxable</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Residency</label>
                  <select
                    name="federalResidency"
                    defaultValue={employee.federalResidency || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="resident">Resident</option>
                    <option value="nonresident">Non-Resident</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Social Security & Medicare */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase">Social Security & Medicare</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Social Security Taxability</label>
                  <select
                    name="socialSecurityTaxability"
                    defaultValue={employee.socialSecurityTaxability || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="taxable">Taxable</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Medicare Taxability</label>
                  <select
                    name="medicareTaxability"
                    defaultValue={employee.medicareTaxability || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="taxable">Taxable</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
              </div>
            </div>

            {/* State Tax */}
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase">NY State Income Tax</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State Filing Status</label>
                  <select
                    name="stateFilingStatus"
                    defaultValue={employee.stateFilingStatus || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select status</option>
                    <option value="single">Single</option>
                    <option value="married">Married</option>
                    <option value="head_of_household">Head of Household</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State Residency</label>
                  <select
                    name="stateResidency"
                    defaultValue={employee.stateResidency || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="resident">Resident</option>
                    <option value="nonresident">Non-Resident</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State Allowances</label>
                  <input
                    type="number"
                    name="stateAllowances"
                    min="0"
                    defaultValue={employee.stateAllowances || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State Taxability</label>
                  <select
                    name="stateTaxability"
                    defaultValue={employee.stateTaxability || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="taxable">Taxable</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
              </div>
            </div>

            {/* State Programs */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase">NY State Programs</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Unemployment Taxability</label>
                  <select
                    name="unemploymentTaxability"
                    defaultValue={employee.unemploymentTaxability || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="taxable">Taxable</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Disability Taxability</label>
                  <select
                    name="disabilityTaxability"
                    defaultValue={employee.disabilityTaxability || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="taxable">Taxable</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Paid Family Leave Taxability</label>
                  <select
                    name="paidFamilyLeaveTaxability"
                    defaultValue={employee.paidFamilyLeaveTaxability || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select</option>
                    <option value="taxable">Taxable</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
                <div>
                  <label className="flex items-center text-sm font-medium text-gray-700">
                    <input
                      type="checkbox"
                      name="dependentHealthInsurance"
                      defaultChecked={employee.dependentHealthInsurance || false}
                      value="true"
                      className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    Dependent Health Insurance
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Method */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Payment Method</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Payment Method
                </label>
                <select
                  name="paymentMethod"
                  defaultValue={employee.paymentInfo?.paymentMethod || ''}
                  onChange={(e) => {
                    const directDepositFields = document.getElementById('directDepositFields');
                    if (e.target.value === 'direct_deposit') {
                      directDepositFields?.classList.remove('hidden');
                    } else {
                      directDepositFields?.classList.add('hidden');
                    }
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select method</option>
                  <option value="check">Paper Check</option>
                  <option value="direct_deposit">Direct Deposit</option>
                </select>
              </div>
            </div>

            <div id="directDepositFields" className={employee.paymentInfo?.paymentMethod === 'direct_deposit' ? 'mt-4' : 'hidden mt-4'}>
              <h3 className="font-medium text-gray-900 mb-3">Direct Deposit Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank Name
                  </label>
                  <input
                    type="text"
                    name="bankName"
                    defaultValue={employee.paymentInfo?.bankName || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Type
                  </label>
                  <select
                    name="accountType"
                    defaultValue={employee.paymentInfo?.accountType || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select type</option>
                    <option value="checking">Checking</option>
                    <option value="savings">Savings</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Routing Number
                  </label>
                  <input
                    type="text"
                    name="routingNumber"
                    maxLength={9}
                    defaultValue={employee.paymentInfo?.routingNumber || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Encrypted and secure</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Number
                  </label>
                  <input
                    type="text"
                    name="accountNumber"
                    defaultValue={employee.paymentInfo?.accountNumber || ''}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-500 mt-1">Encrypted and secure</p>
                </div>
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Emergency Contact</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Name
                </label>
                <input
                  type="text"
                  name="emergencyContactName"
                  defaultValue={employee.emergencyContact?.name || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Relationship
                </label>
                <input
                  type="text"
                  name="emergencyContactRelationship"
                  placeholder="e.g., Spouse, Parent"
                  defaultValue={employee.emergencyContact?.relationship || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone Number
                </label>
                <input
                  type="tel"
                  name="emergencyContactPhone"
                  defaultValue={employee.emergencyContact?.phone || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Alternate Phone
                </label>
                <input
                  type="tel"
                  name="emergencyContactAlternatePhone"
                  defaultValue={employee.emergencyContact?.alternatePhone || ''}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Link
              href={`/employees/${employee.id}`}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:bg-gray-400"
            >
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
