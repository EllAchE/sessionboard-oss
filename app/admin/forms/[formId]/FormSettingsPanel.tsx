'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Select, Switch, Textarea } from '../../../../components/ui';
import { PAGE_HEADING_MAX_LENGTH } from '../../../../lib/forms/contract';
import type { FormSettingsInput, FormKind, FormTargetType } from '../types';
import type { FormView } from './builder-types';
import styles from './builder.module.css';

/**
 * Everything about the form that is not a question. `datetime-local` is deliberate: an organizer
 * schedules a close in the time they are standing in, and the value is converted to a real instant
 * on the way out rather than stored as a wall clock.
 */

function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | null {
  if (!value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

type Draft = {
  name: string;
  slug: string;
  kind: FormKind;
  targetType: FormTargetType;
  collectsParticipants: boolean;
  externalTitle: string;
  pageHeading: string;
  showWelcome: boolean;
  maxParticipants: string;
  introMarkdown: string;
  opensAt: string;
  closesAt: string;
  maxSubmissionsPerUser: string;
  allowDrafts: boolean;
  notifyEmails: string;
  confirmationSubject: string;
  confirmationBodyMarkdown: string;
};

function toDraft(form: FormView): Draft {
  return {
    name: form.name,
    slug: form.slug,
    kind: form.kind,
    targetType: form.targetType,
    collectsParticipants: form.collectsParticipants,
    externalTitle: form.externalTitle ?? '',
    pageHeading: form.pageHeading ?? '',
    showWelcome: form.showWelcome,
    maxParticipants: form.maxParticipants === null ? '' : String(form.maxParticipants),
    introMarkdown: form.introMarkdown ?? '',
    opensAt: toLocalInput(form.opensAt),
    closesAt: toLocalInput(form.closesAt),
    maxSubmissionsPerUser:
      form.maxSubmissionsPerUser === null ? '' : String(form.maxSubmissionsPerUser),
    allowDrafts: form.allowDrafts,
    notifyEmails: form.notifyEmails.join(', '),
    confirmationSubject: form.confirmationSubject ?? '',
    confirmationBodyMarkdown: form.confirmationBodyMarkdown ?? '',
  };
}

export function FormSettingsPanel({
  form,
  busy,
  onSave,
}: {
  form: FormView;
  busy: boolean;
  onSave: (patch: FormSettingsInput) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(form));

  useEffect(() => {
    setDraft(toDraft(form));
  }, [form]);

  const update = (patch: Partial<Draft>) => setDraft((current) => ({ ...current, ...patch }));

  const save = () => {
    const limit = draft.maxSubmissionsPerUser.trim();
    const cap = draft.maxParticipants.trim();
    onSave({
      name: draft.name,
      slug: draft.slug,
      kind: draft.kind,
      targetType: draft.targetType,
      collectsParticipants: draft.collectsParticipants,
      externalTitle: draft.externalTitle.trim() || null,
      pageHeading: draft.pageHeading.trim() || null,
      showWelcome: draft.showWelcome,
      maxParticipants: cap ? Number(cap) : null,
      introMarkdown: draft.introMarkdown.trim() || null,
      opensAt: fromLocalInput(draft.opensAt),
      closesAt: fromLocalInput(draft.closesAt),
      maxSubmissionsPerUser: limit ? Number(limit) : null,
      allowDrafts: draft.allowDrafts,
      notifyEmails: draft.notifyEmails
        .split(/[,\n]/)
        .map((entry) => entry.trim())
        .filter(Boolean),
      confirmationSubject: draft.confirmationSubject.trim() || null,
      confirmationBodyMarkdown: draft.confirmationBodyMarkdown.trim() || null,
    });
  };

  return (
    <div className={styles.stack}>
      <div className={styles.settingsGrid}>
        <Card padding="md">
          <p className={styles.panelTitle}>The form</p>
          <div className={styles.stack}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-name">
                Internal form name *
              </label>
              <Input
                id="settings-name"
                value={draft.name}
                onChange={(event) => update({ name: event.target.value })}
              />
              <span className={styles.help}>
                Only organizers see this. It is how the form is listed here, not what a speaker reads.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-slug">
                URL slug
              </label>
              <Input
                id="settings-slug"
                value={draft.slug}
                onChange={(event) => update({ slug: event.target.value })}
              />
              <span className={styles.help}>
                Changing this breaks any link you have already shared.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-kind">
                Form type
              </label>
              <Select
                id="settings-kind"
                value={draft.kind}
                onChange={(event) => update({ kind: event.target.value as FormKind })}
              >
                <option value="cfp">Call for speakers</option>
                <option value="portal">Portal form</option>
              </Select>
              <span className={styles.help}>What the form is for. What it produces is below.</span>
            </div>

            {/* `F-4` */}
            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-target">
                This form collects
              </label>
              <Select
                id="settings-target"
                value={draft.targetType}
                onChange={(event) =>
                  update({ targetType: event.target.value as FormTargetType })
                }
              >
                <option value="abstract">Abstracts — proposals that go to review</option>
                <option value="session">Sessions — entries straight onto the programme</option>
              </Select>
              <span className={styles.help}>
                {draft.targetType === 'session'
                  ? 'A submission arrives accepted and appears in the agenda’s unscheduled queue. Use this for invited talks and sponsor slots.'
                  : 'A submission arrives pending and joins the review queue.'}
              </span>
            </div>

            {/* `F-4` */}
            <div className={styles.switchRow}>
              <span className={styles.switchText}>
                <span className={styles.switchLabel}>Collect participants</span>
                <span className={styles.help}>
                  Adds the participant step to the public form, where speakers give their details and
                  name anyone presenting with them. Off, only the submitter is recorded.
                </span>
              </span>
              <Switch
                checked={draft.collectsParticipants}
                aria-label="Collect participants"
                onCheckedChange={(next) => update({ collectsParticipants: next })}
              />
            </div>
          </div>
        </Card>

        {/* `F-9` */}
        <Card padding="md">
          <p className={styles.panelTitle}>Welcome screen</p>
          <div className={styles.stack}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-external-title">
                External form title *
              </label>
              <Input
                id="settings-external-title"
                value={draft.externalTitle}
                placeholder={draft.name}
                onChange={(event) => update({ externalTitle: event.target.value })}
              />
              <span className={styles.help}>
                What a speaker reads at the top of the page and what a shared link previews as. Blank
                falls back to the internal name.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-page-heading">
                Page heading
              </label>
              <Input
                id="settings-page-heading"
                value={draft.pageHeading}
                maxLength={PAGE_HEADING_MAX_LENGTH}
                placeholder="Speak with us"
                onChange={(event) => update({ pageHeading: event.target.value })}
              />
              <span className={styles.help}>
                {draft.pageHeading.length} of {PAGE_HEADING_MAX_LENGTH} characters. A short line above
                the title on the welcome step.
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-intro">
                Welcome message
              </label>
              <Textarea
                id="settings-intro"
                rows={5}
                value={draft.introMarkdown}
                onChange={(event) => update({ introMarkdown: event.target.value })}
              />
              <span className={styles.help}>Markdown, shown on the welcome step.</span>
            </div>

            <div className={styles.switchRow}>
              <span className={styles.switchText}>
                <span className={styles.switchLabel}>Show the welcome message</span>
                <span className={styles.help}>
                  Turn it off to hide the welcome step while keeping the copy. Getting it back is this
                  switch, not rewriting the paragraph.
                </span>
              </span>
              <Switch
                checked={draft.showWelcome}
                aria-label="Show the welcome message"
                onCheckedChange={(next) => update({ showWelcome: next })}
              />
            </div>
          </div>
        </Card>

        <Card padding="md">
          <p className={styles.panelTitle}>When it runs</p>
          <div className={styles.stack}>
            <div className={styles.grid2}>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-opens">
                  Opens
                </label>
                <Input
                  id="settings-opens"
                  type="datetime-local"
                  value={draft.opensAt}
                  onChange={(event) => update({ opensAt: event.target.value })}
                />
              </div>
              <div className={styles.field}>
                <label className={styles.label} htmlFor="settings-closes">
                  Closes
                </label>
                <Input
                  id="settings-closes"
                  type="datetime-local"
                  value={draft.closesAt}
                  onChange={(event) => update({ closesAt: event.target.value })}
                />
              </div>
            </div>
            <span className={styles.help}>
              Times are in your browser&rsquo;s timezone. Leave both empty and the form is governed
              only by its published status.
            </span>

            <hr className={styles.divider} />

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-limit">
                Submissions per person
              </label>
              <Input
                id="settings-limit"
                type="number"
                min={1}
                placeholder="No limit"
                value={draft.maxSubmissionsPerUser}
                onChange={(event) => update({ maxSubmissionsPerUser: event.target.value })}
              />
              <span className={styles.help}>Blank means as many as they like.</span>
            </div>

            <div className={styles.switchRow}>
              <span className={styles.switchText}>
                <span className={styles.switchLabel}>Allow multiple drafts</span>
                <span className={styles.help}>
                  A speaker can keep more than one unfinished submission open at a time.
                </span>
              </span>
              <Switch
                checked={draft.allowDrafts}
                aria-label="Allow multiple drafts"
                onCheckedChange={(next) => update({ allowDrafts: next })}
              />
            </div>
          </div>
        </Card>

        <Card padding="md">
          <p className={styles.panelTitle}>Notify organizers</p>
          <div className={styles.stack}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-notify">
                Email on each new submission
              </label>
              <Textarea
                id="settings-notify"
                rows={3}
                value={draft.notifyEmails}
                placeholder="program@example.com, chair@example.com"
                onChange={(event) => update({ notifyEmails: event.target.value })}
              />
              <span className={styles.help}>
                One address per line, or separated by commas. Leave empty for no notifications.
              </span>
            </div>
          </div>
        </Card>

        <Card padding="md">
          <p className={styles.panelTitle}>Confirmation to the submitter</p>
          <div className={styles.stack}>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-subject">
                Subject
              </label>
              <Input
                id="settings-subject"
                value={draft.confirmationSubject}
                placeholder="We received your talk"
                onChange={(event) => update({ confirmationSubject: event.target.value })}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-body">
                Message
              </label>
              <Textarea
                id="settings-body"
                rows={6}
                value={draft.confirmationBodyMarkdown}
                onChange={(event) => update({ confirmationBodyMarkdown: event.target.value })}
              />
              <span className={styles.help}>
                Markdown. Leave both empty and no confirmation email is sent.
              </span>
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.actions}>
        <Button variant="primary" loading={busy} disabled={!draft.name.trim()} onClick={save}>
          Save settings
        </Button>
      </div>
    </div>
  );
}
