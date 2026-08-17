'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useState } from 'react';
import { ImageIcon, Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, CardTitle, IconButton, Input, Switch, Textarea } from '@/components/ui';
import { PhoneVerificationControl } from '@/components/notifications/PhoneVerificationControl';
import { renderMarkdown } from '@/lib/markdown';
import { NOTIFICATION_CATEGORY_ROWS } from '@/lib/notification-categories';
import { normalizeProfileImage } from '@/lib/profile-image';
import type { Participant, ProfileName } from '@/lib/services/portal';
import type { NotificationPrefs } from '@/lib/services/settings';
import { IDLE_STATE, type FormState } from '../../form-state';
import styles from '../../portal.module.css';
import { saveProfileAction } from '../actions';
import { FieldError, FormNotice, SubmitButton } from '../FormNotice';

type LinkRow = { label: string; url: string };

const MAX_LINKS = 8;
const BIO_LIMIT = 5000;

/**
 * `S-2`, `S-8`. The bio is markdown with a live preview beside it rather than a rich-text editor:
 * the preview uses the same untrusted renderer the organizer's programme page will use, so what a
 * speaker sees here is exactly what gets published.
 */
export function ProfileForm({
  eventSlug,
  me,
  name,
  notifications,
  collectHeadshot,
}: {
  eventSlug: string;
  me: Participant;
  name: ProfileName;
  notifications: NotificationPrefs;
  /** `AR-1`: the first profile save collects the picture instead of deferring it to another panel. */
  collectHeadshot: boolean;
}) {
  const router = useRouter();
  const [headshotPreview, setHeadshotPreview] = useState<string | null>(null);
  const [state, action] = useActionState(
    async (previous: FormState, formData: FormData): Promise<FormState> => {
      const selected = formData.get('headshot');
      formData.delete('headshot');

      let normalized: File | null = null;
      if (selected instanceof File && selected.size > 0) {
        try {
          normalized = await normalizeProfileImage(selected);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'That image could not be prepared.';
          return { status: 'error', message, details: { headshot: message } };
        }
      }

      const saved = await saveProfileAction(previous, formData);
      if (saved.status !== 'ok' || !normalized) return saved;

      try {
        const upload = new FormData();
        upload.set('intent', 'headshot');
        upload.set('files', normalized);
        const response = await fetch(`/portal/${eventSlug}/upload`, { method: 'POST', body: upload });
        const result = (await response.json()) as { ok: boolean; message?: string };
        if (!response.ok || !result.ok) {
          const detail = result.message ?? 'The profile picture did not upload.';
          return {
            status: 'error',
            message: `Profile saved, but ${detail.toLowerCase()}`,
            details: { headshot: detail },
          };
        }
        if (headshotPreview) URL.revokeObjectURL(headshotPreview);
        setHeadshotPreview(null);
        router.refresh();
        return { status: 'ok', message: 'Profile and picture saved' };
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'the picture upload failed';
        return {
          status: 'error',
          message: `Profile saved, but ${detail.toLowerCase()}`,
          details: { headshot: detail },
        };
      }
    },
    IDLE_STATE,
  );
  const [bio, setBio] = useState(me.bioMarkdown ?? '');
  const [links, setLinks] = useState<LinkRow[]>(
    me.links.length > 0 ? me.links : [{ label: '', url: '' }],
  );
  const [phone, setPhone] = useState(notifications.phone ?? '');
  const [notifyEmail, setNotifyEmail] = useState(notifications.notifyEmail);
  const [notifySms, setNotifySms] = useState(notifications.notifySms);
  const [verifiedPhone, setVerifiedPhone] = useState(
    notifications.phoneVerified ? (notifications.phone ?? null) : null,
  );
  const phoneVerified = Boolean(verifiedPhone && phone === verifiedPhone);

  const setLink = (index: number, patch: Partial<LinkRow>) =>
    setLinks((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="eventSlug" value={eventSlug} />

      {collectHeadshot ? (
        <Card>
          <CardHeader>
            <CardTitle>Profile picture</CardTitle>
          </CardHeader>
          <CardBody>
            <div className={styles.headshotPanel}>
              {headshotPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img className={styles.headshotImage} src={headshotPreview} alt="Selected headshot" />
              ) : (
                <div className={styles.headshotPlaceholder}>
                  <ImageIcon size={24} aria-hidden />
                </div>
              )}
              <div className={styles.spacer}>
                <input
                  name="headshot"
                  type="file"
                  className={styles.fileInput}
                  accept="image/*"
                  aria-describedby="headshot-help"
                  onChange={(event) => {
                    const selected = event.currentTarget.files?.[0] ?? null;
                    setHeadshotPreview((current) => {
                      if (current) URL.revokeObjectURL(current);
                      return selected ? URL.createObjectURL(selected) : null;
                    });
                  }}
                />
                <p id="headshot-help" className={styles.hint}>
                  JPEG, PNG, GIF or WebP up to 10 MB. Upload a square photo — anything else is
                  center-cropped to a 512 px square.
                </p>
                <FieldError state={state} field="headshot" />
              </div>
            </div>
          </CardBody>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Who you are</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="firstName">
                First name
              </label>
              <Input
                id="firstName"
                name="firstName"
                defaultValue={name.firstName}
                placeholder="Ada"
                invalid={Boolean(state.details?.firstName)}
              />
              <FieldError state={state} field="firstName" />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="lastName">
                Last name
              </label>
              <Input
                id="lastName"
                name="lastName"
                defaultValue={name.lastName}
                placeholder="Lovelace"
                invalid={Boolean(state.details?.lastName)}
              />
              <FieldError state={state} field="lastName" />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="displayName">
                Name as it should appear
              </label>
              <Input
                id="displayName"
                name="displayName"
                defaultValue={me.displayName ?? ''}
                placeholder="Ada Lovelace"
                invalid={Boolean(state.details?.displayName)}
              />
              <span className={styles.hint}>
                Leave it blank and we use your first and last name.
              </span>
              <FieldError state={state} field="displayName" />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="salutation">
                Salutation
              </label>
              <Input
                id="salutation"
                name="salutation"
                defaultValue={me.salutation ?? ''}
                placeholder="Ada"
              />
              <span className={styles.hint}>How an email to you should open.</span>
              <FieldError state={state} field="salutation" />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="honorific">
                Honorific
              </label>
              <Input
                id="honorific"
                name="honorific"
                defaultValue={me.honorific ?? ''}
                placeholder="Dr"
              />
              <span className={styles.hint}>Printed before your name on the programme.</span>
              <FieldError state={state} field="honorific" />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="pronouns">
                Pronouns
              </label>
              <Input id="pronouns" name="pronouns" defaultValue={me.pronouns ?? ''} placeholder="she/her" />
              <FieldError state={state} field="pronouns" />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="gender">
                Gender
              </label>
              <Input id="gender" name="gender" defaultValue={me.gender ?? ''} placeholder="Woman" />
              <span className={styles.hint}>Optional.</span>
              <FieldError state={state} field="gender" />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="jobTitle">
                Job title
              </label>
              <Input
                id="jobTitle"
                name="jobTitle"
                defaultValue={me.jobTitle ?? ''}
                placeholder="Principal Engineer"
              />
              <FieldError state={state} field="jobTitle" />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="company">
                Company
              </label>
              <Input id="company" name="company" defaultValue={me.company ?? ''} placeholder="Analytical Engines" />
              <FieldError state={state} field="company" />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="timezone">
                Your timezone
              </label>
              <Input
                id="timezone"
                name="timezone"
                defaultValue={me.timezone ?? ''}
                placeholder="Europe/London"
              />
              <span className={styles.hint}>Used for scheduling.</span>
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="phone">
                Phone number
              </label>
              <Input
                id="phone"
                name="phone"
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(untrusted) => {
                  setPhone(untrusted.target.value);
                  if (untrusted.target.value !== verifiedPhone) setNotifySms(false);
                }}
                placeholder="+1 555 123 4567"
                invalid={Boolean(state.details?.phone)}
              />
              <FieldError state={state} field="phone" />
              <PhoneVerificationControl
                phone={phone}
                verified={phoneVerified}
                onVerified={(normalized) => {
                  setPhone(normalized);
                  setVerifiedPhone(normalized);
                }}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alerts</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.stackTight}>
            <div className={styles.switchRow}>
              <span className={styles.switchText}>
                <span className={styles.switchLabel}>Email</span>
                <span className={styles.hint}>Reminders, decisions, and schedule changes.</span>
              </span>
              <input type="hidden" name="notifyEmail" value={notifyEmail ? 'on' : ''} />
              <Switch checked={notifyEmail} aria-label="Email alerts" onCheckedChange={setNotifyEmail} />
            </div>
            <div className={styles.switchRow}>
              <span className={styles.switchText}>
                <span className={styles.switchLabel}>Text message</span>
                <span className={styles.hint}>
                  {phone.trim()
                    ? 'Turning this on records your consent. Message rates may apply; reply STOP to opt out or HELP for help.'
                    : 'Add a phone number above to turn this on.'}
                </span>
              </span>
              <input type="hidden" name="notifySms" value={notifySms ? 'on' : ''} />
              <Switch
                checked={notifySms}
                disabled={!phone.trim() || !phoneVerified}
                aria-label="Text message alerts"
                onCheckedChange={setNotifySms}
              />
            </div>
            <div className={styles.fieldGrid}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="notificationTimezone">Alert timezone</label>
                <Input
                  id="notificationTimezone"
                  name="notificationTimezone"
                  defaultValue={notifications.timezone ?? me.timezone ?? ''}
                  placeholder="America/New_York"
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="quietStart">Text quiet hours start</label>
                <Input id="quietStart" name="quietStart" type="time" defaultValue={notifications.quietStart ?? ''} />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="quietEnd">Text quiet hours end</label>
                <Input id="quietEnd" name="quietEnd" type="time" defaultValue={notifications.quietEnd ?? ''} />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="smsHourlyLimit">Maximum texts per hour</label>
                <Input id="smsHourlyLimit" name="smsHourlyLimit" type="number" min={1} max={100} defaultValue={notifications.smsHourlyLimit} />
              </div>
              <PreferenceSelect name="eventNotifyEmail" label="Email for this event" value={notifications.eventNotifyEmail} />
              <PreferenceSelect name="eventNotifySms" label="Texts for this event" value={notifications.eventNotifySms} />
            </div>
            <div className={styles.stackTight}>
              {NOTIFICATION_CATEGORY_ROWS.map(([key, label]) => (
                <div className={styles.switchRow} key={key}>
                  <span className={styles.switchLabel}>{label}</span>
                  <PreferenceSelect name={`category:${key}:email`} label="Email" value={notifications.categories[key].notifyEmail} />
                  <PreferenceSelect name={`category:${key}:sms`} label="Text" value={notifications.categories[key].notifySms} />
                </div>
              ))}
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Biography</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="bioMarkdown">
                Markdown
              </label>
              <Textarea
                id="bioMarkdown"
                name="bioMarkdown"
                rows={14}
                value={bio}
                maxLength={BIO_LIMIT}
                onChange={(untrusted) => setBio(untrusted.target.value)}
                placeholder={'The two-paragraph version an MC could read aloud.\n\n**Bold**, _italic_ and [links](https://example.com) all work.'}
                invalid={Boolean(state.details?.bioMarkdown)}
              />
              <span className={styles.hint}>
                {bio.length} / {BIO_LIMIT} characters
              </span>
              <FieldError state={state} field="bioMarkdown" />
            </div>
            <div className={styles.field}>
              <span className={styles.label}>Preview</span>
              <div
                className={`${styles.previewPane} ${styles.prose}`}
                dangerouslySetInnerHTML={{ __html: renderMarkdown(bio) }}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Links</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.stackTight}>
            {links.map((row, index) => (
              <div key={index} className={styles.linkRow}>
                <Input
                  name="linkLabel"
                  value={row.label}
                  placeholder="LinkedIn"
                  aria-label="Link label"
                  onChange={(untrusted) => setLink(index, { label: untrusted.target.value })}
                />
                <Input
                  name="linkUrl"
                  value={row.url}
                  placeholder="linkedin.com/in/ada"
                  aria-label="Link address"
                  onChange={(untrusted) => setLink(index, { url: untrusted.target.value })}
                />
                <IconButton
                  label="Remove this link"
                  variant="ghost"
                  size="sm"
                  onClick={() => setLinks((current) => current.filter((_, at) => at !== index))}
                >
                  <Trash2 size={15} />
                </IconButton>
              </div>
            ))}
            <FieldError state={state} field="links" />
            {links.length < MAX_LINKS && (
              <div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  iconLeft={<Plus size={14} />}
                  onClick={() => setLinks((current) => [...current, { label: '', url: '' }])}
                >
                  Add a link
                </Button>
              </div>
            )}
            <span className={styles.hint}>
              URLs without https:// are fixed automatically.
            </span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Anything we should know</CardTitle>
        </CardHeader>
        <CardBody>
          <div className={styles.fieldGrid}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="dietaryNotes">
                Dietary needs
              </label>
              <Textarea id="dietaryNotes" name="dietaryNotes" rows={3} defaultValue={me.dietaryNotes ?? ''} />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="accessibilityNotes">
                Accessibility needs
              </label>
              <Textarea
                id="accessibilityNotes"
                name="accessibilityNotes"
                rows={3}
                defaultValue={me.accessibilityNotes ?? ''}
              />
            </div>
          </div>
        </CardBody>
      </Card>

      <FormNotice state={state} />
      <div className={styles.taskActions}>
        <SubmitButton variant="primary">Save profile</SubmitButton>
      </div>
    </form>
  );
}

function PreferenceSelect({
  name,
  label,
  value,
}: {
  name: string;
  label: string;
  value: boolean | null;
}) {
  return (
    <label className={styles.field}>
      <span className={styles.label}>{label}</span>
      <select name={name} defaultValue={value === null ? 'inherit' : value ? 'on' : 'off'}>
        <option value="inherit">Use global default</option>
        <option value="on">On</option>
        <option value="off">Off</option>
      </select>
    </label>
  );
}
