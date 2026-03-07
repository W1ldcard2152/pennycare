import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, createToken, setSessionCookie } from '@/lib/auth';
import { registerSchema, validateRequest } from '@/lib/validation';
import { logSecurityEvent } from '@/lib/audit';
import { registerLimiter, getClientIp } from '@/lib/rateLimit';

export async function POST(request: NextRequest) {
  try {
    // Rate limit registrations
    const ip = getClientIp(request);
    const ipCheck = registerLimiter.check(ip);
    if (!ipCheck.allowed) {
      const retryAfterSec = Math.ceil((ipCheck.retryAfterMs || 60000) / 1000);
      return NextResponse.json(
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterSec) } }
      );
    }

    const body = await request.json();

    const validation = validateRequest(registerSchema, body);
    if (!validation.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: validation.errors },
        { status: 400 }
      );
    }

    const { email, password, firstName, lastName, companyName } = validation.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user and company in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create user
      const user = await tx.user.create({
        data: {
          email,
          passwordHash,
          firstName,
          lastName,
        },
      });

      // Create company
      const company = await tx.company.create({
        data: {
          companyName,
          legalBusinessName: companyName,
        },
      });

      // Create user-company access with owner role
      await tx.userCompanyAccess.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: 'owner',
        },
      });

      return { user, company };
    });

    // Create session token
    const token = await createToken({
      userId: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      currentCompanyId: result.company.id,
    });

    await setSessionCookie(token);

    await logSecurityEvent({
      action: 'auth.register',
      metadata: { email: result.user.email, ip, userId: result.user.id },
    });

    return NextResponse.json({
      success: true,
      user: {
        id: result.user.id,
        email: result.user.email,
        firstName: result.user.firstName,
        lastName: result.user.lastName,
      },
      company: {
        id: result.company.id,
        companyName: result.company.companyName,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500 }
    );
  }
}
