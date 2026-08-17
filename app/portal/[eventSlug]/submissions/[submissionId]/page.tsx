import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarClock, CalendarPlus, ChevronLeft, MapPin } from 'lucide-react';
import { Badge, Button, Card, CardBody, CardHeader, CardTitle } from '@/components/ui';
import { isAppError } from '@/lib/errors';
import {
  getMySubmission,
  listGroupMembers,
  submissionFields,
  submissionLevelOptions,
  submissionTaxonomy,
  type PortalSubmission,
} from '@/lib/services/portal';
import {
  ROLE_LABEL,
  SUBMISSION_STATUS_LABEL,
  formatDate,
  formatTimeRange,
  submissionTone,
} from '../../../format';
import styles from '../../../portal.module.css';
import { portalSession } from '../../context';
import { GroupPanel } from '../../group/GroupPanel';
import { SubmissionEditor, WithdrawForm } from './SubmissionEditor';

/** `S-5`, `S-9`, `S-13`. */
export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ eventSlug: string; submissionId: string }>;
}) {
  const { eventSlug, submissionId } = await params;
  const { event, me } = await portalSession(eventSlug);

  let submission: PortalSubmission;
  try {
    submission = await getMySubmission(me.id, submissionId);
  } catch (error) {
    if (isAppError(error) && error.code === 'not_found') notFound();
    throw error;
  }

  const [fields, levelOptions, taxonomy, members] = await Promise.all([
    submissionFields(submission.formId),
    submissionLevelOptions(submission.formId),
    submissionTaxonomy(submission.formId, event.id),
    listGroupMembers(submission.id, me.id),
  ]);

  return (
    <div className={styles.stack}>
      <div>
        <Link href={`/portal/${eventSlug}/submissions`} className={styles.metaLine}>
          <ChevronLeft size={14} aria-hidden /> All my sessions
        </Link>
        <div className={styles.rowBetween} style={{ marginTop: 'var(--space-3)' }}>
          <div>
            <h1 className={styles.pageTitle}>{submission.title}</h1>
            <div className={styles.metaLine}>
              <span>{submission.ref}</span>
              {submission.formatName && <span className={styles.dot}>{submission.formatName}</span>}
              {submission.trackName && <span className={styles.dot}>{submission.trackName}</span>}
              <span className={styles.dot}>
                You are the {ROLE_LABEL[submission.myRole] ?? submission.myRole}
                {submission.isPrimary ? ' and primary contact' : ''}
              </span>
            </div>
          </div>
          <Badge tone={submissionTone(submission.status)}>
            {SUBMISSION_STATUS_LABEL[submission.status] ?? submission.status}
          </Badge>
        </div>
      </div>

      {submission.scheduled && (
        <Card>
          <CardHeader>
            <CardTitle>When and where</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.metaLine}>
              <CalendarClock size={15} aria-hidden />
              <span>
                {formatTimeRange(
                  submission.scheduled.startsAt,
                  submission.scheduled.endsAt,
                  event.timezone,
                )}
              </span>
              {submission.scheduled.roomName && (
                <>
                  <MapPin size={15} aria-hidden />
                  <span>{submission.scheduled.roomName}</span>
                </>
              )}
            </div>
            {!submission.scheduled.published && (
              <p className={styles.hint}>This slot may move until the schedule is published.</p>
            )}
            {submission.scheduled.startsAt && (
              <a
                className={styles.calendarLink}
                href={`/api/calendar/${submission.scheduled.id}`}
              >
                <CalendarPlus size={15} aria-hidden />
                Add to calendar (.ics)
              </a>
            )}
          </CardBody>
        </Card>
      )}

      {submission.status === 'draft' ? (
        <Card>
          <CardHeader>
            <CardTitle>This one has not been sent yet</CardTitle>
          </CardHeader>
          <CardBody>
            {submission.editable ? (
              <>
                <p className={styles.muted}>
                  Organizers cannot see drafts. This draft still counts toward the limit for “
                  {submission.formName}”.
                </p>
                <div className={styles.taskActions} style={{ marginTop: 'var(--space-4)' }}>
                  <Link
                    href={`/submit/${eventSlug}/${submission.formSlug}?draft=${submission.id}`}
                  >
                    <Button variant="primary">Finish and submit</Button>
                  </Link>
                </div>
              </>
            ) : (
              <p className={styles.muted}>
                “{submission.formName}” is closed, so this draft cannot be submitted. Discard it to
                free the slot.
              </p>
            )}
          </CardBody>
        </Card>
      ) : submission.editable ? (
        <SubmissionEditor
          eventSlug={eventSlug}
          submission={submission}
          fields={fields}
          levelOptions={levelOptions}
          taxonomy={taxonomy}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Your submission</CardTitle>
          </CardHeader>
          <CardBody>
            <div
              className={styles.prose}
              dangerouslySetInnerHTML={{ __html: submission.descriptionHtml }}
            />
            <p className={styles.hint} style={{ marginTop: 'var(--space-4)' }}>
              {submission.formStatus === 'open'
                ? 'Email the organizers to request changes.'
                : `“${submission.formName}” closed${
                    submission.formClosesAt
                      ? ` on ${formatDate(submission.formClosesAt, event.timezone)}`
                      : ''
                  }, so edits are with the organizers now.`}
            </p>
          </CardBody>
        </Card>
      )}

      <GroupPanel
        eventSlug={eventSlug}
        submissionId={submission.id}
        title="Who is on this session"
        members={members}
        canManage={submission.isPrimary}
      />

      {submission.status !== 'withdrawn' && submission.isPrimary && (
        <Card>
          <CardHeader>
            <CardTitle>{submission.status === 'draft' ? 'Changed your mind?' : 'Cannot make it?'}</CardTitle>
          </CardHeader>
          <CardBody>
            <p className={styles.muted}>
              {submission.status === 'draft'
                ? 'Discard this draft and free its submission slot?'
                : 'Withdraw this session from the programme? Organizers will be notified.'}
            </p>
            <WithdrawForm
              eventSlug={eventSlug}
              submissionId={submission.id}
              draft={submission.status === 'draft'}
            />
          </CardBody>
        </Card>
      )}
    </div>
  );
}
