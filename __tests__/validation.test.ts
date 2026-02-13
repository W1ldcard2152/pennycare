import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  createEmployeeSchema,
  updateEmployeeSchema,
  processPayrollSchema,
  createDeductionSchema,
  createTimeEntrySchema,
  voidPayrollSchema,
  correctPayrollSchema,
  validateRequest,
} from '@/lib/validation';

// ── Register Schema ───────────────────────────────────

describe('registerSchema', () => {
  it('accepts valid registration data', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'securepass123',
      firstName: 'John',
      lastName: 'Doe',
      companyName: 'Acme Corp',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'not-an-email',
      password: 'securepass123',
      firstName: 'John',
      lastName: 'Doe',
      companyName: 'Acme Corp',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'short',
      firstName: 'John',
      lastName: 'Doe',
      companyName: 'Acme Corp',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing required fields', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'securepass123',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty strings', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'securepass123',
      firstName: '',
      lastName: 'Doe',
      companyName: 'Acme Corp',
    });
    expect(result.success).toBe(false);
  });
});

// ── Create Employee Schema ────────────────────────────

describe('createEmployeeSchema', () => {
  const validHourly = {
    firstName: 'Mike',
    lastName: 'Johnson',
    employeeNumber: '001',
    position: 'Mechanic',
    employmentType: 'full-time' as const,
    payType: 'hourly' as const,
    hireDate: '2024-03-15',
    hourlyRate: 25,
  };

  const validSalaried = {
    firstName: 'Lisa',
    lastName: 'Martinez',
    employeeNumber: '002',
    position: 'Manager',
    employmentType: 'full-time' as const,
    payType: 'salary' as const,
    hireDate: '2024-01-01',
    annualSalary: 52000,
  };

  it('accepts valid hourly employee', () => {
    const result = createEmployeeSchema.safeParse(validHourly);
    expect(result.success).toBe(true);
  });

  it('accepts valid salaried employee', () => {
    const result = createEmployeeSchema.safeParse(validSalaried);
    expect(result.success).toBe(true);
  });

  it('rejects hourly employee without hourly rate', () => {
    const result = createEmployeeSchema.safeParse({
      ...validHourly,
      hourlyRate: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('rejects salaried employee without annual salary', () => {
    const result = createEmployeeSchema.safeParse({
      ...validSalaried,
      annualSalary: undefined,
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid employment type', () => {
    const result = createEmployeeSchema.safeParse({
      ...validHourly,
      employmentType: 'contractor',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid pay type', () => {
    const result = createEmployeeSchema.safeParse({
      ...validHourly,
      payType: 'commission',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative hourly rate', () => {
    const result = createEmployeeSchema.safeParse({
      ...validHourly,
      hourlyRate: -10,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing first name', () => {
    const result = createEmployeeSchema.safeParse({
      ...validHourly,
      firstName: '',
    });
    expect(result.success).toBe(false);
  });

  it('accepts string numbers for hourly rate (form data)', () => {
    const result = createEmployeeSchema.safeParse({
      ...validHourly,
      hourlyRate: '25.50',
    });
    expect(result.success).toBe(true);
  });
});

// ── Update Employee Schema ────────────────────────────

describe('updateEmployeeSchema', () => {
  it('accepts valid update data with extra fields (passthrough)', () => {
    const result = updateEmployeeSchema.safeParse({
      firstName: 'Mike',
      lastName: 'Johnson',
      employeeNumber: '001',
      position: 'Lead Mechanic',
      employmentType: 'full-time',
      payType: 'hourly',
      hireDate: '2024-03-15',
      w4FilingStatus: 'married',
      hourlyRate: '35',
    });
    expect(result.success).toBe(true);
  });
});

// ── Process Payroll Schema ────────────────────────────

describe('processPayrollSchema', () => {
  it('accepts valid dates', () => {
    const result = processPayrollSchema.safeParse({
      startDate: '2026-01-01',
      endDate: '2026-01-07',
      payDate: '2026-01-10',
    });
    expect(result.success).toBe(true);
  });

  it('rejects when start date is after end date', () => {
    const result = processPayrollSchema.safeParse({
      startDate: '2026-01-10',
      endDate: '2026-01-07',
      payDate: '2026-01-15',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing dates', () => {
    const result = processPayrollSchema.safeParse({
      startDate: '2026-01-01',
    });
    expect(result.success).toBe(false);
  });
});

// ── Create Deduction Schema ───────────────────────────

describe('createDeductionSchema', () => {
  it('accepts valid deduction', () => {
    const result = createDeductionSchema.safeParse({
      deductionType: '401k',
      name: '401(k) Contribution',
      amountType: 'percentage',
      amount: 6,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid amount type', () => {
    const result = createDeductionSchema.safeParse({
      deductionType: '401k',
      name: '401(k)',
      amountType: 'flatrate',
      amount: 100,
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = createDeductionSchema.safeParse({
      deductionType: '401k',
      name: '401(k)',
      amountType: 'fixed',
      amount: -50,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing deduction type', () => {
    const result = createDeductionSchema.safeParse({
      name: '401(k)',
      amountType: 'fixed',
      amount: 100,
    });
    expect(result.success).toBe(false);
  });
});

// ── Time Entry Schema ─────────────────────────────────

describe('createTimeEntrySchema', () => {
  it('accepts valid time entry', () => {
    const result = createTimeEntrySchema.safeParse({
      employeeId: 'emp-123',
      date: '2026-01-15',
      hoursWorked: 8,
      overtimeHours: 2,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative hours', () => {
    const result = createTimeEntrySchema.safeParse({
      employeeId: 'emp-123',
      date: '2026-01-15',
      hoursWorked: -1,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing employee ID', () => {
    const result = createTimeEntrySchema.safeParse({
      date: '2026-01-15',
      hoursWorked: 8,
    });
    expect(result.success).toBe(false);
  });
});

// ── Void/Correct Schemas ──────────────────────────────

describe('voidPayrollSchema', () => {
  it('accepts valid reason', () => {
    const result = voidPayrollSchema.safeParse({ reason: 'Wrong hours entered' });
    expect(result.success).toBe(true);
  });

  it('rejects empty reason', () => {
    const result = voidPayrollSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing reason', () => {
    const result = voidPayrollSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('correctPayrollSchema', () => {
  it('accepts valid reason', () => {
    const result = correctPayrollSchema.safeParse({ reason: 'Rate was updated' });
    expect(result.success).toBe(true);
  });

  it('rejects empty reason', () => {
    const result = correctPayrollSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });
});

// ── validateRequest helper ────────────────────────────

describe('validateRequest', () => {
  it('returns success with parsed data on valid input', () => {
    const result = validateRequest(voidPayrollSchema, { reason: 'Test' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.reason).toBe('Test');
    }
  });

  it('returns errors on invalid input', () => {
    const result = validateRequest(voidPayrollSchema, { reason: '' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0);
    }
  });
});
