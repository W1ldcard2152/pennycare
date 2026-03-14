'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  ChevronUpIcon,
  XMarkIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface AuditEntry {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  userEmail: string | null;
  action: string;
  entityType: string;
  entityId: string;
  metadata: Record<string, unknown> | null;
  changes: Record<string, { old: unknown; new: unknown }> | null;
}

interface AuditResponse {
  entries: AuditEntry[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  summary: {
    totalEntries: number;
    lastActivity: string | null;
  };
  filters: {
    actions: string[];
    entityTypes: string[];
    users: { id: string; name: string; email: string }[];
  };
}

function formatTimestamp(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'UTC',
  });
}

function formatDateInput(date: Date): string {
  return date.toISOString().split('T')[0];
}

function getActionColor(action: string): string {
  if (action.includes('import') || action.includes('ebay') || action.includes('statement')) {
    return 'bg-blue-100 text-blue-800';
  }
  if (action.includes('journal') || action.includes('void')) {
    return 'bg-purple-100 text-purple-800';
  }
  if (action.includes('payroll')) {
    return 'bg-green-100 text-green-800';
  }
  if (action.includes('reconciliation')) {
    return 'bg-teal-100 text-teal-800';
  }
  if (action.includes('employee') || action.includes('deduction')) {
    return 'bg-orange-100 text-orange-800';
  }
  if (action.includes('vendor') || action.includes('expense')) {
    return 'bg-amber-100 text-amber-800';
  }
  if (action.includes('account') || action.includes('rule')) {
    return 'bg-indigo-100 text-indigo-800';
  }
  return 'bg-gray-100 text-gray-800';
}

function getEntityLink(entityType: string, entityId: string): string | null {
  const idLooksValid = entityId && entityId !== 'N/A' && !entityId.includes(',');

  switch (entityType) {
    case 'JournalEntry':
      return idLooksValid ? `/bookkeeping/journal-entries/${entityId}` : null;
    case 'Account':
      return idLooksValid ? `/bookkeeping/accounts/${entityId}` : null;
    case 'Employee':
      return idLooksValid ? `/employees/${entityId}` : null;
    case 'PayrollRecord':
      return idLooksValid ? `/payroll/pay-stub/${entityId}` : null;
    case 'Reconciliation':
      return idLooksValid ? `/bookkeeping/reconciliation/${entityId}` : null;
    default:
      return null;
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return value.toLocaleString();
    return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (typeof value === 'string') {
    // Try to detect and format dates
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      try {
        const date = new Date(value);
        if (!isNaN(date.getTime())) {
          return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            timeZone: 'UTC',
          });
        }
      } catch {
        // Not a date, return as-is
      }
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => formatValue(v)).join(', ');
  }
  if (typeof value === 'object') {
    return JSON.stringify(value);
  }
  return String(value);
}

function formatActionLabel(action: string): string {
  return action
    .split(/[._]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export default function AuditTrailPage() {
  const [data, setData] = useState<AuditResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return formatDateInput(d);
  });
  const [endDate, setEndDate] = useState(() => formatDateInput(new Date()));
  const [selectedAction, setSelectedAction] = useState('');
  const [selectedEntityType, setSelectedEntityType] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [searchText, setSearchText] = useState('');
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Expanded rows
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  const fetchAuditLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (selectedAction) params.set('action', selectedAction);
      if (selectedEntityType) params.set('entityType', selectedEntityType);
      if (selectedUser) params.set('userId', selectedUser);
      if (searchText) params.set('search', searchText);
      params.set('page', String(page));
      params.set('limit', String(limit));

      const res = await fetch(`/api/admin/audit?${params.toString()}`);
      if (!res.ok) {
        if (res.status === 401) {
          window.location.href = '/login';
          return;
        }
        if (res.status === 403) {
          throw new Error('You do not have permission to view the audit trail');
        }
        throw new Error('Failed to load audit logs');
      }

      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load audit logs');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedAction, selectedEntityType, selectedUser, searchText, page, limit]);

  useEffect(() => {
    fetchAuditLogs();
  }, [fetchAuditLogs]);

  const clearFilters = () => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    setStartDate(formatDateInput(d));
    setEndDate(formatDateInput(new Date()));
    setSelectedAction('');
    setSelectedEntityType('');
    setSelectedUser('');
    setSearchText('');
    setPage(1);
  };

  const toggleRow = (id: string) => {
    setExpandedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const hasActiveFilters =
    selectedAction || selectedEntityType || selectedUser || searchText;

  if (error) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
            <h2 className="text-lg font-semibold text-red-800">Error</h2>
            <p className="text-red-600 mt-2">{error}</p>
            <button
              onClick={fetchAuditLogs}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">
              Dashboard
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600 text-sm">Audit Trail</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Audit Trail</h1>
          <p className="text-gray-600 mt-1">View all system activities and changes</p>
        </div>

        {/* Summary Stats */}
        {data && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
              <div className="flex items-center">
                <MagnifyingGlassIcon className="h-8 w-8 text-blue-500" />
                <div className="ml-3">
                  <p className="text-sm text-gray-500">Total Entries</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {data.summary.totalEntries.toLocaleString()}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow border border-gray-200 p-4">
              <div className="flex items-center">
                <ClockIcon className="h-8 w-8 text-green-500" />
                <div className="ml-3">
                  <p className="text-sm text-gray-500">Last Activity</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {data.summary.lastActivity
                      ? formatTimestamp(data.summary.lastActivity)
                      : 'No activity'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="bg-white rounded-lg shadow border border-gray-200 p-4 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FunnelIcon className="h-5 w-5 text-gray-500" />
            <h2 className="font-semibold text-gray-900">Filters</h2>
            {hasActiveFilters && (
              <button
                onClick={clearFilters}
                className="ml-auto flex items-center text-sm text-gray-500 hover:text-gray-700"
              >
                <XMarkIcon className="h-4 w-4 mr-1" />
                Clear Filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
            {/* Date Range */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              />
            </div>

            {/* Action Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
              <select
                value={selectedAction}
                onChange={(e) => {
                  setSelectedAction(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                <option value="">All Actions</option>
                {data?.filters.actions.map((action) => (
                  <option key={action} value={action}>
                    {formatActionLabel(action)}
                  </option>
                ))}
              </select>
            </div>

            {/* Entity Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Entity Type</label>
              <select
                value={selectedEntityType}
                onChange={(e) => {
                  setSelectedEntityType(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                <option value="">All Types</option>
                {data?.filters.entityTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* User Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
              <select
                value={selectedUser}
                onChange={(e) => {
                  setSelectedUser(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-900"
              >
                <option value="">All Users</option>
                {data?.filters.users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Search */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => {
                    setSearchText(e.target.value);
                    setPage(1);
                  }}
                  placeholder="Search..."
                  className="w-full rounded-md border border-gray-300 px-3 py-2 pr-8 text-sm text-gray-900"
                />
                <MagnifyingGlassIcon className="absolute right-2 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>
        </div>

        {/* Results Table */}
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
              <p className="mt-4 text-gray-500">Loading audit logs...</p>
            </div>
          ) : data?.entries.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              <MagnifyingGlassIcon className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p className="text-lg font-medium">No audit entries found</p>
              <p className="mt-1 text-sm">Try adjusting your filters or date range</p>
            </div>
          ) : (
            <>
              {/* Table */}
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="w-8 px-4 py-3" />
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Timestamp
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        User
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Action
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Entity Type
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Entity ID
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {data?.entries.map((entry) => {
                      const isExpanded = expandedRows.has(entry.id);
                      const entityLink = getEntityLink(entry.entityType, entry.entityId);
                      const hasDetails =
                        (entry.metadata && Object.keys(entry.metadata).length > 0) ||
                        (entry.changes && Object.keys(entry.changes).length > 0);

                      return (
                        <tr key={entry.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            {hasDetails && (
                              <button
                                onClick={() => toggleRow(entry.id)}
                                className="p-1 text-gray-400 hover:text-gray-600"
                              >
                                {isExpanded ? (
                                  <ChevronUpIcon className="h-4 w-4" />
                                ) : (
                                  <ChevronDownIcon className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                            {formatTimestamp(entry.timestamp)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div className="font-medium text-gray-900">{entry.userName}</div>
                            {entry.userEmail && (
                              <div className="text-xs text-gray-500">{entry.userEmail}</div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getActionColor(
                                entry.action
                              )}`}
                            >
                              {formatActionLabel(entry.action)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-900">{entry.entityType}</td>
                          <td className="px-4 py-3 text-sm">
                            {entityLink ? (
                              <Link
                                href={entityLink}
                                className="text-blue-600 hover:text-blue-700 font-mono text-xs"
                              >
                                {entry.entityId.length > 20
                                  ? `${entry.entityId.slice(0, 20)}...`
                                  : entry.entityId}
                              </Link>
                            ) : (
                              <span className="text-gray-500 font-mono text-xs">
                                {entry.entityId.length > 20
                                  ? `${entry.entityId.slice(0, 20)}...`
                                  : entry.entityId}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Expanded Details (rendered outside table for layout) */}
              {data?.entries.map((entry) => {
                const isExpanded = expandedRows.has(entry.id);
                if (!isExpanded) return null;

                return (
                  <div
                    key={`${entry.id}-details`}
                    className="border-t border-gray-200 bg-gray-50 px-6 py-4"
                  >
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Metadata */}
                      {entry.metadata && Object.keys(entry.metadata).length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Details</h4>
                          <dl className="space-y-1">
                            {Object.entries(entry.metadata).map(([key, value]) => (
                              <div key={key} className="flex">
                                <dt className="text-sm text-gray-500 w-40 flex-shrink-0">
                                  {key
                                    .replace(/([A-Z])/g, ' $1')
                                    .replace(/^./, (s) => s.toUpperCase())}
                                  :
                                </dt>
                                <dd className="text-sm text-gray-900">{formatValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}

                      {/* Changes */}
                      {entry.changes && Object.keys(entry.changes).length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold text-gray-700 mb-2">Changes</h4>
                          <dl className="space-y-2">
                            {Object.entries(entry.changes).map(([field, change]) => (
                              <div key={field} className="border-l-2 border-amber-300 pl-3">
                                <dt className="text-sm font-medium text-gray-700">
                                  {field
                                    .replace(/([A-Z])/g, ' $1')
                                    .replace(/^./, (s) => s.toUpperCase())}
                                </dt>
                                <dd className="text-sm">
                                  <span className="text-red-600 line-through">
                                    {formatValue(change.old)}
                                  </span>
                                  <span className="mx-2 text-gray-400">&rarr;</span>
                                  <span className="text-green-600">{formatValue(change.new)}</span>
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Pagination */}
              {data && data.pagination.totalPages > 0 && (
                <div className="bg-gray-50 border-t border-gray-200 px-4 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-sm text-gray-700">
                      Showing{' '}
                      <span className="font-medium">
                        {(data.pagination.page - 1) * data.pagination.limit + 1}
                      </span>{' '}
                      to{' '}
                      <span className="font-medium">
                        {Math.min(
                          data.pagination.page * data.pagination.limit,
                          data.pagination.total
                        )}
                      </span>{' '}
                      of <span className="font-medium">{data.pagination.total}</span> entries
                    </span>
                    <select
                      value={limit}
                      onChange={(e) => {
                        setLimit(parseInt(e.target.value, 10));
                        setPage(1);
                      }}
                      className="rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900"
                    >
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                      <option value={100}>100 per page</option>
                    </select>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeftIcon className="h-4 w-4 mr-1" />
                      Previous
                    </button>
                    <span className="text-sm text-gray-700">
                      Page {data.pagination.page} of {data.pagination.totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(data.pagination.totalPages, p + 1))}
                      disabled={page >= data.pagination.totalPages}
                      className="inline-flex items-center px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                      <ChevronRightIcon className="h-4 w-4 ml-1" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
