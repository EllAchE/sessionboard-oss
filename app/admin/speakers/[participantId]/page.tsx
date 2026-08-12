import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader, CardTitle } from '@/components/ui';
import { isAppError } from '@/lib/errors';
import { can } from '@/lib/context';
import { SPEAKER_WORKFLOW_OPTIONS, getSpeakerProfile } from '@/lib/services/participants';
import { SpeakerForm, type SpeakerFormValues } from '../SpeakerForm';
import { SpeakerStatus } from '../SpeakerStatus';
import { speakersContext } from '../context';
import styles from '../speakers.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Speaker · Cicero' };

function Definition({ term, value }: { term: string; value: string | null }) {
  return (
    <>
      <dt className={styles.term}>{term}</dt>
      <dd className={styles.value}>{value?.trim() || '—'}</dd>
    </>
  );
}

export default async function SpeakerDetailPage({
  params,
}: {
  params: Promise<{ participantId: string }>;
}) {
  const [ctx, { participantId }] = await Promise.all([speakersContext(), params]);

  const speaker = await getSpeakerProfile(ctx, participantId).catch((error) => {
    if (isAppError(error) && error.code === 'not_found') notFound();
    throw error;
  });

  const initial: SpeakerFormValues = {
    id: speaker.id,
    email: speaker.email,
    name: speaker.displayName ?? speaker.name,
    pronouns: speaker.pronouns ?? '',
    jobTitle: speaker.jobTitle ?? '',
    company: speaker.company ?? '',
    bioMarkdown: speaker.bioMarkdown ?? '',
    website: speaker.website ?? '',
    timezone: speaker.timezone ?? '',
    dietaryNotes: speaker.dietaryNotes ?? '',
    accessibilityNotes: speaker.accessibilityNotes ?? '',
    headshotFileId: speaker.headshotFileId,
  };

  return (
    <div className={styles.page}>
      <div>
        <Link className={styles.backLink} href="/admin/speakers">
          <ChevronLeft size={14} />
          Speakers
        </Link>
        <div className={styles.pageHead}>
          <div>
            <p className={styles.eyebrow}>Speaker</p>
            <h1 className={styles.title}>{speaker.name}</h1>
            <p className={styles.subtitle}>
              {[speaker.jobTitle, speaker.company].filter(Boolean).join(', ') || speaker.email}
            </p>
          </div>
          <div className={styles.headActions}>
            <span className={styles.statusPicker}>
              <span className={styles.fieldLabel}>Status</span>
              <SpeakerStatus
                participantId={speaker.id}
                status={speaker.workflowStatus}
                options={SPEAKER_WORKFLOW_OPTIONS}
                canManage={can(ctx, 'event:manage')}
              />
            </span>
            <Badge tone={speaker.hasBio ? 'success' : 'warning'}>
              {speaker.hasBio ? 'Bio on file' : 'No bio'}
            </Badge>
            <Badge tone={speaker.hasHeadshot ? 'success' : 'warning'}>
              {speaker.hasHeadshot ? 'Photo on file' : 'No photo'}
            </Badge>
            <Badge tone={speaker.hasTravelDetail ? 'success' : 'warning'}>
              {speaker.hasTravelDetail ? 'Travel details' : 'No travel details'}
            </Badge>
          </div>
        </div>
      </div>

      <div className={styles.detailGrid}>
        <Card>
          <CardHeader>
            <CardTitle>Travel &amp; logistics</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className={styles.definition}>
              <Definition term="Timezone" value={speaker.timezone} />
              <Definition term="Dietary needs" value={speaker.dietaryNotes} />
              <Definition term="Accessibility & arrival" value={speaker.accessibilityNotes} />
            </dl>
          </CardBody>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Program</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className={styles.definition}>
              <Definition
                term="Accepted"
                value={speaker.acceptedSessions.join('\n') || 'No accepted sessions yet'}
              />
              <Definition term="Submissions" value={String(speaker.submissions)} />
              <Definition
                term="Tasks"
                value={`${speaker.tasksDone} of ${speaker.tasksTotal} done${
                  speaker.tasksOverdue > 0 ? `, ${speaker.tasksOverdue} overdue` : ''
                }`}
              />
            </dl>
          </CardBody>
        </Card>
      </div>

      <SpeakerForm initial={initial} />
    </div>
  );
}
