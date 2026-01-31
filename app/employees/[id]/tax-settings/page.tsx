'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface TaxSettings {
  // Federal
  w4FormType?: string;
  w4FilingStatus?: string;
  w4Allowances?: number;
  additionalWithholding?: number;
  additionalWithholdingPercentage?: number;
  overrideAmount?: number;
  overridePercentage?: number;
  federalTaxability?: string;
  federalTaxesWithheld: boolean;
  federalResidency?: string;
  socialSecurityTaxability?: string;
  medicareTaxability?: string;

  // State
  stateFilingStatus?: string;
  stateResidency?: string;
  stateAllowances?: number;
  stateTaxesWithheld: boolean;
  stateTaxability?: string;

  // Unemployment
  unemploymentTaxability?: string;
  worksiteCode?: string;
  dependentHealthInsurance: boolean;

  // Disability & PFL
  disabilityTaxability?: string;
  disabilityTaxesWithheld: boolean;
  paidFamilyLeaveTaxability?: string;
  paidFamilyLeaveTaxesWithheld: boolean;
}

export default function TaxSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const [employee, setEmployee] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<TaxSettings>({
    federalTaxesWithheld: true,
    stateTaxesWithheld: true,
    dependentHealthInsurance: false,
    disabilityTaxesWithheld: true,
    paidFamilyLeaveTaxesWithheld: true,
  });

  useEffect(() => {
    fetchEmployee();
  }, []);

  const fetchEmployee = async () => {
    try {
      const response = await fetch(`/api/employees/${params.id}`);
      const data = await response.json();
      setEmployee(data);

      // Populate settings from employee data
      setSettings({
        w4FormType: data.w4FormType || '2019_prior',
        w4FilingStatus: data.w4FilingStatus || 'married',
        w4Allowances: data.w4Allowances || 1,
        additionalWithholding: data.additionalWithholding,
        additionalWithholdingPercentage: data.additionalWithholdingPercentage,
        overrideAmount: data.overrideAmount,
        overridePercentage: data.overridePercentage,
        federalTaxability: data.federalTaxability || 'taxable',
        federalTaxesWithheld: data.federalTaxesWithheld ?? true,
        federalResidency: data.federalResidency || 'resident',
        socialSecurityTaxability: data.socialSecurityTaxability || 'taxable',
        medicareTaxability: data.medicareTaxability || 'taxable',

        stateFilingStatus: data.stateFilingStatus || 'married',
        stateResidency: data.stateResidency || 'resident',
        stateAllowances: data.stateAllowances || 1,
        stateTaxesWithheld: data.stateTaxesWithheld ?? true,
        stateTaxability: data.stateTaxability || 'taxable',

        unemploymentTaxability: data.unemploymentTaxability || 'taxable',
        worksiteCode: data.worksiteCode,
        dependentHealthInsurance: data.dependentHealthInsurance ?? false,

        disabilityTaxability: data.disabilityTaxability || 'taxable',
        disabilityTaxesWithheld: data.disabilityTaxesWithheld ?? true,
        paidFamilyLeaveTaxability: data.paidFamilyLeaveTaxability || 'taxable',
        paidFamilyLeaveTaxesWithheld: data.paidFamilyLeaveTaxesWithheld ?? true,
      });
    } catch (error) {
      console.error('Error fetching employee:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const response = await fetch(`/api/employees/${params.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...employee,
          ...settings,
        }),
      });

      if (!response.ok) throw new Error('Failed to update tax settings');

      alert('Tax settings updated successfully');
      router.push(`/employees/${params.id}`);
    } catch (error) {
      console.error('Error updating tax settings:', error);
      alert('Failed to update tax settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-8">
          <Link href={`/employees/${params.id}`} className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Back to Employee
          </Link>
          <h1 className="text-3xl font-bold">Tax Settings</h1>
          <p className="text-gray-600 mt-2">
            {employee?.firstName} {employee?.lastName} - Employee #{employee?.employeeNumber}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-8">
          {/* Federal Tax Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Federal Tax Settings</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  W4 Form Type
                </label>
                <select
                  value={settings.w4FormType}
                  onChange={(e) => setSettings({ ...settings, w4FormType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="2019_prior">2019 & Prior</option>
                  <option value="2020_later">2020 & Later</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filing Status
                </label>
                <select
                  value={settings.w4FilingStatus}
                  onChange={(e) => setSettings({ ...settings, w4FilingStatus: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="head_of_household">Head of Household</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Residency
                </label>
                <select
                  value={settings.federalResidency}
                  onChange={(e) => setSettings({ ...settings, federalResidency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="resident">Resident</option>
                  <option value="nonresident">Nonresident</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Taxability
                </label>
                <select
                  value={settings.federalTaxability}
                  onChange={(e) => setSettings({ ...settings, federalTaxability: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="taxable">Taxable</option>
                  <option value="exempt">Exempt</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Number of Allowances
                </label>
                <input
                  type="number"
                  value={settings.w4Allowances || ''}
                  onChange={(e) => setSettings({ ...settings, w4Allowances: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  min="0"
                />
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.federalTaxesWithheld}
                    onChange={(e) => setSettings({ ...settings, federalTaxesWithheld: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Taxes Withheld</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.additionalWithholding || ''}
                  onChange={(e) => setSettings({ ...settings, additionalWithholding: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Additional Percentage
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.additionalWithholdingPercentage || ''}
                  onChange={(e) => setSettings({ ...settings, additionalWithholdingPercentage: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Override Amount
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.overrideAmount || ''}
                  onChange={(e) => setSettings({ ...settings, overrideAmount: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Override Percentage
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={settings.overridePercentage || ''}
                  onChange={(e) => setSettings({ ...settings, overridePercentage: parseFloat(e.target.value) || undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="mt-6">
              <h3 className="font-semibold mb-3">Social Security / Medicare</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Social Security Taxability
                  </label>
                  <select
                    value={settings.socialSecurityTaxability}
                    onChange={(e) => setSettings({ ...settings, socialSecurityTaxability: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="taxable">Taxable</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Medicare Taxability
                  </label>
                  <select
                    value={settings.medicareTaxability}
                    onChange={(e) => setSettings({ ...settings, medicareTaxability: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  >
                    <option value="taxable">Taxable</option>
                    <option value="exempt">Exempt</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* State Tax Settings */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">New York State Income Tax</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Filing Status
                </label>
                <select
                  value={settings.stateFilingStatus}
                  onChange={(e) => setSettings({ ...settings, stateFilingStatus: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="head_of_household">Head of Household</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Residency
                </label>
                <select
                  value={settings.stateResidency}
                  onChange={(e) => setSettings({ ...settings, stateResidency: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="resident">Resident</option>
                  <option value="nonresident">Nonresident</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total Number of Allowances
                </label>
                <input
                  type="number"
                  value={settings.stateAllowances || ''}
                  onChange={(e) => setSettings({ ...settings, stateAllowances: parseInt(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  min="0"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Taxability
                </label>
                <select
                  value={settings.stateTaxability}
                  onChange={(e) => setSettings({ ...settings, stateTaxability: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                >
                  <option value="taxable">Taxable</option>
                  <option value="exempt">Exempt</option>
                </select>
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={settings.stateTaxesWithheld}
                    onChange={(e) => setSettings({ ...settings, stateTaxesWithheld: e.target.checked })}
                    className="mr-2"
                  />
                  <span className="text-sm font-medium text-gray-700">Taxes Withheld</span>
                </label>
              </div>
            </div>
          </div>

          {/* Unemployment, Disability, PFL */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">New York State Unemployment, Disability & Paid Family Leave</h2>

            <div className="space-y-6">
              {/* Unemployment */}
              <div>
                <h3 className="font-semibold mb-3">Unemployment</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Taxability
                    </label>
                    <select
                      value={settings.unemploymentTaxability}
                      onChange={(e) => setSettings({ ...settings, unemploymentTaxability: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="taxable">Taxable</option>
                      <option value="exempt">Exempt</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Worksite Code
                    </label>
                    <input
                      type="text"
                      value={settings.worksiteCode || ''}
                      onChange={(e) => setSettings({ ...settings, worksiteCode: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="Optional"
                    />
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.dependentHealthInsurance}
                        onChange={(e) => setSettings({ ...settings, dependentHealthInsurance: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Dependent Health Insurance Benefits</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Disability */}
              <div>
                <h3 className="font-semibold mb-3">Disability</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Taxability
                    </label>
                    <select
                      value={settings.disabilityTaxability}
                      onChange={(e) => setSettings({ ...settings, disabilityTaxability: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="taxable">Taxable</option>
                      <option value="exempt">Exempt</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.disabilityTaxesWithheld}
                        onChange={(e) => setSettings({ ...settings, disabilityTaxesWithheld: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Taxes Withheld</span>
                    </label>
                  </div>
                </div>
              </div>

              {/* Paid Family Leave */}
              <div>
                <h3 className="font-semibold mb-3">Paid Family Leave</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Taxability
                    </label>
                    <select
                      value={settings.paidFamilyLeaveTaxability}
                      onChange={(e) => setSettings({ ...settings, paidFamilyLeaveTaxability: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    >
                      <option value="taxable">Taxable</option>
                      <option value="exempt">Exempt</option>
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={settings.paidFamilyLeaveTaxesWithheld}
                        onChange={(e) => setSettings({ ...settings, paidFamilyLeaveTaxesWithheld: e.target.checked })}
                        className="mr-2"
                      />
                      <span className="text-sm font-medium text-gray-700">Taxes Withheld</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-4">
            <Link
              href={`/employees/${params.id}`}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors disabled:bg-gray-400"
            >
              {saving ? 'Saving...' : 'Save Tax Settings'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
