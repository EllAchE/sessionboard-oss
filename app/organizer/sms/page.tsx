import { redirect } from 'next/navigation';
import { sentKey } from '../sent/messages';

/**
 * The SMS log merged into `/organizer/sent`. Kept as a redirect for the same reason as
 * `../mail/page.tsx`: `lib/sms` documents this path in several places, and an old link should land
 * on the messages it named rather than on a 404.
 */
export const dynamic = 'force-dynamic';

export default async function SmsRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; q?: string; id?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.event) query.set('event', params.event);
  query.set('channel', 'sms');
  if (params.q) query.set('q', params.q);
  if (params.id) query.set('id', sentKey('sms', params.id));
  redirect(`/organizer/sent?${query.toString()}`);
}
