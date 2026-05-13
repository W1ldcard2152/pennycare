'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ChevronDownIcon,
  ChevronUpIcon,
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

const DISMISSED_IDS_KEY = 'tax-banner-dismissed-ids';
const BANNER_DISMISSED_KEY = 'tax-banner-dismissed';

function formatDeadlineDate(dateStr: string): string {
  const date = new Date(dateStr + 'T12:00:00Z');
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function daysLabel(daysUntil: number): string {
  if (daysUntil < 0) return `${Math.abs(daysUntil)} days overdue`;
  if (daysUntil === 0) return 'due today';
  if (daysUntil === 1) return 'due tomorrow';
  return `due in ${daysUntil} days`;
}

function readDismissedIds(): Set<string> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_IDS_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persistDismissedIds(ids: Set<string>) {
  try {
    sessionStorage.setItem(DISMISSED_IDS_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // sessionStorage not available
  }
}

export default function TaxDeadlineBanner() {
  const [bannerDeadlines, setBannerDeadlines] = useState<TaxDeadline[]>([]);
  const [dismissedAll, setDismissedAll] = useState(false);
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(BANNER_DISMISSED_KEY)) {
        setDismissedAll(true);
        setLoading(false);
        return;
      }
      setDismissedIds(readDismissedIds());
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

  const handleDismissAll = () => {
    setDismissedAll(true);
    try {
      sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    } catch {
      // sessionStorage not available
    }
  };

  const handleDismissOne = (id: string) => {
    const next = new Set(dismissedIds);
    next.add(id);
    setDismissedIds(next);
    persistDismissedIds(next);
  };

  if (loading || dismissedAll) return null;

  const visible = bannerDeadlines.filter((d) => !dismissedIds.has(d.id));
  if (visible.length === 0) return null;

  const mostUrgent = visible[0];
  const remainingCount = visible.length - 1;

  // Color the banner by the most urgent visible item.
  const isHigh = mostUrgent.urgency === 'overdue' || mostUrgent.urgency === 'imminent' ||
    visible.some((d) => d.urgency === 'overdue');
  const bgColor = isHigh ? 'bg-red-50 border-red-200' : 'bg-yellow-50 border-yellow-200';
  const bgHover = isHigh ? 'hover:bg-red-100' : 'hover:bg-yellow-100';
  const iconColor = isHigh ? 'text-red-500' : 'text-yellow-500';
  const textColor = isHigh ? 'text-red-800' : 'text-yellow-800';
  const linkColor = isHigh ? 'text-red-600 hover:text-red-800' : 'text-yellow-600 hover:text-yellow-800';
  const dividerColor = isHigh ? 'border-red-200' : 'border-yellow-200';

  return (
    <div className={`border-b ${bgColor}`}>
      {/* Collapsed row — clicking the background toggles expanded view. */}
      <button
        type="button"
        onClick={() => remainingCount > 0 && setExpanded((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-2 text-left transition-colors ${
          remainingCount > 0 ? `cursor-pointer ${bgHover}` : 'cursor-default'
        }`}
        aria-expanded={expanded}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ExclamationTriangleIcon className={`h-5 w-5 flex-shrink-0 ${iconColor}`} />
          <span className={`text-sm font-medium ${textColor}`}>
            {mostUrgent.href ? (
              <Link
                href={mostUrgent.href}
                className={`underline ${linkColor}`}
                onClick={(e) => e.stopPropagation()}
              >
                {mostUrgent.label}
              </Link>
            ) : (
              mostUrgent.label
            )}
            {' '}{daysLabel(mostUrgent.daysUntil)}
            {' '}({formatDeadlineDate(mostUrgent.deadline)})
          </span>
          {remainingCount > 0 && (
            <span className={`inline-flex items-center gap-1 text-sm font-medium ${linkColor} ml-1`}>
              +{remainingCount} more
              {expanded ? (
                <ChevronUpIcon className="h-4 w-4" />
              ) : (
                <ChevronDownIcon className="h-4 w-4" />
              )}
            </span>
          )}
        </div>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            handleDismissAll();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              e.stopPropagation();
              handleDismissAll();
            }
          }}
          className={`flex-shrink-0 p-1 rounded hover:bg-black/5 ${textColor}`}
          title="Dismiss all until next session"
        >
          <XMarkIcon className="h-4 w-4" />
        </span>
      </button>

      {/* Expanded list — one row per remaining deadline with its own dismiss. */}
      {expanded && remainingCount > 0 && (
        <ul className={`border-t ${dividerColor} divide-y ${dividerColor}`}>
          {visible.slice(1).map((d) => (
            <li
              key={d.id}
              className={`flex items-center justify-between px-4 py-2 ${bgHover}`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <ExclamationTriangleIcon className={`h-4 w-4 flex-shrink-0 ${iconColor}`} />
                <span className={`text-sm ${textColor}`}>
                  {d.href ? (
                    <Link href={d.href} className={`underline ${linkColor}`}>
                      {d.label}
                    </Link>
                  ) : (
                    d.label
                  )}
                  {' '}{daysLabel(d.daysUntil)}{' '}
                  <span className="text-gray-500">({formatDeadlineDate(d.deadline)})</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleDismissOne(d.id)}
                className={`flex-shrink-0 p-1 rounded hover:bg-black/5 ${textColor}`}
                title="Dismiss this reminder until next session"
              >
                <XMarkIcon className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
