import { NextResponse, type NextRequest } from 'next/server';

/** Must match AUTH_COOKIE_NAME in the API. */
export const SESSION_COOKIE = 'cargoflow_session';

/**
 * Optimistic route guard: pages require a session cookie to render. This only avoids flashing
 * protected screens to signed-out visitors — the API validates the token on every request and
 * the client redirects to /login on any 401.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (pathname === '/login') return NextResponse.next();

  if (!request.cookies.get(SESSION_COOKIE)?.value) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = pathname === '/' ? '' : `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // Everything except the API proxy, Next internals and static files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|ico|txt)$).*)'],
};
