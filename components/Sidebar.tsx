'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Image from 'next/image';
import {
  HomeIcon,
  UsersIcon,
  CurrencyDollarIcon,
  ClockIcon,
  DocumentTextIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  FolderIcon,
  ClipboardDocumentListIcon,
  BookOpenIcon,
} from '@heroicons/react/24/outline';

const navigation = [
  { name: 'Dashboard', href: '/', icon: HomeIcon },
  { name: 'Employees', href: '/employees', icon: UsersIcon },
  { name: 'Payroll', href: '/payroll', icon: CurrencyDollarIcon },
  { name: 'Tax Forms', href: '/tax-forms', icon: ClipboardDocumentListIcon },
  { name: 'Bookkeeping', href: '/bookkeeping', icon: BookOpenIcon },
  { name: 'Time Tracking', href: '/time-tracking', icon: ClockIcon },
  { name: 'Documents', href: '/documents', icon: FolderIcon },
  { name: 'Reports', href: '/reports', icon: DocumentTextIcon },
  { name: 'Analytics', href: '/analytics', icon: ChartBarIcon },
  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon },
];

export default function Sidebar() {
  const pathname = usePathname();

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
          />
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-2 py-4">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/' && pathname.startsWith(item.href));

          return (
            <Link
              key={item.name}
              href={item.href}
              className={`
                group flex items-center rounded-md px-3 py-2 text-sm font-medium
                transition-colors duration-150
                ${isActive
                  ? 'text-white'
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
                  mr-3 h-6 w-6 flex-shrink-0
                  ${isActive ? 'text-white' : 'text-gray-400 group-hover:text-white'}
                `}
              />
              {item.name}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="border-t p-4" style={{ borderColor: '#1e2838' }}>
        <div className="text-xs text-gray-400">
          <p className="font-semibold text-white">PennyCare</p>
          <p className="mt-1">Payroll Management System</p>
        </div>
      </div>
    </div>
  );
}
