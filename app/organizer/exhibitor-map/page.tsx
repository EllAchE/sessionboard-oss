import { appUrl } from '@/lib/env';
import { getExhibitorMap } from '@/lib/services/exhibitor-map';
import { getEvent } from '@/lib/services/events';
import { ExhibitorMapManager } from './ExhibitorMapManager';
import { exhibitorMapContext } from './context';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Exhibitor map · Cicero' };

export default async function ExhibitorMapPage() {
  const ctx = await exhibitorMapContext();
  const [owner, map] = await Promise.all([getEvent(ctx.eventId), getExhibitorMap(ctx.eventId)]);

  return (
    <ExhibitorMapManager
      eventName={owner.name}
      eventSlug={owner.slug}
      origin={appUrl()}
      map={
        map
          ? {
              filename: map.file.filename,
              sizeBytes: map.file.sizeBytes,
              updatedAt: map.updatedAt.toISOString(),
            }
          : null
      }
    />
  );
}
