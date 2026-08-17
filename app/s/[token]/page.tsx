import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { EmbedBody } from '@/app/embed/EmbedBody';
import { parseEmbedOptions } from '@/app/embed/model';
import { SHARE_LINK_VIEW_LABEL, recordShareLinkView } from '@/lib/services/share-links';
import { shareContext } from './context';
import { ShareFrame } from './ShareFrame';

export const dynamic = 'force-dynamic';

type Params = { token: string };
type Search = Record<string, string | string[] | undefined>;

/**
 * `robots: { index: false }` is not optional here and is only half the story — `/s/` is also in the
 * `app/robots.ts` disallow list and the route sends `X-Robots-Tag` from `next.config.ts`. Belt and
 * braces on purpose: the metadata tag only helps a crawler that already fetched the URL, and a URL
 * that *is* the credential should not be fetched by a crawler in the first place.
 *
 * The title deliberately omits the event name. A share URL sitting in a browser history entry or a
 * chat unfurl should not also announce whose unpublished programme it opens.
 */
export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { token } = await params;
  const context = await shareContext(token);
  return {
    title: context ? `${SHARE_LINK_VIEW_LABEL[context.grant.view]} · Shared preview` : 'Cicero',
    robots: { index: false, follow: false },
  };
}

/**
 * `AD-9`. The whole no-login surface: one view of one event's programme, chosen by the organizer at
 * mint time and read out of the token row.
 *
 * Every failure — unknown token, malformed token, expired, revoked, event since deleted — lands on
 * the same `notFound()`. A visitor cannot tell a token that never existed from one that was revoked
 * an hour ago, so a leaked-and-killed link gives an attacker no signal that it was ever real.
 */
export default async function SharedViewPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  searchParams: Promise<Search>;
}) {
  const [{ token }, search] = await Promise.all([params, searchParams]);
  const context = await shareContext(token);
  if (!context) notFound();

  const { grant, bundle } = context;
  await recordShareLinkView(grant.id);

  return (
    <ShareFrame grant={grant} eventName={bundle.event.name}>
      <EmbedBody
        view={grant.view}
        bundle={bundle}
        options={parseEmbedOptions(search)}
        showHeader
        /**
         * Both bases stay inside this share link. Pointing them at `/embed/...` would send a reader
         * to the public programme, where a session or speaker that is still a draft simply 404s.
         */
        speakerBase={`/s/${encodeURIComponent(token)}/speaker`}
        sessionBase={`/s/${encodeURIComponent(token)}`}
      />
    </ShareFrame>
  );
}
