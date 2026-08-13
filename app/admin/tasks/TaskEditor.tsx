'use client';

import { useMemo, useState, useTransition } from 'react';
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
  { value: 'form', label: 'Scroll', hint: 'The orator answers a scroll you have already inscribed.' },
  { value: 'file_upload', label: 'Archive record', hint: 'The orator files one or more records.' },
  { value: 'acknowledge', label: 'Oath', hint: 'The orator affirms it. No artifact is lodged.' },
  { value: 'link', label: 'Road elsewhere', hint: 'The orator visits a page you decree.' },
];

const AUDIENCES: Array<{ value: AdminTaskRow['audience']; label: string }> = [
  { value: 'all_participants', label: 'Everyone on the rolls' },
  { value: 'accepted_participants', label: 'Proclaimed orators only' },
  { value: 'manual', label: 'Personally appointed orators' },
];

const BLANK: TaskFormInput = {
  name: '',
  descriptionMarkdown: '',
  kind: 'acknowledge',
  audience: 'accepted_participants',
  participantIds: [],
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
    participantIds: row.participantIds,
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
  speakers: Array<{ id: string; name: string; email: string }>;
};

export function TaskEditor({ open, onClose, editing, forms, speakers }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<TaskFormInput>(BLANK);
  const [seeded, setSeeded] = useState<string | null>(null);
  const [speakerQuery, setSpeakerQuery] = useState('');

  /** The dialog stays mounted, so the draft is reseeded whenever the row behind it changes. */
  const key = editing ? editing.id : 'new';
  if (open && seeded !== key) {
    setSeeded(key);
    setDraft(editing ? draftFrom(editing) : BLANK);
    setSpeakerQuery('');
  }
  if (!open && seeded !== null) setSeeded(null);

  const set = <K extends keyof TaskFormInput>(field: K, value: TaskFormInput[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));

  const save = () => {
    if (!draft.name.trim()) {
      toast({ title: 'Every duty needs a name', tone: 'warning' });
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
      toast({ title: editing ? 'Duty sealed in the ledger' : `${draft.name} entered in the ledger`, tone: 'success' });
      onClose();
      router.refresh();
    });
  };

  const kindHint = KINDS.find((entry) => entry.value === draft.kind)?.hint;
  const visibleSpeakers = useMemo(() => {
    const query = speakerQuery.trim().toLocaleLowerCase();
    if (!query) return speakers;
    return speakers.filter((speaker) =>
      `${speaker.name} ${speaker.email}`.toLocaleLowerCase().includes(query),
    );
  }, [speakerQuery, speakers]);
  const toggleSpeaker = (participantId: string) => {
    set(
      'participantIds',
      draft.participantIds.includes(participantId)
        ? draft.participantIds.filter((id) => id !== participantId)
        : [...draft.participantIds, participantId],
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => (next ? undefined : onClose())}
      title={editing ? `Revise ${editing.name}` : 'Decree a duty'}
      description="Duties appear in each appointed orator’s atrium and feed the unsettled-work ledger."
      footer={
        <>
          <Button onClick={onClose}>Leave unchanged</Button>
          <Button variant="primary" loading={pending} onClick={save}>
            {editing ? 'Seal revisions' : 'Enter in the ledger'}
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
            placeholder="File your presentation scrolls"
            onChange={(event) => set('name', event.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.label}>Instructions</span>
          <Textarea
            rows={3}
            value={draft.descriptionMarkdown}
            placeholder="Markdown. Proclaimed above the duty in the atrium."
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

        {draft.audience === 'manual' ? (
          <fieldset className={styles.speakerPicker}>
            <legend className={styles.label}>Selected orators</legend>
            <Input
              type="search"
              value={speakerQuery}
              aria-label="Search orators"
              placeholder="Search by name or dispatch address"
              onChange={(event) => setSpeakerQuery(event.target.value)}
            />
            <span className={styles.hint}>
              {draft.participantIds.length} of {speakers.length} orators appointed
            </span>
            <div
              className={styles.speakerList}
              role="group"
              aria-label="Orators appointed to this duty"
            >
              {visibleSpeakers.map((speaker) => (
                <label className={styles.speakerOption} key={speaker.id}>
                  <Checkbox
                    checked={draft.participantIds.includes(speaker.id)}
                    onChange={() => toggleSpeaker(speaker.id)}
                  />
                  <span>
                    <span className={styles.speakerName}>{speaker.name}</span>
                    <span className={styles.speakerEmail}>{speaker.email}</span>
                  </span>
                </label>
              ))}
              {visibleSpeakers.length === 0 ? (
                <span className={styles.speakerEmpty}>No orator answers that search.</span>
              ) : null}
            </div>
          </fieldset>
        ) : null}

        {draft.kind === 'form' ? (
          <label className={styles.field}>
            <span className={styles.label}>Scroll</span>
            <Select value={draft.formId} onChange={(event) => set('formId', event.target.value)}>
              <option value="">Choose a scroll…</option>
              {forms.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.name}
                </option>
              ))}
            </Select>
            {forms.length === 0 ? (
              <span className={styles.hint}>
                No scrolls have been inscribed. Visit Scrolls, then return.
              </span>
            ) : null}
          </label>
        ) : null}

        {draft.kind === 'link' ? (
          <label className={styles.field}>
            <span className={styles.label}>Road</span>
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
            <span className={styles.label}>Appointed day</span>
            <Input
              type="date"
              value={draft.dueAt}
              onChange={(event) => set('dueAt', event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Dispatch reminders this many days before</span>
            <Input
              value={draft.reminderDaysBefore}
              placeholder="7, 1"
              onChange={(event) => set('reminderDaysBefore', event.target.value)}
            />
            <span className={styles.hint}>Separate days with commas. Leave blank to send no couriers.
            </span>
          </label>
        </div>

        <label className={styles.checkbox}>
          <Checkbox
            checked={draft.required}
            onChange={(event) => set('required', event.target.checked)}
          />
          <span>Required—remains on the orator’s ledger until settled</span>
        </label>
      </div>
    </Dialog>
  );
}
