'use client';

import { useMemo, useRef, useState, useTransition } from 'react';
import { CalendarCheck, Eye, Send, TriangleAlert, Users } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Select,
  Switch,
  Textarea,
} from '@/components/ui';
import type {
  AudienceKind,
  AudienceSpec,
  PreviewResult,
  SendOutcome,
  TemplateVariable,
} from '@/lib/services/comms';
import { previewAction, sendCampaignAction } from './actions';
import styles from './comms.module.css';

type Option = { id: string; name: string };

export type ComposerProps = {
  eventId: string;
  variables: TemplateVariable[];
  audiences: Array<{ kind: AudienceKind; label: string }>;
  tracks: Option[];
  formats: Option[];
  tasks: Option[];
  templates: Array<{ key: string; name: string; subject: string; bodyMarkdown: string; attachIcs: boolean }>;
  transport: string;
};

const NEEDS_TRACK: AudienceKind[] = ['track'];
const NEEDS_FORMAT: AudienceKind[] = ['format'];
const NEEDS_TASK: AudienceKind[] = ['outstanding_tasks'];

/**
 * `C-4`. The send is deliberately gated behind a preview: an unresolved merge field is invisible in
 * the editor and obvious in the preview, and by then it has already gone out to fifty people.
 */
export function Composer(props: ComposerProps) {
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [audienceKind, setAudienceKind] = useState<AudienceKind>('accepted_speakers');
  const [trackId, setTrackId] = useState('');
  const [formatId, setFormatId] = useState('');
  const [taskId, setTaskId] = useState('');
  const [attachIcs, setAttachIcs] = useState(false);
  const [templateKey, setTemplateKey] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [outcome, setOutcome] = useState<SendOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const audience: AudienceSpec = useMemo(
    () => ({
      kind: audienceKind,
      trackId: trackId || null,
      formatId: formatId || null,
      taskId: taskId || null,
    }),
    [audienceKind, trackId, formatId, taskId],
  );

  function formData(): FormData {
    const data = new FormData();
    data.set('eventId', props.eventId);
    data.set('subject', subject);
    data.set('bodyMarkdown', body);
    data.set('audienceKind', audience.kind);
    if (audience.trackId) data.set('trackId', audience.trackId);
    if (audience.formatId) data.set('formatId', audience.formatId);
    if (audience.taskId) data.set('taskId', audience.taskId);
    if (templateKey) data.set('templateKey', templateKey);
    data.set('attachIcs', attachIcs ? 'on' : 'off');
    return data;
  }

  function runPreview() {
    setError(null);
    setOutcome(null);
    startTransition(async () => {
      const result = await previewAction(formData());
      if (result.ok) setPreview(result.data);
      else setError(result.error);
    });
  }

  function runSend() {
    setError(null);
    startTransition(async () => {
      const result = await sendCampaignAction(formData());
      if (result.ok) {
        setOutcome(result.data);
        setPreview(null);
      } else {
        setError(result.error);
      }
    });
  }

  function applyTemplate(key: string) {
    setTemplateKey(key);
    const template = props.templates.find((row) => row.key === key);
    if (!template) return;
    setSubject(template.subject);
    setBody(template.bodyMarkdown);
    setAttachIcs(template.attachIcs);
    setPreview(null);
  }

  function insertVariable(path: string) {
    const token = `{{${path}}}`;
    const textarea = bodyRef.current;
    if (!textarea) {
      setBody((current) => `${current}${token}`);
      return;
    }
    const start = textarea.selectionStart ?? body.length;
    const end = textarea.selectionEnd ?? body.length;
    const next = `${body.slice(0, start)}${token}${body.slice(end)}`;
    setBody(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const canSend = subject.trim().length > 0 && body.trim().length > 0 && preview !== null;

  return (
    <div className={styles.split}>
      <div className={styles.stack}>
        <Card>
          <CardHeader>
            <CardTitle>The assembly</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.stack}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="audienceKind">
                  Who receives this dispatch
                </label>
                <Select
                  id="audienceKind"
                  value={audienceKind}
                  onChange={(e) => {
                    setAudienceKind(e.target.value as AudienceKind);
                    setPreview(null);
                  }}
                >
                  {props.audiences.map((option) => (
                    <option key={option.kind} value={option.kind}>
                      {option.label}
                    </option>
                  ))}
                </Select>
              </div>

              {NEEDS_TRACK.includes(audienceKind) && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="trackId">
                    Track
                  </label>
                  <Select id="trackId" value={trackId} onChange={(e) => setTrackId(e.target.value)}>
                    <option value="">Choose a programme theme…</option>
                    {props.tracks.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {NEEDS_FORMAT.includes(audienceKind) && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="formatId">
                    Format
                  </label>
                  <Select
                    id="formatId"
                    value={formatId}
                    onChange={(e) => setFormatId(e.target.value)}
                  >
                    <option value="">Choose an oration format…</option>
                    {props.formats.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {NEEDS_TASK.includes(audienceKind) && (
                <div className={styles.field}>
                  <label className={styles.label} htmlFor="taskId">
                    Limit to one duty
                  </label>
                  <Select id="taskId" value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                    <option value="">Any unsettled duty</option>
                    {props.tasks.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Dispatch</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.stack}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="templateKey">
                  Begin from a dispatch pattern
                </label>
                <Select
                  id="templateKey"
                  value={templateKey}
                  onChange={(e) => applyTemplate(e.target.value)}
                >
                  <option value="">Begin with a blank scroll</option>
                  {props.templates.map((template) => (
                    <option key={template.key} value={template.key}>
                      {template.name}
                    </option>
                  ))}
                </Select>
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="subject">
                  Subject
                </label>
                <Input
                  id="subject"
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value);
                    setPreview(null);
                  }}
                  placeholder="Your oration before {{event.name}}"
                />
              </div>

              <div className={styles.field}>
                <label className={styles.label} htmlFor="bodyMarkdown">
                  Body — markdown
                </label>
                <Textarea
                  id="bodyMarkdown"
                  ref={bodyRef}
                  className={styles.body}
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setPreview(null);
                  }}
                  placeholder={'Salve {{speaker.firstName|friend}},\n\n…'}
                />
              </div>

              <div className={styles.field}>
                <span className={styles.label}>Living inscriptions—click to insert</span>
                <div className={styles.variables}>
                  {props.variables.map((variable) => (
                    <button
                      key={variable.path}
                      type="button"
                      className={styles.variableChip}
                      title={variable.description}
                      onClick={() => insertVariable(variable.path)}
                    >
                      {variable.path}
                    </button>
                  ))}
                </div>
                <span className={styles.hint}>
                  {'{{speaker.company|their company}}'} falls back to the text after the pipe when the
                  value is empty.
                </span>
              </div>

              <div className={styles.row}>
                <Switch
                  checked={attachIcs}
                  onCheckedChange={setAttachIcs}
                  aria-label="Attach the calendar invitation"
                />
                <span className={styles.subtle}>
                  Attach a personal fasti copy of each recipient&rsquo;s oration. Summons that amend
                  themselves are dispatched from the imperial fasti.
                </span>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>

      <div className={styles.stack}>
        <Card>
          <CardHeader>
            <CardTitle>Inspect the sealed copy</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.stack}>
              <div className={styles.row}>
                <Button
                  variant="secondary"
                  iconLeft={<Eye size={15} />}
                  onClick={runPreview}
                  loading={pending}
                >
                  Preview for a real recipient
                </Button>
                <span className={styles.spacer} />
                <Button
                  variant="primary"
                  iconLeft={<Send size={15} />}
                  disabled={!canSend}
                  onClick={runSend}
                  loading={pending}
                >
                  Dispatch
                </Button>
              </div>

              {error && (
                <p className={`${styles.warning} ${styles.danger}`}>
                  <TriangleAlert size={16} /> {error}
                </p>
              )}

              {outcome && (
                <p className={`${styles.notice} ${styles.success}`}>
                  Sent to {outcome.sent} of {outcome.recipients} recipients
                  {outcome.failed > 0 ? `, ${outcome.failed} failed` : ''}. Every message is
                  readable in the courier archive.
                </p>
              )}

              {props.transport === 'log' && (
                <p className={styles.notice}>
                  <CalendarCheck size={16} /> MAIL_TRANSPORT is <code>log</code>: no courier leaves
                  the server. Dispatches appear in the archive with their calendar attachment
                  intact.
                </p>
              )}

              {preview && preview.unknown.length > 0 && (
                <p className={styles.warning}>
                  <TriangleAlert size={16} /> Unknown merge fields, which will render as nothing:{' '}
                  {preview.unknown.join(', ')}
                </p>
              )}

              {preview && !preview.recipient && (
                <p className={styles.warning}>
                  <Users size={16} /> This assembly is empty.
                </p>
              )}

              {preview?.recipient && preview.message && (
                <>
                  <div className={styles.previewMeta}>
                    <Badge tone="accent">{preview.audienceSize} recipients</Badge>
                    <span>
                      Rendered for <strong>{preview.recipient.name}</strong>{' '}
                      <span className={styles.mono}>{preview.recipient.email}</span>
                    </span>
                  </div>

                  {preview.message.missing.length > 0 && (
                    <p className={styles.warning}>
                      <TriangleAlert size={16} /> Empty for this recipient:{' '}
                      {preview.message.missing.join(', ')}
                    </p>
                  )}

                  <p className={styles.previewSubject}>{preview.message.subject}</p>
                  <div
                    className={styles.previewFrame}
                    dangerouslySetInnerHTML={{ __html: preview.message.html }}
                  />
                </>
              )}
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
