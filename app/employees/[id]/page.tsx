'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { maskSSN, maskAccountNumber, formatPhoneNumber } from '@/lib/formatting';
import EmployeeDocuments from '@/components/EmployeeDocuments';

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
  documents: Array<{
    id: string;
    documentType: string;
    fileName: string;
    filePath: string;
    fileSize: number;
    createdAt: string;
  }>;
}

export default function EmployeeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [previewDoc, setPreviewDoc] = useState<{ id: string; fileName: string; filePath: string } | null>(null);

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
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const documentType = prompt('Document type (w4, i9, license, other):') || 'other';
    const description = prompt('Description (optional):') || '';

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', documentType);
      formData.append('description', description);

      const response = await fetch(`/api/employees/${params.id}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Failed to upload document');

      fetchEmployee();
      alert('Document uploaded successfully');
    } catch (error) {
      console.error('Error uploading document:', error);
      alert('Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  const formatCurrency = (amount?: number) => {
    if (!amount) return '-';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
          <p className="text-gray-600">Loading employee...</p>
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
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
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link href="/employees" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
            ← Back to Employees
          </Link>
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-3xl font-bold">
                {employee.firstName} {employee.lastName}
              </h1>
              <p className="text-gray-600 mt-1">
                {employee.position} • Employee #{employee.employeeNumber}
              </p>
              <div className="flex gap-2 mt-2">
                <span
                  className={`px-3 py-1 text-sm font-semibold rounded-full ${
                    employee.isActive
                      ? 'bg-green-100 text-green-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {employee.isActive ? 'Active' : 'Inactive'}
                </span>
                <span className="px-3 py-1 text-sm font-semibold rounded-full bg-blue-100 text-blue-800 capitalize">
                  {employee.employmentType.replace('-', ' ')}
                </span>
              </div>
            </div>
            <Link
              href={`/employees/${employee.id}/edit`}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Edit Employee
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Personal Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Personal Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Email</p>
                  <p className="font-medium">{employee.email || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Phone</p>
                  <p className="font-medium">{employee.phone ? formatPhoneNumber(employee.phone) : '-'}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-gray-600">Address</p>
                  <p className="font-medium">
                    {employee.address
                      ? `${employee.address}, ${employee.city}, ${employee.state} ${employee.zipCode}`
                      : '-'}
                  </p>
                </div>
              </div>
            </div>

            {/* Employment Details */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Employment Details</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Department</p>
                  <p className="font-medium">{employee.department || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Hire Date</p>
                  <p className="font-medium">
                    {new Date(employee.hireDate).toLocaleDateString()}
                  </p>
                </div>
                {employee.terminationDate && (
                  <div className="col-span-2">
                    <p className="text-sm text-gray-600">Termination Date</p>
                    <p className="font-medium">
                      {new Date(employee.terminationDate).toLocaleDateString()}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Pay Information */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Pay Information</h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-600">Pay Type</p>
                  <p className="font-medium capitalize">{employee.payType}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">
                    {employee.payType === 'hourly' ? 'Hourly Rate' : 'Annual Salary'}
                  </p>
                  <p className="font-medium">
                    {employee.payType === 'hourly'
                      ? formatCurrency(employee.hourlyRate)
                      : formatCurrency(employee.annualSalary)}
                  </p>
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
                  Edit Tax Settings →
                </Link>
              </div>

              {/* Federal Tax */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase">Federal Tax</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">SSN</p>
                    <p className="font-medium">{employee.taxId ? maskSSN(employee.taxId) : '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">W4 Form Type</p>
                    <p className="font-medium capitalize">
                      {employee.w4FormType?.replace('_', ' & ') || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">W4 Filing Status</p>
                    <p className="font-medium capitalize">
                      {employee.w4FilingStatus?.replace('_', ' ') || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">W4 Allowances</p>
                    <p className="font-medium">{employee.w4Allowances ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Additional Withholding</p>
                    <p className="font-medium">{formatCurrency(employee.additionalWithholding)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Withholding %</p>
                    <p className="font-medium">
                      {employee.additionalWithholdingPercentage ? `${employee.additionalWithholdingPercentage}%` : '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Federal Taxability</p>
                    <p className="font-medium capitalize">{employee.federalTaxability || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Residency</p>
                    <p className="font-medium capitalize">{employee.federalResidency || '-'}</p>
                  </div>
                </div>
              </div>

              {/* Social Security & Medicare */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase">Social Security & Medicare</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Social Security Taxability</p>
                    <p className="font-medium capitalize">{employee.socialSecurityTaxability || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Medicare Taxability</p>
                    <p className="font-medium capitalize">{employee.medicareTaxability || '-'}</p>
                  </div>
                </div>
              </div>

              {/* State Tax (NY) */}
              <div className="mb-6">
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase">NY State Income Tax</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Filing Status</p>
                    <p className="font-medium capitalize">
                      {employee.stateFilingStatus?.replace('_', ' ') || '-'}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Residency</p>
                    <p className="font-medium capitalize">{employee.stateResidency || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Allowances</p>
                    <p className="font-medium">{employee.stateAllowances ?? '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Taxability</p>
                    <p className="font-medium capitalize">{employee.stateTaxability || '-'}</p>
                  </div>
                </div>
              </div>

              {/* State Programs */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3 uppercase">NY State Programs</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Unemployment Taxability</p>
                    <p className="font-medium capitalize">{employee.unemploymentTaxability || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Disability Taxability</p>
                    <p className="font-medium capitalize">{employee.disabilityTaxability || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Paid Family Leave</p>
                    <p className="font-medium capitalize">{employee.paidFamilyLeaveTaxability || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Dependent Health Insurance</p>
                    <p className="font-medium">{employee.dependentHealthInsurance ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Payment Method */}
            {employee.paymentInfo && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Payment Method</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Method</p>
                    <p className="font-medium capitalize">
                      {employee.paymentInfo.paymentMethod.replace('_', ' ')}
                    </p>
                  </div>
                  {employee.paymentInfo.paymentMethod === 'direct_deposit' && (
                    <>
                      <div>
                        <p className="text-sm text-gray-600">Bank</p>
                        <p className="font-medium">{employee.paymentInfo.bankName || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Account Type</p>
                        <p className="font-medium capitalize">
                          {employee.paymentInfo.accountType || '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-600">Account Number</p>
                        <p className="font-medium">
                          {employee.paymentInfo.accountNumber
                            ? maskAccountNumber(employee.paymentInfo.accountNumber)
                            : '-'}
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            {/* Emergency Contact */}
            {employee.emergencyContact && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-xl font-semibold mb-4">Emergency Contact</h2>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Name</p>
                    <p className="font-medium">{employee.emergencyContact.name}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Relationship</p>
                    <p className="font-medium">{employee.emergencyContact.relationship}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Phone</p>
                    <p className="font-medium">{formatPhoneNumber(employee.emergencyContact.phone)}</p>
                  </div>
                  {employee.emergencyContact.alternatePhone && (
                    <div>
                      <p className="text-sm text-gray-600">Alternate Phone</p>
                      <p className="font-medium">{formatPhoneNumber(employee.emergencyContact.alternatePhone)}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Documents - reorganized order */}
            <EmployeeDocuments
              employeeId={employee.id}
              employeeName={`${employee.firstName} ${employee.lastName}`}
              documents={employee.documents}
              onDocumentUploaded={fetchEmployee}
              layout="sidebar"
            />
          </div>
        </div>

        {/* Document Preview Modal */}
        {previewDoc && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={() => setPreviewDoc(null)}
          >
            <div
              className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Modal Header */}
              <div className="flex justify-between items-center p-4 border-b">
                <h3 className="text-lg font-semibold truncate pr-4">{previewDoc.fileName}</h3>
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="text-gray-500 hover:text-gray-700 text-2xl leading-none"
                >
                  ×
                </button>
              </div>

              {/* Modal Body - Document Preview */}
              <div className="flex-1 overflow-auto p-4 bg-gray-50">
                {previewDoc.fileName.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                  // Image preview
                  <img
                    src={`/api/${previewDoc.filePath.replace(/\\/g, '/')}`}
                    alt={previewDoc.fileName}
                    className="max-w-full h-auto mx-auto"
                  />
                ) : previewDoc.fileName.match(/\.pdf$/i) ? (
                  // PDF preview
                  <iframe
                    src={`/api/${previewDoc.filePath.replace(/\\/g, '/')}`}
                    className="w-full h-[600px] border-0"
                    title={previewDoc.fileName}
                  />
                ) : (
                  // Other file types - show info
                  <div className="text-center py-12">
                    <p className="text-gray-600 mb-4">Preview not available for this file type</p>
                    <p className="text-sm text-gray-500">{previewDoc.fileName}</p>
                  </div>
                )}
              </div>

              {/* Modal Footer */}
              <div className="flex justify-end gap-3 p-4 border-t bg-gray-50">
                <button
                  onClick={() => setPreviewDoc(null)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Close
                </button>
                <a
                  href={`/api/${previewDoc.filePath.replace(/\\/g, '/')}`}
                  download={previewDoc.fileName}
                  className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Download
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
