import { z } from 'zod';

// ── Auth ──────────────────────────────────────────────

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  companyName: z.string().min(1, 'Company name is required'),
});

// ── Employees ─────────────────────────────────────────

export const createEmployeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  employeeNumber: z.string().min(1, 'Employee number is required'),
  position: z.string().min(1, 'Position is required'),
  employmentType: z.enum(['full-time', 'part-time'], {
    message: 'Employment type must be "full-time" or "part-time"',
  }),
  payType: z.enum(['hourly', 'salary'], {
    message: 'Pay type must be "hourly" or "salary"',
  }),
  hireDate: z.string().min(1, 'Hire date is required'),
  hourlyRate: z.union([z.string(), z.number()]).optional().refine(
    (val) => val === undefined || val === null || val === '' || Number(val) >= 0,
    { message: 'Hourly rate cannot be negative' }
  ),
  annualSalary: z.union([z.string(), z.number()]).optional().refine(
    (val) => val === undefined || val === null || val === '' || Number(val) >= 0,
    { message: 'Annual salary cannot be negative' }
  ),
  w4FilingStatus: z.string().optional(),
}).refine(
  (data) => {
    if (data.payType === 'hourly') {
      return data.hourlyRate !== undefined && data.hourlyRate !== null && data.hourlyRate !== '' && Number(data.hourlyRate) > 0;
    }
    return true;
  },
  { message: 'Hourly rate is required for hourly employees', path: ['hourlyRate'] }
).refine(
  (data) => {
    if (data.payType === 'salary') {
      return data.annualSalary !== undefined && data.annualSalary !== null && data.annualSalary !== '' && Number(data.annualSalary) > 0;
    }
    return true;
  },
  { message: 'Annual salary is required for salaried employees', path: ['annualSalary'] }
);

export const updateEmployeeSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  employeeNumber: z.string().min(1, 'Employee number is required'),
  position: z.string().min(1, 'Position is required'),
  employmentType: z.enum(['full-time', 'part-time'], {
    message: 'Employment type must be "full-time" or "part-time"',
  }),
  payType: z.enum(['hourly', 'salary'], {
    message: 'Pay type must be "hourly" or "salary"',
  }),
  hireDate: z.string().min(1, 'Hire date is required'),
}).passthrough(); // Allow additional fields for tax settings, payment info, etc.

// ── Payroll ───────────────────────────────────────────

export const processPayrollSchema = z.object({
  startDate: z.string().min(1, 'Start date is required'),
  endDate: z.string().min(1, 'End date is required'),
  payDate: z.string().min(1, 'Pay date is required'),
}).refine(
  (data) => new Date(data.startDate) <= new Date(data.endDate),
  { message: 'Start date must be before end date', path: ['startDate'] }
);

export const voidPayrollSchema = z.object({
  reason: z.string().min(1, 'A reason is required to void a payroll record'),
});

export const correctPayrollSchema = z.object({
  reason: z.string().min(1, 'A reason is required to correct a payroll record'),
});

// ── Deductions ────────────────────────────────────────

export const createDeductionSchema = z.object({
  deductionType: z.string().min(1, 'Deduction type is required'),
  name: z.string().min(1, 'Deduction name is required'),
  amountType: z.enum(['fixed', 'percentage'], {
    message: 'Amount type must be "fixed" or "percentage"',
  }),
  amount: z.union([z.string(), z.number()]).refine(
    (val) => Number(val) >= 0,
    { message: 'Amount cannot be negative' }
  ),
  preTax: z.union([z.boolean(), z.string()]).optional().transform(
    (val) => val === true || val === 'true'
  ),
  annualLimit: z.union([z.string(), z.number()]).optional().nullable(),
  ytdAmount: z.union([z.string(), z.number()]).optional(),
  caseNumber: z.string().optional().nullable(),
  totalOwed: z.union([z.string(), z.number()]).optional().nullable(),
  remainingBalance: z.union([z.string(), z.number()]).optional().nullable(),
  isActive: z.union([z.boolean(), z.string()]).optional(),
  effectiveDate: z.string().optional(),
  endDate: z.string().optional().nullable(),
});

// ── Time Entries ──────────────────────────────────────

export const createTimeEntrySchema = z.object({
  employeeId: z.string().min(1, 'Employee ID is required'),
  date: z.string().min(1, 'Date is required'),
  hoursWorked: z.union([z.string(), z.number()]).refine(
    (val) => Number(val) >= 0,
    { message: 'Hours worked cannot be negative' }
  ),
  overtimeHours: z.union([z.string(), z.number()]).optional().refine(
    (val) => val === undefined || Number(val) >= 0,
    { message: 'Overtime hours cannot be negative' }
  ),
  notes: z.string().optional().nullable(),
});

// ── Bookkeeping ──────────────────────────────────────

// Valid subtypes per account type
const VALID_SUBTYPES: Record<string, string[]> = {
  asset: ['bank_checking', 'bank_savings', 'accounts_receivable', 'other_current_asset', 'fixed_asset', 'other_asset'],
  liability: ['accounts_payable', 'other_current_liability', 'long_term_liability'],
  equity: ['owners_equity', 'retained_earnings', 'opening_balance_equity'],
  revenue: ['income', 'other_income'],
  expense: ['expense', 'other_expense', 'cost_of_goods_sold'],
  credit_card: ['credit_card'],
};

const accountTypeEnum = z.enum(['asset', 'liability', 'equity', 'revenue', 'expense', 'credit_card'], {
  message: 'Account type must be asset, liability, equity, revenue, expense, or credit_card',
});

export const createAccountSchema = z.object({
  code: z.string().min(1, 'Account code is required').max(10, 'Account code must be 10 characters or less'),
  name: z.string().min(1, 'Account name is required').max(100, 'Account name must be 100 characters or less'),
  type: accountTypeEnum,
  subtype: z.string().min(1, 'Subtype is required'),
  description: z.string().optional().nullable(),
  taxLine: z.string().optional().nullable(),
}).superRefine((data, ctx) => {
  const validSubtypes = VALID_SUBTYPES[data.type];
  if (!validSubtypes || !validSubtypes.includes(data.subtype)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `Invalid subtype '${data.subtype}' for account type '${data.type}'. Valid subtypes: ${validSubtypes?.join(', ') || 'none'}`,
      path: ['subtype'],
    });
  }
});

export const updateAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100).optional(),
  type: accountTypeEnum.optional(),
  subtype: z.string().min(1, 'Subtype is required').optional(),
  description: z.string().optional().nullable(),
  taxLine: z.string().optional().nullable(),
  isActive: z.boolean().optional(),
}).superRefine((data, ctx) => {
  // Only validate subtype if both type and subtype are provided
  if (data.type && data.subtype) {
    const validSubtypes = VALID_SUBTYPES[data.type];
    if (!validSubtypes || !validSubtypes.includes(data.subtype)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid subtype '${data.subtype}' for account type '${data.type}'. Valid subtypes: ${validSubtypes?.join(', ') || 'none'}`,
        path: ['subtype'],
      });
    }
  }
});

const journalEntryLineSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  description: z.string().optional().nullable(),
  debit: z.union([z.string(), z.number()]).transform((v) => Number(v) || 0),
  credit: z.union([z.string(), z.number()]).transform((v) => Number(v) || 0),
});

export const createJournalEntrySchema = z.object({
  date: z.string().min(1, 'Date is required'),
  memo: z.string().min(1, 'Memo/description is required'),
  referenceNumber: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(journalEntryLineSchema).min(2, 'At least 2 lines are required'),
});

export const createVendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required'),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const updateVendorSchema = z.object({
  name: z.string().min(1, 'Vendor name is required').optional(),
  email: z.string().email('Invalid email').optional().nullable().or(z.literal('')),
  phone: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  zipCode: z.string().optional().nullable(),
  taxId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const createExpenseSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  vendorId: z.string().optional().nullable(),
  description: z.string().min(1, 'Description is required'),
  category: z.string().min(1, 'Category is required'),
  amount: z.union([z.string(), z.number()]).refine(
    (val) => Number(val) > 0,
    { message: 'Amount must be greater than 0' }
  ),
  paymentMethod: z.string().optional().nullable(),
  referenceNumber: z.string().optional().nullable(),
  debitAccountId: z.string().optional().nullable(),
  creditAccountId: z.string().optional().nullable(),
  isPaid: z.union([z.boolean(), z.string()]).optional().transform(
    (val) => val === true || val === 'true'
  ),
  paidDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ── CSV Import ──────────────────────────────────────

export const importExpenseBatchSchema = z.object({
  sourceAccountId: z.string().min(1, 'Source account is required'),
  expenses: z.array(z.object({
    date: z.string().min(1, 'Date is required'),
    description: z.string().min(1, 'Description is required'),
    amount: z.union([z.string(), z.number()]).refine(
      (val) => Number(val) > 0,
      { message: 'Amount must be greater than 0' }
    ),
    category: z.string().optional().nullable(),
    paymentMethod: z.string().optional().nullable(),
    referenceNumber: z.string().optional().nullable(),
    debitAccountId: z.string().min(1, 'Debit account is required'),
    isPaid: z.boolean().optional(),
    notes: z.string().optional().nullable(),
  })).min(1, 'At least one expense is required'),
});

// ── eBay Sales Import ──────────────────────────────────

export const ebayImportQuerySchema = z.object({
  batchName: z.string().min(1, 'Batch name is required'),
});

// ── Bank/CC Statement Import ──────────────────────────────────

export const createTransactionRuleSchema = z.object({
  matchType: z.enum(['starts_with', 'contains', 'ends_with'], {
    message: 'Match type must be starts_with, contains, or ends_with',
  }),
  matchText: z.string().min(1, 'Match text is required'),
  targetAccountId: z.string().min(1, 'Target account is required'),
  defaultMemo: z.string().optional().nullable(),
  sourceAccountId: z.string().optional().nullable(),
  priority: z.union([z.string(), z.number()]).transform((v) => Number(v) || 0).pipe(
    z.number().int().min(0, 'Priority must be 0 or greater')
  ),
});

export const updateTransactionRuleSchema = z.object({
  matchType: z.enum(['starts_with', 'contains', 'ends_with']).optional(),
  matchText: z.string().min(1).optional(),
  targetAccountId: z.string().min(1).optional(),
  defaultMemo: z.string().optional().nullable(),
  sourceAccountId: z.string().optional().nullable(),
  priority: z.union([z.string(), z.number()]).transform((v) => Number(v) || 0).pipe(
    z.number().int().min(0)
  ).optional(),
  isActive: z.boolean().optional(),
});

export const updateStatementImportSchema = z.object({
  targetAccountId: z.string().min(1).optional().nullable(),
  matchedRuleId: z.string().min(1).optional().nullable(),
  memo: z.string().optional().nullable(),
  status: z.enum(['pending', 'booked', 'skipped']).optional(),
});

export const bookTransactionsSchema = z.union([
  z.object({
    ids: z.array(z.string().min(1)).min(1, 'At least one ID is required'),
  }),
  z.object({
    batchName: z.string().min(1, 'Batch name is required'),
    bookMatched: z.literal(true),
  }),
]);

export const ebaySalesQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  importBatch: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

// ── Reconciliation ──────────────────────────────────

export const startReconciliationSchema = z.object({
  accountId: z.string().min(1, 'Account is required'),
  statementStartDate: z.string().min(1, 'Statement start date is required'),
  statementEndDate: z.string().min(1, 'Statement end date is required'),
  statementBalance: z.union([z.string(), z.number()]).transform((v) => Number(v)),
});

export const toggleClearedSchema = z.object({
  journalEntryLineId: z.string().min(1, 'Journal entry line ID is required'),
  cleared: z.boolean(),
});

export const completeReconciliationSchema = z.object({
  createAdjustment: z.boolean().optional().default(false),
  adjustmentAccountId: z.string().optional().nullable(),
});

export const reopenReconciliationSchema = z.object({
  reason: z.string().min(1, 'A reason is required to reopen a reconciliation'),
});

// ── Credit Card Statement Import ──────────────────────────────────

export const ccParseSchema = z.object({
  format: z.enum(['capital_one', 'chase', 'paypal_credit'], {
    message: 'Format must be capital_one, chase, or paypal_credit',
  }),
  transactionsText: z.string().optional().default(''),
  paymentsText: z.string().optional().default(''),
  statementEndDate: z.string().min(1, 'Statement end date is required'),
});

const ccPaymentSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  description: z.string().min(1, 'Description is required'),
  amount: z.union([z.string(), z.number()]).transform((v) => Number(v)),
});

const ccTransactionSchema = z.object({
  date: z.string().min(1, 'Date is required'),
  description: z.string().min(1, 'Description is required'),
  amount: z.union([z.string(), z.number()]).transform((v) => Number(v)),
  isCredit: z.boolean(),
  targetAccountId: z.string().optional().nullable(),
});

export const ccSubmitSchema = z.object({
  sourceAccountId: z.string().min(1, 'Source account is required'),
  format: z.string().min(1, 'Format is required'),
  statementEndDate: z.string().min(1, 'Statement end date is required'),
  batchName: z.string().min(1, 'Batch name is required'),
  interestAmount: z.union([z.string(), z.number()]).transform((v) => Number(v) || 0),
  interestAccountId: z.string().optional().nullable(),
  payments: z.array(ccPaymentSchema).default([]),
  transactions: z.array(ccTransactionSchema).default([]),
});

// ── Helper ────────────────────────────────────────────

/**
 * Validate request data against a Zod schema.
 * Returns { success: true, data } or { success: false, error: NextResponse }
 */
export function validateRequest<T>(
  schema: z.ZodType<T>,
  data: unknown
): { success: true; data: T } | { success: false; errors: z.ZodError['issues'] } {
  const result = schema.safeParse(data);
  if (!result.success) {
    return { success: false, errors: result.error.issues };
  }
  return { success: true, data: result.data };
}
