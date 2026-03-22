'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrashIcon, ArchiveBoxIcon, ArchiveBoxXMarkIcon } from '@heroicons/react/24/outline';

interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface Feedback {
  id: string;
  userId: string;
  feedbackText: string;
  page: string | null;
  archived: boolean;
  archivedAt: string | null;
  createdAt: string;
  user: User | null;
}

export default function FeedbackAdminPage() {
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');

  const fetchFeedback = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/feedback?archived=${showArchived}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch feedback');
      }
      const data = await res.json();
      setFeedback(data.feedback);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load feedback');
    } finally {
      setLoading(false);
    }
  }, [showArchived]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  const handleArchive = async (id: string, archive: boolean) => {
    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived: archive }),
      });

      if (!res.ok) {
        throw new Error('Failed to update feedback');
      }

      fetchFeedback();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update feedback');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to permanently delete this feedback?')) {
      return;
    }

    try {
      const res = await fetch(`/api/feedback/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        throw new Error('Failed to delete feedback');
      }

      fetchFeedback();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete feedback');
    }
  };

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span>Show archived</span>
          </label>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-700">{error}</div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading...</div>
      ) : feedback.length === 0 ? (
        <div className="py-12 text-center text-gray-500">
          {showArchived ? 'No archived feedback' : 'No feedback yet'}
        </div>
      ) : (
        <div className="space-y-4">
          {feedback.map((item) => (
            <div
              key={item.id}
              className={`rounded-lg border p-4 ${
                item.archived ? 'border-gray-200 bg-gray-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="mb-2 flex items-start justify-between">
                <div>
                  <span className="font-medium text-gray-900">
                    {item.user
                      ? `${item.user.firstName} ${item.user.lastName}`
                      : 'Unknown User'}
                  </span>
                  {item.user && (
                    <span className="ml-2 text-sm text-gray-500">{item.user.email}</span>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {item.archived ? (
                    <button
                      onClick={() => handleArchive(item.id, false)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Unarchive"
                    >
                      <ArchiveBoxXMarkIcon className="h-5 w-5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => handleArchive(item.id, true)}
                      className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                      title="Archive"
                    >
                      <ArchiveBoxIcon className="h-5 w-5" />
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="rounded p-1 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete"
                  >
                    <TrashIcon className="h-5 w-5" />
                  </button>
                </div>
              </div>

              <p className="whitespace-pre-wrap text-black">{item.feedbackText}</p>

              <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500">
                <span>
                  {new Date(item.createdAt).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
                {item.page && (
                  <span className="rounded bg-gray-100 px-2 py-0.5 text-xs">{item.page}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
