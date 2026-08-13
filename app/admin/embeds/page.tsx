import { currentEventContext, getEvent } from '@/lib/services/events';
import { requireCapability } from '@/lib/context';
import { appUrl } from '@/lib/env';
import { loadPublicBundle } from '../../embed/queries';
import { EmbedStudio } from './EmbedStudio';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Inscriptions · Cicero' };

/** `G-5`, `G-6`, `G-7`. */
export default async function EmbedsPage() {
  const ctx = await currentEventContext();
  requireCapability(ctx, 'event:manage');

  const event = await getEvent(ctx.eventId);
  const bundle = await loadPublicBundle(event.slug);

  return (
    <EmbedStudio
      eventSlug={event.slug}
      eventName={event.name}
      origin={appUrl()}
      tracks={bundle?.tracks ?? []}
      rooms={bundle?.rooms ?? []}
      speakers={(bundle?.speakers ?? []).map((speaker) => ({
        id: speaker.id,
        slug: speaker.slug,
        name: speaker.name,
      }))}
      publishedSessions={bundle?.sessions.length ?? 0}
      publishedSpeakers={bundle?.speakers.length ?? 0}
    />
  );
}
