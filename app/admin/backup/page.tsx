'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import {
  CircleStackIcon,
  ArrowDownTrayIcon,
  TrashIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';

interface Backup {
  id: string;
  filename: string;
  fileSize: number;
  description: string | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  exists: boolean;
}

interface BackupsResponse {
  backups: Backup[];
  lastBackupDate: string | null;
}

export default function BackupRestorePage() {
  const [backups, setBackups] = useState<Backup[]>([]);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [description, setDescription] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [showClearAllConfirm, setShowClearAllConfirm] = useState(false);
  const [clearAllConfirmText, setClearAllConfirmText] = useState('');
  const [resetting, setResetting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchBackups();
  }, []);

  const fetchBackups = async () => {
    try {
      const res = await fetch('/api/admin/backup');
      if (!res.ok) throw new Error('Failed to fetch backups');
      const data: BackupsResponse = await res.json();
      setBackups(data.backups);
      setLastBackupDate(data.lastBackupDate);
    } catch {
      setError('Failed to load backups');
    } finally {
      setLoading(false);
    }
  };

  const createBackup = async () => {
    setCreating(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: description || null }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to create backup');
      }
      const data = await res.json();
      setSuccess(`Backup created: ${data.filename} (${formatFileSize(data.fileSize)})`);
      setDescription('');
      fetchBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create backup');
    } finally {
      setCreating(false);
    }
  };

  const deleteBackup = async (id: string) => {
    setError('');
    setSuccess('');
    try {
      const res = await fetch(`/api/admin/backup/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to delete backup');
      }
      setSuccess('Backup deleted');
      setShowDeleteConfirm(null);
      fetchBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete backup');
    }
  };

  const downloadBackup = (id: string) => {
    window.location.href = `/api/admin/backup/${id}/download`;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.db')) {
        setError('Please select a .db file');
        return;
      }
      setRestoreFile(file);
      setShowRestoreConfirm(true);
    }
  };

  const restoreBackup = async () => {
    if (!restoreFile) return;
    setRestoring(true);
    setError('');
    setSuccess('');
    try {
      const formData = new FormData();
      formData.append('file', restoreFile);

      const res = await fetch('/api/admin/backup/restore', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to restore backup');
      }

      setSuccess(data.message);
      setShowRestoreConfirm(false);
      setRestoreFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup');
    } finally {
      setRestoring(false);
    }
  };

  const clearAllData = async () => {
    if (clearAllConfirmText !== 'DELETE ALL DATA') {
      setError('Please type "DELETE ALL DATA" exactly to confirm');
      return;
    }
    setResetting(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch('/api/admin/backup/clear-all-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmText: clearAllConfirmText }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to clear all data');
      }

      setSuccess(data.message);
      setShowClearAllConfirm(false);
      setClearAllConfirmText('');
      // Refresh the page after a short delay to show the success message
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to clear all data');
    } finally {
      setResetting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string): string => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      timeZone: 'UTC',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getDaysSinceLastBackup = (): number | null => {
    if (!lastBackupDate) return null;
    const last = new Date(lastBackupDate);
    const now = new Date();
    const diffMs = now.getTime() - last.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  };

  const daysSinceBackup = getDaysSinceLastBackup();
  const showBackupReminder = daysSinceBackup === null || daysSinceBackup >= 7;

  if (loading) {
    return (
      <div className="min-h-screen p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-gray-600">Loading backup information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Link href="/" className="text-blue-600 hover:text-blue-700 text-sm">Dashboard</Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-600 text-sm">Backup / Restore</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Backup / Restore</h1>
          <p className="text-gray-600 mt-1">Manage database backups and restore from previous snapshots</p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <XMarkIcon className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-700">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-500 hover:text-red-700">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        )}

        {success && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
            <CheckCircleIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-green-700">{success}</p>
            </div>
            <button onClick={() => setSuccess('')} className="text-green-500 hover:text-green-700">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Backup Reminder */}
        {showBackupReminder && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
            <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              {daysSinceBackup === null ? (
                <p className="text-amber-700 font-medium">No backups found. Create your first backup now.</p>
              ) : (
                <p className="text-amber-700 font-medium">
                  Last backup was {daysSinceBackup} day{daysSinceBackup !== 1 ? 's' : ''} ago. Consider creating a backup.
                </p>
              )}
              <p className="text-amber-600 text-sm mt-1">
                Regular backups protect against data loss. We recommend backing up at least once a week.
              </p>
            </div>
          </div>
        )}

        {/* Create Backup Section */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
            <CircleStackIcon className="w-6 h-6 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Create Backup</h2>
          </div>
          <p className="text-gray-600 text-sm mb-4">
            Create a snapshot of the current database. The backup file can be downloaded and stored securely.
          </p>
          <div className="flex gap-4 items-end">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Description (optional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Before year-end closing"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
              />
            </div>
            <button
              onClick={createBackup}
              disabled={creating}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              {creating ? (
                <>
                  <ArrowPathIcon className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <CircleStackIcon className="w-4 h-4" />
                  Create Backup
                </>
              )}
            </button>
          </div>
        </div>

        {/* Backup History */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Backup History</h2>
            <p className="text-gray-600 text-sm mt-1">
              {backups.length} backup{backups.length !== 1 ? 's' : ''} found
            </p>
          </div>
          {backups.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <CircleStackIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <p>No backups yet</p>
              <p className="text-sm mt-1">Create your first backup to get started</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date / Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Filename
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Size
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Created By
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {backups.map((backup) => (
                    <tr key={backup.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(backup.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                        {backup.filename}
                        {!backup.exists && (
                          <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700 rounded">
                            File Missing
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {formatFileSize(backup.fileSize)}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                        {backup.description || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                        {backup.createdByName}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => downloadBackup(backup.id)}
                            disabled={!backup.exists}
                            className="text-blue-600 hover:text-blue-800 disabled:text-gray-400 disabled:cursor-not-allowed p-1"
                            title={backup.exists ? 'Download' : 'File not found'}
                          >
                            <ArrowDownTrayIcon className="w-5 h-5" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(backup.id)}
                            className="text-red-600 hover:text-red-800 p-1"
                            title="Delete"
                          >
                            <TrashIcon className="w-5 h-5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Restore Section */}
        <div className="bg-white rounded-lg shadow-sm border-2 border-amber-200 overflow-hidden">
          <div className="bg-amber-50 p-6 border-b border-amber-200">
            <div className="flex items-center gap-3 mb-2">
              <ExclamationTriangleIcon className="w-6 h-6 text-amber-600" />
              <h2 className="text-lg font-semibold text-gray-900">Restore from Backup</h2>
            </div>
            <p className="text-amber-700 text-sm">
              <strong>Warning:</strong> Restoring a backup will replace ALL current data.
              An automatic backup of the current database will be created before restoring.
            </p>
          </div>
          <div className="p-6">
            <p className="text-gray-600 text-sm mb-4">
              Upload a .db backup file to restore the database to a previous state.
              After restoring, you will need to restart the server.
            </p>
            <div className="flex items-center gap-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".db"
                onChange={handleFileSelect}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-amber-100 file:text-amber-700 hover:file:bg-amber-200"
              />
            </div>
          </div>
        </div>

        {/* Clear All Data Section */}
        <div className="bg-white rounded-lg shadow-sm border-2 border-red-200 overflow-hidden">
          <div className="bg-red-50 p-6 border-b border-red-200">
            <div className="flex items-center gap-3 mb-2">
              <ExclamationTriangleIcon className="w-6 h-6 text-red-600" />
              <h2 className="text-lg font-semibold text-gray-900">Clear All Data</h2>
            </div>
            <p className="text-red-700 text-sm">
              <strong>DANGER:</strong> This will permanently delete ALL business data (employees, transactions, journal entries, etc.)
              and reset the database to a fresh state. Your user account and company will be preserved.
              An automatic backup will be created first.
            </p>
          </div>
          <div className="p-6">
            <p className="text-gray-600 text-sm mb-4">
              Use this to wipe all business data and start fresh. Your account stays logged in - just refresh the page after clearing.
            </p>
            <button
              onClick={() => setShowClearAllConfirm(true)}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Clear All Data
            </button>
          </div>
        </div>

        {/* Delete Confirmation Modal */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Backup?</h3>
              <p className="text-gray-600 mb-6">
                This will permanently delete the backup file. This action cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteBackup(showDeleteConfirm)}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Restore Confirmation Modal */}
        {showRestoreConfirm && restoreFile && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <div className="flex items-center gap-3 mb-4">
                <ExclamationTriangleIcon className="w-8 h-8 text-amber-500" />
                <h3 className="text-lg font-semibold text-gray-900">Confirm Restore</h3>
              </div>
              <div className="mb-6 space-y-3">
                <p className="text-gray-600">
                  You are about to restore from: <strong className="font-mono">{restoreFile.name}</strong>
                </p>
                <p className="text-gray-600">
                  This will replace the current database with the uploaded file.
                </p>
                <p className="text-amber-600 font-medium">
                  An automatic backup will be created first. The server will need to be restarted after restore.
                </p>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowRestoreConfirm(false);
                    setRestoreFile(null);
                    if (fileInputRef.current) {
                      fileInputRef.current.value = '';
                    }
                  }}
                  disabled={restoring}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={restoreBackup}
                  disabled={restoring}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {restoring ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Restoring...
                    </>
                  ) : (
                    'Restore Database'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Clear All Data Confirmation Modal */}
        {showClearAllConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
              <div className="flex items-center gap-3 mb-4">
                <ExclamationTriangleIcon className="w-8 h-8 text-red-500" />
                <h3 className="text-lg font-semibold text-gray-900">Confirm Clear All Data</h3>
              </div>
              <div className="mb-6 space-y-3">
                <p className="text-gray-600">
                  This will <strong className="text-red-600">permanently delete ALL business data</strong> including:
                </p>
                <ul className="list-disc list-inside text-gray-600 text-sm space-y-1">
                  <li>All employees and payroll records</li>
                  <li>All journal entries and accounts</li>
                  <li>All imported transactions (eBay, statements)</li>
                  <li>All vendors and expenses</li>
                </ul>
                <p className="text-gray-600 text-sm mt-2">
                  Your user account and company settings will be preserved.
                </p>
                <p className="text-red-600 font-medium">
                  An automatic backup will be created first.
                </p>
                <div className="mt-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Type <strong>DELETE ALL DATA</strong> to confirm:
                  </label>
                  <input
                    type="text"
                    value={clearAllConfirmText}
                    onChange={(e) => setClearAllConfirmText(e.target.value)}
                    placeholder="DELETE ALL DATA"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder-gray-400"
                    autoComplete="off"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowClearAllConfirm(false);
                    setClearAllConfirmText('');
                  }}
                  disabled={resetting}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={clearAllData}
                  disabled={resetting || clearAllConfirmText !== 'DELETE ALL DATA'}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300 text-white rounded-lg transition-colors flex items-center gap-2"
                >
                  {resetting ? (
                    <>
                      <ArrowPathIcon className="w-4 h-4 animate-spin" />
                      Clearing...
                    </>
                  ) : (
                    'Clear All Data'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
