'use client';

import { ReactNode } from 'react';

interface PrintLayoutProps {
  title: string;
  subtitle?: string;
  companyName?: string;
  companyAddress?: string;
  children: ReactNode;
}

/**
 * PrintLayout provides consistent print styling for reports.
 *
 * On screen: renders children normally with no visual changes.
 * On print: adds a professional header and applies clean print styles.
 *
 * Usage:
 * <PrintLayout
 *   title="Profit & Loss"
 *   subtitle="January 1, 2025 — February 28, 2025"
 *   companyName="Phoenix Automotive LLC"
 * >
 *   {report content}
 * </PrintLayout>
 */
export function PrintLayout({
  title,
  subtitle,
  companyName,
  companyAddress,
  children,
}: PrintLayoutProps) {
  return (
    <div className="print-layout">
      {/* Print header - only visible when printing */}
      <div className="print-header">
        {companyName && (
          <div className="print-company-name">{companyName}</div>
        )}
        {companyAddress && (
          <div className="print-company-address">{companyAddress}</div>
        )}
        <div className="print-title">{title}</div>
        {subtitle && <div className="print-subtitle">{subtitle}</div>}
      </div>

      {/* Report content */}
      <div className="print-content">
        {children}
      </div>
    </div>
  );
}

export default PrintLayout;
