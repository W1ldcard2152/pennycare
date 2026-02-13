import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { verifyPassword, createToken, setSessionCookie } from '@/lib/auth';
import { loginSchema, validateRequest } from '@/lib/validation';
import { logSecurityEvent } from '@/lib/audit';
import { loginLimiter, accountLockout, getClientIp } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    // 1. IP rate limit
    const ipCheck = loginLimiter.check(ip);
    if (!ipCheck.allowed) {
      const retryAfterSec = Math.ceil((ipCheck.retryAfterMs || 60000) / 1000);
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      );
    }

    // 2. Validate input
    const body = await request.json();
    const validation = validateRequest(loginSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }
    const { email, password } = validation.data;
    const emailLower = email.toLowerCase();

    // 3. Account lockout check (per email, before expensive bcrypt)
    const lockCheck = accountLockout.isLocked(emailLower);
    if (lockCheck.locked) {
      await logSecurityEvent({
        action: 'auth.account_locked',
        metadata: { email: emailLower, ip },
      });
      const retryAfterSec = Math.ceil((lockCheck.retryAfterMs || 60000) / 1000);
      return NextResponse.json(
        { error: 'Account temporarily locked due to too many failed attempts. Try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      );
    }

    // 4. Find user
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        companyAccess: {
          include: {
            company: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      accountLockout.recordFailure(emailLower);
      await logSecurityEvent({
        action: 'auth.login_failed',
        metadata: { email, reason: 'user_not_found_or_inactive', ip },
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // 5. Verify password
    const isValid = await verifyPassword(password, user.passwordHash);

    if (!isValid) {
      accountLockout.recordFailure(emailLower);
      await logSecurityEvent({
        action: 'auth.login_failed',
        metadata: { email, reason: 'invalid_password', ip, userId: user.id },
      });
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // 6. Success — reset lockout, log, and issue token
    accountLockout.reset(emailLower);

    const defaultCompany = user.companyAccess[0]?.company;

    const token = await createToken({
      userId: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      currentCompanyId: defaultCompany?.id,
    });

    await setSessionCookie(token);

    await logSecurityEvent({
      action: 'auth.login_success',
      metadata: { email, ip, userId: user.id },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
      companies: user.companyAccess.map((access) => ({
        id: access.company.id,
        companyName: access.company.companyName,
        role: access.role,
      })),
      currentCompanyId: defaultCompany?.id,
    });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Failed to log in' },
      { status: 500 }
    );
  }
}
