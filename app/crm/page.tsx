import {
  PROSPECT_STAGES,
  STAGE_LABELS,
  listDirectory,
  listOrganizerEvents,
} from '@/lib/services/crm';
import { Directory } from './Directory';
import { requireCrmOrganizer } from './context';
import { filtersFromSearchParams, toContactWire, toFieldWire } from './serialize';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Speaker directory · Cicero' };

/**
 * The whole directory is handed to the client and narrowed there, so clearing a filter restores the
 * full list without a round trip. A deep link still opens narrowed: the query string seeds the same
 * filter state.
 */
export default async function CrmDirectoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireCrmOrganizer();
  const params = await searchParams;

  const [directory, events] = await Promise.all([listDirectory(actor), listOrganizerEvents(actor)]);

  return (
    <Directory
      contacts={directory.rows.map(toContactWire)}
      facets={directory.facets}
      fields={directory.fields.map(toFieldWire)}
      events={events}
      stages={PROSPECT_STAGES.map((stage) => ({
        stage,
        label: STAGE_LABELS[stage],
      }))}
      initialFilters={filtersFromSearchParams(params)}
    />
  );
}
