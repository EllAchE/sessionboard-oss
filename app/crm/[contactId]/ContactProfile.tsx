'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, CalendarPlus, Pencil, Send, StickyNote } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Dialog,
  Input,
  Select,
  Tag,
  Textarea,
  useToast,
} from '@/components/ui';
import { addNoteAction, pushToEventAction, updateContactAction } from '../actions';
import {
  formatDate,
  formatDateTime,
  type ContactWire,
  type EventWire,
  type FieldWire,
} from '../wire';
import styles from '../crm.module.css';

export type NoteView = {
  id: string;
  authorName: string;
  body: string;
  createdAt: string;
};
export type ActivityView = {
  id: string;
  kind: string;
  summary: string;
  actorName: string;
  createdAt: string;
};
export type LinkedEventView = {
  eventId: string;
  eventName: string;
  eventSlug: string;
  linkedAt: string;
};
export type ProspectView = {
  id: string;
  stage: string;
  stageLabel: string;
  score: number | null;
  eventName: string | null;
};

type Props = {
  contact: ContactWire;
  notes: NoteView[];
  activity: ActivityView[];
  events: LinkedEventView[];
  prospects: ProspectView[];
  fields: FieldWire[];
  organizerEvents: EventWire[];
};

export function ContactProfile({
  contact,
  notes,
  activity,
  events,
  prospects,
  fields,
  organizerEvents,
}: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    name: contact.name,
    email: contact.email,
    company: contact.company ?? '',
    jobTitle: contact.jobTitle ?? '',
    location: contact.location ?? '',
    headshotUrl: contact.headshotUrl ?? '',
    bioMarkdown: contact.bioMarkdown ?? '',
    tags: contact.tags.join(', '),
  });
  const [custom, setCustom] = useState<Record<string, string>>(contact.customFields);
  const [pushEventId, setPushEventId] = useState(organizerEvents[0]?.id ?? '');

  const linkedIds = new Set(events.map((entry) => entry.eventId));
  const pushable = organizerEvents.filter((entry) => !linkedIds.has(entry.id));

  const saveNote = () => {
    setError(null);
    startTransition(async () => {
      const result = await addNoteAction({ contactId: contact.id, body: note });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setNote('');
      toast({ title: 'Note entered in the annals', tone: 'success' });
      router.refresh();
    });
  };

  const saveProfile = () => {
    setError(null);
    startTransition(async () => {
      const result = await updateContactAction(contact.id, {
        name: draft.name,
        email: draft.email,
        company: draft.company,
        jobTitle: draft.jobTitle,
        location: draft.location,
        headshotUrl: draft.headshotUrl,
        bioMarkdown: draft.bioMarkdown,
        tags: draft.tags.split(','),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      toast({ title: 'Census record revised', tone: 'success' });
      router.refresh();
    });
  };

  const saveCustom = (key: string, value: string) => {
    const next = { ...custom, [key]: value };
    setCustom(next);
    setError(null);
    startTransition(async () => {
      const result = await updateContactAction(contact.id, {
        customFields: next,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({ title: 'Entered in the annals', tone: 'success' });
      router.refresh();
    });
  };

  const push = () => {
    if (pushEventId === '') return;
    setError(null);
    startTransition(async () => {
      const result = await pushToEventAction({
        contactId: contact.id,
        eventId: pushEventId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({
        title: `Added to ${result.data.eventName}`,
        description: 'Name, email, house, and biography carried to the roll of orators.',
        tone: 'success',
      });
      router.refresh();
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>
            <Link href="/crm">Census of orators</Link>
          </p>
          <h1 className={styles.title}>{contact.name}</h1>
          <p className={styles.subtitle}>
            In the directory since {formatDate(contact.createdAt)}
            {contact.source ? ` · via ${contact.source}` : ''}
          </p>
        </div>
        <div className={styles.headActions}>
          <Button
            size="sm"
            variant="secondary"
            iconLeft={<Pencil size={14} />}
            onClick={() => setEditing(true)}
          >
            Revise likeness
          </Button>
          <Button
            size="sm"
            variant="secondary"
            href={`/crm/campaigns?ids=${contact.id}`}
            iconLeft={<Send size={14} />}
          >
            Email
          </Button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.split}>
        <div className={styles.stack}>
          <Card>
            <CardBody>
              <div className={styles.stack}>
                <div className={styles.identity}>
                  {contact.headshotUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.headshot} src={contact.headshotUrl} alt={contact.name} />
                  ) : (
                    <div className={styles.headshotEmpty}>Portrait not commissioned</div>
                  )}
                  <div className={styles.identityBody}>
                    <span className={styles.value}>{contact.email}</span>
                    <span className={styles.value}>
                      {[contact.jobTitle, contact.company].filter(Boolean).join(' · ') || '—'}
                    </span>
                    <span className={styles.hint}>
                      {contact.location ?? 'Location not recorded'}
                    </span>
                    {contact.tags.length > 0 ? (
                      <span className={styles.tagRow}>
                        {contact.tags.map((tag) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className={styles.bio}>{contact.bioMarkdown ?? 'No biography in the annals.'}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Private annals</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.stack}>
                <Textarea
                  rows={3}
                  placeholder="Only the inner council sees this."
                  aria-label="Internal note"
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
                  <p className={styles.hint}>No notes in the annals.</p>
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
              <CardTitle>Public record</CardTitle>
            </CardHeader>
            <CardBody>
              {activity.length === 0 ? (
                <p className={styles.hint}>The annals hold no deed for this name yet.</p>
              ) : (
                <div className={styles.timeline}>
                  {activity.map((entry) => (
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

        <div className={styles.stack}>
          <Card>
            <CardHeader>
              <CardTitle>Assemblies</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.stack}>
                {events.length === 0 ? (
                  <p className={styles.hint}>Not yet appointed to any assembly.</p>
                ) : (
                  events.map((entry) => (
                    <div key={entry.eventId} className={styles.spread}>
                      <span className={styles.value}>{entry.eventName}</span>
                      <span className={styles.timelineMeta}>{formatDate(entry.linkedAt)}</span>
                    </div>
                  ))
                )}
                {pushable.length > 0 ? (
                  <>
                    <label className={styles.field}>
                      <span className={styles.label}>Appoint to an event</span>
                      <Select
                        selectSize="sm"
                        value={pushEventId}
                        aria-label="Assembly to summon this citizen to"
                        onChange={(entry) => setPushEventId(entry.currentTarget.value)}
                      >
                        {pushable.map((entry) => (
                          <option key={entry.id} value={entry.id}>
                            {entry.name}
                          </option>
                        ))}
                      </Select>
                    </label>
                    <Button
                      variant="primary"
                      size="sm"
                      iconLeft={<CalendarPlus size={14} />}
                      loading={pending}
                      onClick={push}
                    >
                      Add to event
                    </Button>
                    <p className={styles.hint}>
                      Enters the orator on that assembly&rsquo;s roll with this name, dispatch address,
                      affiliation, and biography already inscribed.
                    </p>
                  </>
                ) : null}
                {events.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    href="/admin/speakers"
                    iconRight={<ArrowUpRight size={14} />}
                  >
                    Open the orator census
                  </Button>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom inscriptions</CardTitle>
            </CardHeader>
            <CardBody>
              {fields.length === 0 ? (
                <p className={styles.hint}>
                  No custom inscriptions yet. <Link href="/crm/fields">Inscribe one</Link>.
                </p>
              ) : (
                <div className={styles.stack}>
                  {fields.map((field) => (
                    <label key={field.id} className={styles.field}>
                      <span className={styles.label}>{field.label}</span>
                      {field.options.length > 0 ? (
                        <Select
                          selectSize="sm"
                          value={custom[field.key] ?? ''}
                          aria-label={field.label}
                          onChange={(entry) => saveCustom(field.key, entry.currentTarget.value)}
                        >
                          <option value="">Not set</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <Input
                          inputSize="sm"
                          aria-label={field.label}
                          value={custom[field.key] ?? ''}
                          onChange={(entry) =>
                            setCustom({
                              ...custom,
                              [field.key]: entry.currentTarget.value,
                            })
                          }
                          onBlur={(entry) => saveCustom(field.key, entry.currentTarget.value)}
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Summoning</CardTitle>
            </CardHeader>
            <CardBody>
              {prospects.length === 0 ? (
                <p className={styles.hint}>Not under recruitment.</p>
              ) : (
                <div className={styles.stack}>
                  {prospects.map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/crm/pipeline/${entry.id}`}
                      className={styles.spread}
                    >
                      <span className={styles.value}>{entry.eventName ?? 'No assembly yet'}</span>
                      <span className={styles.row}>
                        {entry.score !== null ? <Badge>{entry.score}</Badge> : null}
                        <Badge tone="accent">{entry.stageLabel}</Badge>
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <Dialog
        open={editing}
        onOpenChange={setEditing}
        title="Revise the census record"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} onClick={saveProfile}>
              Seal changes
            </Button>
          </>
        }
      >
        <div className={styles.stack}>
          <label className={styles.field}>
            <span className={styles.label}>Name</span>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Dispatch address</span>
            <Input
              value={draft.email}
              onChange={(e) => setDraft({ ...draft, email: e.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Company</span>
            <Input
              value={draft.company}
              onChange={(e) => setDraft({ ...draft, company: e.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Job title</span>
            <Input
              value={draft.jobTitle}
              onChange={(e) => setDraft({ ...draft, jobTitle: e.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Location</span>
            <Input
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Headshot URL</span>
            <Input
              value={draft.headshotUrl}
              onChange={(e) => setDraft({ ...draft, headshotUrl: e.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Tags</span>
            <Input
              value={draft.tags}
              onChange={(e) => setDraft({ ...draft, tags: e.currentTarget.value })}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>Bio</span>
            <Textarea
              rows={5}
              value={draft.bioMarkdown}
              onChange={(e) => setDraft({ ...draft, bioMarkdown: e.currentTarget.value })}
            />
          </label>
        </div>
      </Dialog>
    </div>
  );
}
