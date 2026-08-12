'use client';

import { useActionState } from 'react';
import { CheckCircle2, Download, ExternalLink, FileText, Trash2 } from 'lucide-react';
import { Badge, Button, IconButton, cn } from '@/components/ui';
import { acceptAttribute, describeAcceptedTypes, formatBytes } from '@/lib/services/files';
import type { PortalTask } from '@/lib/services/tasks';
import { IDLE_STATE } from '../../form-state';
import { TASK_STATUS_LABEL, formatDate, formatDateTime, relativeDue, taskTone } from '../../format';
import styles from '../../portal.module.css';
import {
  completeTaskAction,
  removeTaskFileAction,
  reopenTaskAction,
  saveTaskFormAction,
} from '../actions';
import { FieldSet } from '../FieldSet';
import { FormNotice, SubmitButton } from '../FormNotice';
import { Uploader } from '../Uploader';

/**
 * `S-14`–`S-18`. One card per assignment, and the speaker finishes the work inside it — a task that
 * sends you somewhere else to do the thing and then back to tick a box is how checklists rot.
 */
export function TaskCard({
  task,
  eventSlug,
  timezone,
}: {
  task: PortalTask;
  eventSlug: string;
  timezone: string;
}) {
  const done = task.status === 'completed';
  const waived = task.status === 'waived';

  return (
    <article
      id={task.assignmentId}
      className={cn(
        styles.taskCard,
        task.overdue && styles.taskCardOverdue,
        (done || waived) && styles.taskCardDone,
      )}
    >
      <div className={styles.rowBetween}>
        <div>
          <h3 className={styles.taskName}>{task.name}</h3>
          <div className={styles.metaLine}>
            <span>{TASK_STATUS_LABEL[task.status]}</span>
            {task.dueAt && (
              <span className={styles.dot}>
                {relativeDue(task.dueAt)} · {formatDate(task.dueAt, timezone)}
              </span>
            )}
            {task.completedAt && (
              <span className={styles.dot}>Done {formatDateTime(task.completedAt, timezone)}</span>
            )}
            {task.submissionTitle && <span className={styles.dot}>{task.submissionTitle}</span>}
            {!task.required && <span className={styles.dot}>Optional</span>}
          </div>
        </div>
        <Badge tone={taskTone(task.status, task.overdue)}>
          {task.overdue ? 'Overdue' : TASK_STATUS_LABEL[task.status]}
        </Badge>
      </div>

      {task.descriptionHtml && (
        <div
          className={styles.prose}
          /* Organizer-authored task copy, rendered by `renderMarkdown` in the service. */
          dangerouslySetInnerHTML={{ __html: task.descriptionHtml }}
        />
      )}

      {waived ? (
        <p className={styles.muted}>
          An organizer decided this one is not needed for you. Nothing to do.
        </p>
      ) : (
        <TaskBody task={task} eventSlug={eventSlug} />
      )}

      {done && !waived && <ReopenForm task={task} eventSlug={eventSlug} />}
    </article>
  );
}

function TaskBody({ task, eventSlug }: { task: PortalTask; eventSlug: string }) {
  switch (task.kind) {
    case 'file_upload':
      return <FileTask task={task} eventSlug={eventSlug} />;
    case 'form':
      return <FormTask task={task} eventSlug={eventSlug} />;
    case 'link':
      return <LinkTask task={task} eventSlug={eventSlug} />;
    default:
      return <AcknowledgeTask task={task} eventSlug={eventSlug} />;
  }
}

function AcknowledgeTask({ task, eventSlug }: { task: PortalTask; eventSlug: string }) {
  const [state, action] = useActionState(completeTaskAction, IDLE_STATE);
  if (task.status === 'completed') return <FormNotice state={state} />;

  return (
    <form action={action} className={styles.stackTight}>
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="assignmentId" value={task.assignmentId} />
      <FormNotice state={state} />
      <div className={styles.taskActions}>
        <SubmitButton variant="primary" size="sm" iconLeft={<CheckCircle2 size={15} />}>
          Mark as done
        </SubmitButton>
      </div>
    </form>
  );
}

function LinkTask({ task, eventSlug }: { task: PortalTask; eventSlug: string }) {
  const [state, action] = useActionState(completeTaskAction, IDLE_STATE);

  return (
    <form action={action} className={styles.stackTight}>
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="assignmentId" value={task.assignmentId} />
      <FormNotice state={state} />
      <div className={styles.taskActions}>
        {task.linkUrl && (
          <a href={task.linkUrl} target="_blank" rel="noopener noreferrer">
            <Button type="button" variant="secondary" size="sm" iconRight={<ExternalLink size={14} />}>
              Open the link
            </Button>
          </a>
        )}
        {task.status !== 'completed' && (
          <SubmitButton variant="primary" size="sm" iconLeft={<CheckCircle2 size={15} />}>
            I have done this
          </SubmitButton>
        )}
      </div>
    </form>
  );
}

function FileTask({ task, eventSlug }: { task: PortalTask; eventSlug: string }) {
  const spec = task.fileRequest;
  const full = Boolean(spec && !spec.allowMultiple && task.files.length >= 1);

  return (
    <div className={styles.stackTight}>
      {spec && (
        <p className={styles.hint}>
          {spec.helpText ? `${spec.helpText} · ` : ''}
          {describeAcceptedTypes(spec)} · up to {spec.maxSizeMb} MB
          {spec.allowMultiple ? ' · several files allowed' : ' · one file'}
        </p>
      )}

      {task.files.length > 0 && (
        <ul className={styles.fileList}>
          {task.files.map((record) => (
            <li key={record.id} className={styles.fileRow}>
              <FileText size={15} aria-hidden />
              <span className={styles.fileName}>{record.filename}</span>
              <span className={styles.faint}>{formatBytes(record.sizeBytes)}</span>
              <a
                href={`/portal/${eventSlug}/file/${record.id}?download`}
                aria-label={`Download ${record.filename}`}
              >
                <Download size={15} />
              </a>
              <RemoveFileForm task={task} eventSlug={eventSlug} fileId={record.id} />
            </li>
          ))}
        </ul>
      )}

      {full ? (
        <p className={styles.hint}>Remove the current file to upload a different one.</p>
      ) : (
        <Uploader
          eventSlug={eventSlug}
          intent="task"
          assignmentId={task.assignmentId}
          accept={spec ? acceptAttribute(spec) : undefined}
          multiple={spec?.allowMultiple ?? true}
          buttonLabel={task.files.length > 0 ? 'Upload another' : 'Upload'}
        />
      )}
    </div>
  );
}

function RemoveFileForm({
  task,
  eventSlug,
  fileId,
}: {
  task: PortalTask;
  eventSlug: string;
  fileId: string;
}) {
  const [, action] = useActionState(removeTaskFileAction, IDLE_STATE);
  return (
    <form action={action} className={styles.inlineForm}>
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="assignmentId" value={task.assignmentId} />
      <input type="hidden" name="fileId" value={fileId} />
      <IconButton label="Remove this file" variant="ghost" size="sm" type="submit">
        <Trash2 size={15} />
      </IconButton>
    </form>
  );
}

function FormTask({ task, eventSlug }: { task: PortalTask; eventSlug: string }) {
  const [state, action] = useActionState(saveTaskFormAction, IDLE_STATE);
  if (!task.form) return <p className={styles.muted}>This form is no longer available.</p>;

  return (
    <form action={action} className={styles.stackTight}>
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="assignmentId" value={task.assignmentId} />

      {task.form.introMarkdown && <p className={styles.muted}>{task.form.introMarkdown}</p>}

      <FieldSet fields={task.form.fields} initial={task.answers ?? {}} errors={state.details} />

      <FormNotice state={state} />
      <div className={styles.taskActions}>
        <SubmitButton variant="ghost" size="sm" name="intent" value="save">
          Save for later
        </SubmitButton>
        <SubmitButton variant="primary" size="sm" name="intent" value="submit">
          {task.status === 'completed' ? 'Resubmit' : 'Submit'}
        </SubmitButton>
      </div>
    </form>
  );
}

function ReopenForm({ task, eventSlug }: { task: PortalTask; eventSlug: string }) {
  const [state, action] = useActionState(reopenTaskAction, IDLE_STATE);
  if (task.kind === 'form' || task.kind === 'file_upload') return null;

  return (
    <form action={action}>
      <input type="hidden" name="eventSlug" value={eventSlug} />
      <input type="hidden" name="assignmentId" value={task.assignmentId} />
      <FormNotice state={state} />
      <SubmitButton variant="ghost" size="sm">
        This is not done after all
      </SubmitButton>
    </form>
  );
}
