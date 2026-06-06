'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import {
  HomeIcon,
  ArrowDownTrayIcon,
  ShoppingCartIcon,
  BuildingLibraryIcon,
  CreditCardIcon,
  CogIcon,
  BanknotesIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  ClockIcon,
  BookOpenIcon,
  ClipboardDocumentListIcon,
  PencilSquareIcon,
  CheckBadgeIcon,
  BuildingStorefrontIcon,
  ChartBarIcon,
  DocumentChartBarIcon,
  ScaleIcon,
  CalculatorIcon,
  DocumentTextIcon,
  DocumentDuplicateIcon,
  WrenchScrewdriverIcon,
  MagnifyingGlassIcon,
  CircleStackIcon,
  Cog6ToothIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  LockClosedIcon,
  ChatBubbleLeftRightIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface NavSection {
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
}

const sections: NavSection[] = [
  {
    name: 'Import',
    icon: ArrowDownTrayIcon,
    items: [
      { name: 'eBay Sales', href: '/bookkeeping/ebay', icon: ShoppingCartIcon },
      { name: 'Statement Import', href: '/bookkeeping/statement-import', icon: BuildingLibraryIcon },
      { name: 'Transaction Review', href: '/bookkeeping/transaction-review', icon: ClipboardDocumentListIcon },
      { name: 'Transaction Rules', href: '/bookkeeping/rules', icon: CogIcon },
    ],
  },
  {
    name: 'Payroll',
    icon: BanknotesIcon,
    items: [
      { name: 'Payroll Dashboard', href: '/payroll', icon: BanknotesIcon },
      { name: 'Employees', href: '/employees', icon: UserGroupIcon },
      { name: 'Run Payroll', href: '/payroll/run', icon: CurrencyDollarIcon },
      { name: 'Time Tracking', href: '/time-tracking', icon: ClockIcon },
    ],
  },
  {
    name: 'Books',
    icon: BookOpenIcon,
    items: [
      { name: 'Chart of Accounts', href: '/bookkeeping/accounts', icon: ClipboardDocumentListIcon },
      { name: 'Journal Entries', href: '/bookkeeping/journal-entries', icon: PencilSquareIcon },
      { name: 'Reconciliation', href: '/bookkeeping/reconciliation', icon: CheckBadgeIcon },
      { name: 'Vendors', href: '/bookkeeping/vendors', icon: BuildingStorefrontIcon },
      { name: 'Tax Deposits', href: '/bookkeeping/tax-deposits', icon: BuildingLibraryIcon },
      { name: 'Tax Filings', href: '/bookkeeping/tax-filings', icon: DocumentDuplicateIcon },
    ],
  },
  {
    name: 'Reports',
    icon: ChartBarIcon,
    items: [
      { name: 'Profit & Loss', href: '/bookkeeping/reports/profit-loss', icon: DocumentChartBarIcon },
      { name: 'Balance Sheet', href: '/bookkeeping/reports/balance-sheet', icon: ScaleIcon },
      { name: 'Trial Balance', href: '/bookkeeping/reports/trial-balance', icon: CalculatorIcon },
      { name: 'General Ledger', href: '/bookkeeping/reports/general-ledger', icon: BookOpenIcon },
      { name: 'Payroll Reports', href: '/reports', icon: DocumentTextIcon },
      { name: 'Tax Forms', href: '/tax-forms', icon: DocumentDuplicateIcon },
    ],
  },
  {
    name: 'Admin',
    icon: WrenchScrewdriverIcon,
    items: [
      { name: 'Company Settings', href: '/settings', icon: Cog6ToothIcon },
      { name: 'Year-End Closing', href: '/admin/year-end', icon: LockClosedIcon },
      { name: 'Audit Trail', href: '/admin/audit', icon: MagnifyingGlassIcon },
      { name: 'Backup / Restore', href: '/admin/backup', icon: CircleStackIcon },
      { name: 'Data Integrity', href: '/admin/integrity', icon: ShieldCheckIcon },
      { name: 'Feedback', href: '/admin/feedback', icon: ChatBubbleLeftRightIcon },
    ],
  },
];

// Every section starts collapsed on each app launch — no persistence across
// sessions. The auto-expand-active-section effect below will open the
// section containing the current page (so navigating to /payroll opens
// Payroll), but a fresh app open lands the user on the dashboard with all
// sections closed. This is a deliberate "clean slate every launch" UX —
// the offline-first product principle extends to not silently remembering
// state between sessions.
function getDefaultExpandedState(): Record<string, boolean> {
  return sections.reduce((acc, section) => {
    acc[section.name] = false;
    return acc;
  }, {} as Record<string, boolean>);
}

function isPathActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(href + '/');
}

function isSectionActive(pathname: string, section: NavSection): boolean {
  return section.items.some(item => isPathActive(pathname, item.href));
}

export default function Sidebar() {
  const pathname = usePathname();
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(getDefaultExpandedState);
  // null = haven't loaded yet; we hide eBay until we know, so demo accounts
  // (default-off) never flash the link to viewers.
  const [ebayEnabled, setEbayEnabled] = useState<boolean | null>(null);

  // Fetch the active company's feature flags. Re-runs on pathname change so
  // a company switch (full page reload) or a Settings save followed by a
  // navigation both pick up the latest value without needing a refresh.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/company')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data && typeof data.ebayImportEnabled === 'boolean') {
          setEbayEnabled(data.ebayImportEnabled);
        } else {
          setEbayEnabled(false);
        }
      })
      .catch(() => {
        if (!cancelled) setEbayEnabled(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const visibleSections = sections.map((section) => {
    if (section.name !== 'Import') return section;
    return {
      ...section,
      items: section.items.filter((item) => {
        if (item.href === '/bookkeeping/ebay') return ebayEnabled === true;
        return true;
      }),
    };
  });

  // Auto-expand the section containing the active page. Runs on mount and
  // whenever the user navigates. No localStorage involved — purely
  // in-memory React state for the lifetime of this app session.
  useEffect(() => {
    const activeSection = sections.find(section => isSectionActive(pathname, section));
    if (activeSection && !expandedSections[activeSection.name]) {
      setExpandedSections(prev => ({ ...prev, [activeSection.name]: true }));
    }
  }, [pathname, expandedSections]);

  const toggleSection = (sectionName: string) => {
    setExpandedSections(prev => ({ ...prev, [sectionName]: !prev[sectionName] }));
  };

  const isDashboardActive = pathname === '/';

  return (
    <div className="flex h-screen w-64 flex-col" style={{ backgroundColor: '#304059' }}>
      {/* Logo */}
      <div className="flex h-44 items-center justify-center border-b px-4 py-8" style={{ borderColor: '#1e2838' }}>
        <Link href="/" className="cursor-pointer">
          <Image
            src="/logo.svg"
            alt="CV Books Logo"
            width={474}
            height={441}
            className="h-28 w-auto transition-opacity hover:opacity-80"
            unoptimized
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {/* Dashboard (standalone) */}
        <Link
          href="/"
          className={`
            group flex items-center rounded-md px-3 py-2 text-sm font-medium
            transition-colors duration-150 mb-4
            ${isDashboardActive
              ? 'text-white border-l-2 border-white'
              : 'text-gray-300 hover:text-white'
            }
          `}
          style={isDashboardActive ? { backgroundColor: '#1e2838' } : {}}
          onMouseEnter={(e) => {
            if (!isDashboardActive) {
              e.currentTarget.style.backgroundColor = '#1e2838';
            }
          }}
          onMouseLeave={(e) => {
            if (!isDashboardActive) {
              e.currentTarget.style.backgroundColor = '';
            }
          }}
        >
          <HomeIcon
            className={`
              mr-3 h-5 w-5 flex-shrink-0
              ${isDashboardActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}
            `}
          />
          Dashboard
        </Link>

        {/* Expand/Collapse All */}
        <div className="flex items-center justify-end px-3 mb-2">
          {(() => {
            const activeSection = sections.find(s => isSectionActive(pathname, s));
            const expandedCount = sections.filter(s => expandedSections[s.name]).length;
            const onlyActiveOpen = expandedCount <= 1 && (!activeSection || expandedSections[activeSection.name]);
            const shouldExpand = onlyActiveOpen;
            return (
              <button
                onClick={() => {
                  const updated = { ...expandedSections };
                  for (const s of sections) {
                    updated[s.name] = shouldExpand;
                  }
                  if (activeSection) {
                    updated[activeSection.name] = true;
                  }
                  setExpandedSections(updated);
                }}
                  className="text-gray-400 hover:text-gray-200 text-xs transition-colors duration-150"
                >
                  {shouldExpand ? 'Expand All' : 'Collapse All'}
                </button>
              );
            })()}
          </div>

        {/* Collapsible Sections */}
        {visibleSections.map((section) => {
          const isExpanded = expandedSections[section.name];
          const sectionActive = isSectionActive(pathname, section);

          return (
            <div key={section.name} className="mb-2">
              {/* Section Header */}
              <button
                onClick={() => toggleSection(section.name)}
                className={`
                  w-full flex items-center justify-between rounded-md px-3 py-2 text-xs font-semibold uppercase tracking-wider
                  transition-colors duration-150
                  ${sectionActive ? 'text-gray-200' : 'text-gray-400 hover:text-gray-200'}
                `}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#1e2838';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = '';
                }}
              >
                <div className="flex items-center">
                  <section.icon className="mr-2 h-4 w-4 flex-shrink-0" />
                  {section.name}
                </div>
                {isExpanded ? (
                  <ChevronDownIcon className="h-4 w-4" />
                ) : (
                  <ChevronRightIcon className="h-4 w-4" />
                )}
              </button>

              {/* Section Items — no async load anymore, so no flash-prevention gate needed */}
              <div
                className={`
                  overflow-hidden transition-all duration-200 ease-in-out
                  ${isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
                `}
              >
                <div className="pl-4 pt-1 space-y-1">
                  {section.items.map((item) => {
                    const isActive = isPathActive(pathname, item.href);

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`
                          group flex items-center rounded-md px-3 py-2 text-sm font-medium
                          transition-colors duration-150
                          ${isActive
                            ? 'text-white border-l-2 border-white'
                            : 'text-gray-300 hover:text-white'
                          }
                        `}
                        style={isActive ? { backgroundColor: '#1e2838' } : {}}
                        onMouseEnter={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.backgroundColor = '#1e2838';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isActive) {
                            e.currentTarget.style.backgroundColor = '';
                          }
                        }}
                      >
                        <item.icon
                          className={`
                            mr-3 h-5 w-5 flex-shrink-0
                            ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}
                          `}
                        />
                        {item.name}
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-4" style={{ borderColor: '#1e2838' }}>
        <div className="text-xs text-gray-400">
          <p className="font-semibold text-white">CV Books</p>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span>Bookkeeping &amp; Payroll</span>
            {/* Version is wired in at build time via next.config.ts → env.NEXT_PUBLIC_APP_VERSION.
                Visible here so users on an offline install can self-report which build they have. */}
            <span className="font-mono text-[10px] text-gray-500">
              v{process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
