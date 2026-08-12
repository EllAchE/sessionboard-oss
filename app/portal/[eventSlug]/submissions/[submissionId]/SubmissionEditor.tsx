'use client';

import { useActionState, useState } from 'react';
import { Card, CardBody, CardHeader, CardTitle, Input, Textarea } from '@/components/ui';
import type { FormFieldSpec } from '@/lib/forms/contract';
import { renderMarkdown } from '@/lib/markdown';
import type { PortalSubmission } from '@/lib/services/portal';
import { IDLE_STATE } from '../../../form-state';
import styles from '../../../portal.module.css';
import { saveSubmissionAction, withdrawSubmissionAction } from '../../actions';
import { FieldError, FormNotice, SubmitButton } from '../../FormNotice';
import { FieldSet } from '../../FieldSet';

const DESCRIPTION_LIMIT = 5000;

/** `S-9`. Editing stays open while the form is, and closes with it rather than at acceptance. */
export function SubmissionEditor({
  eventSlug,
  submission,
  fields,
}: {
  eventSlug: string;
  submission: PortalSubmission;
  fields: FormFieldSpec[];
}) {
  const [state, action] = useActionState(saveSubmissionAction, IDLE_STATE);
  const [description, setDescription] = useState(submission.descriptionMarkdown ?? '');

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="submissionId" value={submission.id} />
      <input type="hidden" name="formId" value={submission.formId} />

      <Card>
        <CardHeader>
          <CardTitle>Session details</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.stackTight}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="title">
                Title
              </label>
              <Input
                id="title"
                name="title"
                defaultValue={submission.title}
                invalid={Boolean(state.details?.title)}
              />
              <FieldError state={state} field="title" />
            </div>

            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="descriptionMarkdown">
                  Description
                </label>
                <Textarea
                  id="descriptionMarkdown"
                  name="descriptionMarkdown"
                  rows={12}
                  maxLength={DESCRIPTION_LIMIT}
                  value={description}
                  onChange={(untrusted) => setDescription(untrusted.target.value)}
                  invalid={Boolean(state.details?.descriptionMarkdown)}
                />
                <span className={styles.hint}>
                  {description.length} / {DESCRIPTION_LIMIT} characters
                </span>
                <FieldError state={state} field="descriptionMarkdown" />
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Preview</span>
                <div
                  className={`${styles.previewPane} ${styles.prose}`}
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(description) }}
                />
              </div>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="level">
                Audience level
              </label>
              <Input id="level" name="level" defaultValue={submission.level ?? ''} />
              <FieldError state={state} field="level" />
            </div>
          </div>
        </CardBody>
      </Card>

      {fields.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{submission.formName}</CardTitle>
          </CardHeader>
          <CardBody>
            <FieldSet fields={fields} initial={submission.answers} errors={state.details} />
          </CardBody>
        </Card>
      )}

      <FormNotice state={state} />
      <div className={styles.taskActions}>
        <SubmitButton variant="primary">Save changes</SubmitButton>
      </div>
    </form>
  );
}

export function WithdrawForm({
  eventSlug,
  submissionId,
  draft = false,
}: {
  eventSlug: string;
  submissionId: string;
  draft?: boolean;
}) {
  const [state, action] = useActionState(withdrawSubmissionAction, IDLE_STATE);
  const [confirming, setConfirming] = useState(false);

  return (
    <form action={action} className={styles.stackTight}>
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="submissionId" value={submissionId} />
      <FormNotice state={state} />
      {confirming ? (
        <div className={styles.taskActions}>
          <SubmitButton variant="danger" size="sm">
            {draft ? 'Yes, discard this draft' : 'Yes, withdraw this session'}
          </SubmitButton>
          <button type="button" className={styles.checkLink} onClick={() => setConfirming(false)}>
            Keep it
          </button>
        </div>
      ) : (
        <div className={styles.taskActions}>
          <button type="button" className={styles.checkLink} onClick={() => setConfirming(true)}>
            {draft ? 'Discard this draft' : 'Withdraw this session'}
          </button>
        </div>
      )}
    </form>
  );
}
