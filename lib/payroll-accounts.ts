/**
 * Which accounts payroll posts to.
 *
 * The payroll → JE bridge and the filing service used to find accounts by
 * code alone (6000 wages, 6010 employer taxes, 6020 tax adjustments, 2100–2180
 * liabilities). A chart built before the payroll catalog can use those codes
 * for something else — a live chart had 6000 = "Shop Supplies", so every
 * payroll booked gross wages as shop supplies, silently.
 *
 * Rules now:
 *  - Liabilities (2100–2180) stay code-based — that range is reserved for
 *    payroll and can't be created by hand — but an account there must be a
 *    liability or payroll refuses to post (ensurePayrollAccounts).
 *  - Expense roles resolve in this order: the account chosen in Settings →
 *    Payroll (Company.payroll*AccountId); else the standard code, but only if
 *    the account there is an expense whose name fits the role; else, if the
 *    code is free, it is created from the catalog. A standard code held by an
 *    unrelated account is a PayrollAccountError — never a silent post.
 *  - Payroll Tax Adjustments is system-managed (the filing service creates it
 *    on first use), so instead of refusing it is found by name or created at
 *    the next free code.
 */
import type { Account, Company, Prisma } from '@prisma/client';
import { prisma } from './db';
import { getCatalogAccount } from './account-catalog';

type Db = Prisma.TransactionClient | typeof prisma;

export type PayrollExpenseRole = 'wages' | 'employerTaxes' | 'taxAdjustments';

interface RoleDef {
  label: string;
  code: string;
  field: 'payrollWagesAccountId' | 'payrollTaxExpenseAccountId' | 'payrollTaxAdjustmentsAccountId';
  /** Does an account's name describe this role? */
  fits: RegExp;
}

export const PAYROLL_EXPENSE_ROLES: Record<PayrollExpenseRole, RoleDef> = {
  wages: { label: 'Gross wages', code: '6000', field: 'payrollWagesAccountId', fits: /wage|salar/i },
  employerTaxes: {
    label: 'Employer payroll taxes',
    code: '6010',
    field: 'payrollTaxExpenseAccountId',
    fits: /payroll\s*tax|employer.*tax/i,
  },
  taxAdjustments: {
    label: 'Payroll tax adjustments (filed returns)',
    code: '6020',
    field: 'payrollTaxAdjustmentsAccountId',
    fits: /payroll\s*tax\s*adjust/i,
  },
};

export const PAYROLL_EXPENSE_ROLE_KEYS = Object.keys(PAYROLL_EXPENSE_ROLES) as PayrollExpenseRole[];

export class PayrollAccountError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PayrollAccountError';
  }
}

type AccountRef = Pick<Account, 'id' | 'code' | 'name' | 'type' | 'isActive'>;
const ACCOUNT_SELECT = { id: true, code: true, name: true, type: true, isActive: true } as const;

export type RoleResolution =
  | { role: PayrollExpenseRole; status: 'mapped' | 'standard'; account: AccountRef }
  | { role: PayrollExpenseRole; status: 'will_create'; code: string; name: string }
  | { role: PayrollExpenseRole; status: 'problem'; message: string; conflict?: AccountRef };

const SETTINGS_HINT = 'Choose the right account under Settings → Payroll → Payroll Accounts.';

function fitsRole(role: PayrollExpenseRole, a: AccountRef): boolean {
  return a.type === 'expense' && PAYROLL_EXPENSE_ROLES[role].fits.test(a.name);
}

/** What each expense role would post to — no writes. Settings and Run Payroll show this. */
export async function describePayrollExpenseAccounts(
  companyId: string,
  db: Db = prisma
): Promise<RoleResolution[]> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { payrollWagesAccountId: true, payrollTaxExpenseAccountId: true, payrollTaxAdjustmentsAccountId: true },
  });
  if (!company) throw new PayrollAccountError('Company not found');
  const out: RoleResolution[] = [];
  for (const role of PAYROLL_EXPENSE_ROLE_KEYS) out.push(await describeRole(db, companyId, company, role));
  return out;
}

async function describeRole(
  db: Db,
  companyId: string,
  company: Pick<Company, RoleDef['field']>,
  role: PayrollExpenseRole
): Promise<RoleResolution> {
  const def = PAYROLL_EXPENSE_ROLES[role];
  const mappedId = company[def.field];
  if (mappedId) {
    const mapped = await db.account.findFirst({ where: { id: mappedId, companyId }, select: ACCOUNT_SELECT });
    if (!mapped) return { role, status: 'problem', message: `The ${def.label.toLowerCase()} account chosen in Settings no longer exists. ${SETTINGS_HINT}` };
    if (mapped.type !== 'expense') {
      return { role, status: 'problem', conflict: mapped, message: `${mapped.code} ${mapped.name} is not an expense account. ${SETTINGS_HINT}` };
    }
    if (!mapped.isActive) {
      return { role, status: 'problem', conflict: mapped, message: `${mapped.code} ${mapped.name} is inactive. Reactivate it or ${SETTINGS_HINT.charAt(0).toLowerCase()}${SETTINGS_HINT.slice(1)}` };
    }
    return { role, status: 'mapped', account: mapped };
  }

  const atCode = await db.account.findFirst({ where: { companyId, code: def.code }, select: ACCOUNT_SELECT });
  if (atCode && fitsRole(role, atCode) && atCode.isActive) return { role, status: 'standard', account: atCode };

  if (role === 'taxAdjustments') {
    // System-managed: an existing one by name, else it is created on first use.
    const byName = await db.account.findFirst({
      where: { companyId, type: 'expense', isActive: true, name: getCatalogAccount(def.code)!.name },
      select: ACCOUNT_SELECT,
    });
    if (byName) return { role, status: 'standard', account: byName };
    const code = atCode ? await nextFreeCode(db, companyId, def.code) : def.code;
    return { role, status: 'will_create', code, name: getCatalogAccount(def.code)!.name };
  }

  if (!atCode) return { role, status: 'will_create', code: def.code, name: getCatalogAccount(def.code)!.name };
  return {
    role,
    status: 'problem',
    conflict: atCode,
    message: atCode.isActive && atCode.type === 'expense' && !fitsRole(role, atCode)
      ? `Payroll would post ${def.label.toLowerCase()} to ${atCode.code}, but ${atCode.code} is "${atCode.name}" in your chart. ${SETTINGS_HINT}`
      : `Account ${atCode.code} "${atCode.name}" can't take ${def.label.toLowerCase()} (${atCode.isActive ? atCode.type : 'inactive'}). ${SETTINGS_HINT}`,
  };
}

async function nextFreeCode(db: Db, companyId: string, start: string): Promise<string> {
  const base = Number(start);
  const taken = new Set(
    (await db.account.findMany({ where: { companyId }, select: { code: true } })).map((a) => a.code)
  );
  for (let n = base + 1; n < base + 100; n++) {
    if (!taken.has(String(n))) return String(n);
  }
  throw new PayrollAccountError(`No free account code near ${start} for ${getCatalogAccount(start)?.name ?? start}`);
}

/**
 * Account id for each requested role, creating a missing standard account
 * from the catalog. Throws PayrollAccountError instead of posting to an
 * account that isn't the right kind.
 */
export async function resolvePayrollExpenseAccounts(
  companyId: string,
  roles: PayrollExpenseRole[],
  db: Db = prisma
): Promise<Record<PayrollExpenseRole, string>> {
  const company = await db.company.findUnique({
    where: { id: companyId },
    select: { payrollWagesAccountId: true, payrollTaxExpenseAccountId: true, payrollTaxAdjustmentsAccountId: true },
  });
  if (!company) throw new PayrollAccountError('Company not found');

  const ids = {} as Record<PayrollExpenseRole, string>;
  for (const role of roles) {
    const r = await describeRole(db, companyId, company, role);
    if (r.status === 'problem') throw new PayrollAccountError(r.message);
    if (r.status === 'will_create') {
      const def = getCatalogAccount(PAYROLL_EXPENSE_ROLES[role].code)!;
      const created = await db.account.create({
        data: {
          companyId,
          code: r.code,
          name: def.name,
          type: def.type,
          accountGroup: def.accountGroup,
          description: def.description || null,
          taxLine: def.taxLine || null,
          isActive: true,
        },
        select: { id: true },
      });
      console.log(`Auto-created payroll account ${r.code} (${def.name}) for company ${companyId}`);
      ids[role] = created.id;
    } else {
      ids[role] = r.account.id;
    }
  }
  return ids;
}

/** Validate a Settings choice: an active expense account of this company, or null for the standard code. */
export async function validatePayrollAccountChoice(
  companyId: string,
  accountId: string | null
): Promise<string | null> {
  if (accountId === null) return null;
  const a = await prisma.account.findFirst({ where: { id: accountId, companyId }, select: ACCOUNT_SELECT });
  if (!a) return 'Account not found';
  if (a.type !== 'expense') return `${a.code} ${a.name} is not an expense account`;
  if (!a.isActive) return `${a.code} ${a.name} is inactive`;
  return null;
}
