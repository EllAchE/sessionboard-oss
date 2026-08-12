import { activeTransportName } from '@/lib/mail';
import {
  AUDIENCE_LABELS,
  TEMPLATE_VARIABLES,
  ensureDefaultTemplates,
  listTasksForEvent,
  listTemplates,
  listTracksAndFormats,
  resolveAdminEvent,
  type AudienceKind,
} from '@/lib/services/comms';
import { Card, CardBody } from '@/components/ui';
import { CommsTabs } from './CommsTabs';
import { Composer } from './Composer';
import { EventPicker } from './EventPicker';
import styles from './comms.module.css';

/**
 * `C-4`. The manual send surface. Rendered as a child of the admin shell.
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
  const { event, options } = await resolveAdminEvent({ eventParam: params.event ?? null });

  if (!event) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Communications</h1>
        <Card>
          <CardBody>
            <p className={styles.empty}>
              Create an event first — templates and audiences are scoped to one.
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
          <p className={styles.lede}>
            One message per recipient, with merge fields resolved against that person. Preview
            renders against a real recipient before anything is sent.
          </p>
        </div>
        <EventPicker current={event.slug} options={options} basePath="/admin/comms" />
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
        }))}
        transport={activeTransportName()}
      />
    </div>
  );
}
