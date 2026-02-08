import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword, createToken, verifyToken, SessionUser } from '@/lib/auth';

describe('hashPassword', () => {
  it('returns a bcrypt hash string', async () => {
    const hash = await hashPassword('mypassword');
    expect(hash).toBeTruthy();
    expect(hash).not.toBe('mypassword');
    expect(hash.startsWith('$2a$') || hash.startsWith('$2b$')).toBe(true);
  });

  it('produces different hashes for the same password (due to salt)', async () => {
    const hash1 = await hashPassword('samepass');
    const hash2 = await hashPassword('samepass');
    expect(hash1).not.toBe(hash2);
  });
});

describe('verifyPassword', () => {
  it('returns true for correct password', async () => {
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('correct-password', hash);
    expect(result).toBe(true);
  });

  it('returns false for incorrect password', async () => {
    const hash = await hashPassword('correct-password');
    const result = await verifyPassword('wrong-password', hash);
    expect(result).toBe(false);
  });
});

describe('createToken & verifyToken', () => {
  const testUser: SessionUser = {
    userId: 'user-123',
    email: 'test@example.com',
    firstName: 'John',
    lastName: 'Doe',
    currentCompanyId: 'company-456',
  };

  it('creates a valid JWT token string', async () => {
    const token = await createToken(testUser);
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
    // JWTs have 3 parts separated by dots
    expect(token.split('.').length).toBe(3);
  });

  it('verifyToken returns the session data from a valid token', async () => {
    const token = await createToken(testUser);
    const session = await verifyToken(token);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe('user-123');
    expect(session!.email).toBe('test@example.com');
    expect(session!.firstName).toBe('John');
    expect(session!.lastName).toBe('Doe');
    expect(session!.currentCompanyId).toBe('company-456');
  });

  it('verifyToken returns null for an invalid token', async () => {
    const session = await verifyToken('invalid.token.string');
    expect(session).toBeNull();
  });

  it('verifyToken returns null for a tampered token', async () => {
    const token = await createToken(testUser);
    // Tamper with the payload
    const parts = token.split('.');
    parts[1] = parts[1] + 'tampered';
    const tamperedToken = parts.join('.');
    const session = await verifyToken(tamperedToken);
    expect(session).toBeNull();
  });

  it('handles user without currentCompanyId', async () => {
    const userNoCompany: SessionUser = {
      userId: 'user-789',
      email: 'nocompany@example.com',
      firstName: 'Jane',
      lastName: 'Smith',
    };
    const token = await createToken(userNoCompany);
    const session = await verifyToken(token);
    expect(session).not.toBeNull();
    expect(session!.userId).toBe('user-789');
    expect(session!.currentCompanyId).toBeUndefined();
  });
});
