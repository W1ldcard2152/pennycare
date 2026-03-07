'use client';

import { useState, useEffect } from 'react';
import { BuildingOffice2Icon, CurrencyDollarIcon, BellAlertIcon } from '@heroicons/react/24/outline';

interface Company {
  id: string;
  companyName: string;
  legalBusinessName: string | null;
  fein: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  industryType: string | null;
  fiscalYearEnd: string | null;
  defaultPayPeriod: string | null;
  overtimeEnabled: boolean;
  overtimeMultiplier: number;
  stateUIClientId: string | null;
  stateTaxId: string | null;
  localTaxId: string | null;
  suiRate: number | null;
  workersCompPolicy: string | null;
  workersCompCarrier: string | null;
  bankName: string | null;
  bankRoutingNumberEncrypted: string | null;
  bankAccountNumberEncrypted: string | null;
  defaultPTODays: number | null;
  defaultSickDays: number | null;
  ptoAccrualEnabled: boolean;
  ptoAccrualHoursEarned: number | null;
  ptoAccrualHoursWorked: number | null;
  sickAccrualEnabled: boolean;
  sickAccrualHoursEarned: number | null;
  sickAccrualHoursWorked: number | null;
  sickAnnualCapHours: number | null;
  federalDepositSchedule: string;
  reminderLeadDays: number;
}

interface TaxFilingRecord {
  id: string;
  formType: string;
  year: number;
  quarter: number | null;
  status: string;
  filedDate: string | null;
  confirmationNumber: string | null;
}

type TabType = 'company' | 'payroll' | 'notifications';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabType>('company');
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchCompany();
  }, []);

  const fetchCompany = async () => {
    try {
      const res = await fetch('/api/company');
      const data = await res.json();
      // Convert null values to empty strings for controlled inputs
      const normalizedData = {
        ...data,
        companyName: data.companyName || '',
        legalBusinessName: data.legalBusinessName || '',
        fein: data.fein || '',
        address: data.address || '',
        city: data.city || '',
        state: data.state || '',
        zipCode: data.zipCode || '',
        phone: data.phone || '',
        email: data.email || '',
        website: data.website || '',
        industryType: data.industryType || '',
        fiscalYearEnd: data.fiscalYearEnd || '',
        defaultPayPeriod: data.defaultPayPeriod || '',
        stateUIClientId: data.stateUIClientId || '',
        stateTaxId: data.stateTaxId || '',
        localTaxId: data.localTaxId || '',
        suiRate: data.suiRate ?? 0,
        workersCompPolicy: data.workersCompPolicy || '',
        workersCompCarrier: data.workersCompCarrier || '',
        bankName: data.bankName || '',
        bankRoutingNumberEncrypted: data.bankRoutingNumberEncrypted || '',
        bankAccountNumberEncrypted: data.bankAccountNumberEncrypted || '',
        defaultPTODays: data.defaultPTODays ?? 0,
        defaultSickDays: data.defaultSickDays ?? 5,
        ptoAccrualHoursEarned: data.ptoAccrualHoursEarned ?? 1,
        ptoAccrualHoursWorked: data.ptoAccrualHoursWorked ?? 40,
        sickAccrualEnabled: data.sickAccrualEnabled ?? true,
        sickAccrualHoursEarned: data.sickAccrualHoursEarned ?? 1,
        sickAccrualHoursWorked: data.sickAccrualHoursWorked ?? 30,
        sickAnnualCapHours: data.sickAnnualCapHours ?? 40,
        federalDepositSchedule: data.federalDepositSchedule || 'monthly',
        reminderLeadDays: data.reminderLeadDays ?? 7,
      };
      setCompany(normalizedData);
    } catch (error) {
      console.error('Error fetching company:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!company) return;

    setSaving(true);
    try {
      const res = await fetch('/api/company', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(company),
      });

      if (res.ok) {
        const updated = await res.json();
        setCompany(updated);
        alert('Settings saved successfully!');
      } else {
        alert('Failed to save settings');
      }
    } catch (error) {
      console.error('Error saving company:', error);
      alert('Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const updateField = (field: keyof Company, value: any) => {
    if (!company) return;
    setCompany({ ...company, [field]: value });
  };

  if (loading) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="flex h-96 items-center justify-center">
        <div className="text-red-500">Failed to load settings</div>
      </div>
    );
  }

  const tabs = [
    { id: 'company' as TabType, name: 'Company Settings', icon: BuildingOffice2Icon },
    { id: 'payroll' as TabType, name: 'Payroll Settings', icon: CurrencyDollarIcon },
    { id: 'notifications' as TabType, name: 'Tax Reminders', icon: BellAlertIcon },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
        <p className="mt-2 text-gray-600">
          Manage your company and payroll configuration
        </p>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex items-center whitespace-nowrap border-b-2 px-1 py-4 text-sm font-medium
                ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }
              `}
            >
              <tab.icon className="mr-2 h-5 w-5" />
              {tab.name}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab Content */}
      <div className="mt-8">
        {activeTab === 'company' && (
          <CompanySettings company={company} updateField={updateField} />
        )}
        {activeTab === 'payroll' && (
          <PayrollSettings company={company} updateField={updateField} />
        )}
        {activeTab === 'notifications' && (
          <TaxRemindersSettings company={company} updateField={updateField} />
        )}
      </div>

      {/* Save Button */}
      <div className="mt-8 flex justify-end border-t pt-6">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-6 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
}

function CompanySettings({
  company,
  updateField,
}: {
  company: Company;
  updateField: (field: keyof Company, value: any) => void;
}) {
  // Format EIN as XX-XXXXXXX
  const handleEINChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9]/g, ''); // Remove non-digits
    if (value.length > 9) {
      value = value.slice(0, 9); // Limit to 9 digits
    }
    if (value.length > 2) {
      value = value.slice(0, 2) + '-' + value.slice(2);
    }
    updateField('fein', value);
  };

  // Format phone as (XXX) XXX-XXXX
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/[^0-9]/g, ''); // Remove non-digits
    if (value.length > 10) {
      value = value.slice(0, 10); // Limit to 10 digits
    }
    if (value.length > 6) {
      value = '(' + value.slice(0, 3) + ') ' + value.slice(3, 6) + '-' + value.slice(6);
    } else if (value.length > 3) {
      value = '(' + value.slice(0, 3) + ') ' + value.slice(3);
    } else if (value.length > 0) {
      value = '(' + value;
    }
    updateField('phone', value);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Company Information</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Company Name *
            </label>
            <input
              type="text"
              value={company.companyName}
              onChange={(e) => updateField('companyName', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Legal Business Name
            </label>
            <input
              type="text"
              value={company.legalBusinessName || ''}
              onChange={(e) => updateField('legalBusinessName', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              FEIN (Federal Employer ID)
            </label>
            <input
              type="text"
              value={company.fein || ''}
              onChange={handleEINChange}
              placeholder="XX-XXXXXXX"
              maxLength={10}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">Format: XX-XXXXXXX</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Industry Type
            </label>
            <input
              type="text"
              value={company.industryType || ''}
              onChange={(e) => updateField('industryType', e.target.value)}
              placeholder="e.g., Auto Repair"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Contact Information</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Address</label>
            <input
              type="text"
              value={company.address || ''}
              onChange={(e) => updateField('address', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">City</label>
            <input
              type="text"
              value={company.city || ''}
              onChange={(e) => updateField('city', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">State</label>
            <input
              type="text"
              value={company.state || ''}
              onChange={(e) => updateField('state', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">ZIP Code</label>
            <input
              type="text"
              value={company.zipCode || ''}
              onChange={(e) => updateField('zipCode', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Phone</label>
            <input
              type="tel"
              value={company.phone || ''}
              onChange={handlePhoneChange}
              placeholder="(XXX) XXX-XXXX"
              maxLength={14}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              value={company.email || ''}
              onChange={(e) => updateField('email', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-700">Website</label>
            <input
              type="url"
              value={company.website || ''}
              onChange={(e) => updateField('website', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Business Details</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Fiscal Year End
            </label>
            <input
              type="text"
              value={company.fiscalYearEnd || ''}
              onChange={(e) => updateField('fiscalYearEnd', e.target.value)}
              placeholder="MM-DD (e.g., 12-31)"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">Format: MM-DD</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PayrollSettings({
  company,
  updateField,
}: {
  company: Company;
  updateField: (field: keyof Company, value: any) => void;
}) {
  return (
    <div className="space-y-6">
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Tax IDs</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              State UI Client ID
            </label>
            <input
              type="text"
              value={company.stateUIClientId || ''}
              onChange={(e) => updateField('stateUIClientId', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">State unemployment insurance ID</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              SUI Rate (%)
            </label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="100"
              value={company.suiRate || ''}
              onChange={(e) => updateField('suiRate', parseFloat(e.target.value) || 0)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">Employer's NY SUI rate (2.1% - 9.9%)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              State Tax ID
            </label>
            <input
              type="text"
              value={company.stateTaxId || ''}
              onChange={(e) => updateField('stateTaxId', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Local Tax ID
            </label>
            <input
              type="text"
              value={company.localTaxId || ''}
              onChange={(e) => updateField('localTaxId', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">If applicable</p>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Pay Period Settings</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Default Pay Period
            </label>
            <select
              value={company.defaultPayPeriod || ''}
              onChange={(e) => updateField('defaultPayPeriod', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="">Select pay period</option>
              <option value="weekly">Weekly</option>
              <option value="biweekly">Bi-weekly</option>
              <option value="semimonthly">Semi-monthly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Overtime Multiplier
            </label>
            <input
              type="number"
              step="0.1"
              value={company.overtimeMultiplier}
              onChange={(e) => updateField('overtimeMultiplier', parseFloat(e.target.value))}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">Typically 1.5 (time and a half)</p>
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={company.overtimeEnabled}
                onChange={(e) => updateField('overtimeEnabled', e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700">Enable overtime calculations</span>
            </label>
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Workers Compensation</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Policy Number
            </label>
            <input
              type="text"
              value={company.workersCompPolicy || ''}
              onChange={(e) => updateField('workersCompPolicy', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Carrier
            </label>
            <input
              type="text"
              value={company.workersCompCarrier || ''}
              onChange={(e) => updateField('workersCompCarrier', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">PTO & Leave Policies</h3>

        {/* PTO Section */}
        <div className="mb-6">
          <h4 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">Paid Time Off (PTO)</h4>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Default PTO Days (Annual)
              </label>
              <input
                type="number"
                value={company.defaultPTODays || 0}
                onChange={(e) => updateField('defaultPTODays', parseInt(e.target.value) || 0)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="flex items-center mt-6">
                <input
                  type="checkbox"
                  checked={company.ptoAccrualEnabled}
                  onChange={(e) => updateField('ptoAccrualEnabled', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Enable PTO accrual</span>
              </label>
            </div>
          </div>

          {company.ptoAccrualEnabled && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                PTO Accrual Rate
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={company.ptoAccrualHoursEarned || 1}
                  onChange={(e) => updateField('ptoAccrualHoursEarned', parseFloat(e.target.value) || 1)}
                  className="w-20 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">hour(s) earned per</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={company.ptoAccrualHoursWorked || 40}
                  onChange={(e) => updateField('ptoAccrualHoursWorked', parseFloat(e.target.value) || 40)}
                  className="w-20 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">hours worked</span>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                Example: 1 hour per 40 hours worked = ~52 hours/year for full-time employee
              </p>
            </div>
          )}
        </div>

        {/* Sick Leave Section */}
        <div className="border-t pt-6">
          <h4 className="mb-3 text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Sick Leave
            <span className="ml-2 inline-flex items-center rounded-full bg-yellow-100 px-2.5 py-0.5 text-xs font-medium text-yellow-800 normal-case">
              NY Required
            </span>
          </h4>
          <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 mb-4">
            <p className="text-sm text-yellow-800">
              <strong>New York State Requirement:</strong> Employers with 5-99 employees must provide a minimum of 40 hours (5 days) of paid sick leave per year, accruing at 1 hour per 30 hours worked.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Default Sick Days (Annual)
              </label>
              <input
                type="number"
                min="5"
                value={company.defaultSickDays || 5}
                onChange={(e) => updateField('defaultSickDays', Math.max(5, parseInt(e.target.value) || 5))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Minimum 5 days (40 hours) required in NY</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">
                Annual Cap (Hours)
              </label>
              <input
                type="number"
                min="40"
                value={company.sickAnnualCapHours || 40}
                onChange={(e) => updateField('sickAnnualCapHours', Math.max(40, parseFloat(e.target.value) || 40))}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
              <p className="mt-1 text-xs text-gray-500">Maximum accrual per year</p>
            </div>

            <div>
              <label className="flex items-center mt-6">
                <input
                  type="checkbox"
                  checked={company.sickAccrualEnabled ?? true}
                  onChange={(e) => updateField('sickAccrualEnabled', e.target.checked)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">Enable sick leave accrual</span>
              </label>
            </div>
          </div>

          {(company.sickAccrualEnabled ?? true) && (
            <div className="mt-4 rounded-lg bg-gray-50 p-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Sick Leave Accrual Rate
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={company.sickAccrualHoursEarned || 1}
                  onChange={(e) => updateField('sickAccrualHoursEarned', parseFloat(e.target.value) || 1)}
                  className="w-20 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">hour(s) earned per</span>
                <input
                  type="number"
                  step="1"
                  min="1"
                  value={company.sickAccrualHoursWorked || 30}
                  onChange={(e) => updateField('sickAccrualHoursWorked', parseFloat(e.target.value) || 30)}
                  className="w-20 rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-600">hours worked</span>
              </div>
              <p className="mt-2 text-sm text-gray-500">
                NY Minimum: 1 hour per 30 hours worked (default)
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Bank Account (ACH)</h3>
        <p className="mb-4 text-sm text-gray-600">
          Company bank account for originating payroll direct deposits
        </p>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Bank Name
            </label>
            <input
              type="text"
              value={company.bankName || ''}
              onChange={(e) => updateField('bankName', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Routing Number
            </label>
            <input
              type="text"
              value={company.bankRoutingNumberEncrypted || ''}
              onChange={(e) => updateField('bankRoutingNumberEncrypted', e.target.value)}
              placeholder="9 digits"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-yellow-600">Note: Encryption not yet implemented</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Account Number
            </label>
            <input
              type="text"
              value={company.bankAccountNumberEncrypted || ''}
              onChange={(e) => updateField('bankAccountNumberEncrypted', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-yellow-600">Note: Encryption not yet implemented</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function TaxRemindersSettings({
  company,
  updateField,
}: {
  company: Company;
  updateField: (field: keyof Company, value: any) => void;
}) {
  const [filings, setFilings] = useState<TaxFilingRecord[]>([]);
  const [loadingFilings, setLoadingFilings] = useState(true);

  const currentYear = new Date().getFullYear();

  useEffect(() => {
    fetchFilings();
  }, []);

  const fetchFilings = async () => {
    try {
      const res = await fetch('/api/tax-filings');
      if (res.ok) {
        const data = await res.json();
        setFilings(data);
      }
    } catch {
      // Silently fail
    } finally {
      setLoadingFilings(false);
    }
  };

  const handleMarkFiled = async (formType: string, year: number, quarter: number | null) => {
    try {
      const res = await fetch('/api/tax-filings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formType,
          year,
          quarter,
          status: 'filed',
          filedDate: new Date().toISOString(),
        }),
      });
      if (res.ok) {
        fetchFilings();
      }
    } catch {
      alert('Failed to update filing status');
    }
  };

  const handleUnfile = async (id: string) => {
    try {
      const res = await fetch(`/api/tax-filings/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchFilings();
      }
    } catch {
      alert('Failed to update filing status');
    }
  };

  const getFilingStatus = (formType: string, year: number, quarter: number | null) => {
    return filings.find(
      f => f.formType === formType && f.year === year && f.quarter === quarter
    );
  };

  // Build the forms grid for the current year
  const formRows = [
    { formType: '941', label: 'Form 941', periods: [1, 2, 3, 4].map(q => ({ quarter: q, label: `Q${q}` })) },
    { formType: 'nys45', label: 'NYS-45', periods: [1, 2, 3, 4].map(q => ({ quarter: q, label: `Q${q}` })) },
    { formType: '940', label: 'Form 940', periods: [{ quarter: null as number | null, label: 'Annual' }] },
    { formType: 'w2', label: 'Form W-2', periods: [{ quarter: null as number | null, label: 'Annual' }] },
  ];

  return (
    <div className="space-y-6">
      {/* Deposit Schedule & Lead Days */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Reminder Settings</h3>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Federal Tax Deposit Schedule
            </label>
            <select
              value={company.federalDepositSchedule || 'monthly'}
              onChange={(e) => updateField('federalDepositSchedule', e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value="monthly">Monthly (due 15th of following month)</option>
              <option value="semiweekly">Semi-Weekly (Wed/Fri after payday)</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              IRS assigns based on prior-year liability. Under $50,000 = Monthly; $50,000+ = Semi-Weekly.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Reminder Lead Days
            </label>
            <input
              type="number"
              min="1"
              max="90"
              value={company.reminderLeadDays ?? 7}
              onChange={(e) => updateField('reminderLeadDays', parseInt(e.target.value) || 7)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <p className="mt-1 text-sm text-gray-500">
              Show the banner alert this many days before a deadline.
            </p>
          </div>
        </div>
      </div>

      {/* Filing Status */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h3 className="mb-4 text-lg font-semibold text-gray-900">Filing Status ({currentYear})</h3>
        <p className="mb-4 text-sm text-gray-600">
          Mark forms as filed to dismiss their reminders.
        </p>

        {loadingFilings ? (
          <div className="text-gray-500 text-sm">Loading filing status...</div>
        ) : (
          <div className="space-y-4">
            {formRows.map((form) => (
              <div key={form.formType} className="border rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-3">{form.label}</h4>
                <div className="flex flex-wrap gap-3">
                  {form.periods.map((period) => {
                    const filing = getFilingStatus(form.formType, currentYear, period.quarter);
                    const isFiled = filing?.status === 'filed';

                    return (
                      <div
                        key={`${form.formType}-${period.label}`}
                        className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                          isFiled
                            ? 'border-green-200 bg-green-50 text-green-800'
                            : 'border-gray-200 bg-gray-50 text-gray-700'
                        }`}
                      >
                        <span className="font-medium">{period.label}</span>
                        {isFiled ? (
                          <>
                            <span className="text-green-600">Filed</span>
                            <button
                              onClick={() => handleUnfile(filing!.id)}
                              className="text-xs text-gray-500 hover:text-red-600 underline"
                            >
                              Undo
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleMarkFiled(form.formType, currentYear, period.quarter)}
                            className="text-xs text-blue-600 hover:text-blue-800 underline"
                          >
                            Mark Filed
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
