import { redirect } from 'next/navigation';
import { sentKey } from '../sent/messages';

/**
 * The email log merged into `/organizer/sent`, which shows both channels. This path stays because
 * plenty of things point at it — the CRM campaign composer, `revalidatePath` calls, comments
 * throughout `lib/mail`, and any organizer who bookmarked their outbox — and a redirect keeps every
 * one of them true.
 *
 * The channel filter is set to `email` rather than left at `all`: a link that said "mail" was asking
 * for mail, and the new screen can widen from there in one click.
 */
export const dynamic = 'force-dynamic';

export default async function MailRedirectPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; q?: string; id?: string }>;
}) {
  const params = await searchParams;
  const query = new URLSearchParams();
  if (params.event) query.set('event', params.event);
  query.set('channel', 'email');
  if (params.q) query.set('q', params.q);
  /** Selection ids are now channel-qualified, so a bare id from an old link needs its prefix back. */
  if (params.id) query.set('id', sentKey('email', params.id));
  redirect(`/organizer/sent?${query.toString()}`);
}
