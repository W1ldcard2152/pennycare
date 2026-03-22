'use client';

import { useState, useRef, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { usePathname } from 'next/navigation';

export default function FeedbackButton() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    setMessageType('');

    if (!feedbackText.trim()) {
      setMessage('Please enter your feedback.');
      setMessageType('error');
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackText: feedbackText.trim(),
          page: pathname,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to submit feedback');
      }

      setMessage('Feedback submitted successfully!');
      setMessageType('success');
      setFeedbackText('');
      setTimeout(() => setIsOpen(false), 2000);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      setMessage('Failed to submit feedback. Please try again.');
      setMessageType('error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="relative" ref={popoverRef}>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white transition duration-200 hover:bg-red-700"
      >
        Feedback
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-4 shadow-xl">
          <button
            onClick={() => setIsOpen(false)}
            className="absolute right-2 top-2 text-gray-400 hover:text-gray-600"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>

          <h3 className="mb-3 text-lg font-semibold text-gray-900">Submit Feedback</h3>

          <form onSubmit={handleSubmit}>
            <div className="mb-3">
              <label htmlFor="feedbackText" className="mb-1 block text-sm font-medium text-gray-700">
                Your Feedback
              </label>
              <textarea
                id="feedbackText"
                name="feedbackText"
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                rows={4}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Tell us what you think..."
              />
            </div>

            {message && (
              <p
                className={`mb-3 text-center text-sm ${
                  messageType === 'success' ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition duration-200 hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? 'Submitting...' : 'Submit'}
            </button>
          </form>

          <div className="mt-3 text-center">
            <a
              href="/admin/feedback"
              className="text-sm text-blue-600 hover:underline"
              onClick={() => setIsOpen(false)}
            >
              View All Feedback
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
