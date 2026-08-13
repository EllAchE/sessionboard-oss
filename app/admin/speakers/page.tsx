import { Plus, Upload } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, CardTitle } from '@/components/ui';
import { SPEAKER_WORKFLOW_OPTIONS, listSpeakerProfiles } from '@/lib/services/participants';
import { can } from '@/lib/context';
import { SpeakerRoster } from './SpeakerRoster';
import { speakersContext } from './context';
import styles from './speakers.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Orators · Cicero' };

function Counter({
  value,
  label,
  tone,
}: {
  value: number;
  label: string;
  tone?: 'success' | 'warning';
}) {
  return (
    <div className={styles.counter}>
      <span className={styles.counterValue} data-tone={tone}>
        {value}
      </span>
      <span className={styles.counterLabel}>{label}</span>
    </div>
  );
}

export default async function AdminSpeakersPage() {
  const ctx = await speakersContext();
  const speakers = await listSpeakerProfiles(ctx);
  const manages = can(ctx, 'event:manage');

  const confirmed = speakers.filter((row) => row.workflowStatus === 'confirmed').length;
  const incomplete = speakers.filter((row) => !row.hasBio || !row.hasHeadshot).length;
  const noTravel = speakers.filter((row) => !row.hasTravelDetail).length;

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>The census</p>
          <h1 className={styles.title}>Orators</h1>
          <p className={styles.subtitle}>
            Every orator on the event roll, with their likeness, journey, and preparations.
          </p>
        </div>
        {manages ? (
          <div className={styles.headActions}>
            <Button href="/admin/speakers/import" iconLeft={<Upload size={15} />}>
              Import tablet
            </Button>
            <Button
              href="/admin/speakers/new"
              variant="primary"
              iconLeft={<Plus size={15} />}
            >
              Summon an orator
            </Button>
          </div>
        ) : null}
      </div>

      <div className={styles.counterGrid}>
        <Counter value={speakers.length} label="Orators" />
        <Counter value={confirmed} label="Confirmed orators" tone="success" />
        <Counter
          value={incomplete}
          label="Incomplete public likenesses"
          tone={incomplete > 0 ? 'warning' : 'success'}
        />
        <Counter
          value={noTravel}
          label="No journey details"
          tone={noTravel > 0 ? 'warning' : 'success'}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Roll of orators</CardTitle>
        </CardHeader>
        <CardBody>
          <SpeakerRoster
            speakers={speakers}
            statuses={SPEAKER_WORKFLOW_OPTIONS}
            canManage={manages}
          />
        </CardBody>
      </Card>
    </div>
  );
}
