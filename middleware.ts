import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from './lib/auth';

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public paths that don't require authentication
  const publicPaths = ['/login', '/register'];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  // API routes that don't require authentication
  const publicApiPaths = ['/api/auth/login', '/api/auth/register', '/api/auth/session'];
  const isPublicApiPath = publicApiPaths.some((path) => pathname.startsWith(path));

  // Check session
  const session = await getSessionFromRequest(request);

  // Redirect to login if not authenticated and trying to access protected route
  if (!session && !isPublicPath && !isPublicApiPath) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect to dashboard if authenticated and trying to access login/register
  if (session && isPublicPath) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Block API requests without authentication (except public API paths)
  if (!session && pathname.startsWith('/api') && !isPublicApiPath) {
    return NextResponse.json(
      { error: 'Authentication required' },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
