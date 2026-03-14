'use client';

import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';

export default function AuditTrailPage() {
  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
          <MagnifyingGlassIcon className="h-16 w-16 text-gray-300 mx-auto mb-6" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Audit Trail</h1>
          <p className="text-gray-500 text-lg">Coming Soon</p>
          <p className="text-gray-400 mt-4 text-sm">
            This feature will provide a detailed log of all system activities, changes, and user actions.
          </p>
        </div>
      </div>
    </div>
  );
}
