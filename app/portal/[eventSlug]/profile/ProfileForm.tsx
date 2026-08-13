'use client';

import { useActionState, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { Button, Card, CardBody, CardHeader, CardTitle, IconButton, Input, Switch, Textarea } from '@/components/ui';
import { renderMarkdown } from '@/lib/markdown';
import type { Participant, ProfileName } from '@/lib/services/portal';
import type { NotificationPrefs } from '@/lib/services/settings';
import { IDLE_STATE } from '../../form-state';
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
}: {
  eventSlug: string;
  me: Participant;
  name: ProfileName;
  notifications: NotificationPrefs;
}) {
  const [state, action] = useActionState(saveProfileAction, IDLE_STATE);
  const [bio, setBio] = useState(me.bioMarkdown ?? '');
  const [links, setLinks] = useState<LinkRow[]>(
    me.links.length > 0 ? me.links : [{ label: '', url: '' }],
  );
  const [phone, setPhone] = useState(notifications.phone ?? '');
  const [notifyEmail, setNotifyEmail] = useState(notifications.notifyEmail);
  const [notifySms, setNotifySms] = useState(notifications.notifySms);

  const setLink = (index: number, patch: Partial<LinkRow>) =>
    setLinks((current) => current.map((row, at) => (at === index ? { ...row, ...patch } : row)));

  return (
    <form action={action} className={styles.form}>
      <input type="hidden" name="eventSlug" value={eventSlug} />

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
              <span className={styles.hint}>Optional, and yours to word however you like.</span>
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
              <span className={styles.hint}>Used when organizers schedule anything with you.</span>
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
                onChange={(untrusted) => setPhone(untrusted.target.value)}
                placeholder="+1 555 123 4567"
                invalid={Boolean(state.details?.phone)}
              />
              <FieldError state={state} field="phone" />
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
                <span className={styles.hint}>Reminders, decisions and session details by email.</span>
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
                disabled={!phone.trim()}
                aria-label="Text message alerts"
                onCheckedChange={setNotifySms}
              />
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
              LinkedIn, X, Facebook, your own site — anything you want on the programme. Addresses
              without https:// are fixed up for you.
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
