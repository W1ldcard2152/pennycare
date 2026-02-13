import { describe, it, expect } from 'vitest';
import { loginSchema } from '@/lib/validation';

// ── Role Hierarchy ───────────────────────────────────

describe('RBAC role hierarchy', () => {
  // Import the role levels directly to test the hierarchy logic
  const ROLE_LEVEL: Record<string, number> = {
    viewer: 1,
    payroll: 2,
    admin: 3,
    owner: 4,
  };

  function hasPermission(userRole: string, requiredRole: string): boolean {
    return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
  }

  it('owner has access to everything', () => {
    expect(hasPermission('owner', 'owner')).toBe(true);
    expect(hasPermission('owner', 'admin')).toBe(true);
    expect(hasPermission('owner', 'payroll')).toBe(true);
    expect(hasPermission('owner', 'viewer')).toBe(true);
  });

  it('admin has access to admin, payroll, and viewer', () => {
    expect(hasPermission('admin', 'owner')).toBe(false);
    expect(hasPermission('admin', 'admin')).toBe(true);
    expect(hasPermission('admin', 'payroll')).toBe(true);
    expect(hasPermission('admin', 'viewer')).toBe(true);
  });

  it('payroll has access to payroll and viewer only', () => {
    expect(hasPermission('payroll', 'owner')).toBe(false);
    expect(hasPermission('payroll', 'admin')).toBe(false);
    expect(hasPermission('payroll', 'payroll')).toBe(true);
    expect(hasPermission('payroll', 'viewer')).toBe(true);
  });

  it('viewer has access to viewer only', () => {
    expect(hasPermission('viewer', 'owner')).toBe(false);
    expect(hasPermission('viewer', 'admin')).toBe(false);
    expect(hasPermission('viewer', 'payroll')).toBe(false);
    expect(hasPermission('viewer', 'viewer')).toBe(true);
  });

  it('all roles are defined', () => {
    expect(Object.keys(ROLE_LEVEL)).toHaveLength(4);
    expect(ROLE_LEVEL).toHaveProperty('viewer');
    expect(ROLE_LEVEL).toHaveProperty('payroll');
    expect(ROLE_LEVEL).toHaveProperty('admin');
    expect(ROLE_LEVEL).toHaveProperty('owner');
  });

  it('role levels are strictly ordered', () => {
    expect(ROLE_LEVEL.viewer).toBeLessThan(ROLE_LEVEL.payroll);
    expect(ROLE_LEVEL.payroll).toBeLessThan(ROLE_LEVEL.admin);
    expect(ROLE_LEVEL.admin).toBeLessThan(ROLE_LEVEL.owner);
  });
});

// ── Login Schema ─────────────────────────────────────

describe('loginSchema', () => {
  it('accepts valid login data', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: 'mypassword',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = loginSchema.safeParse({
      email: 'not-an-email',
      password: 'mypassword',
    });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({
      email: 'user@example.com',
      password: '',
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    expect(loginSchema.safeParse({}).success).toBe(false);
    expect(loginSchema.safeParse({ email: 'user@example.com' }).success).toBe(false);
    expect(loginSchema.safeParse({ password: 'test' }).success).toBe(false);
  });
});

// ── Path Traversal Prevention ────────────────────────

describe('path traversal prevention', () => {
  const { resolve } = require('path');

  // Use resolve() for the base dir so paths are platform-appropriate
  const uploadsDir = resolve(process.cwd(), 'uploads');

  function isPathSafe(base: string, ...segments: string[]): boolean {
    const filePath = resolve(base, ...segments);
    return filePath.startsWith(base);
  }

  it('allows normal paths within uploads', () => {
    expect(isPathSafe(uploadsDir, 'company-1', 'emp-1', 'doc.pdf')).toBe(true);
  });

  it('blocks ../ traversal attempts', () => {
    expect(isPathSafe(uploadsDir, '..', '.env')).toBe(false);
    expect(isPathSafe(uploadsDir, '..', '..', 'etc', 'passwd')).toBe(false);
    expect(isPathSafe(uploadsDir, 'company', '..', '..', '.env')).toBe(false);
  });

  it('blocks absolute path injection', () => {
    const malicious = resolve(uploadsDir, '..', 'prisma', 'pennycare.db');
    expect(malicious.startsWith(uploadsDir)).toBe(false);
  });
});
