import { notFound } from 'next/navigation';
import { PROSPECT_STAGES, STAGE_LABELS, getSegment, listOrganizerEvents } from '@/lib/services/crm';
import { Directory } from '../../Directory';
import { requireCrmOrganizer } from '../../context';
import { EMPTY_FILTERS } from '../../wire';
import { toContactWire, toFieldWire } from '../../serialize';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Segment · Cicero' };

function facetsOf(
  rows: Array<{
    company: string | null;
    jobTitle: string | null;
    tags: string[];
    source: string | null;
    location: string | null;
  }>,
) {
  const collect = (pick: (row: (typeof rows)[number]) => Array<string | null>) =>
    [
      ...new Set(
        rows
          .flatMap(pick)
          .map((value) => (value ?? '').trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
  return {
    companies: collect((row) => [row.company]),
    jobTitles: collect((row) => [row.jobTitle]),
    tags: collect((row) => row.tags),
    sources: collect((row) => [row.source]),
    locations: collect((row) => [row.location]),
  };
}

export default async function SegmentPage({ params }: { params: Promise<{ segmentId: string }> }) {
  const actor = await requireCrmOrganizer();
  const { segmentId } = await params;

  const found = await getSegment(actor, segmentId).catch(() => null);
  if (!found) notFound();

  const events = await listOrganizerEvents(actor);
  const subtitle =
    found.segment.kind === 'dynamic'
      ? 'Dynamic segment. Membership re-runs the saved filters every time this page opens.'
      : 'Curated segment. The members were fixed when it was saved.';

  return (
    <Directory
      contacts={found.members.map(toContactWire)}
      facets={facetsOf(found.members)}
      fields={found.fields.map(toFieldWire)}
      events={events}
      stages={PROSPECT_STAGES.map((stage) => ({
        stage,
        label: STAGE_LABELS[stage],
      }))}
      initialFilters={EMPTY_FILTERS}
      heading={{ eyebrow: 'Segment', title: found.segment.name, subtitle }}
    />
  );
}
