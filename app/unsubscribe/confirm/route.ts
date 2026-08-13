import { consumeUnsubscribeToken } from '@/lib/services/notification-preferences';

export async function POST(request: Request) {
  const form = await request.formData();
  const token = form.get('token');
  if (typeof token !== 'string' || !token) return new Response('Invalid unsubscribe link', { status: 400 });
  try {
    await consumeUnsubscribeToken(token);
    return Response.redirect(new URL('/unsubscribe?done=1', request.url), 303);
  } catch {
    return new Response('That unsubscribe link has expired or was already used.', { status: 400 });
  }
}
