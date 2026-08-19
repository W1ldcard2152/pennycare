import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { hashPassword, createToken, setSessionCookie } from '@/lib/auth';
import { registerSchema, validateRequest } from '@/lib/validation';
import { logSecurityEvent } from '@/lib/audit';
import { registerLimiter, getClientIp } from '@/lib/rateLimit';

// POST /api/auth/register — FIRST-RUN SETUP ONLY.
//
// Open self-service registration was removed in 1.2. This endpoint now creates
// the very first user (and their company) when the database has no users yet —
// the only self-service account creation that exists. Once any user exists, it
// returns 403; further users are minted by an OWNER via /api/users.
export async function POST(request: NextRequest) {
  try {
    // Gate: first-run only. If any user exists, registration is closed.
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      return NextResponse.json(
        { error: 'Registration is closed. Ask an owner to create an account for you.' },
        { status: 403 }
      );
    }

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

      // Create user-company access with OWNER role
      await tx.userCompanyAccess.create({
        data: {
          userId: user.id,
          companyId: company.id,
          role: 'OWNER',
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
