'use client';

import { useEffect, useState } from 'react';
import { Card, Button, Input, Select, Switch, Textarea } from '../../../../components/ui';
import {
  PAGE_HEADING_MAX_LENGTH,
  hasWelcomeScreen,
  welcomeScreenErrors,
} from '../../../../lib/forms/contract';
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

  /**
   * `F-9`. The same rule the service enforces, read here so the organizer is stopped by the field
   * rather than by a failed save — and so the message is beside the box that has to change. A form
   * written before the rule existed arrives with both blank; it is fixed on this panel, where both
   * boxes already are, rather than anywhere else.
   */
  const welcomeProblems = hasWelcomeScreen(draft.kind)
    ? welcomeScreenErrors({ externalTitle: draft.externalTitle, pageHeading: draft.pageHeading })
    : {};
  const blocked = !draft.name.trim() || Object.keys(welcomeProblems).length > 0;

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
              <span className={styles.help}>Shown only to organizers.</span>
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
              <span className={styles.help}>Choose what this form creates.</span>
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
                  Adds a participant step for the submitter and co-presenters.
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
                {welcomeProblems.externalTitle ??
                  'What a speaker reads at the top of the page and what a shared link previews as.'}
              </span>
            </div>

            <div className={styles.field}>
              <label className={styles.label} htmlFor="settings-page-heading">
                Page heading *
              </label>
              <Input
                id="settings-page-heading"
                value={draft.pageHeading}
                maxLength={PAGE_HEADING_MAX_LENGTH}
                placeholder="Speak with us"
                onChange={(event) => update({ pageHeading: event.target.value })}
              />
              <span className={styles.help}>
                {welcomeProblems.pageHeading ??
                  `${draft.pageHeading.length} of ${PAGE_HEADING_MAX_LENGTH} characters. A short line above the title on the welcome step.`}
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
                <span className={styles.help}>Hide the welcome step without deleting its copy.</span>
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
              Your browser timezone. Leave blank for no date limits.
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
                Separate addresses with commas or new lines. Leave blank for none.
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
              <span className={styles.help}>Leave both blank to send no confirmation.</span>
            </div>
          </div>
        </Card>
      </div>

      <div className={styles.actions}>
        <Button variant="primary" loading={busy} disabled={blocked} onClick={save}>
          Save settings
        </Button>
        {blocked ? (
          <span className={styles.help}>
            {draft.name.trim()
              ? 'The starred welcome-screen fields are still empty.'
              : 'The form still needs an internal name.'}
          </span>
        ) : null}
      </div>
    </div>
  );
}
