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

const STORAGE_KEY = 'sidebar-sections';

const sections: NavSection[] = [
  {
    name: 'Import',
    icon: ArrowDownTrayIcon,
    items: [
      { name: 'eBay Sales', href: '/bookkeeping/ebay', icon: ShoppingCartIcon },
      { name: 'Bank Statements', href: '/bookkeeping/statements', icon: BuildingLibraryIcon },
      { name: 'Credit Cards', href: '/bookkeeping/cc-import', icon: CreditCardIcon },
      { name: 'Transaction Rules', href: '/bookkeeping/rules', icon: CogIcon },
    ],
  },
  {
    name: 'Payroll',
    icon: BanknotesIcon,
    items: [
      { name: 'Employees', href: '/employees', icon: UserGroupIcon },
      { name: 'Run Payroll', href: '/payroll', icon: CurrencyDollarIcon },
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
    ],
  },
];

function getDefaultExpandedState(): Record<string, boolean> {
  return sections.reduce((acc, section) => {
    acc[section.name] = true;
    return acc;
  }, {} as Record<string, boolean>);
}

function loadExpandedState(): Record<string, boolean> {
  if (typeof window === 'undefined') return getDefaultExpandedState();

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Ensure all sections have a value (in case new sections are added)
      const defaults = getDefaultExpandedState();
      return { ...defaults, ...parsed };
    }
  } catch {
    // Invalid JSON, use defaults
  }
  return getDefaultExpandedState();
}

function saveExpandedState(state: Record<string, boolean>) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage not available
  }
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
  const [isInitialized, setIsInitialized] = useState(false);

  // Load expanded state from localStorage on mount
  useEffect(() => {
    const stored = loadExpandedState();
    setExpandedSections(stored);
    setIsInitialized(true);
  }, []);

  // Auto-expand sections that contain the active page
  useEffect(() => {
    if (!isInitialized) return;

    const activeSection = sections.find(section => isSectionActive(pathname, section));
    if (activeSection && !expandedSections[activeSection.name]) {
      setExpandedSections(prev => {
        const updated = { ...prev, [activeSection.name]: true };
        saveExpandedState(updated);
        return updated;
      });
    }
  }, [pathname, isInitialized, expandedSections]);

  const toggleSection = (sectionName: string) => {
    setExpandedSections(prev => {
      const updated = { ...prev, [sectionName]: !prev[sectionName] };
      saveExpandedState(updated);
      return updated;
    });
  };

  const isDashboardActive = pathname === '/';

  return (
    <div className="flex h-screen w-64 flex-col" style={{ backgroundColor: '#304059' }}>
      {/* Logo */}
      <div className="flex h-48 items-center justify-center border-b px-4 py-8" style={{ borderColor: '#1e2838' }}>
        <Link href="/" className="cursor-pointer">
          <Image
            src="/logo.jpg"
            alt="PennyCare Logo"
            width={480}
            height={200}
            className="h-40 w-auto transition-opacity hover:opacity-80"
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

        {/* Collapsible Sections */}
        {sections.map((section) => {
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
                {isInitialized && (
                  isExpanded ? (
                    <ChevronDownIcon className="h-4 w-4" />
                  ) : (
                    <ChevronRightIcon className="h-4 w-4" />
                  )
                )}
              </button>

              {/* Section Items - hidden until localStorage is loaded to prevent flash */}
              <div
                className={`
                  overflow-hidden
                  ${isInitialized ? 'transition-all duration-200 ease-in-out' : ''}
                  ${!isInitialized ? 'max-h-0 opacity-0' : isExpanded ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'}
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
          <p className="font-semibold text-white">PennyCare</p>
          <p className="mt-1">Payroll & Bookkeeping</p>
        </div>
      </div>
    </div>
  );
}
