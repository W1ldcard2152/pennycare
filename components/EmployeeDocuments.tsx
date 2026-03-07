'use client';

import { useState } from 'react';
import Link from 'next/link';
import { DOCUMENT_TYPES, getRequiredDocumentTypes } from '@/lib/documentTypes';
import { ExclamationTriangleIcon, CheckCircleIcon, DocumentIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface Document {
  id: string;
  documentType: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  createdAt: string;
  description?: string;
}

interface EmployeeDocumentsProps {
  employeeId: string;
  employeeName: string;
  documents: Document[];
  onDocumentUploaded: () => void;
  layout?: 'sidebar' | 'full';
}

export default function EmployeeDocuments({
  employeeId,
  employeeName,
  documents,
  onDocumentUploaded,
  layout = 'full',
}: EmployeeDocumentsProps) {
  const [selectedDocType, setSelectedDocType] = useState('');
  const [documentDate, setDocumentDate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [showAllDocuments, setShowAllDocuments] = useState(false);

  // Get missing required documents
  const requiredTypes = getRequiredDocumentTypes();
  const missingRequired = requiredTypes.filter(
    (type) => !documents.some((doc) => doc.documentType === type.id)
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setError('');
    }
  };

  const handleUpload = async () => {
    if (!selectedFile || !selectedDocType || !documentDate) {
      setError('Please select a file, document type, and document date');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('documentType', selectedDocType);
      formData.append('documentDate', documentDate);

      const res = await fetch(`/api/employees/${employeeId}/documents`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to upload document');
      }

      // Reset form
      setSelectedFile(null);
      setSelectedDocType('');
      setDocumentDate('');
      setError('');

      // Notify parent to refresh
      onDocumentUploaded();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload document');
    } finally {
      setUploading(false);
    }
  };

  // Group documents by type
  const documentsByType = documents.reduce((acc, doc) => {
    if (!acc[doc.documentType]) {
      acc[doc.documentType] = [];
    }
    acc[doc.documentType].push(doc);
    return acc;
  }, {} as Record<string, Document[]>);

  if (layout === 'sidebar') {
    return (
      <>
        {/* 1. Missing Required Documents Warning */}
        {missingRequired.length > 0 && (
          <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4">
            <div className="flex items-start">
              <ExclamationTriangleIcon className="h-5 w-5 text-red-600 flex-shrink-0" />
              <div className="ml-3">
                <h3 className="text-sm font-semibold text-red-800">Missing Required Documents</h3>
                <ul className="mt-2 space-y-1">
                  {missingRequired.map((type) => (
                    <li key={type.id} className="text-xs text-red-700">
                      {type.label}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* 2. Quick Actions */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
          <div className="space-y-2">
            <Link
              href={`/payroll/time-entry?employee=${employeeId}`}
              className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Add Time Entry
            </Link>
            <Link
              href={`/payroll/run?employee=${employeeId}`}
              className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              Run Payroll
            </Link>
            <Link
              href={`/employees/${employeeId}/history`}
              className="block w-full text-left px-4 py-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors"
            >
              View Pay History
            </Link>
          </div>
        </div>

        {/* 3. Upload Documents */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
          <h3 className="mb-4 text-lg font-semibold text-gray-900">Upload Document</h3>

          <div className="space-y-3">
            {/* Document Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Document Type <span className="text-red-600">*</span>
              </label>
              <select
                value={selectedDocType}
                onChange={(e) => setSelectedDocType(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">Select type...</option>
                {DOCUMENT_TYPES.map((type) => (
                  <option key={type.id} value={type.id}>
                    {type.label} {type.required && '(Required)'}
                  </option>
                ))}
              </select>
            </div>

            {/* Document Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Document Date <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                value={documentDate}
                onChange={(e) => setDocumentDate(e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>

            {/* File Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Select File <span className="text-red-600">*</span>
              </label>
              <input
                type="file"
                onChange={handleFileSelect}
                accept=".pdf,.jpg,.jpeg,.png,.gif,.doc,.docx"
                className="mt-1 block w-full text-sm text-gray-500 file:mr-4 file:rounded-md file:border-0 file:bg-blue-50 file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-blue-700 hover:file:bg-blue-100"
              />
              {selectedFile && (
                <p className="mt-1 text-xs text-gray-600">
                  {selectedFile.name}
                </p>
              )}
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-2 text-xs text-red-800">
                {error}
              </div>
            )}

            <button
              onClick={handleUpload}
              disabled={uploading || !selectedFile || !selectedDocType || !documentDate}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:bg-gray-400"
            >
              {uploading ? 'Uploading...' : 'Upload Document'}
            </button>
          </div>
        </div>

        {/* 4. Employee Documents (Toggleable) */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow">
          <button
            onClick={() => setShowAllDocuments(!showAllDocuments)}
            className="flex w-full items-center justify-between text-left"
          >
            <h3 className="text-lg font-semibold text-gray-900">
              Employee Documents ({documents.length})
            </h3>
            {showAllDocuments ? (
              <ChevronUpIcon className="h-5 w-5 text-gray-500" />
            ) : (
              <ChevronDownIcon className="h-5 w-5 text-gray-500" />
            )}
          </button>

          {showAllDocuments && (
            <div className="mt-4 space-y-3">
              {DOCUMENT_TYPES.map((type) => {
                const typeDocs = documentsByType[type.id] || [];
                const hasDocument = typeDocs.length > 0;

                return (
                  <div
                    key={type.id}
                    className={`rounded-lg border p-3 ${
                      !hasDocument && type.required
                        ? 'border-red-200 bg-red-50'
                        : 'border-gray-200 bg-gray-50'
                    }`}
                  >
                    <div className="flex items-start">
                      {hasDocument ? (
                        <CheckCircleIcon className="mr-2 h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                      ) : type.required ? (
                        <ExclamationTriangleIcon className="mr-2 h-4 w-4 text-red-600 flex-shrink-0 mt-0.5" />
                      ) : (
                        <DocumentIcon className="mr-2 h-4 w-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-gray-900">{type.label}</h4>

                        {/* Show uploaded documents for this type */}
                        {typeDocs.length > 0 && (
                          <div className="mt-2 space-y-1">
                            {typeDocs.map((doc) => (
                              <div
                                key={doc.id}
                                className="flex items-center justify-between rounded border border-gray-200 bg-white p-2"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900 truncate">
                                    {doc.fileName}
                                  </p>
                                  <p className="text-xs text-gray-500">
                                    {doc.description || new Date(doc.createdAt).toLocaleDateString()}
                                  </p>
                                </div>
                                <a
                                  href={`/api/${doc.filePath.replace(/\\/g, '/')}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-2 text-xs text-blue-600 hover:text-blue-800 whitespace-nowrap"
                                >
                                  View
                                </a>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </>
    );
  }

  // Full layout (original)
  return (
    <div className="space-y-6">
      {/* ... rest of original layout ... */}
    </div>
  );
}
