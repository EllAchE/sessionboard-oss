import { NextResponse, type NextRequest } from 'next/server';
import { withSiteChromeHeader } from '@/lib/site-chrome';

/**
 * Tells the root layout whether it is rendering a Cicero page or an embeddable widget. See
 * `lib/site-chrome.ts` for why the answer has to travel on the request.
 */
export function middleware(request: NextRequest) {
  return NextResponse.next({
    request: { headers: withSiteChromeHeader(request.nextUrl.pathname, request.headers) },
  });
}

export const config = {
  /**
   * Everything a layout renders for, which is every document request. The exclusions are assets
   * served without one: Next's own build output, the favicon, and the embed loader script.
   *
   * `/embed/*` is deliberately *not* excluded here. The embed decision lives in
   * `withSiteChromeHeader`, where it is a plain function with tests, rather than in a negative
   * lookahead that no test can reach.
   */
  matcher: ['/((?!_next/static|_next/image|favicon.ico|embed.js).*)'],
};
