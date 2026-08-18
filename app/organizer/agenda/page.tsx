import { can } from '@/lib/context';
import { currentEventContext } from '@/lib/services/events';
import { AgendaBoard } from './AgendaBoard';
import { agendaModelConfigured } from './ai-actions';
import { loadAgenda, toWire, unavailabilityToWire } from './data';

/**
 * The board's server shell. Everything the client needs arrives in one payload from `loadAgenda`,
 * with instants flattened to ISO strings by `toWire` — a `Date` does not survive the boundary.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Agenda · Cicero' };

export default async function AgendaPage() {
  const ctx = await currentEventContext();
  const [data, modelConfigured] = await Promise.all([
    loadAgenda(ctx.eventId),
    agendaModelConfigured(),
  ]);

  return (
    <AgendaBoard
      event={data.event}
      rooms={data.rooms}
      tracks={data.tracks}
      formats={data.formats}
      entries={toWire(data.entries)}
      unavailability={unavailabilityToWire(data.unavailability)}
      queue={data.queue}
      descriptions={data.descriptions}
      publicHolds={data.publicHolds}
      modelConfigured={modelConfigured}
      canManage={can(ctx, 'agenda:manage')}
    />
  );
}
