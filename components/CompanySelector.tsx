'use client';

import { useState, useEffect } from 'react';
import { ChevronDownIcon, CheckIcon } from '@heroicons/react/24/outline';

interface Company {
  id: string;
  companyName: string;
  role: string;
}

interface SessionData {
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  } | null;
  companies: Company[];
  currentCompanyId?: string;
}

export default function CompanySelector() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSession();
  }, []);

  const fetchSession = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      setSession(data);
    } catch (error) {
      console.error('Error fetching session:', error);
    } finally {
      setLoading(false);
    }
  };

  const switchCompany = async (companyId: string) => {
    try {
      const res = await fetch('/api/auth/switch-company', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId }),
      });

      if (res.ok) {
        // Refresh the page to reload with new company context
        window.location.reload();
      }
    } catch (error) {
      console.error('Error switching company:', error);
    }
    setIsOpen(false);
  };

  if (loading || !session?.user || !session.companies.length) {
    return null;
  }

  const currentCompany = session.companies.find(
    (c) => c.id === session.currentCompanyId
  );

  if (!currentCompany) {
    return null;
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        <span>{currentCompany.companyName}</span>
        <ChevronDownIcon className="h-4 w-4" />
      </button>

      {isOpen && session.companies.length > 1 && (
        <div className="absolute right-0 z-10 mt-2 w-64 rounded-md bg-white shadow-lg ring-1 ring-black ring-opacity-5">
          <div className="py-1">
            <div className="px-4 py-2 text-xs font-semibold text-gray-500">
              Switch Company
            </div>
            {session.companies.map((company) => (
              <button
                key={company.id}
                onClick={() => switchCompany(company.id)}
                className="flex w-full items-center justify-between px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
              >
                <div>
                  <div className="font-medium">{company.companyName}</div>
                  <div className="text-xs text-gray-500">{company.role}</div>
                </div>
                {company.id === session.currentCompanyId && (
                  <CheckIcon className="h-5 w-5 text-blue-600" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
