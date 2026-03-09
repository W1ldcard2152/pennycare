'use client';

import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import TaxDeadlineBanner from './TaxDeadlineBanner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Don't show layout on login/register pages
  const isAuthPage = pathname === '/login' || pathname === '/register';

  if (isAuthPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar - hidden when printing */}
      <div className="no-print">
        <Sidebar />
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top Bar - hidden when printing */}
        <div className="no-print">
          <TopBar />
        </div>

        {/* Tax Deadline Banner - hidden when printing */}
        <div className="no-print">
          <TaxDeadlineBanner />
        </div>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto print:overflow-visible">
          <div className="py-6 print:py-0">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
