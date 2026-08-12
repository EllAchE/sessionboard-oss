import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui';
import { currentEventContext } from '@/lib/services/events';
import { listSpeakers } from '@/lib/services/dashboard';
import { Counter } from '../dashboard/widgets';
import { SpeakerTable } from '../dashboard/SpeakerTracking';
import styles from '../dashboard/dashboard.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Speakers · Cicero' };

export default async function AdminSpeakersPage() {
  const ctx = await currentEventContext();
  const speakers = await listSpeakers(ctx);

  const accepted = speakers.filter((row) => row.acceptedSessions.length > 0).length;
  const incomplete = speakers.filter((row) => !row.hasBio || !row.hasHeadshot).length;
  const overdue = speakers.filter((row) => row.tasksOverdue > 0).length;

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Program</p>
          <h1 className={styles.title}>Speakers</h1>
          <p className={styles.subtitle}>
            Everyone attached to a submission for this event, with their onboarding state.
          </p>
        </div>
      </div>

      <div className={styles.counterGrid}>
        <Counter value={speakers.length} label="Participants" />
        <Counter value={accepted} label="Confirmed speakers" tone="success" />
        <Counter
          value={incomplete}
          label="Incomplete profiles"
          tone={incomplete > 0 ? 'warning' : 'success'}
        />
        <Counter
          value={overdue}
          label="Blocked by overdue tasks"
          tone={overdue > 0 ? 'danger' : 'success'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roster</CardTitle>
        </CardHeader>
        <CardBody>
          <SpeakerTable speakers={speakers} />
        </CardBody>
      </Card>
    </div>
  );
}
