'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  CalendarDaysIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  CheckCircleIcon,
  ArrowRightIcon,
} from '@heroicons/react/24/outline';

interface TaxDeadline {
  id: string;
  type: 'filing' | 'deposit';
  formType: string;
  label: string;
  description: string;
  deadline: string;
  urgency: 'overdue' | 'imminent' | 'this_week' | 'upcoming';
  daysUntil: number;
  isFiled: boolean;
  href?: string;
}

interface RemindersResponse {
  deadlines: TaxDeadline[];
  summary: {
    overdueCount: number;
    imminentCount: number;
    thisWeekCount: number;
    upcomingCount: number;
  };
}

const urgencyConfig = {
  overdue: {
    dot: 'bg-red-500',
    text: 'text-red-700',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-700',
    label: 'Overdue',
  },
  imminent: {
    dot: 'bg-red-400',
    text: 'text-red-600',
    bg: 'bg-red-50',
    badge: 'bg-red-100 text-red-600',
    label: 'Due soon',
  },
  this_week: {
    dot: 'bg-yellow-500',
    text: 'text-yellow-700',
    bg: 'bg-yellow-50',
    badge: 'bg-yellow-100 text-yellow-700',
    label: 'This week',
  },
  upcoming: {
    dot: 'bg-blue-500',
    text: 'text-blue-700',
    bg: '',
    badge: 'bg-blue-100 text-blue-700',
    label: 'Upcoming',
  },
};

function formatDeadlineDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function daysLabel(daysUntil: number): string {
  if (daysUntil < 0) return `${Math.abs(daysUntil)}d overdue`;
  if (daysUntil === 0) return 'Due today';
  if (daysUntil === 1) return 'Tomorrow';
  return `${daysUntil}d`;
}

export default function UpcomingDeadlinesWidget() {
  const [data, setData] = useState<RemindersResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchReminders() {
      try {
        const response = await fetch('/api/reminders');
        if (response.ok) {
          const result = await response.json();
          setData(result);
        }
      } catch {
        // Silently fail - widget is non-critical
      } finally {
        setLoading(false);
      }
    }
    fetchReminders();
  }, []);

  if (loading) {
    return (
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Tax Deadlines</h3>
          </div>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!data || data.deadlines.length === 0) {
    return (
      <div className="overflow-hidden rounded-lg bg-white shadow">
        <div className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Tax Deadlines</h3>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CheckCircleIcon className="h-5 w-5 text-green-500" />
            <span>No upcoming deadlines</span>
          </div>
        </div>
      </div>
    );
  }

  const displayDeadlines = data.deadlines.slice(0, 7);
  const hasMore = data.deadlines.length > 7;
  const { summary } = data;
  const urgentCount = summary.overdueCount + summary.imminentCount;

  return (
    <div className="overflow-hidden rounded-lg bg-white shadow">
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <CalendarDaysIcon className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-semibold text-gray-900">Upcoming Tax Deadlines</h3>
            {urgentCount > 0 && (
              <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                {urgentCount} urgent
              </span>
            )}
          </div>
          <Link
            href="/tax-forms"
            className="text-sm text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
          >
            View all
            <ArrowRightIcon className="h-3 w-3" />
          </Link>
        </div>

        {/* Deadline List */}
        <div className="space-y-2">
          {displayDeadlines.map((deadline) => {
            const config = urgencyConfig[deadline.urgency];
            return (
              <div
                key={deadline.id}
                className={`flex items-center justify-between rounded-md px-3 py-2 ${config.bg}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`h-2.5 w-2.5 rounded-full flex-shrink-0 ${config.dot}`} />
                  <div className="min-w-0">
                    {deadline.href ? (
                      <Link
                        href={deadline.href}
                        className={`text-sm font-medium hover:underline ${config.text || 'text-gray-900'}`}
                      >
                        {deadline.label}
                      </Link>
                    ) : (
                      <span className={`text-sm font-medium ${config.text || 'text-gray-900'}`}>
                        {deadline.label}
                      </span>
                    )}
                    <p className="text-xs text-gray-500 truncate">{deadline.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                  <span className="text-xs text-gray-500">{formatDeadlineDate(deadline.deadline)}</span>
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${config.badge}`}>
                    {daysLabel(deadline.daysUntil)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {hasMore && (
          <div className="mt-3 text-center">
            <Link
              href="/tax-forms"
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              +{data.deadlines.length - 7} more deadlines
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
