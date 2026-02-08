import Link from 'next/link';
import {
  UsersIcon,
  CurrencyDollarIcon,
  ClockIcon,
  DocumentTextIcon,
  ChartBarIcon,
  BanknotesIcon
} from '@heroicons/react/24/outline';
import UpcomingDeadlinesWidget from '@/components/UpcomingDeadlinesWidget';

export default function Dashboard() {
  const stats = [
    { name: 'Total Employees', value: '1', icon: UsersIcon, color: 'bg-blue-500' },
    { name: 'Active Payroll', value: '$0', icon: CurrencyDollarIcon, color: 'bg-green-500' },
    { name: 'Pending Hours', value: '0', icon: ClockIcon, color: 'bg-yellow-500' },
    { name: 'This Month', value: '$0', icon: BanknotesIcon, color: 'bg-purple-500' },
  ];

  const quickLinks = [
    {
      title: 'Employees',
      description: 'Manage employee information, documents, and payment details',
      href: '/employees',
      icon: UsersIcon,
      available: true,
    },
    {
      title: 'Payroll',
      description: 'Process payroll, track time entries, and manage tax withholdings',
      href: '/payroll',
      icon: CurrencyDollarIcon,
      available: true,
    },
    {
      title: 'Time Tracking',
      description: 'Track employee hours and manage time entries',
      href: '/time-tracking',
      icon: ClockIcon,
      available: true,
    },
    {
      title: 'Reports',
      description: 'Generate financial reports and analytics',
      href: '/reports',
      icon: DocumentTextIcon,
      available: true,
    },
    {
      title: 'Analytics',
      description: 'View business insights and performance metrics',
      href: '/analytics',
      icon: ChartBarIcon,
      available: true,
    },
  ];

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">
          Welcome to PennyCare - Payroll Management System
        </p>
      </div>

      {/* Stats Grid */}
      <div className="mb-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="overflow-hidden rounded-lg bg-white shadow"
          >
            <div className="p-5">
              <div className="flex items-center">
                <div className={`flex-shrink-0 rounded-md p-3 ${stat.color}`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="truncate text-sm font-medium text-gray-500">
                      {stat.name}
                    </dt>
                    <dd className="text-2xl font-semibold text-gray-900">
                      {stat.value}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Upcoming Tax Deadlines */}
      <div className="mb-8">
        <UpcomingDeadlinesWidget />
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Quick Actions</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {quickLinks.map((link) => (
            link.available ? (
              <Link
                key={link.title}
                href={link.href}
                className="group relative overflow-hidden rounded-lg border border-gray-200 bg-white p-6 shadow-sm transition-all hover:shadow-md"
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <link.icon className="h-8 w-8 text-blue-600" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-900 group-hover:text-blue-600">
                      {link.title}
                    </h3>
                    <p className="mt-2 text-sm text-gray-600">
                      {link.description}
                    </p>
                  </div>
                </div>
              </Link>
            ) : (
              <div
                key={link.title}
                className="relative overflow-hidden rounded-lg border border-gray-200 bg-gray-50 p-6 shadow-sm"
              >
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    <link.icon className="h-8 w-8 text-gray-400" />
                  </div>
                  <div className="ml-4">
                    <h3 className="text-lg font-semibold text-gray-400">
                      {link.title}
                    </h3>
                    <p className="mt-2 text-sm text-gray-500">
                      {link.description}
                    </p>
                    <span className="mt-2 inline-block text-xs font-medium text-gray-500">
                      Coming Soon
                    </span>
                  </div>
                </div>
              </div>
            )
          ))}
        </div>
      </div>
    </div>
  );
}
