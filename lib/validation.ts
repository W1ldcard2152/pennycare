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
