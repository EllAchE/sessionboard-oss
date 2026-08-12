import { Card, CardBody } from '@/components/ui';
import {
  TEMPLATE_VARIABLES,
  ensureDefaultTemplates,
  listTemplates,
  resolveAdminEvent,
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
  const { event, options } = await resolveAdminEvent({ eventParam: params.event ?? null });

  if (!event) {
    return (
      <div className={styles.page}>
        <h1 className={styles.title}>Email templates</h1>
        <Card>
          <CardBody>
            <p className={styles.empty}>Create an event first — templates are scoped to one.</p>
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
          <p className={styles.lede}>
            Submission confirmations, decisions, calendar invitations and reminders all read from
            here. Editing one changes what the product sends without a deploy.
          </p>
        </div>
        <EventPicker current={event.slug} options={options} basePath="/admin/comms/templates" />
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
        }))}
      />
    </div>
  );
}
