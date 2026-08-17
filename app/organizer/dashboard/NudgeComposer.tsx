'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Copy, Mail, Send } from 'lucide-react';
import { Button, Dialog, Input, Textarea, useToast } from '@/components/ui';
import type { OutstandingTaskRow } from '@/lib/services/dashboard';
import type { TaskNudgeDraft } from '@/lib/services/task-nudge';
import { draftNudgeAction, sendNudgeAction } from './nudge-actions';
import styles from './dashboard.module.css';

/**
 * Assisted chasing — the organizer half of `B-1`.
 *
 * The shape is deliberate and comes from a decade of program-committee archives: no tool has ever
 * successfully sent a reminder on a committee's behalf, and the ones that tried got switched off
 * within an event cycle. So this drafts and a human sends. There is no bulk action, no "remind
 * all", and no path from a table row to an outbound email that does not pass through a screen
 * showing the exact rendered text.
 *
 * That is enforced on the server, not here: `sendNudgeAction` hands the reviewed rendering back to
 * `sendParticipantEmail`, which re-resolves the recipient, re-renders the message, and refuses if
 * either has moved since the review. The two-step here is the honest presentation of that rule.
 */

type Phase = 'loading' | 'editing' | 'reviewing';

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function NudgeComposer({
  row,
  onClose,
}: {
  row: OutstandingTaskRow | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();

  const [phase, setPhase] = useState<Phase>('loading');
  const [draft, setDraft] = useState<TaskNudgeDraft | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);

  const assignmentId = row?.id ?? null;

  const load = useCallback(
    (edited?: { subject: string; bodyMarkdown: string }) => {
      if (!assignmentId) return;
      startTransition(async () => {
        const result = await draftNudgeAction({ assignmentId, ...edited });
        if (!result.ok) {
          setError(result.message);
          setPhase('editing');
          return;
        }
        setError(null);
        setDraft(result.data);
        setSubject(result.data.source.subject);
        setBody(result.data.source.bodyMarkdown);
        // A first open lands in the editor; an explicit re-render is the organizer asking to read
        // it, which is the step that unlocks Send.
        setPhase(edited ? 'reviewing' : 'editing');
      });
    },
    [assignmentId],
  );

  useEffect(() => {
    if (!assignmentId) return;
    setPhase('loading');
    setDraft(null);
    setSubject('');
    setBody('');
    setError(null);
    load();
  }, [assignmentId, load]);

  if (!row) return null;

  /** Editing after a review invalidates it — the reviewed text is the only thing Send may use. */
  const edit = (next: { subject?: string; body?: string }) => {
    if (next.subject !== undefined) setSubject(next.subject);
    if (next.body !== undefined) setBody(next.body);
    setPhase('editing');
  };

  const reviewed =
    phase === 'reviewing' &&
    draft !== null &&
    subject === draft.source.subject &&
    body === draft.source.bodyMarkdown;

  const plainText = draft ? `Subject: ${draft.rendered.subject}\n\n${draft.rendered.text}` : '';

  const copyDraft = async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(plainText);
      toast({ title: 'Draft copied', description: 'Paste it into your own mail client.' });
    } catch {
      toast({ title: 'Could not reach the clipboard', tone: 'danger' });
    }
  };

  const send = () => {
    if (!draft || !reviewed) return;
    startTransition(async () => {
      const result = await sendNudgeAction({
        assignmentId: draft.assignmentId,
        subject: draft.source.subject,
        bodyMarkdown: draft.source.bodyMarkdown,
        reviewedRecipientEmail: draft.recipient.email,
        reviewedSubject: draft.rendered.subject,
        reviewedBodyText: draft.rendered.text,
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      toast({
        title: `Nudge sent to ${result.data.recipientName}`,
        description: result.data.delivered
          ? result.data.recipientEmail
          : `Recorded in the mail log. This deployment's transport does not hand mail to a provider.`,
        tone: 'success',
      });
      router.refresh();
      onClose();
    });
  };

  const warnings = [
    ...(draft?.unknownVariables ?? []).map(
      (path) => `{{${path}}} is not a merge field, so it will render as nothing.`,
    ),
    ...(draft?.rendered.missing ?? []).map((path) => `{{${path}}} is empty for this recipient.`),
  ];

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      size="lg"
      title={`Draft a nudge: ${row.taskName}`}
      description={
        draft
          ? `To ${draft.recipient.name} <${draft.recipient.email}>. Nothing is sent until you read it and press send.`
          : `Preparing a draft for ${row.participantName}…`
      }
      footer={
        <div className={styles.draftFooter}>
          {/**
           * Escalation runs by medium, not by attempt count: the tool's email, then the
           * coordinator's own address, then a text. These two are that escape hatch — the same
           * reviewed draft, handed to the organizer instead of to the transport. They appear only
           * once the message has been rendered, for the same reason Send does.
           */}
          {reviewed && draft ? (
            <>
              <Button variant="ghost" size="sm" iconLeft={<Copy size={14} />} onClick={copyDraft}>
                Copy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                iconLeft={<Mail size={14} />}
                href={`mailto:${encodeURIComponent(draft.recipient.email)}?subject=${encodeURIComponent(draft.rendered.subject)}&body=${encodeURIComponent(draft.rendered.text)}`}
              >
                Send from my own email
              </Button>
            </>
          ) : null}
          <span className={styles.toolbarSpacer} />
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          {reviewed ? (
            <Button
              variant="primary"
              size="sm"
              iconLeft={<Send size={14} />}
              loading={pending}
              onClick={send}
            >
              Send from Cicero
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              loading={pending}
              disabled={!draft || !subject.trim() || !body.trim()}
              onClick={() => load({ subject, bodyMarkdown: body })}
            >
              Read it before sending
            </Button>
          )}
        </div>
      }
    >
      {phase === 'loading' ? (
        <p className={styles.personMeta}>Rendering the draft against {row.participantName}…</p>
      ) : (
        <div className={styles.draftBody}>
          {row.lastRemindedAt ? (
            <p className={styles.draftNote}>
              {row.participantName} was last reminded on {formatDay(row.lastRemindedAt)}.
            </p>
          ) : null}

          {error ? (
            <p className={styles.draftError} role="alert">
              {error}
            </p>
          ) : null}

          <label className={styles.draftField}>
            <span className={styles.draftLabel}>Subject</span>
            <Input
              inputSize="sm"
              value={subject}
              onChange={(event) => edit({ subject: event.target.value })}
            />
          </label>

          <label className={styles.draftField}>
            <span className={styles.draftLabel}>Message</span>
            <Textarea
              rows={12}
              value={body}
              onChange={(event) => edit({ body: event.target.value })}
            />
          </label>

          {warnings.length > 0 ? (
            <ul className={styles.draftWarnings}>
              {warnings.map((warning) => (
                <li key={warning}>
                  <AlertTriangle size={12} aria-hidden /> {warning}
                </li>
              ))}
            </ul>
          ) : null}

          {reviewed && draft ? (
            <div className={styles.draftPreview}>
              <p className={styles.draftLabel}>
                This is exactly what {draft.recipient.name} will read
              </p>
              <p className={styles.draftPreviewSubject}>{draft.rendered.subject}</p>
              <pre className={styles.draftPreviewText}>{draft.rendered.text}</pre>
              {draft.dynamicFields.includes('portal.link') ? (
                <p className={styles.draftNote}>The sign-in link is added only when sent.</p>
              ) : null}
            </div>
          ) : (
            <p className={styles.draftNote}>Review before sending.</p>
          )}
        </div>
      )}
    </Dialog>
  );
}
