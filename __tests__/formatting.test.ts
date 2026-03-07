import { describe, it, expect } from 'vitest';
import { formatSSN, maskSSN, maskAccountNumber, formatPhoneNumber } from '@/lib/formatting';

describe('formatSSN', () => {
  it('formats a 9-digit string as XXX-XX-XXXX', () => {
    expect(formatSSN('123456789')).toBe('123-45-6789');
  });

  it('strips non-digit characters before formatting', () => {
    expect(formatSSN('123-45-6789')).toBe('123-45-6789');
    expect(formatSSN('123 45 6789')).toBe('123-45-6789');
  });

  it('returns original string if not 9 digits', () => {
    expect(formatSSN('12345')).toBe('12345');
    expect(formatSSN('1234567890')).toBe('1234567890');
    expect(formatSSN('')).toBe('');
  });
});

describe('maskSSN', () => {
  it('masks first 5 digits and shows last 4', () => {
    expect(maskSSN('123456789')).toBe('***-**-6789');
  });

  it('strips non-digit characters before masking', () => {
    expect(maskSSN('123-45-6789')).toBe('***-**-6789');
  });

  it('returns full mask if not 9 digits', () => {
    expect(maskSSN('12345')).toBe('***-**-****');
    expect(maskSSN('')).toBe('***-**-****');
  });
});

describe('maskAccountNumber', () => {
  it('shows only last 4 digits', () => {
    expect(maskAccountNumber('123456789012')).toBe('****9012');
  });

  it('handles short account numbers', () => {
    expect(maskAccountNumber('123')).toBe('****');
  });

  it('returns empty string for empty input', () => {
    expect(maskAccountNumber('')).toBe('');
  });

  it('strips non-digit characters', () => {
    expect(maskAccountNumber('1234-5678-9012')).toBe('****9012');
  });
});

describe('formatPhoneNumber', () => {
  it('formats 10-digit number as (XXX) XXX-XXXX', () => {
    expect(formatPhoneNumber('5551234567')).toBe('(555) 123-4567');
  });

  it('strips non-digit characters before formatting', () => {
    expect(formatPhoneNumber('555-123-4567')).toBe('(555) 123-4567');
    expect(formatPhoneNumber('(555) 123-4567')).toBe('(555) 123-4567');
  });

  it('returns original string if not 10 digits', () => {
    expect(formatPhoneNumber('12345')).toBe('12345');
    expect(formatPhoneNumber('15551234567')).toBe('15551234567');
  });

  it('returns empty string for empty input', () => {
    expect(formatPhoneNumber('')).toBe('');
  });
});
