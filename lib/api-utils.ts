import { NextResponse } from 'next/server';
import { getSession } from './auth';

export async function requireCompanyAccess() {
  const session = await getSession();

  if (!session) {
    return {
      error: NextResponse.json({ error: 'Not authenticated' }, { status: 401 }),
      session: null,
      companyId: null,
    };
  }

  if (!session.currentCompanyId) {
    return {
      error: NextResponse.json({ error: 'No company selected' }, { status: 400 }),
      session,
      companyId: null,
    };
  }

  return {
    error: null,
    session,
    companyId: session.currentCompanyId,
  };
}
