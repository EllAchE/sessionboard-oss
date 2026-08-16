'use client';

import { useCallback, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, Info } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Select,
  Textarea,
  useToast,
} from '../../../../components/ui';
import { createSubmissionAction } from '../actions';
import queue from '../submissions.module.css';
import styles from './new-submission.module.css';

export type FormOptionWire = {
  id: string;
  name: string;
  status: 'draft' | 'open' | 'closed';
  /** Which of the locked six this form actually shows, and what the organizer renamed them to. */
  builtinKeys: string[];
  requiredKeys: string[];
  labels: Record<string, string>;
  levelOptions: string[];
  customFields: Array<{ id: string; label: string; type: string; required: boolean }>;
};

export type NewSubmissionFormProps = {
  forms: FormOptionWire[];
  tracks: Array<{ id: string; name: string }>;
  formats: Array<{ id: string; name: string }>;
  tags: Array<{ id: string; name: string }>;
};

const FORM_STATUS_TONE: Record<string, 'neutral' | 'info' | 'success'> = {
  draft: 'neutral',
  open: 'success',
  closed: 'info',
};

/**
 * `V-7`. The one screen where an organizer types a submission in on somebody's behalf — an invited
 * keynote, a talk that arrived by email, a sponsor session. Everything it collects is a real
 * `submission` column, and `createSubmissionAsOrganizer` creates the speaker's account and
 * participant record if this is the first anyone has heard of them.
 */
export function NewSubmissionForm(props: NewSubmissionFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [formId, setFormId] = useState(props.forms[0]?.id ?? '');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formatId, setFormatId] = useState('');
  const [trackId, setTrackId] = useState('');
  const [level, setLevel] = useState('');
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [speakerEmail, setSpeakerEmail] = useState('');
  const [speakerName, setSpeakerName] = useState('');
  const [status, setStatus] = useState<'submitted' | 'accepted'>('submitted');

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const noFormsReason =
    props.forms.length === 0
      ? 'This event has no CFP form yet. Create one before adding a submission by hand.'
      : null;
  const banner = error ?? noFormsReason;

  const selected = useMemo(
    () => props.forms.find((entry) => entry.id === formId) ?? null,
    [props.forms, formId],
  );

  const shows = useCallback(
    (key: string) => !selected || selected.builtinKeys.includes(key),
    [selected],
  );
  const labelFor = useCallback(
    (key: string, fallback: string) => selected?.labels[key] ?? fallback,
    [selected],
  );
  const required = useCallback(
    (key: string) => selected?.requiredKeys.includes(key) ?? key === 'title',
    [selected],
  );

  const submit = useCallback(() => {
    setError(null);
    setFieldErrors({});
    if (!formId) {
      setError('This event has no CFP form yet. Create one before adding a submission by hand.');
      return;
    }

    startTransition(async () => {
      const result = await createSubmissionAction({
        formId,
        title,
        descriptionMarkdown: description || null,
        trackId: trackId || null,
        formatId: formatId || null,
        level: level || null,
        speakerEmail,
        speakerName: speakerName || null,
        status,
        tagIds,
      });

      if (!result.ok) {
        setError(result.message);
        setFieldErrors(result.details ?? {});
        return;
      }

      toast({
        title: `${result.data.displayRef} created`,
        description: title,
        tone: 'success',
      });
      router.push(`/organizer/submissions/${result.data.id}`);
    });
  }, [
    formId,
    title,
    description,
    trackId,
    formatId,
    level,
    speakerEmail,
    speakerName,
    status,
    tagIds,
    router,
    toast,
  ]);

  const toggleTag = (tagId: string, checked: boolean) =>
    setTagIds((current) =>
      checked ? [...current, tagId] : current.filter((entry) => entry !== tagId),
    );

  return (
    <div className={queue.page}>
      <header className={queue.header}>
        <div className={queue.headings}>
          <span className={queue.eyebrow}>Review</span>
          <h1 className={queue.title}>Add submission</h1>
          <p className={queue.subtitle}>
            Creates the speaker&apos;s account and participant record if they have neither.
            ⌘&#8629; submits.
          </p>
        </div>
        <div className={queue.actions}>
          <Button
            variant="ghost"
            iconLeft={<ChevronLeft size={14} />}
            onClick={() => router.push('/organizer/submissions')}
          >
            Back to queue
          </Button>
        </div>
      </header>

      {banner ? <p className={queue.error}>{banner}</p> : null}

      <form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            event.preventDefault();
            submit();
          }
        }}
      >
        <Card>
          <CardHeader>
            <CardTitle>Submission</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>Form</span>
                <Select value={formId} onChange={(event) => setFormId(event.target.value)}>
                  {props.forms.length === 0 ? <option value="">No CFP form yet</option> : null}
                  {props.forms.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </Select>
                {selected ? (
                  <span className={styles.hint}>
                    <Badge tone={FORM_STATUS_TONE[selected.status] ?? 'neutral'} size="sm">
                      {selected.status}
                    </Badge>{' '}
                    A closed form still accepts an organizer-entered talk.
                  </span>
                ) : null}
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Status on creation</span>
                <Select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value === 'accepted' ? 'accepted' : 'submitted')
                  }
                >
                  <option value="submitted">Submitted · goes through review</option>
                  <option value="accepted">Accepted · skips review, agenda-eligible</option>
                </Select>
              </label>

              <label className={`${styles.field} ${styles.wide}`}>
                <span className={styles.label}>
                  {labelFor('title', 'Title')} <span className={styles.required}>required</span>
                </span>
                <Input
                  value={title}
                  autoFocus
                  invalid={Boolean(fieldErrors.title)}
                  onChange={(event) => setTitle(event.target.value)}
                />
                {fieldErrors.title ? (
                  <span className={styles.fieldError}>{fieldErrors.title}</span>
                ) : null}
              </label>

              {shows('description') ? (
                <label className={`${styles.field} ${styles.wide}`}>
                  <span className={styles.label}>
                    {labelFor('description', 'Description')}
                    {required('description') ? (
                      <span className={styles.required}>required</span>
                    ) : null}
                  </span>
                  <Textarea
                    rows={8}
                    value={description}
                    placeholder="Markdown. Rendered on the submission detail and the public site."
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
              ) : null}

              {shows('format') ? (
                <label className={styles.field}>
                  <span className={styles.label}>{labelFor('format', 'Session format')}</span>
                  <Select value={formatId} onChange={(event) => setFormatId(event.target.value)}>
                    <option value="">Unassigned</option>
                    {props.formats.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}

              {shows('track') ? (
                <label className={styles.field}>
                  <span className={styles.label}>{labelFor('track', 'Track')}</span>
                  <Select value={trackId} onChange={(event) => setTrackId(event.target.value)}>
                    <option value="">Unassigned</option>
                    {props.tracks.map((entry) => (
                      <option key={entry.id} value={entry.id}>
                        {entry.name}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}

              {shows('level') ? (
                <label className={styles.field}>
                  <span className={styles.label}>{labelFor('level', 'Audience level')}</span>
                  <Select value={level} onChange={(event) => setLevel(event.target.value)}>
                    <option value="">Unassigned</option>
                    {(selected?.levelOptions ?? []).map((entry) => (
                      <option key={entry} value={entry}>
                        {entry}
                      </option>
                    ))}
                  </Select>
                </label>
              ) : null}

              {shows('tags') && props.tags.length > 0 ? (
                <div className={`${styles.field} ${styles.wide}`}>
                  <span className={styles.label}>{labelFor('tags', 'Tags')}</span>
                  <div className={styles.tagGrid}>
                    {props.tags.map((entry) => (
                      <label key={entry.id} className={styles.tag}>
                        <Checkbox
                          checked={tagIds.includes(entry.id)}
                          onChange={(event) => toggleTag(entry.id, event.target.checked)}
                        />
                        {entry.name}
                      </label>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Speaker</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.grid}>
              <label className={styles.field}>
                <span className={styles.label}>
                  Email <span className={styles.required}>required</span>
                </span>
                <Input
                  type="email"
                  value={speakerEmail}
                  invalid={Boolean(fieldErrors.speakerEmail)}
                  placeholder="speaker@example.com"
                  onChange={(event) => setSpeakerEmail(event.target.value)}
                />
                <span className={styles.hint}>
                  An existing account is reused; a new address gets one, with no email sent from
                  here.
                </span>
                {fieldErrors.speakerEmail ? (
                  <span className={styles.fieldError}>{fieldErrors.speakerEmail}</span>
                ) : null}
              </label>

              <label className={styles.field}>
                <span className={styles.label}>Name</span>
                <Input
                  value={speakerName}
                  placeholder="Optional"
                  onChange={(event) => setSpeakerName(event.target.value)}
                />
              </label>
            </div>
          </CardBody>
        </Card>

        {selected && selected.customFields.length > 0 ? (
          <Card>
            <CardHeader>
              <CardTitle>Custom fields on {selected.name}</CardTitle>
            </CardHeader>
            <CardBody>
              <p className={styles.notice}>
                <Info size={14} />
                These {selected.customFields.length} field
                {selected.customFields.length === 1 ? '' : 's'} are not collected here. The organizer
                path writes the submission&apos;s own columns only, so the speaker fills these in
                from the portal once they have the submission.
              </p>
              <ul className={styles.fieldList}>
                {selected.customFields.map((field) => (
                  <li key={field.id}>
                    <span>{field.label}</span>
                    <span className={queue.muted}>
                      {field.type.replace(/_/g, ' ')}
                      {field.required ? ' · required' : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : null}

        <div className={styles.footer}>
          <Button type="submit" variant="primary" loading={pending} disabled={props.forms.length === 0}>
            Create submission
          </Button>
          <Button type="button" variant="ghost" onClick={() => router.push('/organizer/submissions')}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}
