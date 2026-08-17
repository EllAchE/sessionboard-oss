import { requireCurrentActor } from '@/lib/auth';
import { currentEventIdHint } from '@/lib/services/events';
import { activeTransportName } from '@/lib/mail';
import { activeSmsTransportName } from '@/lib/sms';
import {
  AUDIENCE_LABELS,
  TEMPLATE_VARIABLES,
  ensureDefaultTemplates,
  listTasksForEvent,
  listTemplates,
  listTracksAndFormats,
  resolveOrganizerEvent,
  type AudienceKind,
} from '@/lib/services/comms';
import { Card, CardBody } from '@/components/ui';
import { CommsTabs } from './CommsTabs';
import { Composer } from './Composer';
import { EventPicker } from './EventPicker';
import styles from './comms.module.css';

/**
 * `C-4`. The manual send surface. Rendered as a child of the organizer shell.
 */
export const dynamic = 'force-dynamic';

const AUDIENCE_ORDER: AudienceKind[] = [
  'accepted_speakers',
  'all_speakers',
  'pending_speakers',
  'declined_speakers',
  'scheduled_speakers',
  'outstanding_tasks',
  'track',
  'format',
];

export default async function CommsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const params = await searchParams;
  const actor = await requireCurrentActor();
  const { event, options } = await resolveOrganizerEvent({
    eventParam: params.event ?? null,
    cookieEventId: await currentEventIdHint(),
    userId: actor.userId,
  });

  if (!event) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Communications</h1>
        <Card>
          <CardBody>
            <p className={styles.empty}>
              Create an event first. Templates and audiences are scoped to one.
            </p>
          </CardBody>
        </Card>
      </div>
    );
  }

  await ensureDefaultTemplates(event.id);
  const [templates, { tracks, formats }, tasks] = await Promise.all([
    listTemplates(event.id),
    listTracksAndFormats(event.id),
    listTasksForEvent(event.id),
  ]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Communications</p>
          <h1 className={styles.title}>Compose</h1>
          <p className={styles.lede}>Personalized per recipient. Preview before sending.</p>
        </div>
        <EventPicker current={event.slug} options={options} basePath="/organizer/comms" />
      </div>

      <CommsTabs active="compose" eventSlug={event.slug} />

      <Composer
        eventId={event.id}
        variables={TEMPLATE_VARIABLES}
        audiences={AUDIENCE_ORDER.map((kind) => ({ kind, label: AUDIENCE_LABELS[kind] }))}
        tracks={tracks.map((t) => ({ id: t.id, name: t.name }))}
        formats={formats.map((f) => ({ id: f.id, name: f.name }))}
        tasks={tasks.map((t) => ({ id: t.id, name: t.name }))}
        templates={templates.map((template) => ({
          key: template.key,
          name: template.name,
          subject: template.subject,
          bodyMarkdown: template.bodyMarkdown,
          attachIcs: template.attachIcs,
          smsBody: template.smsBody,
        }))}
        transport={activeTransportName()}
        smsTransport={activeSmsTransportName()}
      />
    </div>
  );
}
