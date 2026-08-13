'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { StickyNote, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { addNoteAction, moveProspectAction, removeProspectAction } from '../../actions';
import { formatDateTime } from '../../wire';
import styles from '../../crm.module.css';

type Props = {
  prospect: {
    id: string;
    contactId: string;
    stage: string;
    stageLabel: string;
    score: number | null;
    rationale: string | null;
    eventName: string | null;
    createdAt: string;
  };
  contact: {
    id: string;
    name: string;
    email: string;
    company: string | null;
    jobTitle: string | null;
  };
  stages: Array<{ stage: string; label: string }>;
  notes: Array<{
    id: string;
    authorName: string;
    body: string;
    createdAt: string;
  }>;
  history: Array<{
    id: string;
    kind: string;
    summary: string;
    actorName: string;
    createdAt: string;
  }>;
};

export function ProspectDetail({ prospect, contact, stages, notes, history }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const saveNote = () => {
    setError(null);
    startTransition(async () => {
      const result = await addNoteAction({
        contactId: contact.id,
        prospectId: prospect.id,
        body: note,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote('');
      toast({ title: 'Note saved', tone: 'success' });
      router.refresh();
    });
  };

  const changeStage = (stage: string) => {
    setError(null);
    startTransition(async () => {
      const result = await moveProspectAction({
        prospectId: prospect.id,
        stage: stage as never,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: 'Stage updated', tone: 'success' });
      router.refresh();
    });
  };

  const remove = () => {
    startTransition(async () => {
      const result = await removeProspectAction(prospect.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push('/crm/pipeline');
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <Link href="/crm/pipeline">Summoning campaign</Link>
          </p>
          <h1 className={styles.title}>{contact.name}</h1>
          <p className={styles.subtitle}>
            {[contact.jobTitle, contact.company].filter(Boolean).join(' · ') || contact.email} ·{' '}
            {prospect.eventName ?? 'No assembly yet'}
          </p>
        </div>
        <div className={styles.headActions}>
          <Button size="sm" variant="secondary" href={`/crm/${contact.id}`}>
            Open citizen record
          </Button>
          <Button
            size="sm"
            variant="ghost"
            iconLeft={<Trash2 size={14} />}
            loading={pending}
            onClick={remove}
          >
            Withdraw summons
          </Button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.split}>
        <div className={styles.stack}>
          <Card>
            <CardHeader>
              <CardTitle>Summons notes</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.stack}>
                <Textarea
                  rows={3}
                  aria-label="Internal note"
                  placeholder="What word returned from the last envoy?"
                  value={note}
                  onChange={(entry) => setNote(entry.currentTarget.value)}
                />
                <div>
                  <Button
                    variant="primary"
                    size="sm"
                    iconLeft={<StickyNote size={14} />}
                    loading={pending}
                    onClick={saveNote}
                  >
                    Seal note
                  </Button>
                </div>
                {notes.length === 0 ? (
                  <p className={styles.hint}>No notes have entered the annals for this name.</p>
                ) : (
                  notes.map((entry) => (
                    <div key={entry.id} className={styles.note}>
                      <p className={styles.noteBody}>{entry.body}</p>
                      <span className={styles.timelineMeta}>
                        {entry.authorName} · {formatDateTime(entry.createdAt)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campaign annals</CardTitle>
            </CardHeader>
            <CardBody>
              {history.length === 0 ? (
                <p className={styles.hint}>No change of standing is recorded.</p>
              ) : (
                <div className={styles.timeline}>
                  {history.map((entry) => (
                    <div key={entry.id} className={styles.timelineItem}>
                      <span className={styles.timelineDot} data-kind={entry.kind} />
                      <div className={styles.timelineBody}>
                        <span className={styles.timelineSummary}>{entry.summary}</span>
                        <span className={styles.timelineMeta}>
                          {entry.actorName} · {formatDateTime(entry.createdAt)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Summoning</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.stack}>
              <label className={styles.field}>
                <span className={styles.label}>Stage</span>
                <Select
                  value={prospect.stage}
                  disabled={pending}
                  aria-label="Stage"
                  onChange={(entry) => changeStage(entry.currentTarget.value)}
                >
                  {stages.map((stage) => (
                    <option key={stage.stage} value={stage.stage}>
                      {stage.label}
                    </option>
                  ))}
                </Select>
              </label>
              <div className={styles.field}>
                <span className={styles.label}>Score</span>
                <span className={styles.value}>
                  {prospect.score === null ? '—' : <Badge tone="accent">{prospect.score}</Badge>}
                </span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Rationale</span>
                <span className={styles.value}>{prospect.rationale ?? '—'}</span>
              </div>
              <div className={styles.field}>
                <span className={styles.label}>Enrolled</span>
                <span className={styles.value}>{formatDateTime(prospect.createdAt)}</span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
