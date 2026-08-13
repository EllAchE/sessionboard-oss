import { requireCurrentActor } from '@/lib/auth';
import { listCampaigns, listDirectory, listOrganizerEvents } from '@/lib/services/crm';
import { Composer } from './Composer';
import { toContactWire } from '../serialize';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Census dispatches · Cicero' };

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireCurrentActor();
  const params = await searchParams;
  const raw = params.ids;
  const ids = (Array.isArray(raw) ? raw.join(',') : (raw ?? ''))
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  const [directory, events, campaigns] = await Promise.all([
    listDirectory(actor),
    listOrganizerEvents(actor),
    listCampaigns(actor),
  ]);

  return (
    <Composer
      contacts={directory.rows.map(toContactWire)}
      preselected={ids}
      events={events}
      campaigns={campaigns.map((campaign) => ({
        id: campaign.id,
        subject: campaign.subject,
        recipientCount: campaign.recipientCount,
        createdAt: campaign.createdAt.toISOString(),
        recipients: campaign.recipients.map((recipient) => ({
          email: recipient.email,
          renderedSubject: recipient.renderedSubject,
        })),
      }))}
    />
  );
}
