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
  { value: 'in_review', label: 'Before the censors' },
  { value: 'approved', label: 'Cleared for proclamation' },
  { value: 'changes_requested', label: 'Revision decreed' },
];

const APPROVAL_TONE: Record<ContentApprovalStatus, 'info' | 'success' | 'warning'> = {
  in_review: 'info',
  approved: 'success',
  changes_requested: 'warning',
};

const SESSION_EDITABLE = ['title', 'level', 'descriptionMarkdown'];
const SPEAKER_EDITABLE = ['displayName', 'jobTitle', 'company', 'bioMarkdown'];
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
  sessionFields,
  speakerFields,
}: {
  entities: EntityWire[];
  revisions: RevisionWire[];
  sessionFields: Record<string, string>;
  speakerFields: Record<string, string>;
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

  const labels = selected?.kind === 'session' ? sessionFields : speakerFields;
  const editable = selected?.kind === 'session' ? SESSION_EDITABLE : SPEAKER_EDITABLE;

  const shown = useMemo(
    () => (selected ? revisions.filter((entry) => entry.entityId === selected.id) : revisions),
    [revisions, selected],
  );

  const save = () => {
    if (!selected) return;
    start(async () => {
      const result = await saveContentAction(selected.kind, selected.id, draft);
      if (!result.ok) {
        toast({ title: 'Not entered in the annals', description: result.message, tone: 'danger' });
        return;
      }
      toast({
        title: 'Entered in the annals',
        description: 'The earlier wording remains in the annals below.',
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
            ? 'It appears in the public fasti.'
            : 'It remains outside the public fasti until approved.',
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
        description: 'This restoration enters the annals too, so it may be reversed.',
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
          <span className={queue.eyebrow}>The annals</span>
          <h1 className={queue.title}>Orations &amp; orators</h1>
          <p className={queue.subtitle}>
            Revise the inscriptions, decree what may enter the public fasti, and restore any earlier
            wording from the annals.
          </p>
        </div>
      </header>

      <div className={styles.split}>
        <div className={styles.stack}>
          <Card>
            <CardHeader>
              <CardTitle>Decree &amp; inscription</CardTitle>
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
                      <span className={styles.faint}>{entity.secondary ?? 'Orator'}</span>
                    </button>
                    {entity.contentStatus ? (
                      <>
                        <Badge tone={APPROVAL_TONE[entity.contentStatus]}>
                          {approvalLabel(entity.contentStatus)}
                        </Badge>
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
                      </>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className={queue.hint}>
                Only approved orations reach the public fasti and inscriptions. Every decree is
                attributed in the annals.
              </p>
            </CardBody>
          </Card>

          {selected && (
            <Card>
              <CardHeader>
                <CardTitle>Revise {selected.label}</CardTitle>
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
                      {pending ? 'Inscribing…' : 'Enter revisions'}
                    </Button>
                    <span className={styles.faint}>
                      The earlier wording remains restorable from the annals.
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
              {selected ? `Annals of ${selected.label}` : 'Annals of revision'}
            </CardTitle>
          </CardHeader>
          <CardBody>
            {shown.length === 0 ? (
              <p className={queue.muted}>
                No revision has entered the annals. Every inscription, decree, and restoration will
                appear here with its author and hour.
              </p>
            ) : (
              <ul className={styles.rowList}>
                {shown.map((entry) => (
                  <li key={entry.id} className={styles.revision}>
                    <div className={styles.revisionHead}>
                      <div className={styles.stackTight}>
                        <span className={styles.commentAuthor}>{entry.summary}</span>
                        <span className={styles.faint}>
                          {entry.editorName} · {entry.when}
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
