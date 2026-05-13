import { describe, it, expect } from 'vitest';
import {
  createTaxDepositSchema,
  createTaxFilingSchema,
  voidTaxDepositSchema,
} from '@/lib/validation';
import { addBusinessDays, parseBusinessDate } from '@/lib/date-utils';

const baseDeposit = {
  taxAuthority: 'federal_941' as const,
  formReference: 'Form 941',
  taxPeriodYear: 2026,
  taxPeriodQuarter: 'Q2' as const,
  depositDate: '2026-05-07',
  paymentMethod: 'EFTPS' as const,
  confirmationNumber: 'EFT-12345',
  federalIncomeTaxWithheld: 100,
  socialSecurityTax: 200,
  medicareTax: 50,
  additionalMedicareTax: 0,
  stateIncomeTaxWithheld: 0,
  stateUnemploymentTax: 0,
  stateDisabilityTax: 0,
  statePaidFamilyLeaveTax: 0,
  totalAmount: 350,
  notes: null,
  bankAccountId: 'bank-account-id-1',
};

describe('createTaxDepositSchema', () => {
  it('accepts a valid federal 941 deposit where breakdown matches total', () => {
    const result = createTaxDepositSchema.safeParse(baseDeposit);
    expect(result.success).toBe(true);
  });

  it('accepts a state deposit (NY withholding) with mixed authority/breakdown', () => {
    const result = createTaxDepositSchema.safeParse({
      ...baseDeposit,
      taxAuthority: 'ny_withholding',
      formReference: 'NYS-1',
      federalIncomeTaxWithheld: 0,
      socialSecurityTax: 0,
      medicareTax: 0,
      stateIncomeTaxWithheld: 700,
      totalAmount: 700,
    });
    expect(result.success).toBe(true);
  });

  it('rejects when breakdown does not equal totalAmount', () => {
    const result = createTaxDepositSchema.safeParse({
      ...baseDeposit,
      totalAmount: 999, // breakdown sums to 350
    });
    expect(result.success).toBe(false);
  });

  it('tolerates one-cent rounding between breakdown and totalAmount', () => {
    const result = createTaxDepositSchema.safeParse({
      ...baseDeposit,
      federalIncomeTaxWithheld: 100.005,
      socialSecurityTax: 200.0,
      medicareTax: 49.99,
      totalAmount: 350.0,
    });
    // Sum is 349.995, total is 350 — diff < 0.01
    expect(result.success).toBe(true);
  });

  it('rejects an unknown tax authority', () => {
    const result = createTaxDepositSchema.safeParse({
      ...baseDeposit,
      taxAuthority: 'made_up_authority',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative tax components', () => {
    const result = createTaxDepositSchema.safeParse({
      ...baseDeposit,
      federalIncomeTaxWithheld: -50,
      socialSecurityTax: 250,
      medicareTax: 50,
      totalAmount: 250,
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive totalAmount', () => {
    const result = createTaxDepositSchema.safeParse({
      ...baseDeposit,
      federalIncomeTaxWithheld: 0,
      socialSecurityTax: 0,
      medicareTax: 0,
      totalAmount: 0,
    });
    expect(result.success).toBe(false);
  });

  it('requires a bankAccountId', () => {
    const { bankAccountId: _ignore, ...rest } = baseDeposit;
    void _ignore;
    const result = createTaxDepositSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('rejects a malformed deposit date', () => {
    const result = createTaxDepositSchema.safeParse({
      ...baseDeposit,
      depositDate: '5/7/2026',
    });
    expect(result.success).toBe(false);
  });

  it('rejects an invalid quarter token', () => {
    const result = createTaxDepositSchema.safeParse({
      ...baseDeposit,
      taxPeriodQuarter: 'Q5',
    });
    expect(result.success).toBe(false);
  });
});

describe('createTaxFilingSchema', () => {
  const baseFiling = {
    formType: '941' as const,
    taxPeriodYear: 2026,
    taxPeriodQuarter: 'Q2' as const,
    filedDate: '2026-07-30',
    filingMethod: 'IRS e-file' as const,
    confirmationNumber: 'IRS-67890',
    totalLiability: 1011.92,
    totalDeposits: 1011.92,
    balanceDue: 0,
    notes: null,
  };

  it('accepts a typical 941 filing record', () => {
    expect(createTaxFilingSchema.safeParse(baseFiling).success).toBe(true);
  });

  it('allows a negative balanceDue (overpayment)', () => {
    const result = createTaxFilingSchema.safeParse({
      ...baseFiling,
      totalDeposits: 1100,
      balanceDue: -88.08,
    });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown form type', () => {
    const result = createTaxFilingSchema.safeParse({
      ...baseFiling,
      formType: 'NYS-100',
    });
    expect(result.success).toBe(false);
  });

  it('rejects negative liability', () => {
    const result = createTaxFilingSchema.safeParse({
      ...baseFiling,
      totalLiability: -10,
    });
    expect(result.success).toBe(false);
  });
});

describe('voidTaxDepositSchema', () => {
  it('requires a non-empty reason', () => {
    expect(voidTaxDepositSchema.safeParse({ reason: '' }).success).toBe(false);
    expect(voidTaxDepositSchema.safeParse({ reason: 'Bad amount' }).success).toBe(true);
  });
});

describe('addBusinessDays (NYS-1 / 941 deadline math)', () => {
  it('adds 5 business days from a Wednesday → following Wednesday', () => {
    // 2026-05-06 is a Wednesday
    const wed = parseBusinessDate('2026-05-06');
    const plus5 = addBusinessDays(wed, 5);
    expect(plus5.toISOString().slice(0, 10)).toBe('2026-05-13');
  });

  it('adds 5 business days from a Thursday → following Thursday', () => {
    // 2026-05-07 is a Thursday
    const thu = parseBusinessDate('2026-05-07');
    const plus5 = addBusinessDays(thu, 5);
    expect(plus5.toISOString().slice(0, 10)).toBe('2026-05-14');
  });

  it('skips weekends correctly', () => {
    // 2026-05-08 is a Friday — +1 business day = next Monday 5/11
    const fri = parseBusinessDate('2026-05-08');
    const plus1 = addBusinessDays(fri, 1);
    expect(plus1.toISOString().slice(0, 10)).toBe('2026-05-11');
  });
});
