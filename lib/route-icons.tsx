// Route → icon mapping. Single source of truth so the sidebar, the tab
// strip, and any future "recents" UI all use the same iconography. New
// routes inherit the closest-matching prefix's icon. Order matters: more
// specific prefixes must come before broader ones.

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
  LockClosedIcon,
  ChatBubbleLeftRightIcon,
  Square2StackIcon,
} from '@heroicons/react/24/outline';

type IconComponent = React.ComponentType<{ className?: string }>;

interface RouteIconRule {
  prefix: string;
  icon: IconComponent;
}

// Order: most specific first. The first matching prefix wins.
const RULES: RouteIconRule[] = [
  { prefix: '/bookkeeping/ebay', icon: ShoppingCartIcon },
  { prefix: '/bookkeeping/statement-import', icon: BuildingLibraryIcon },
  { prefix: '/bookkeeping/transaction-review', icon: ClipboardDocumentListIcon },
  { prefix: '/bookkeeping/rules', icon: CogIcon },
  { prefix: '/bookkeeping/accounts', icon: ClipboardDocumentListIcon },
  { prefix: '/bookkeeping/journal-entries', icon: PencilSquareIcon },
  { prefix: '/bookkeeping/reconciliation', icon: CheckBadgeIcon },
  { prefix: '/bookkeeping/vendors', icon: BuildingStorefrontIcon },
  { prefix: '/bookkeeping/tax-deposits', icon: BuildingLibraryIcon },
  { prefix: '/bookkeeping/tax-filings', icon: DocumentDuplicateIcon },
  { prefix: '/bookkeeping/reports/profit-loss', icon: DocumentChartBarIcon },
  { prefix: '/bookkeeping/reports/balance-sheet', icon: ScaleIcon },
  { prefix: '/bookkeeping/reports/trial-balance', icon: CalculatorIcon },
  { prefix: '/bookkeeping/reports/general-ledger', icon: BookOpenIcon },
  { prefix: '/bookkeeping/cc-import', icon: CreditCardIcon },
  { prefix: '/bookkeeping/expenses', icon: BanknotesIcon },
  { prefix: '/bookkeeping', icon: BookOpenIcon },
  { prefix: '/payroll/run', icon: CurrencyDollarIcon },
  { prefix: '/payroll', icon: BanknotesIcon },
  { prefix: '/employees', icon: UserGroupIcon },
  { prefix: '/time-tracking', icon: ClockIcon },
  { prefix: '/reports', icon: DocumentTextIcon },
  { prefix: '/tax-forms', icon: DocumentDuplicateIcon },
  { prefix: '/settings', icon: Cog6ToothIcon },
  { prefix: '/admin/year-end', icon: LockClosedIcon },
  { prefix: '/admin/audit', icon: MagnifyingGlassIcon },
  { prefix: '/admin/backup', icon: CircleStackIcon },
  { prefix: '/admin/feedback', icon: ChatBubbleLeftRightIcon },
  { prefix: '/admin', icon: WrenchScrewdriverIcon },
  { prefix: '/search', icon: MagnifyingGlassIcon },
];

export function getIconForPath(pathname: string): IconComponent {
  if (pathname === '/' || pathname === '') return HomeIcon;
  for (const rule of RULES) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + '/')) {
      return rule.icon;
    }
  }
  return Square2StackIcon;
}
