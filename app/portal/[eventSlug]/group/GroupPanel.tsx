'use client';

import { useActionState } from 'react';
import { UserPlus } from 'lucide-react';
import { Badge, Card, CardBody, CardHeader, CardTitle, Input, Select } from '@/components/ui';
import type { GroupMember } from '@/lib/services/portal';
import { IDLE_STATE } from '../../form-state';
import { ROLE_LABEL } from '../../format';
import styles from '../../portal.module.css';
import { revokeAccessAction, shareAccessAction } from '../actions';
import { FieldError, FormNotice, SubmitButton } from '../FormNotice';

/**
 * `S-13`. Sharing creates the co-speaker their own portal rather than handing out a link into this
 * one — a shared login is how the wrong bio ends up on the programme.
 */
export function GroupPanel({
  eventSlug,
  submissionId,
  title,
  members,
  canManage,
}: {
  eventSlug: string;
  submissionId: string;
  title: string;
  members: GroupMember[];
  canManage: boolean;
}) {
  const [shareState, share] = useActionState(shareAccessAction, IDLE_STATE);
  const [revokeState, revoke] = useActionState(revokeAccessAction, IDLE_STATE);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardBody>
        <div className={styles.stackTight}>
          {members.map((member) => (
            <div key={member.participantId} className={styles.rowBetween}>
              <div>
                <div className={styles.identityName}>
                  {member.name}
                  {member.isMe ? ' (you)' : ''}
                </div>
                <div className={styles.identityEmail}>{member.email}</div>
              </div>
              <div className={styles.row}>
                <Badge tone={member.isPrimary ? 'accent' : 'neutral'}>
                  {member.isPrimary ? 'Principal orator' : (ROLE_LABEL[member.kind] ?? member.kind)}
                </Badge>
                {canManage && !member.isPrimary && !member.isMe && (
                  <form action={revoke} className={styles.inlineForm}>
                    <input type="hidden" name="eventSlug" value={eventSlug} />
                    <input type="hidden" name="submissionId" value={submissionId} />
                    <input type="hidden" name="targetParticipantId" value={member.participantId} />
                    <SubmitButton variant="ghost" size="sm">
                      Remove
                    </SubmitButton>
                  </form>
                )}
              </div>
            </div>
          ))}

          <FormNotice state={revokeState} />

          {canManage ? (
            <form action={share} className={styles.stackTight}>
              <input type="hidden" name="eventSlug" value={eventSlug} />
              <input type="hidden" name="submissionId" value={submissionId} />
              <div className={styles.fieldGrid}>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`share-email-${submissionId}`}>
                    Their email
                  </label>
                  <Input
                    id={`share-email-${submissionId}`}
                    name="email"
                    type="email"
                    placeholder="fellow-orator@example.com"
                    invalid={Boolean(shareState.details?.email)}
                  />
                  <FieldError state={shareState} field="email" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`share-name-${submissionId}`}>
                    Their name
                  </label>
                  <Input id={`share-name-${submissionId}`} name="name" placeholder="Optional" />
                </div>
                <div className={styles.field}>
                  <label className={styles.label} htmlFor={`share-kind-${submissionId}`}>
                    Their role
                  </label>
                  <Select id={`share-kind-${submissionId}`} name="kind" defaultValue="co_speaker">
                    <option value="co_speaker">Fellow orator</option>
                    <option value="moderator">Moderator</option>
                    <option value="panelist">Panelist</option>
                    <option value="speaker">Orator</option>
                  </Select>
                </div>
              </div>
              <FormNotice state={shareState} />
              <div className={styles.taskActions}>
                <SubmitButton variant="secondary" size="sm" iconLeft={<UserPlus size={15} />}>
                  Give them access
                </SubmitButton>
              </div>
              <span className={styles.hint}>
                A courier brings their own sealed link and duties for this oration.
              </span>
            </form>
          ) : (
            <p className={styles.hint}>
              Only the principal orator may change the delegation for this oration.
            </p>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
