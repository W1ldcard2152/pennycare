import { describe, it, expect } from 'vitest';
import {
  parseCapitalOne,
  parseChase,
  parsePayPalCredit,
  parseESLBank,
} from '@/lib/cc-parsers';

// Helper to format date as YYYY-MM-DD for readable assertions
function d(date: Date): string {
  return date.toISOString().slice(0, 10);
}

describe('parseChase', () => {
  it('parses a basic single-line transaction', () => {
    const r = parseChase('01/25     E-Z*PASSNY REBILL 800-333-8655 NY 50.00', 2025, 0);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].amount).toBe(50);
    expect(r.transactions[0].isCredit).toBe(false);
    expect(r.transactions[0].description).toContain('E-Z*PASSNY');
  });

  it('parses a credit (negative amount attached)', () => {
    const r = parseChase('01/28     eBay O*26-12528-08142 800-4563229 CA-73.88', 2025, 0);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].amount).toBe(73.88);
    expect(r.transactions[0].isCredit).toBe(true);
  });

  it('handles sub-dollar amounts (.90)', () => {
    const r = parseChase('01/15     SOME CHARGE VA     .90', 2025, 0);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].amount).toBe(0.9);
  });

  it('handles multi-line transactions with newline continuation', () => {
    const text = [
      '01/09     Amazon.com*ZD61W6B40 Amzn.com/bill WA     23.68',
      'Order Number     113-8931723-9944253',
      '01/15     PAYPAL *ADVANCEAUTO 877-238-2623 VA     23.21',
    ].join('\n');
    const r = parseChase(text, 2025, 0);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0].amount).toBe(23.68);
    expect(r.transactions[0].description).toContain('Order Number');
    expect(r.transactions[0].description).toContain('113-8931723-9944253');
    expect(r.transactions[1].amount).toBe(23.21);
  });

  it('handles multi-line transactions with space-joined continuation (PDF paste)', () => {
    const text =
      '01/09     Amazon.com*ZD61W6B40 Amzn.com/bill WA     23.68     Order Number     113-8931723-9944253     01/15     PAYPAL VA     23.21';
    const r = parseChase(text, 2025, 0);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0].amount).toBe(23.68);
    expect(r.transactions[0].description).toContain('Order Number');
    expect(r.transactions[1].amount).toBe(23.21);
  });

  it('handles year rollover (Dec transaction on Jan statement)', () => {
    const r = parseChase('12/28     PURCHASE     100.00', 2026, 0); // statement ends Jan 2026
    expect(r.transactions[0].transDate.getUTCFullYear()).toBe(2025);
  });

  it('does not rollover when month is near statement end', () => {
    const r = parseChase('10/15     PURCHASE     100.00', 2025, 9); // statement ends Oct 2025
    expect(r.transactions[0].transDate.getUTCFullYear()).toBe(2025);
  });

  it('parses multiple transactions correctly', () => {
    const text = [
      '01/08     eBay O*19-12545-51893 408-3766151 CA     65.00',
      '01/09     Amazon.com*ZD61W6B40 Amzn.com/bill WA     23.68',
      'Order Number     113-8931723-9944253',
      '01/12     Amazon.com*Z533X6CK0 Amzn.com/bill WA     13.75',
      'Order Number     112-9710330-9857836',
      '01/12     Amazon.com*Z543C7CV0 Amzn.com/bill WA     28.15',
      'Order Number     114-0550271-1093818',
      '01/15     PAYPAL *ADVANCEAUTO 877-238-2623 VA     23.21',
      '01/15     SQ *TCI LOGISTICS INC gosq.com IL     50.00',
    ].join('\n');
    const r = parseChase(text, 2025, 0);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(6);
    expect(r.transactions.map((t) => t.amount)).toEqual([65, 23.68, 13.75, 28.15, 23.21, 50]);
  });
});

describe('parseCapitalOne', () => {
  it('parses a basic transaction', () => {
    const r = parseCapitalOne('Dec 16 Dec 17 USPS STAMPS ENDICIA888-434-0055DC $100.00', 2025, 11);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].amount).toBe(100);
    expect(r.transactions[0].isCredit).toBe(false);
  });

  it('parses a credit with space-prefixed amount', () => {
    const r = parseCapitalOne('Mar 19 Mar 19 CREDIT-CASH BACK REWARD - $208.51', 2025, 2);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].amount).toBe(208.51);
    expect(r.transactions[0].isCredit).toBe(true);
  });

  it('handles year rollover correctly', () => {
    // Dec transaction on a Jan statement (year=2026, endMonth=0)
    const r = parseCapitalOne('Dec 28 Dec 29 PURCHASE $50.00', 2026, 0);
    expect(r.transactions[0].transDate.getUTCFullYear()).toBe(2025);
    expect(r.transactions[0].postDate!.getUTCFullYear()).toBe(2025);
  });

  it('does NOT rollover when month is near statement end', () => {
    // Oct transaction on an Oct statement — same year
    const r = parseCapitalOne('Oct 15 Oct 16 PURCHASE $50.00', 2025, 9);
    expect(r.transactions[0].transDate.getUTCFullYear()).toBe(2025);
  });
});

describe('parsePayPalCredit', () => {
  it('parses a charge', () => {
    const r = parsePayPalCredit(
      '01/08/25 01/08/25 P92830009EHM6LLAJ Deferred EBAY 800-456-3229 No Interest If Paid In Full $126.74'
    );
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].amount).toBe(126.74);
    expect(r.transactions[0].isCredit).toBe(false);
    expect(d(r.transactions[0].transDate)).toBe('2025-01-08');
  });

  it('parses a payment (negative)', () => {
    const r = parsePayPalCredit(
      '01/20/25 01/20/25 P9283000L01KJFT22 Online Payment Thank You Alpharetta   Ga-$72.00'
    );
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].amount).toBe(72);
    expect(r.transactions[0].isCredit).toBe(true);
  });
});

describe('parseESLBank', () => {
  const sampleText = [
    '01/01 Beginning Balance 2500.00',
    '01/02 ACH Deposit eBay ComTM7L5ZA0 - PAYMENTS NTE ZZZ 65.00 2565.00',
    'P6697161785 5UI782RZSEQHB61',
    '01/02 ACH Deposit eBay ComCLYN4S3U - PAYMENTS NTE ZZZ 89.99 2654.99',
    'P6695912105 PKFYPA4TUK1VI6B',
    '01/02 ACH Withdrawal NYSIF - WEB_PAY 150.00 2504.99',
  ].join('\n');

  it('parses deposits and withdrawals correctly', () => {
    const r = parseESLBank(sampleText, 2025, 1);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(3);

    // First deposit
    expect(r.transactions[0].amount).toBe(65);
    expect(r.transactions[0].isCredit).toBe(true); // deposit
    expect(r.transactions[0].description).toContain('ACH Deposit eBay');

    // Second deposit
    expect(r.transactions[1].amount).toBe(89.99);
    expect(r.transactions[1].isCredit).toBe(true);

    // Withdrawal
    expect(r.transactions[2].amount).toBe(150);
    expect(r.transactions[2].isCredit).toBe(false); // withdrawal
    expect(r.transactions[2].description).toContain('NYSIF');
  });

  it('skips the Beginning Balance line', () => {
    const r = parseESLBank('01/01 Beginning Balance 2500.00', 2025, 1);
    expect(r.transactions).toHaveLength(0);
    // With only a beginning balance and no real transactions, parser warns
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toContain('No transactions could be parsed');
  });

  it('captures continuation text (reference numbers)', () => {
    const r = parseESLBank(sampleText, 2025, 1);
    expect(r.transactions[0].description).toContain('P6697161785');
    expect(r.transactions[0].description).toContain('5UI782RZSEQHB61');
    expect(r.transactions[1].description).toContain('P6695912105');
  });

  it('works with space-joined text (no newlines, PDF paste)', () => {
    const spacedText =
      '01/01 Beginning Balance 2500.00 01/02 ACH Deposit eBay ComTM7L5ZA0 - PAYMENTS NTE ZZZ 65.00 2565.00 P6697161785 5UI782RZSEQHB61 01/02 ACH Withdrawal NYSIF - WEB_PAY 150.00 2415.00';
    const r = parseESLBank(spacedText, 2025, 1);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(2);
    expect(r.transactions[0].amount).toBe(65);
    expect(r.transactions[0].isCredit).toBe(true);
    expect(r.transactions[0].description).toContain('P6697161785');
    expect(r.transactions[1].amount).toBe(150);
    expect(r.transactions[1].isCredit).toBe(false);
  });

  it('handles sub-dollar amounts', () => {
    const text = '01/01 Beginning Balance 100.00\n01/02 Small Fee .50 99.50';
    const r = parseESLBank(text, 2025, 1);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions).toHaveLength(1);
    expect(r.transactions[0].amount).toBe(0.5);
    expect(r.transactions[0].isCredit).toBe(false); // balance went down
  });

  it('handles year rollover', () => {
    const r = parseESLBank(
      '12/28 Beginning Balance 1000.00\n12/30 Some Deposit 50.00 1050.00',
      2026,
      0 // statement ends Jan 2026
    );
    expect(r.transactions[0].transDate.getUTCFullYear()).toBe(2025);
  });

  it('handles comma-formatted amounts', () => {
    const text = '01/01 Beginning Balance 10,000.00\n01/02 Big Deposit 1,500.00 11,500.00';
    const r = parseESLBank(text, 2025, 1);
    expect(r.errors).toHaveLength(0);
    expect(r.transactions[0].amount).toBe(1500);
    expect(r.transactions[0].isCredit).toBe(true);
  });

  it('returns error for empty input', () => {
    const r = parseESLBank('some text with no valid transactions', 2025, 1);
    expect(r.transactions).toHaveLength(0);
    expect(r.errors.length).toBeGreaterThan(0);
  });
});
