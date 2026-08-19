import { describe, it, expect } from 'vitest';
import { ROLE_LEVEL, normalizeRole, roleAtLeast } from '@/lib/api-utils';

describe('role ladder', () => {
  it('orders OWNER > APPROVER > BOOKKEEPER > VIEWER', () => {
    expect(ROLE_LEVEL.OWNER).toBeGreaterThan(ROLE_LEVEL.APPROVER);
    expect(ROLE_LEVEL.APPROVER).toBeGreaterThan(ROLE_LEVEL.BOOKKEEPER);
    expect(ROLE_LEVEL.BOOKKEEPER).toBeGreaterThan(ROLE_LEVEL.VIEWER);
  });

  it('maps legacy role values in place', () => {
    expect(normalizeRole('owner')).toBe('OWNER');
    expect(normalizeRole('admin')).toBe('APPROVER');
    expect(normalizeRole('payroll')).toBe('BOOKKEEPER');
    expect(normalizeRole('viewer')).toBe('VIEWER');
  });

  it('passes through already-migrated values', () => {
    expect(normalizeRole('OWNER')).toBe('OWNER');
    expect(normalizeRole('BOOKKEEPER')).toBe('BOOKKEEPER');
  });

  it('returns null for unknown roles', () => {
    expect(normalizeRole('superuser')).toBeNull();
  });

  it('roleAtLeast enforces the ladder', () => {
    expect(roleAtLeast('OWNER', 'APPROVER')).toBe(true);
    expect(roleAtLeast('APPROVER', 'APPROVER')).toBe(true);
    expect(roleAtLeast('BOOKKEEPER', 'APPROVER')).toBe(false);
    expect(roleAtLeast('VIEWER', 'BOOKKEEPER')).toBe(false);
  });
});
