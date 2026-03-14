import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireCompanyAccess } from '@/lib/api-utils';
import { getAccountBalances, generateProfitAndLoss } from '@/lib/bookkeeping';
import { formatDate } from '@/lib/date-utils';

// GET /api/bookkeeping/dashboard
// Returns all data needed for the dashboard in a single call
export async function GET() {
  try {
    const { error, companyId } = await requireCompanyAccess();
    if (error) return error;

    // Calculate date ranges
    const now = new Date();
    const todayStr = formatDate(now);

    // Current month: first day of month to today
    const currentMonthStart = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-01`;

    // YTD: January 1 to today
    const ytdStart = `${now.getUTCFullYear()}-01-01`;

    // Fetch all data in parallel
    const [
      allBalances,
      currentMonthPnL,
      ytdPnL,
      unbookedCount,
      reconcilableAccounts,
      recentReconciliations,
      recentAuditLogs,
      employeeCount,
      lastPayrollDate,
    ] = await Promise.all([
      // Account balances (all time, as of today)
      getAccountBalances(companyId!, undefined, todayStr),

      // Current month P&L
      generateProfitAndLoss(companyId!, currentMonthStart, todayStr),

      // YTD P&L
      generateProfitAndLoss(companyId!, ytdStart, todayStr),

      // Unbooked statement imports
      prisma.statementImport.count({
        where: { companyId: companyId!, status: 'pending' },
      }),

      // Get accounts that can be reconciled (bank + credit card)
      prisma.account.findMany({
        where: {
          companyId: companyId!,
          isActive: true,
          OR: [
            { subtype: { in: ['bank_checking', 'bank_savings'] } },
            { type: 'credit_card' },
          ],
        },
        select: { id: true, code: true, name: true, type: true, subtype: true },
      }),

      // Recent completed reconciliations
      prisma.reconciliation.findMany({
        where: { companyId: companyId!, status: 'completed' },
        orderBy: { completedAt: 'desc' },
        take: 50,
        select: { accountId: true, completedAt: true },
      }),

      // Recent audit logs for activity feed
      prisma.auditLog.findMany({
        where: {
          companyId: companyId!,
          action: {
            in: [
              'ebay.import',
              'statement.import',
              'cc_import.book',
              'payroll.process',
              'reconciliation.complete',
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          action: true,
          entityType: true,
          metadata: true,
          createdAt: true,
        },
      }),

      // Employee count for payroll check
      prisma.employee.count({
        where: { companyId: companyId!, isActive: true },
      }),

      // Most recent payroll
      prisma.payrollRecord.findFirst({
        where: { companyId: companyId!, status: 'active' },
        orderBy: { payDate: 'desc' },
        select: { payDate: true },
      }),
    ]);

    // Filter to key accounts for balance display
    const keyAccounts = allBalances.filter((b) => {
      // Bank accounts
      if (b.subtype === 'bank_checking' || b.subtype === 'bank_savings') return true;
      // Credit cards
      if (b.type === 'credit_card') return true;
      // eBay Pending Payouts (1050) - only if has balance
      if (b.code === '1050' && b.balance !== 0) return true;
      // CC Payments Pending (1060) - only if has balance
      if (b.code === '1060' && b.balance !== 0) return true;
      return false;
    });

    // Calculate unreconciled accounts
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const lastReconciledByAccount = new Map<string, Date>();
    for (const rec of recentReconciliations) {
      if (rec.completedAt && !lastReconciledByAccount.has(rec.accountId)) {
        lastReconciledByAccount.set(rec.accountId, rec.completedAt);
      }
    }

    const unreconciledAccounts = reconcilableAccounts
      .map((acct) => {
        const lastReconciled = lastReconciledByAccount.get(acct.id);
        return {
          accountId: acct.id,
          accountCode: acct.code,
          accountName: acct.name,
          lastReconciledDate: lastReconciled ? formatDate(lastReconciled) : null,
          needsReconciliation: !lastReconciled || lastReconciled < thirtyDaysAgo,
        };
      })
      .filter((a) => a.needsReconciliation);

    // Format recent activity
    const recentActivity = recentAuditLogs.map((log) => {
      let description = '';
      let count: number | undefined;

      try {
        const meta = log.metadata ? JSON.parse(log.metadata) : {};
        count = meta.count || meta.recordCount || meta.matched;

        switch (log.action) {
          case 'ebay.import':
            description = `Imported ${count || 0} eBay sales`;
            break;
          case 'statement.import':
            description = `Imported bank/CC statement (${count || 0} transactions)`;
            break;
          case 'cc_import.book':
            description = `Booked credit card transactions`;
            break;
          case 'payroll.process':
            description = `Processed payroll for ${count || 0} employee${count !== 1 ? 's' : ''}`;
            break;
          case 'reconciliation.complete':
            description = `Completed reconciliation for ${meta.accountName || 'account'}`;
            break;
          default:
            description = log.action;
        }
      } catch {
        description = log.action;
      }

      return {
        type: log.action,
        description,
        date: formatDate(log.createdAt),
        timestamp: log.createdAt.toISOString(),
        count,
      };
    });

    // Check if payroll might be needed
    // Simple heuristic: if there are employees and no payroll in the last 14 days
    const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const payrollMayBeNeeded = employeeCount > 0 &&
      (!lastPayrollDate?.payDate || lastPayrollDate.payDate < fourteenDaysAgo);

    // Format month name for display
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const currentMonthName = monthNames[now.getUTCMonth()];

    return NextResponse.json({
      accountBalances: keyAccounts.map((b) => ({
        id: b.accountId,
        code: b.code,
        name: b.name,
        type: b.type,
        subtype: b.subtype,
        balance: b.balance,
      })),
      currentMonthPnL: {
        revenue: currentMonthPnL.totalRevenue,
        expenses: currentMonthPnL.totalExpenses,
        netIncome: currentMonthPnL.netIncome,
        startDate: currentMonthStart,
        endDate: todayStr,
        label: `${currentMonthName} ${now.getUTCFullYear()}`,
      },
      ytdPnL: {
        revenue: ytdPnL.totalRevenue,
        expenses: ytdPnL.totalExpenses,
        netIncome: ytdPnL.netIncome,
        startDate: ytdStart,
        endDate: todayStr,
        label: `Jan 1 – ${currentMonthName.slice(0, 3)} ${now.getUTCDate()}, ${now.getUTCFullYear()}`,
      },
      pendingItems: {
        unbookedTransactions: unbookedCount,
        unreconciledAccounts,
        payrollMayBeNeeded,
        employeeCount,
      },
      recentActivity,
    });
  } catch (err) {
    console.error('Error fetching dashboard data:', err);
    return NextResponse.json({ error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}
