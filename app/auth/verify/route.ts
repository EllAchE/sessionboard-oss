import { NextResponse, type NextRequest } from 'next/server';
import { consumeMagicLink } from '@/lib/auth';

/**
 * A GET that mutates, deliberately: the link arrives in an email client and a mail scanner that
 * prefetches it burns the token, which is the intended single-use behaviour rather than a bug.
 */
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.redirect(new URL('/signin?error=missing', request.url));
  }

  try {
    const { redirectTo } = await consumeMagicLink(token);
    const target = redirectTo.startsWith('/') && !redirectTo.startsWith('//') ? redirectTo : '/admin';
    return NextResponse.redirect(new URL(target, request.url));
  } catch {
    return NextResponse.redirect(new URL('/signin?error=expired', request.url));
  }
}
