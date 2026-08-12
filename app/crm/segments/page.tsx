import { requireCurrentActor } from '@/lib/auth';
import { listSegments, toFilters } from '@/lib/services/crm';
import { SegmentList } from './SegmentList';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Segments · Cicero' };

const CRITERIA_LABELS: Record<string, string> = {
  search: 'matching',
  company: 'company',
  jobTitle: 'job title',
  tag: 'tag',
  source: 'source',
  location: 'location',
};

function describe(raw: Record<string, unknown>): string {
  const filters = toFilters(raw);
  const parts = Object.entries(CRITERIA_LABELS)
    .map(([key, label]) => {
      const value = filters[key as keyof typeof filters];
      return typeof value === 'string' && value !== '' ? `${label} ${value}` : null;
    })
    .filter((part): part is string => part !== null);
  for (const [key, value] of Object.entries(filters.custom ?? {})) parts.push(`${key} ${value}`);
  return parts.length === 0 ? 'No filter criteria' : parts.join(' · ');
}

export default async function SegmentsPage() {
  const actor = await requireCurrentActor();
  const segments = await listSegments(actor);

  return (
    <SegmentList
      segments={segments.map(({ segment, memberCount }) => ({
        id: segment.id,
        name: segment.name,
        kind: segment.kind,
        memberCount,
        criteria:
          segment.kind === 'curated'
            ? `${segment.memberContactIds.length} contacts picked when it was saved`
            : describe(segment.filters),
        createdAt: segment.createdAt.toISOString(),
      }))}
    />
  );
}
