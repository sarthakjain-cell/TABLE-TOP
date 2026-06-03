import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Translates URL-safe base64url strings back to standard base64 for browser compatibility.
 */
function decodeBase64Url(base64url: string): string {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  return atob(base64);
}

/**
 * Global Edge Middleware to safeguard administrative and kitchen paths.
 * Enforces role restrictions only if a token is present; otherwise, allows
 * the page components to render their local login/token gates.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/admin') || pathname.startsWith('/kitchen')) {
    const authCookie = request.cookies.get('tabletop_auth_token');

    if (authCookie && authCookie.value) {
      try {
        // Decode the URL-safe base64 token payload safely
        const tokenValue = authCookie.value;
        const rawPayload = decodeBase64Url(tokenValue);
        const { payload } = JSON.parse(rawPayload);
        const { role } = JSON.parse(payload);

        // Admin route restriction
        if (pathname.startsWith('/admin') && role !== 'ADMIN') {
          return NextResponse.redirect(new URL('/', request.url));
        }

        // Kitchen route restriction (permits KITCHEN and ADMIN roles)
        if (pathname.startsWith('/kitchen') && role !== 'ADMIN' && role !== 'KITCHEN') {
          return NextResponse.redirect(new URL('/', request.url));
        }
      } catch (err) {
        // If the token is corrupted, clear the cookie and redirect to root
        const response = NextResponse.redirect(new URL('/', request.url));
        response.cookies.delete('tabletop_auth_token');
        return response;
      }
    }
  }

  return NextResponse.next();
}

// Target specific route pathways to optimize performance
export const config = {
  matcher: ['/admin/:path*', '/kitchen/:path*'],
};
