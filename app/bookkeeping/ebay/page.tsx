'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeftIcon, ArrowUpTrayIcon, TrashIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface EbaySale {
  id: string;
  orderDate: string;
  orderNumber: string;
  itemId: string;
  itemTitle: string;
  buyerName: string | null;
  shipToCity: string | null;
  shipToState: string | null;
  quantity: number;
  itemPrice: number;
  itemSubtotal: number;
  shippingAmount: number;
  discountAmount: number;
  grossAmount: number;
  totalFees: number;
  netAmount: number;
  importBatch: string;
  journalEntry: { id: string; entryNumber: number; status: string } | null;
}

interface Batch {
  name: string;
  count: number;
  grossAmount: number;
  totalFees: number;
  netAmount: number;
}

interface Totals {
  count: number;
  grossAmount: number;
  totalFees: number;
  netAmount: number;
  itemSubtotal: number;
  shippingAmount: number;
  discountAmount: number;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function getLast24MonthsRange(): { startDate: string; endDate: string } {
  const now = new Date();
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0); // End of current month
  const startDate = new Date(now.getFullYear() - 2, now.getMonth(), 1); // 24 months ago
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0],
  };
}

function getSuggestedBatchName(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `ebay-${year}-${month}`;
}

export default function EbaySalesPage() {
  const [sales, setSales] = useState<EbaySale[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters - default to last 24 months to show historical data
  const { startDate: defaultStart, endDate: defaultEnd } = getLast24MonthsRange();
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [selectedBatch, setSelectedBatch] = useState<string>('');

  // Upload state
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [batchName, setBatchName] = useState(getSuggestedBatchName());
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    partialSuccess?: boolean;
    imported?: number;
    skipped?: number;
    errors?: Array<{ row: number; message: string }>;
    failedDays?: Array<{ dateKey: string; error: string }>;
    journalEntriesCreated?: number;
    totals?: { grossAmount: number; totalFees: number; netAmount: number };
  } | null>(null);

  // Batch expansion state
  const [expandedBatches, setExpandedBatches] = useState<Set<string>>(new Set());

  // Delete state
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchSales = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (selectedBatch) params.set('importBatch', selectedBatch);
      params.set('limit', '100');

      const res = await fetch(`/api/bookkeeping/ebay/sales?${params}`);
      if (!res.ok) {
        throw new Error('Failed to fetch sales');
      }
      const data = await res.json();
      setSales(data.sales);
      setBatches(data.batches);
      setTotals(data.totals);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, selectedBatch]);

  useEffect(() => {
    fetchSales();
  }, [fetchSales]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadFile || !batchName.trim()) return;

    setUploading(true);
    setUploadResult(null);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('batchName', batchName.trim());

      const res = await fetch('/api/bookkeeping/ebay/import', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok && !data.partialSuccess) {
        setError(data.error || 'Upload failed');
        setUploadResult({ success: false });
      } else {
        setUploadResult({
          success: data.success,
          partialSuccess: data.partialSuccess,
          imported: data.imported,
          skipped: data.skipped,
          errors: data.errors,
          failedDays: data.failedDays,
          journalEntriesCreated: data.journalEntriesCreated,
          totals: data.totals,
        });
        // Clear form and refresh if any imports succeeded
        if (data.imported > 0) {
          setUploadFile(null);
          const fileInput = document.getElementById('csv-file') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
          fetchSales();
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
      setUploadResult({ success: false });
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteBatch = async (batchToDelete: string) => {
    if (deleteConfirm !== batchToDelete) {
      setDeleteConfirm(batchToDelete);
      return;
    }

    setDeletingBatch(batchToDelete);
    setError(null);

    try {
      const res = await fetch(`/api/bookkeeping/ebay/import/${encodeURIComponent(batchToDelete)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Delete failed');
      }

      setDeleteConfirm(null);
      fetchSales();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeletingBatch(null);
    }
  };

  const toggleBatchExpanded = (batchName: string) => {
    setExpandedBatches((prev) => {
      const next = new Set(prev);
      if (next.has(batchName)) {
        next.delete(batchName);
      } else {
        next.add(batchName);
      }
      return next;
    });
  };

  // Group sales by batch
  const salesByBatch = sales.reduce((acc, sale) => {
    if (!acc[sale.importBatch]) {
      acc[sale.importBatch] = [];
    }
    acc[sale.importBatch].push(sale);
    return acc;
  }, {} as Record<string, EbaySale[]>);

  // Monthly summary - group by actual sale orderDate, not batch name
  const monthlySummary = sales.reduce((acc, sale) => {
    // Extract YYYY-MM from orderDate
    const date = new Date(sale.orderDate);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    if (!acc[key]) {
      acc[key] = { count: 0, grossAmount: 0, totalFees: 0, netAmount: 0 };
    }
    acc[key].count += 1;
    acc[key].grossAmount += sale.grossAmount;
    acc[key].totalFees += sale.totalFees;
    acc[key].netAmount += sale.netAmount;
    return acc;
  }, {} as Record<string, { count: number; grossAmount: number; totalFees: number; netAmount: number }>);

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/bookkeeping"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-4"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-1" />
            Back to Bookkeeping
          </Link>
          <h1 className="text-3xl font-bold mb-2 text-gray-900">eBay Sales</h1>
          <p className="text-gray-600">
            Import and manage eBay sales from CSV exports
          </p>
        </div>

        {/* Error display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
            {error}
          </div>
        )}

        {/* Import Section */}
        <div className="bg-white rounded-lg shadow mb-8 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center text-gray-900">
            <ArrowUpTrayIcon className="h-5 w-5 mr-2 text-blue-600" />
            Import CSV
          </h2>

          <form onSubmit={handleUpload} className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <label htmlFor="csv-file" className="block text-sm font-medium text-gray-700 mb-1">
                CSV File
              </label>
              <input
                id="csv-file"
                type="file"
                accept=".csv,.txt"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            <div className="w-48">
              <label htmlFor="batch-name" className="block text-sm font-medium text-gray-700 mb-1">
                Batch Name
              </label>
              <input
                id="batch-name"
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="ebay-2025-01"
                className="block w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={!uploadFile || !batchName.trim() || uploading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </form>

          {/* Upload result */}
          {uploadResult && (uploadResult.success || uploadResult.partialSuccess) && (
            <div className={`mt-4 p-4 rounded-lg ${uploadResult.partialSuccess ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
              <p className={`font-medium ${uploadResult.partialSuccess ? 'text-yellow-800' : 'text-green-800'}`}>
                {uploadResult.partialSuccess ? 'Partial import completed' : 'Import successful!'}
              </p>
              <ul className={`mt-2 text-sm ${uploadResult.partialSuccess ? 'text-yellow-700' : 'text-green-700'}`}>
                <li>Imported: {uploadResult.imported} sales</li>
                {uploadResult.skipped! > 0 && (
                  <li>Skipped (duplicates): {uploadResult.skipped}</li>
                )}
                <li>Journal entries created: {uploadResult.journalEntriesCreated}</li>
                {uploadResult.totals && (
                  <>
                    <li>Total gross: {formatCurrency(uploadResult.totals.grossAmount)}</li>
                    <li>Total fees: {formatCurrency(uploadResult.totals.totalFees)}</li>
                    <li>Total net: {formatCurrency(uploadResult.totals.netAmount)}</li>
                  </>
                )}
              </ul>
              {uploadResult.failedDays && uploadResult.failedDays.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-red-700">Failed days (try re-importing these):</p>
                  <ul className="text-sm text-red-600">
                    {uploadResult.failedDays.map((day, i) => (
                      <li key={i}>{day.dateKey}: {day.error}</li>
                    ))}
                  </ul>
                </div>
              )}
              {uploadResult.errors && uploadResult.errors.length > 0 && (
                <div className="mt-2">
                  <p className="text-sm font-medium text-yellow-700">Parse warnings:</p>
                  <ul className="text-sm text-yellow-600">
                    {uploadResult.errors.map((err, i) => (
                      <li key={i}>Row {err.row}: {err.message}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow mb-6 p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label htmlFor="start-date" className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="end-date" className="block text-sm font-medium text-gray-700 mb-1">
                End Date
              </label>
              <input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label htmlFor="batch-filter" className="block text-sm font-medium text-gray-700 mb-1">
                Import Batch
              </label>
              <select
                id="batch-filter"
                value={selectedBatch}
                onChange={(e) => setSelectedBatch(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">All batches</option>
                {batches.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name} ({b.count} sales)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => {
                setStartDate(defaultStart);
                setEndDate(defaultEnd);
                setSelectedBatch('');
              }}
              className="px-4 py-2 text-gray-600 hover:text-gray-800"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Loading state */}
        {loading && (
          <div className="text-center py-12 text-gray-500">Loading...</div>
        )}

        {/* Sales Table */}
        {!loading && sales.length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden mb-8">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Sales ({totals?.count || 0})</h2>
            </div>

            {/* Group by batch */}
            {Object.entries(salesByBatch).map(([batch, batchSales]) => {
              const isExpanded = expandedBatches.has(batch);
              const batchTotals = batchSales.reduce(
                (acc, s) => ({
                  gross: acc.gross + s.grossAmount,
                  fees: acc.fees + s.totalFees,
                  net: acc.net + s.netAmount,
                }),
                { gross: 0, fees: 0, net: 0 }
              );

              return (
                <div key={batch} className="border-b border-gray-200 last:border-b-0">
                  {/* Batch header */}
                  <div className="px-6 py-3 bg-gray-50 flex items-center justify-between">
                    <button
                      onClick={() => toggleBatchExpanded(batch)}
                      className="flex items-center text-sm font-medium text-gray-700 hover:text-gray-900"
                    >
                      {isExpanded ? (
                        <ChevronUpIcon className="h-4 w-4 mr-2" />
                      ) : (
                        <ChevronDownIcon className="h-4 w-4 mr-2" />
                      )}
                      {batch} ({batchSales.length} sales)
                    </button>

                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-600">
                        Gross: {formatCurrency(batchTotals.gross)} |
                        Fees: {formatCurrency(batchTotals.fees)} |
                        Net: {formatCurrency(batchTotals.net)}
                      </span>

                      {deleteConfirm === batch ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-red-600">Delete this batch?</span>
                          <button
                            onClick={() => handleDeleteBatch(batch)}
                            disabled={deletingBatch === batch}
                            className="px-2 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-400"
                          >
                            {deletingBatch === batch ? 'Deleting...' : 'Yes'}
                          </button>
                          <button
                            onClick={() => setDeleteConfirm(null)}
                            className="px-2 py-1 text-sm text-gray-600 hover:text-gray-800"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(batch)}
                          className="p-1 text-gray-400 hover:text-red-600"
                          title="Delete batch"
                        >
                          <TrashIcon className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Sales rows */}
                  {isExpanded && (
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Date
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Order #
                          </th>
                          <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Item Title
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Qty
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Item Price
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Shipping
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Fees
                          </th>
                          <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Net
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {batchSales.map((sale) => (
                          <tr key={sale.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {formatDate(sale.orderDate)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {sale.orderNumber}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-900 max-w-xs truncate" title={sale.itemTitle}>
                              {sale.itemTitle}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                              {sale.quantity}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                              {formatCurrency(sale.itemPrice)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                              {formatCurrency(sale.shippingAmount)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">
                              -{formatCurrency(sale.totalFees)}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600 text-right">
                              {formatCurrency(sale.netAmount)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}

            {/* Summary row */}
            {totals && (
              <div className="px-6 py-4 bg-gray-100 border-t-2 border-gray-300">
                <div className="flex justify-end gap-8">
                  <span className="text-sm font-medium text-gray-700">
                    Total Gross: <span className="text-gray-900">{formatCurrency(totals.grossAmount)}</span>
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    Total Fees: <span className="text-red-600">-{formatCurrency(totals.totalFees)}</span>
                  </span>
                  <span className="text-sm font-medium text-gray-700">
                    Total Net: <span className="text-green-600">{formatCurrency(totals.netAmount)}</span>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Empty state */}
        {!loading && sales.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <p className="text-gray-500">No eBay sales found for the selected filters.</p>
            <p className="text-sm text-gray-400 mt-2">Upload a CSV file to import sales.</p>
          </div>
        )}

        {/* Monthly Summary */}
        {Object.keys(monthlySummary).length > 0 && (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Monthly Summary</h2>
            </div>
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Month
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    # Sales
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Gross Revenue
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total Fees
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Net Revenue
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {Object.entries(monthlySummary)
                  .sort((a, b) => b[0].localeCompare(a[0]))
                  .map(([month, data]) => {
                    const [year, monthNum] = month.split('-');
                    const monthName = new Date(Date.UTC(parseInt(year), parseInt(monthNum) - 1, 15)).toLocaleDateString('en-US', {
                      month: 'long',
                      year: 'numeric',
                      timeZone: 'UTC',
                    });
                    return (
                      <tr key={month} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {monthName}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {data.count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          {formatCurrency(data.grossAmount)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">
                          -{formatCurrency(data.totalFees)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600 text-right">
                          {formatCurrency(data.netAmount)}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
