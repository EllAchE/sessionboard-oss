'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { History, Undo2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Textarea,
  useToast,
} from '../../../../../components/ui';
import type {
  ContentApprovalStatus,
  ContentEntityKind,
} from '../../../../../lib/services/content';
import { restoreRevisionAction, saveContentAction, setContentStatusAction } from '../actions';
import { FilesNav } from '../FilesNav';
import queue from '../../submissions.module.css';
import styles from '../files.module.css';

export type EntityWire = {
  kind: ContentEntityKind;
  id: string;
  label: string;
  secondary: string | null;
  fields: Record<string, string>;
  contentStatus: ContentApprovalStatus | null;
};

export type RevisionWire = {
  id: string;
  entityKind: ContentEntityKind;
  entityId: string;
  entityLabel: string;
  revisionNumber: number;
  summary: string;
  editorName: string;
  when: string;
  isCurrent: boolean;
  changed: Array<{ label: string; before: string; after: string }>;
};

/**
 * `CNT-12`'s vocabulary is duplicated here rather than imported: `lib/services/content.ts` reaches
 * the database, and a value import from a client component drags `pg` into the browser bundle.
 */
const APPROVAL_OPTIONS: Array<{ value: ContentApprovalStatus; label: string }> = [
  { value: 'in_review', label: 'In review' },
  { value: 'approved', label: 'Approved' },
  { value: 'changes_requested', label: 'Changes requested' },
];

const APPROVAL_TONE: Record<ContentApprovalStatus, 'info' | 'success' | 'warning'> = {
  in_review: 'info',
  approved: 'success',
  changes_requested: 'warning',
};

/**
 * Empty means "history only". A scheduled session is edited on the agenda board and a sponsor on
 * the sponsors board, where their scheduling and uniqueness rules live; this screen shows their
 * history and restores it, and offers no second editor that would bypass those rules.
 */
const EDITABLE_BY_KIND: Record<ContentEntityKind, string[]> = {
  session: ['title', 'level', 'descriptionMarkdown'],
  participant: ['displayName', 'jobTitle', 'company', 'bioMarkdown'],
  scheduled_session: [],
  sponsor: [],
};

const EDITED_ELSEWHERE: Partial<Record<ContentEntityKind, string>> = {
  scheduled_session: 'Edited on the agenda board.',
  sponsor: 'Edited on the sponsors board.',
};

const LONG_FIELDS = new Set(['descriptionMarkdown', 'bioMarkdown']);

function approvalLabel(status: ContentApprovalStatus): string {
  return APPROVAL_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

/**
 * Edit, history and restore on one screen. Split across three, an organizer has to remember what
 * the old copy said while navigating to the thing that would have told them.
 */
export function ContentHistory({
  entities,
  revisions,
  fieldLabels,
}: {
  entities: EntityWire[];
  revisions: RevisionWire[];
  fieldLabels: Record<ContentEntityKind, Record<string, string>>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(entities[0]?.id ?? null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  const selected = useMemo(
    () => entities.find((entity) => entity.id === selectedId) ?? null,
    [entities, selectedId],
  );

  useEffect(() => {
    setDraft(selected ? { ...selected.fields } : {});
  }, [selected]);

  const labels = selected ? fieldLabels[selected.kind] : {};
  const editable = selected ? EDITABLE_BY_KIND[selected.kind] : [];

  const shown = useMemo(
    () => (selected ? revisions.filter((entry) => entry.entityId === selected.id) : revisions),
    [revisions, selected],
  );

  const save = () => {
    if (!selected) return;
    start(async () => {
      const result = await saveContentAction(selected.kind, selected.id, draft);
      if (!result.ok) {
        toast({ title: 'Not saved', description: result.message, tone: 'danger' });
        return;
      }
      toast({
        title: 'Saved',
        description: 'The previous wording is in the history below.',
        tone: 'success',
      });
      router.refresh();
    });
  };

  const setStatus = (entity: EntityWire, status: ContentApprovalStatus) => {
    start(async () => {
      const result = await setContentStatusAction(entity.id, status);
      if (!result.ok) {
        toast({ title: 'Not changed', description: result.message, tone: 'danger' });
        return;
      }
      toast({
        title: `${entity.label} is ${approvalLabel(status).toLowerCase()}`,
        description:
          status === 'approved'
            ? 'It appears on the public agenda.'
            : 'It is held back from the public agenda until it is approved.',
        tone: status === 'approved' ? 'success' : 'info',
      });
      router.refresh();
    });
  };

  const restore = (revisionId: string) => {
    start(async () => {
      const result = await restoreRevisionAction(revisionId);
      if (!result.ok) {
        toast({ title: 'Not restored', description: result.message, tone: 'danger' });
        return;
      }
      toast({
        title: 'Restored',
        description: 'The restore is itself in the history, so it can be undone.',
        tone: 'success',
      });
      router.refresh();
    });
  };

  return (
    <div className={queue.page}>
      <FilesNav />

      <header className={queue.header}>
        <div className={queue.headings}>
          <span className={queue.eyebrow}>Content</span>
          <h1 className={queue.title}>Sessions and speakers</h1>
          <p className={queue.subtitle}>Edit public copy, approve it, or restore earlier versions.</p>
        </div>
      </header>

      <div className={styles.split}>
        <div className={styles.stack}>
          <Card>
            <CardHeader>
              <CardTitle>Approval and content</CardTitle>
            </CardHeader>
            <CardBody>
              <ul className={styles.entityList}>
                {entities.map((entity) => (
                  <li
                    key={entity.id}
                    className={styles.entityRow}
                    data-selected={entity.id === selectedId}
                  >
                    <button
                      type="button"
                      className={styles.entityPick}
                      onClick={() => setSelectedId(entity.id)}
                    >
                      <span className={styles.entityName}>{entity.label}</span>
                      <span className={styles.faint}>{entity.secondary ?? 'Speaker'}</span>
                    </button>
                    {/*
                      Its own row under the name rather than a sibling competing with it for the
                      line. The name is what says which session is being approved, and it was the
                      part that lost.
                    */}
                    {entity.contentStatus ? (
                      <div className={styles.entityStatus}>
                        <Badge tone={APPROVAL_TONE[entity.contentStatus]}>
                          {approvalLabel(entity.contentStatus)}
                        </Badge>
                        <div className={styles.entityStatusPick}>
                          <Select
                            selectSize="sm"
                            aria-label={`Content approval for ${entity.label}`}
                            value={entity.contentStatus}
                            disabled={pending}
                            onChange={(event) =>
                              setStatus(entity, event.target.value as ContentApprovalStatus)
                            }
                          >
                            {APPROVAL_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className={queue.hint}>Only approved sessions appear publicly.</p>
            </CardBody>
          </Card>

          {selected && editable.length === 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{selected.label}</CardTitle>
              </CardHeader>
              <CardBody>
                <p className={queue.muted}>
                  {EDITED_ELSEWHERE[selected.kind] ?? 'Edited elsewhere.'} Its history is on the
                  right, and every version stays restorable from here.
                </p>
              </CardBody>
            </Card>
          )}

          {selected && editable.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Edit {selected.label}</CardTitle>
              </CardHeader>
              <CardBody>
                <div className={styles.stack}>
                  {editable.map((field) => (
                    <div key={field} className={styles.field}>
                      <label className={styles.fieldLabel} htmlFor={`content-${field}`}>
                        {labels[field] ?? field}
                      </label>
                      {LONG_FIELDS.has(field) ? (
                        <Textarea
                          id={`content-${field}`}
                          rows={6}
                          value={draft[field] ?? ''}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, [field]: event.target.value }))
                          }
                        />
                      ) : (
                        <Input
                          id={`content-${field}`}
                          inputSize="sm"
                          value={draft[field] ?? ''}
                          onChange={(event) =>
                            setDraft((current) => ({ ...current, [field]: event.target.value }))
                          }
                        />
                      )}
                    </div>
                  ))}
                  <div className={styles.inlineRow}>
                    <Button variant="primary" size="sm" disabled={pending} onClick={save}>
                      {pending ? 'Saving…' : 'Save changes'}
                    </Button>
                    <span className={styles.faint}>
                      The version before this save stays restorable.
                    </span>
                  </div>
                </div>
              </CardBody>
            </Card>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>
              <History size={15} aria-hidden />{' '}
              {selected ? `History of ${selected.label}` : 'Change history'}
            </CardTitle>
          </CardHeader>
          <CardBody>
            {shown.length === 0 ? (
              <p className={queue.muted}>No changes yet.</p>
            ) : (
              <ul className={styles.rowList}>
                {shown.map((entry) => (
                  <li key={entry.id} className={styles.revision}>
                    <div className={styles.revisionHead}>
                      <div className={styles.stackTight}>
                        <span className={styles.commentAuthor}>{entry.summary}</span>
                        {/* The number, not the timestamp, is what someone quotes when they ask a
                            colleague to put a session back. Two edits can share a minute. */}
                        <span className={styles.faint}>
                          Revision {entry.revisionNumber} · {entry.editorName} · {entry.when}
                          {selected ? '' : ` · ${entry.entityLabel}`}
                        </span>
                      </div>
                      {entry.isCurrent ? (
                        <Badge tone="neutral">Current</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="ghost"
                          iconLeft={<Undo2 size={14} />}
                          disabled={pending}
                          onClick={() => restore(entry.id)}
                        >
                          Restore
                        </Button>
                      )}
                    </div>
                    {entry.changed.map((change) => (
                      <div key={change.label} className={styles.change}>
                        <span className={styles.fieldLabel}>{change.label}</span>
                        <span className={styles.changeValues}>
                          <span className={styles.before}>{change.before || '—'}</span>
                          <span className={styles.after}>{change.after || '—'}</span>
                        </span>
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
