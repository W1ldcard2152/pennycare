'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ExclamationTriangleIcon,
  XMarkIcon,
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

function formatDeadlineDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function daysLabel(daysUntil: number): string {
  if (daysUntil < 0) return `${Math.abs(daysUntil)} days overdue`;
  if (daysUntil === 0) return 'due today';
  if (daysUntil === 1) return 'due tomorrow';
  return `due in ${daysUntil} days`;
}

export default function TaxDeadlineBanner() {
  const [bannerDeadlines, setBannerDeadlines] = useState<TaxDeadline[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check sessionStorage for dismissal
    try {
      const isDismissed = sessionStorage.getItem('tax-banner-dismissed');
      if (isDismissed) {
        setDismissed(true);
        setLoading(false);
        return;
      }
    } catch {
      // sessionStorage not available
    }

    async function fetchBanner() {
      try {
        const response = await fetch('/api/reminders');
        if (response.ok) {
          const result = await response.json();
          setBannerDeadlines(result.bannerDeadlines || []);
        }
      } catch {
        // Silently fail
      } finally {
        setLoading(false);
      }
    }
    fetchBanner();
  }, []);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem('tax-banner-dismissed', 'true');
    } catch {
      // sessionStorage not available
    }
  };

  if (loading || dismissed || bannerDeadlines.length === 0) {
    return null;
  }

  const mostUrgent = bannerDeadlines[0];
  const hasOverdue = bannerDeadlines.some(d => d.urgency === 'overdue');
  const remainingCount = bannerDeadlines.length - 1;

  const bgColor = hasOverdue || mostUrgent.urgency === 'imminent'
    ? 'bg-red-50 border-red-200'
    : 'bg-yellow-50 border-yellow-200';
  const iconColor = hasOverdue || mostUrgent.urgency === 'imminent'
    ? 'text-red-500'
    : 'text-yellow-500';
  const textColor = hasOverdue || mostUrgent.urgency === 'imminent'
    ? 'text-red-800'
    : 'text-yellow-800';
  const linkColor = hasOverdue || mostUrgent.urgency === 'imminent'
    ? 'text-red-600 hover:text-red-800'
    : 'text-yellow-600 hover:text-yellow-800';

  return (
    <div className={`border-b px-4 py-2 ${bgColor}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <ExclamationTriangleIcon className={`h-5 w-5 flex-shrink-0 ${iconColor}`} />
          <span className={`text-sm font-medium ${textColor}`}>
            {mostUrgent.href ? (
              <Link href={mostUrgent.href} className={`underline ${linkColor}`}>
                {mostUrgent.label}
              </Link>
            ) : (
              mostUrgent.label
            )}
            {' '}{daysLabel(mostUrgent.daysUntil)}
            {' '}({formatDeadlineDate(mostUrgent.deadline)})
          </span>
          {remainingCount > 0 && (
            <Link
              href="/tax-forms"
              className={`text-sm font-medium ${linkColor} ml-1`}
            >
              +{remainingCount} more
            </Link>
          )}
        </div>
        <button
          onClick={handleDismiss}
          className={`flex-shrink-0 p-1 rounded hover:bg-black/5 ${textColor}`}
          title="Dismiss until next session"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
