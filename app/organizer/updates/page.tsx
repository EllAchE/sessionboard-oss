import { currentEventContext, getEvent } from '@/lib/services/events';
import { listOrganizerUpdates } from '@/lib/services/updates';
import { UpdatesFeed } from './UpdatesFeed';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Updates · Cicero' };

export default async function UpdatesPage() {
  const ctx = await currentEventContext();
  const [event, feed] = await Promise.all([
    getEvent(ctx.eventId),
    listOrganizerUpdates(ctx),
  ]);

  return (
    <UpdatesFeed
      actorId={ctx.actor.userId}
      eventId={ctx.eventId}
      eventName={event.name}
      items={feed.items}
      windowStart={feed.since.toISOString()}
      generatedAt={feed.generatedAt.toISOString()}
    />
  );
}
