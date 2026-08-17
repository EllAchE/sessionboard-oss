'use client';

import { useCallback, useRef, useState, useTransition, type ReactNode } from 'react';
import Image from 'next/image';
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
import { normalizeProfileImage } from '@/lib/profile-image';
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
        let normalized: File;
        try {
          normalized = await normalizeProfileImage(photo);
        } catch (error) {
          setMessage(error instanceof Error ? error.message : 'That image could not be prepared.');
          return;
        }
        const body = new FormData();
        body.set('photo', normalized);
        const response = await fetch('/organizer/speakers/upload', { method: 'POST', body });
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
        title: editing ? 'Speaker updated' : `${values.name || values.email} added`,
        tone: 'success',
      });
      router.push(editing ? `/organizer/speakers/${outcome.data.id}` : '/organizer/speakers');
      router.refresh();
    });
  }, [values, photo, editing, initial.id, router, toast]);

  const previewSrc =
    photoPreview ??
    (values.headshotFileId ? `/organizer/speakers/photo/${values.headshotFileId}` : null);

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
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.formGrid}>
            <Field label="Full name" htmlFor="speaker-name" error={errors.displayName}>
              <Input
                id="speaker-name"
                value={values.name}
                autoComplete="off"
                placeholder="Ada Lovelace"
                onChange={(event) => set('name', event.target.value)}
              />
            </Field>
            <Field
              label="Email"
              htmlFor="speaker-email"
              required
              error={errors.email}
              hint={
                editing
                  ? 'The address this speaker signs in with. Fixed once the record exists.'
                  : 'Identifies the speaker. An address already on the roster is updated, never duplicated.'
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
            <Field label="Job title" htmlFor="speaker-job" error={errors.jobTitle}>
              <Input
                id="speaker-job"
                value={values.jobTitle}
                placeholder="Principal Engineer"
                onChange={(event) => set('jobTitle', event.target.value)}
              />
            </Field>
            <Field label="Company" htmlFor="speaker-company" error={errors.company}>
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
            <Field label="Website" htmlFor="speaker-website" error={errors['links.0.url']}>
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
              hint="Markdown. Shown on the public speaker page and in embeds."
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
          <CardTitle>Photo</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.photoRow}>
            {previewSrc ? (
              <Image
                className={styles.photoPreview}
                src={previewSrc}
                alt=""
                width={64}
                height={64}
                unoptimized
              />
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
                {previewSrc ? 'Replace photo' : 'Choose photo'}
              </Button>
              <p className={styles.fieldHint}>
                {photo
                  ? photo.name
                  : 'JPEG, PNG, GIF or WebP up to 10 MB. Upload a square photo. Anything else is center-cropped when you save.'}
              </p>
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Travel &amp; logistics</CardTitle>
        </CardHeader>
        <CardBody>
          <p className={styles.sectionNote}>
Organizer-only. None of this reaches the public speaker page or an embed.
          </p>
          <div className={styles.formGrid}>
            <Field
              label="Timezone"
              htmlFor="speaker-timezone"
              hint="Where they are travelling from, for scheduling calls and arrival."
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
              label="Accessibility & arrival"
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
          {editing ? 'Save changes' : 'Add speaker'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          href={editing ? `/organizer/speakers/${initial.id}` : '/organizer/speakers'}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
