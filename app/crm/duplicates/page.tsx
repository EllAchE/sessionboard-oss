import { requireCurrentActor } from '@/lib/auth';
import { MERGEABLE_FIELDS, listDuplicateGroups } from '@/lib/services/crm';
import { MergePanel } from './MergePanel';
import { toContactWire } from '../serialize';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Duplicates · Cicero' };

const FIELD_LABELS: Record<string, string> = {
  name: 'Name',
  email: 'Email',
  jobTitle: 'Job title',
  company: 'Company',
  bioMarkdown: 'Bio',
  headshotUrl: 'Headshot URL',
  location: 'Location',
  source: 'Source',
};

export default async function DuplicatesPage() {
  const actor = await requireCurrentActor();
  const groups = await listDuplicateGroups(actor);

  return (
    <MergePanel
      groups={groups.map((group) => ({
        key: group.key,
        contacts: group.contacts.map(toContactWire),
      }))}
      fields={MERGEABLE_FIELDS.map((key) => ({
        key,
        label: FIELD_LABELS[key] ?? key,
      }))}
    />
  );
}
