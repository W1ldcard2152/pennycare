'use client';

import { useState, useEffect } from 'react';
import { BuildingOffice2Icon, CurrencyDollarIcon } from '@heroicons/react/24/outline';

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
}

type TabType = 'company' | 'payroll';

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
        defaultSickDays: data.defaultSickDays ?? 0,
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
              onChange={(e) => updateField('fein', e.target.value)}
              placeholder="XX-XXXXXXX"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
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
              onChange={(e) => updateField('phone', e.target.value)}
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
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
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

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Default Sick Days (Annual)
            </label>
            <input
              type="number"
              value={company.defaultSickDays || 0}
              onChange={(e) => updateField('defaultSickDays', parseInt(e.target.value) || 0)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>

          <div className="md:col-span-2">
            <label className="flex items-center">
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
