import { NextResponse, type NextRequest } from 'next/server';
import { consumeMagicLink } from '@/lib/auth';
import { appUrl } from '@/lib/env';
import { authRedirect, localAuthOrigin } from '@/app/signin/redirect';

function publicRedirect(path: string, request: NextRequest): NextResponse {
  return NextResponse.redirect(new URL(path, localAuthOrigin(request.headers) ?? appUrl()));
}

/**
 * A GET that mutates, deliberately: the link arrives in an email client and a mail scanner that
 * prefetches it burns the token, which is the intended single-use behaviour rather than a bug.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return publicRedirect('/signin?error=missing', request);
  }

  try {
    const { redirectTo } = await consumeMagicLink(token);
    return publicRedirect(authRedirect(redirectTo, '/organizer'), request);
  } catch {
    return publicRedirect('/signin?error=expired', request);
  }
}
