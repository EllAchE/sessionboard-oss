'use client';

import { useCallback, useRef, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ImagePlus, Save } from 'lucide-react';
import {
  Avatar,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  Input,
  Textarea,
  useToast,
} from '@/components/ui';
import type { SpeakerInput } from '@/lib/services/participants';
import { createSpeakerAction, updateSpeakerAction } from './actions';
import styles from './speakers.module.css';

export type SpeakerFormValues = {
  id: string | null;
  email: string;
  name: string;
  pronouns: string;
  jobTitle: string;
  company: string;
  bioMarkdown: string;
  website: string;
  timezone: string;
  dietaryNotes: string;
  accessibilityNotes: string;
  headshotFileId: string | null;
};

export const EMPTY_SPEAKER: SpeakerFormValues = {
  id: null,
  email: '',
  name: '',
  pronouns: '',
  jobTitle: '',
  company: '',
  bioMarkdown: '',
  website: '',
  timezone: '',
  dietaryNotes: '',
  accessibilityNotes: '',
  headshotFileId: null,
};

function Field({
  label,
  htmlFor,
  hint,
  error,
  required,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  required?: boolean;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={wide ? `${styles.field} ${styles.wide}` : styles.field}>
      <label className={styles.fieldLabel} htmlFor={htmlFor}>
        {label}
        {required ? <span className={styles.required}> *</span> : null}
      </label>
      {children}
      {error ? <p className={styles.fieldError}>{error}</p> : null}
      {!error && hint ? <p className={styles.fieldHint}>{hint}</p> : null}
    </div>
  );
}

/**
 * `SPK-02` and `SPK-15` on one screen, because an organizer typing a speaker in by hand has their
 * dietary line in front of them at that moment and will not come back for it later.
 */
export function SpeakerForm({ initial }: { initial: SpeakerFormValues }) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const picker = useRef<HTMLInputElement>(null);

  const [values, setValues] = useState(initial);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const editing = initial.id !== null;
  const set = useCallback(
    <K extends keyof SpeakerFormValues>(key: K, value: SpeakerFormValues[K]) =>
      setValues((current) => ({ ...current, [key]: value })),
    [],
  );

  const pickPhoto = useCallback((file: File | null) => {
    setPhoto(file);
    setPhotoPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return file ? URL.createObjectURL(file) : null;
    });
  }, []);

  const submit = useCallback(() => {
    setErrors({});
    setMessage(null);

    startTransition(async () => {
      let headshotFileId = values.headshotFileId;

      if (photo) {
        const body = new FormData();
        body.set('photo', photo);
        const response = await fetch('/admin/speakers/upload', { method: 'POST', body });
        const uploaded = (await response.json()) as
          | { ok: true; fileId: string }
          | { ok: false; message: string };
        if (!uploaded.ok) {
          setMessage(uploaded.message);
          return;
        }
        headshotFileId = uploaded.fileId;
      }

      const input: SpeakerInput = {
        email: values.email,
        name: values.name,
        pronouns: values.pronouns,
        jobTitle: values.jobTitle,
        company: values.company,
        bioMarkdown: values.bioMarkdown,
        website: values.website,
        timezone: values.timezone,
        dietaryNotes: values.dietaryNotes,
        accessibilityNotes: values.accessibilityNotes,
        headshotFileId,
      };

      const outcome = editing
        ? await updateSpeakerAction(initial.id as string, input)
        : await createSpeakerAction(input);

      if (!outcome.ok) {
        setMessage(outcome.message);
        setErrors(outcome.details ?? {});
        return;
      }

      toast({
        title: editing ? 'Orator record revised' : `${values.name || values.email} summoned to the rolls`,
        tone: 'success',
      });
      router.push(editing ? `/admin/speakers/${outcome.data.id}` : '/admin/speakers');
      router.refresh();
    });
  }, [values, photo, editing, initial.id, router, toast]);

  const previewSrc =
    photoPreview ??
    (values.headshotFileId ? `/admin/speakers/photo/${values.headshotFileId}` : null);

  return (
    <form
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {message ? <p className={styles.notice}>{message}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Name &amp; station</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.formGrid}>
            <Field label="Orator’s full name" htmlFor="speaker-name" error={errors.displayName}>
              <Input
                id="speaker-name"
                value={values.name}
                autoComplete="off"
                placeholder="Ada Lovelace"
                onChange={(event) => set('name', event.target.value)}
              />
            </Field>
            <Field
              label="Dispatch address"
              htmlFor="speaker-email"
              required
              error={errors.email}
              hint={
                editing
                  ? 'The address this orator uses to enter the Forum. Fixed once entered in the rolls.'
                  : 'Identifies the orator. An address already on the rolls is revised, never duplicated.'
              }
            >
              <Input
                id="speaker-email"
                type="email"
                value={values.email}
                required
                readOnly={editing}
                disabled={editing}
                autoComplete="off"
                placeholder="ada@example.com"
                invalid={Boolean(errors.email)}
                onChange={(event) => set('email', event.target.value)}
              />
            </Field>
            <Field label="Office or title" htmlFor="speaker-job" error={errors.jobTitle}>
              <Input
                id="speaker-job"
                value={values.jobTitle}
                placeholder="Principal Engineer"
                onChange={(event) => set('jobTitle', event.target.value)}
              />
            </Field>
            <Field label="House or company" htmlFor="speaker-company" error={errors.company}>
              <Input
                id="speaker-company"
                value={values.company}
                placeholder="Analytical Engines Ltd"
                onChange={(event) => set('company', event.target.value)}
              />
            </Field>
            <Field label="Pronouns" htmlFor="speaker-pronouns" error={errors.pronouns}>
              <Input
                id="speaker-pronouns"
                value={values.pronouns}
                placeholder="she/her"
                onChange={(event) => set('pronouns', event.target.value)}
              />
            </Field>
            <Field label="Road to the web" htmlFor="speaker-website" error={errors['links.0.url']}>
              <Input
                id="speaker-website"
                value={values.website}
                placeholder="example.com/ada"
                onChange={(event) => set('website', event.target.value)}
              />
            </Field>
            <Field
              label="Biography"
              htmlFor="speaker-bio"
              wide
              hint="Markdown. Shown on the orator’s public likeness and inscriptions."
              error={errors.bioMarkdown}
            >
              <Textarea
                id="speaker-bio"
                rows={6}
                value={values.bioMarkdown}
                placeholder="Wrote the first algorithm intended for a machine."
                onChange={(event) => set('bioMarkdown', event.target.value)}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Portrait</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.photoRow}>
            {previewSrc ? (
              <img className={styles.photoPreview} src={previewSrc} alt="" />
            ) : (
              <Avatar name={values.name || values.email || '?'} size="lg" />
            )}
            <div>
              <input
                ref={picker}
                className={styles.hiddenInput}
                type="file"
                accept="image/*"
                onChange={(event) => pickPhoto(event.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                iconLeft={<ImagePlus size={15} />}
                onClick={() => picker.current?.click()}
              >
                {previewSrc ? 'Replace portrait' : 'Choose portrait'}
              </Button>
              <p className={styles.fieldHint}>
                {photo ? photo.name : 'JPEG or PNG, up to 10 MB. Lodged when revisions are sealed.'}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Journey &amp; provisions</CardTitle>
        </CardHeader>
        <CardBody>
          <p className={styles.sectionNote}>
Only magistrates see this. None of it reaches the orator’s public likeness or an
            inscription.
          </p>
          <div className={styles.formGrid}>
            <Field
              label="Home timezone"
              htmlFor="speaker-timezone"
              hint="Where the orator journeys from, for scheduling audiences and arrival."
              error={errors.timezone}
            >
              <Input
                id="speaker-timezone"
                value={values.timezone}
                placeholder="Europe/London"
                onChange={(event) => set('timezone', event.target.value)}
              />
            </Field>
            <Field label="Dietary needs" htmlFor="speaker-dietary" error={errors.dietaryNotes}>
              <Textarea
                id="speaker-dietary"
                rows={3}
                value={values.dietaryNotes}
                placeholder="Vegetarian, no nuts"
                onChange={(event) => set('dietaryNotes', event.target.value)}
              />
            </Field>
            <Field
              label="Access &amp; arrival"
              htmlFor="speaker-accessibility"
              hint="Access requirements, plus arrival and travel notes."
              error={errors.accessibilityNotes}
            >
              <Textarea
                id="speaker-accessibility"
                rows={3}
                value={values.accessibilityNotes}
                placeholder="Step-free stage access. Arrives Tue 14:00, departs Thu morning."
                onChange={(event) => set('accessibilityNotes', event.target.value)}
              />
            </Field>
          </div>
        </CardBody>
      </Card>

      <div className={styles.formActions}>
        <Button type="submit" variant="primary" loading={pending} iconLeft={<Save size={15} />}>
          {editing ? 'Seal revisions' : 'Summon orator'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          href={editing ? `/admin/speakers/${initial.id}` : '/admin/speakers'}
        >
          Leave unchanged
        </Button>
      </div>
    </form>
  );
}
