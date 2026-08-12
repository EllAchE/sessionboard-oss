'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox, Dialog, Input, Select, Textarea, useToast } from '@/components/ui';
import type { AdminTaskRow } from '@/lib/services/dashboard';
import { createTaskAction, updateTaskAction, type TaskFormInput } from './actions';
import styles from './editor.module.css';

/**
 * A task is four shapes behind one row: a form to fill, a file to upload, a box to tick, a link to
 * follow. The kind select drives which of the remaining controls mean anything, so the ones that do
 * not apply are hidden rather than disabled — an organizer choosing "Acknowledgement" should not be
 * left wondering what the empty URL box wants.
 */

const KINDS: Array<{ value: AdminTaskRow['kind']; label: string; hint: string }> = [
  { value: 'form', label: 'Form', hint: 'The speaker answers a form you have already built.' },
  { value: 'file_upload', label: 'File upload', hint: 'The speaker uploads one or more files.' },
  { value: 'acknowledge', label: 'Acknowledgement', hint: 'The speaker ticks it off. No artifact.' },
  { value: 'link', label: 'External link', hint: 'The speaker visits a page you link to.' },
];

const AUDIENCES: Array<{ value: AdminTaskRow['audience']; label: string }> = [
  { value: 'all_participants', label: 'Everyone in the event' },
  { value: 'accepted_participants', label: 'Accepted speakers only' },
  { value: 'manual', label: 'Nobody yet — I will assign it' },
];

const BLANK: TaskFormInput = {
  name: '',
  descriptionMarkdown: '',
  kind: 'acknowledge',
  audience: 'accepted_participants',
  dueAt: '',
  required: true,
  linkUrl: '',
  formId: '',
  reminderDaysBefore: '7, 1',
};

/** `<input type="date">` wants `YYYY-MM-DD`; the row carries a full ISO timestamp. */
function toDateInput(iso: string | null): string {
  return iso ? new Date(iso).toISOString().slice(0, 10) : '';
}

export function draftFrom(row: AdminTaskRow): TaskFormInput {
  return {
    name: row.name,
    descriptionMarkdown: row.descriptionMarkdown ?? '',
    kind: row.kind,
    audience: row.audience,
    dueAt: toDateInput(row.dueAt),
    required: row.required,
    linkUrl: row.linkUrl ?? '',
    formId: row.formId ?? '',
    reminderDaysBefore: row.reminderDaysBefore.join(', '),
  };
}

type Props = {
  open: boolean;
  onClose: () => void;
  /** Absent for a new task. */
  editing: AdminTaskRow | null;
  forms: Array<{ id: string; name: string }>;
};

export function TaskEditor({ open, onClose, editing, forms }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<TaskFormInput>(BLANK);
  const [seeded, setSeeded] = useState<string | null>(null);

  /** The dialog stays mounted, so the draft is reseeded whenever the row behind it changes. */
  const key = editing ? editing.id : 'new';
  if (open && seeded !== key) {
    setSeeded(key);
    setDraft(editing ? draftFrom(editing) : BLANK);
  }
  if (!open && seeded !== null) setSeeded(null);

  const set = <K extends keyof TaskFormInput>(field: K, value: TaskFormInput[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const save = () => {
    if (!draft.name.trim()) {
      toast({ title: 'A task needs a name', tone: 'warning' });
      return;
    }
    startTransition(async () => {
      const result = editing
        ? await updateTaskAction(editing.id, draft)
        : await createTaskAction(draft);
      if (!result.ok) {
        toast({ title: result.message, tone: 'danger' });
        return;
      }
      toast({ title: editing ? 'Task saved' : `${draft.name} added`, tone: 'success' });
      onClose();
      router.refresh();
    });
  };

  const kindHint = KINDS.find((entry) => entry.value === draft.kind)?.hint;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={editing ? `Edit ${editing.name}` : 'New task'}
      description="Tasks appear in every assigned speaker's portal and drive the outstanding-work report."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={pending} onClick={save}>
            {editing ? 'Save task' : 'Add task'}
          </Button>
        </>
      }
    >
      <div className={styles.form}>
        <label className={styles.field}>
          <span className={styles.label}>Name</span>
          <Input
            autoFocus
            value={draft.name}
            placeholder="Upload your slides"
            onChange={(event) => set('name', event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Instructions</span>
          <Textarea
            rows={3}
            value={draft.descriptionMarkdown}
            placeholder="Markdown. Shown above the task in the portal."
            onChange={(event) => set('descriptionMarkdown', event.target.value)}
          />
        </label>

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Kind</span>
            <Select
              value={draft.kind}
              onChange={(event) => set('kind', event.target.value as AdminTaskRow['kind'])}
            >
              {KINDS.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
            {kindHint ? <span className={styles.hint}>{kindHint}</span> : null}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Assign to</span>
            <Select
              value={draft.audience}
              onChange={(event) => set('audience', event.target.value as AdminTaskRow['audience'])}
            >
              {AUDIENCES.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.label}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {draft.kind === 'form' ? (
          <label className={styles.field}>
            <span className={styles.label}>Form</span>
            <Select value={draft.formId} onChange={(event) => set('formId', event.target.value)}>
              <option value="">Pick a form…</option>
              {forms.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
            {forms.length === 0 ? (
              <span className={styles.hint}>
                No forms yet. Build one under Forms, then come back.
              </span>
            ) : null}
          </label>
        ) : null}

        {draft.kind === 'link' ? (
          <label className={styles.field}>
            <span className={styles.label}>Link</span>
            <Input
              type="url"
              value={draft.linkUrl}
              placeholder="https://…"
              onChange={(event) => set('linkUrl', event.target.value)}
            />
          </label>
        ) : null}

        <div className={styles.row}>
          <label className={styles.field}>
            <span className={styles.label}>Deadline</span>
            <Input
              type="date"
              value={draft.dueAt}
              onChange={(event) => set('dueAt', event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Remind days before</span>
            <Input
              value={draft.reminderDaysBefore}
              placeholder="7, 1"
              onChange={(event) => set('reminderDaysBefore', event.target.value)}
            />
            <span className={styles.hint}>Comma separated. Blank sends no reminders.</span>
          </label>
        </div>

        <label className={styles.checkbox}>
          <Checkbox
            checked={draft.required}
            onChange={(event) => set('required', event.target.checked)}
          />
          <span>Required — counts against the speaker until it is done</span>
        </label>
      </div>
    </Dialog>
  );
}
