import { notFound } from 'next/navigation';
import { STAGE_LABELS, getContactProfile, listOrganizerEvents } from '@/lib/services/crm';
import { ContactProfile } from './ContactProfile';
import { requireCrmOrganizer } from '../context';
import { toContactWire, toFieldWire } from '../serialize';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Contact · Cicero' };

export default async function ContactPage({ params }: { params: Promise<{ contactId: string }> }) {
  const actor = await requireCrmOrganizer();
  const { contactId } = await params;

  const profile = await getContactProfile(actor, contactId).catch(() => null);
  if (!profile) notFound();

  const events = await listOrganizerEvents(actor);

  return (
    <ContactProfile
      contact={toContactWire(profile.contact)}
      notes={profile.notes.map((note) => ({
        id: note.id,
        authorName: note.authorName,
        body: note.bodyMarkdown,
        createdAt: note.createdAt.toISOString(),
      }))}
      activity={profile.activity.map((entry) => ({
        id: entry.id,
        kind: entry.kind,
        summary: entry.summary,
        actorName: entry.actorName,
        createdAt: entry.createdAt.toISOString(),
      }))}
      events={profile.events.map((entry) => ({
        eventId: entry.eventId,
        eventName: entry.eventName,
        eventSlug: entry.eventSlug,
        linkedAt: entry.linkedAt.toISOString(),
      }))}
      prospects={profile.prospects.map((entry) => ({
        id: entry.id,
        stage: entry.stage,
        stageLabel: STAGE_LABELS[entry.stage],
        score: entry.score,
        eventName: entry.eventName,
      }))}
      fields={profile.fields.map(toFieldWire)}
      organizerEvents={events}
    />
  );
}
