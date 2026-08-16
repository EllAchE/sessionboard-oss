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
      toast({ title: 'Note saved', tone: 'success' });
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
      toast({ title: 'Profile updated', tone: 'success' });
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
      toast({ title: 'Saved', tone: 'success' });
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
        description: 'Name, email, company and bio carried over to the speakers module.',
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
            <Link href="/crm">Speaker directory</Link>
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
            Edit profile
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
                    <img
                      className={styles.headshot}
                      src={contact.headshotUrl}
                      alt={contact.name}
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className={styles.headshotEmpty}>No headshot</div>
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
                    {contact.headshotUrl ? (
                      <span className={styles.hint}>
                        Directory source image. Event profiles use a normalized stored copy.{' '}
                        <a
                          href={contact.headshotUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          referrerPolicy="no-referrer"
                        >
                          Open source image
                        </a>
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className={styles.bio}>{contact.bioMarkdown ?? 'No bio on file yet.'}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Internal notes</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.stack}>
                <Textarea
                  rows={3}
                  placeholder="Only your team sees this."
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
                    Save note
                  </Button>
                </div>
                {notes.length === 0 ? (
                  <p className={styles.hint}>No notes yet.</p>
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
              <CardTitle>Activity</CardTitle>
            </CardHeader>
            <CardBody>
              {activity.length === 0 ? (
                <p className={styles.hint}>Nothing has happened on this record yet.</p>
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
              <CardTitle>Events</CardTitle>
            </CardHeader>
            <CardBody>
              <div className={styles.stack}>
                {events.length === 0 ? (
                  <p className={styles.hint}>Not yet on any event.</p>
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
                      <span className={styles.label}>Add to an event</span>
                      <Select
                        selectSize="sm"
                        value={pushEventId}
                        aria-label="Event to add this contact to"
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
                      Creates the speaker in that event&rsquo;s roster with this name, email,
                      company and bio already filled in. A headshot URL stays a directory source:
                      open and download it, then upload it on the speaker record to create the
                      event&rsquo;s controlled 512 px copy.
                    </p>
                  </>
                ) : null}
                {events.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    href="/organizer/speakers"
                    iconRight={<ArrowUpRight size={14} />}
                  >
                    Open the speakers module
                  </Button>
                ) : null}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Custom fields</CardTitle>
            </CardHeader>
            <CardBody>
              {fields.length === 0 ? (
                <p className={styles.hint}>
                  No organizer-defined fields yet. <Link href="/crm/fields">Create one</Link>.
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
              <CardTitle>Sourcing</CardTitle>
            </CardHeader>
            <CardBody>
              {prospects.length === 0 ? (
                <p className={styles.hint}>Not on the sourcing pipeline.</p>
              ) : (
                <div className={styles.stack}>
                  {prospects.map((entry) => (
                    <Link
                      key={entry.id}
                      href={`/crm/pipeline/${entry.id}`}
                      className={styles.spread}
                    >
                      <span className={styles.value}>{entry.eventName ?? 'No event yet'}</span>
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
        title="Edit contact"
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
            <Button variant="primary" loading={pending} onClick={saveProfile}>
              Save
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
            <span className={styles.label}>Email</span>
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
            <span className={styles.hint}>
              A source reference for prospecting. Event profiles never hotlink it; promote it with
              the speaker photo uploader after adding this contact to an event. Open and download
              the source first, then choose that local file.
            </span>
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
