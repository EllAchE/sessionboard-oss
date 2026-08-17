import { Card, CardBody } from '@/components/ui';
import { requireCurrentActor } from '@/lib/auth';
import { currentEventIdHint } from '@/lib/services/events';
import {
  TEMPLATE_VARIABLES,
  ensureDefaultTemplates,
  listTemplates,
  resolveOrganizerEvent,
} from '@/lib/services/comms';
import { CommsTabs } from '../CommsTabs';
import { EventPicker } from '../EventPicker';
import { TemplateManager } from '../TemplateManager';
import styles from '../comms.module.css';

/** `C-1`. Every automatic send in the product reads one of these rows. */
export const dynamic = 'force-dynamic';

export default async function TemplatesPage({
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
        <h1 className={styles.title}>Email templates</h1>
        <Card>
          <CardBody>
            <p className={styles.empty}>Create an event first. Templates are scoped to one.</p>
          </CardBody>
        </Card>
      </div>
    );
  }

  await ensureDefaultTemplates(event.id);
  const templates = await listTemplates(event.id);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Communications</p>
          <h1 className={styles.title}>Email templates</h1>
          <p className={styles.lede}>Edit automatic emails and reminders without deploying.</p>
        </div>
        <EventPicker current={event.slug} options={options} basePath="/organizer/comms/templates" />
      </div>

      <CommsTabs active="templates" eventSlug={event.slug} />

      <TemplateManager
        eventId={event.id}
        variables={TEMPLATE_VARIABLES}
        templates={templates.map((row) => ({
          id: row.id,
          key: row.key,
          name: row.name,
          subject: row.subject,
          bodyMarkdown: row.bodyMarkdown,
          enabled: row.enabled,
          attachIcs: row.attachIcs,
          smsBody: row.smsBody,
        }))}
      />
    </div>
  );
}
