'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowUpRight, Send } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardDescription,
  CardTitle,
  Checkbox,
  Input,
  Select,
  Textarea,
  useToast,
} from '@/components/ui';
import { sendCampaignAction } from '../actions';
import {
  MERGE_TAG_KEYS,
  formatDateTime,
  renderMergeTagsWire,
  type ContactWire,
  type EventWire,
} from '../wire';
import styles from '../crm.module.css';

export type CampaignView = {
  id: string;
  subject: string;
  recipientCount: number;
  createdAt: string;
  recipients: Array<{ email: string; renderedSubject: string }>;
};

type Props = {
  contacts: ContactWire[];
  preselected: string[];
  events: EventWire[];
  campaigns: CampaignView[];
};

const DEFAULT_BODY = `Hi {{first_name}},

We loved your work at {{company}} and would like to invite you to speak.

Reply to this note and we will send over the details.

— The programme team`;

export function Composer({ contacts, preselected, events, campaigns }: Props) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const [selected, setSelected] = useState<string[]>(preselected);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState(DEFAULT_BODY);
  const [eventId, setEventId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const recipients = useMemo(
    () => contacts.filter((row) => selected.includes(row.id)),
    [contacts, selected],
  );
  const sample = recipients[0] ?? null;

  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id],
    );

  const insertTag = (tag: string) => {
    const area = bodyRef.current;
    const token = `{{${tag}}}`;
    if (!area) {
      setBody((current) => `${current}${token}`);
      return;
    }
    const start = area.selectionStart ?? body.length;
    const end = area.selectionEnd ?? body.length;
    setBody(`${body.slice(0, start)}${token}${body.slice(end)}`);
  };

  const send = () => {
    setError(null);
    startTransition(async () => {
      const result = await sendCampaignAction({
        subject,
        bodyMarkdown: body,
        contactIds: selected,
        eventId: eventId === '' ? null : eventId,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast({
        title: `Sent to ${result.data.sent} contacts`,
        description: result.data.failed > 0 ? `${result.data.failed} failed.` : undefined,
        tone: result.data.failed > 0 ? 'warning' : 'success',
      });
      setSubject('');
      router.refresh();
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHead}>
        <div>
          <p className={styles.eyebrow}>Organization</p>
          <h1 className={styles.title}>Bulk email</h1>
          <p className={styles.subtitle}>
            One message, personalized per recipient. Every send is logged and readable in the
            organizer mailbox.
          </p>
        </div>
        <div className={styles.headActions}>
          <Button
            size="sm"
            variant="secondary"
            href="/admin/mail"
            iconRight={<ArrowUpRight size={14} />}
          >
            Open the mailbox
          </Button>
        </div>
      </div>

      {error ? <p className={styles.error}>{error}</p> : null}

      <div className={styles.composerGrid}>
        <Card>
          <CardHeader>
            <CardTitle>Recipients</CardTitle>
            <CardDescription>{selected.length} selected — at least two are needed.</CardDescription>
          </CardHeader>
          <CardBody>
            <div className={styles.recipientList}>
              {contacts.map((row) => (
                <label key={row.id} className={styles.recipient}>
                  <Checkbox
                    checked={selected.includes(row.id)}
                    aria-label={`Include ${row.name}`}
                    onChange={() => toggle(row.id)}
                  />
                  <span className={styles.identityBody}>
                    <span className={styles.value}>{row.name}</span>
                    <span className={styles.timelineMeta}>{row.email}</span>
                  </span>
                </label>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Message</CardTitle>
            <CardDescription>
              Merge tags are replaced per recipient before the message goes out.
            </CardDescription>
          </CardHeader>
          <CardBody>
            <div className={styles.stack}>
              <label className={styles.field}>
                <span className={styles.label}>Subject</span>
                <Input
                  placeholder="Speak at DevFlow Conf 2027?"
                  value={subject}
                  onChange={(entry) => setSubject(entry.currentTarget.value)}
                />
              </label>
              <label className={styles.field}>
                <span className={styles.label}>Body</span>
                <Textarea
                  ref={bodyRef}
                  rows={10}
                  value={body}
                  onChange={(entry) => setBody(entry.currentTarget.value)}
                />
              </label>
              <div className={styles.tagPalette}>
                <span className={styles.label}>Insert</span>
                {MERGE_TAG_KEYS.map((tag) => (
                  <Button key={tag} size="sm" variant="ghost" onClick={() => insertTag(tag)}>
                    {`{{${tag}}}`}
                  </Button>
                ))}
              </div>
              <label className={styles.field}>
                <span className={styles.label}>Attribute to an event (optional)</span>
                <Select
                  selectSize="sm"
                  value={eventId}
                  onChange={(entry) => setEventId(entry.currentTarget.value)}
                >
                  <option value="">No event</option>
                  {events.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
              </label>

              <div className={styles.preview}>
                <span className={styles.label}>
                  Preview {sample ? `for ${sample.name} <${sample.email}>` : ''}
                </span>
                {sample === null ? (
                  <p className={styles.hint}>Select a recipient to see the message resolved.</p>
                ) : (
                  <>
                    <p className={styles.previewSubject}>
                      {renderMergeTagsWire(subject, sample) || 'No subject yet'}
                    </p>
                    <p className={styles.previewBody}>{renderMergeTagsWire(body, sample)}</p>
                  </>
                )}
              </div>

              <div>
                <Button
                  variant="primary"
                  iconLeft={<Send size={14} />}
                  disabled={selected.length < 2 || subject.trim() === ''}
                  loading={pending}
                  onClick={send}
                >
                  Send to {selected.length} contacts
                </Button>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Sent</CardTitle>
        </CardHeader>
        <CardBody>
          {campaigns.length === 0 ? (
            <p className={styles.hint}>Nothing sent from the CRM yet.</p>
          ) : (
            <div className={styles.stack}>
              {campaigns.map((campaign) => (
                <div key={campaign.id} className={styles.note}>
                  <div className={styles.spread}>
                    <span className={styles.value}>{campaign.subject}</span>
                    <Badge tone="success">{campaign.recipientCount} sent</Badge>
                  </div>
                  <span className={styles.timelineMeta}>{formatDateTime(campaign.createdAt)}</span>
                  <div className={styles.stack}>
                    {campaign.recipients.map((recipient) => (
                      <span key={recipient.email} className={styles.timelineMeta}>
                        {recipient.email} — {recipient.renderedSubject}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
              <p className={styles.hint}>
                Every one of these is also in <Link href="/admin/mail">the mailbox</Link> with its
                rendered body.
              </p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
