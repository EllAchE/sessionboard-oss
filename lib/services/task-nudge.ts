import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { taskAssignment } from '@/db/schema';
import { requireCapability, type EventContext } from '@/lib/context';
import { invalid, notFound } from '@/lib/errors';
import { escapeMarkdownText } from '@/lib/markdown';
import { previewParticipantEmail, sendParticipantEmail } from './comms';
import { listTaskCompletion, type OutstandingTaskRow } from './dashboard';

/**
 * Assisted chasing — the organizer-side half of `B-1`.
 *
 * The outstanding-task report answers "who is blocking us"; this answers "and what do I say to
 * them". It deliberately stops short of sending on anyone's behalf. A domain expert's read of
 * thirteen years of speaker-logistics archives found no case of a tool successfully sending a
 * reminder for a committee, and two separate "it went to spam, I'm sending a personal one"
 * incidents; a feature that auto-emails speakers is switched off within an event cycle. So the
 * tool drafts and a human sends: `draftTaskNudge` composes and renders, the organizer edits it,
 * and `sendTaskNudge` refuses anything that was not rendered for review first.
 *
 * Nothing here is a new mail boundary. `previewParticipantEmail`/`sendParticipantEmail` in
 * `comms.ts` already own recipient resolution, the email-preference fail-closed rule, magic-link
 * minting, transport selection and the audit row; this module supplies the draft copy and the
 * review contract on top of them.
 */

/** Stamped on `email_log` so a hand-sent nudge is distinguishable from the automatic reminder. */
export const TASK_NUDGE_TEMPLATE_KEY = 'task.nudge';

export type NudgeSource = { subject: string; bodyMarkdown: string };

export type TaskNudgeDraft = {
  assignmentId: string;
  participantId: string;
  taskName: string;
  recipient: { name: string; email: string };
  /** Editable source, merge fields intact. */
  source: NudgeSource;
  /** What the recipient will actually read. This is the thing a human has to approve. */
  rendered: { subject: string; text: string; missing: string[] };
  unknownVariables: string[];
  /** Merge fields filled at send time rather than in the preview — today, the sign-in link. */
  dynamicFields: string[];
  lastRemindedAt: string | null;
};

export type TaskNudgeSendResult = {
  recipientName: string;
  recipientEmail: string;
  subject: string;
  logId: string;
  /** False on the `log` transport: recorded in the mail log, not handed to a provider. */
  delivered: boolean;
};

function formatDay(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

/** Everything the copy depends on, and nothing else — so the wording is testable on a literal. */
type NudgeFacts = Pick<
  OutstandingTaskRow,
  'taskName' | 'dueAt' | 'daysOverdue' | 'daysUntilDue' | 'sessionTitles'
>;

function firstSentence(row: NudgeFacts): string {
  // The task name is literal text spliced into a markdown body, not a merge value, so it is
  // escaped here — `renderTemplateMarkdown` only escapes what it substitutes.
  const name = `**${escapeMarkdownText(row.taskName)}**`;
  if (row.daysOverdue !== null) {
    if (row.daysOverdue <= 0) return `Your ${name} is due today and we do not have it yet.`;
    const days = row.daysOverdue === 1 ? '1 day' : `${row.daysOverdue} days`;
    return `We are still missing your ${name}. It was due on ${formatDay(row.dueAt!)}, ${days} ago.`;
  }
  if (row.daysUntilDue !== null) {
    const when =
      row.daysUntilDue === 0
        ? 'today'
        : row.daysUntilDue === 1
          ? 'tomorrow'
          : `on ${formatDay(row.dueAt!)}`;
    return `A quick nudge that your ${name} is due ${when}.`;
  }
  return `We are still waiting on your ${name}.`;
}

/**
 * Pure, and separated from the database on purpose: the wording is the part worth reviewing and
 * regression-testing, and it should be readable without standing up an event.
 *
 * Kept short and specific — a long templated reminder reads as machine output, and the whole point
 * of this flow is that a person puts their name to it. `{{portal.link}}` is the one dynamic field:
 * `comms.ts` renders it as a plain `/portal` URL in the preview and mints a real one-click
 * credential only inside the send boundary, so a draft can be forwarded around without leaking a
 * sign-in token.
 */
export function composeTaskNudge(row: NudgeFacts, organizerName: string): NudgeSource {
  const overdue = row.daysOverdue !== null && row.daysOverdue > 0;
  const subject = `${overdue ? 'Still need' : 'Reminder'}: ${row.taskName} for {{event.name}}`;

  const sessions =
    row.sessionTitles.length > 0
      ? `\n\nIt is for:\n\n${row.sessionTitles.map((title) => `- ${escapeMarkdownText(title)}`).join('\n')}`
      : '';

  const bodyMarkdown = [
    'Hi {{speaker.firstName|there}},',
    '',
    `${firstSentence(row)}${sessions}`,
    '',
    'This link takes you straight into your speaker portal — no password needed:',
    '',
    // Bare, not `[Open your portal]({{portal.link}})` like the automatic templates. `gfm` autolinks
    // it in the HTML part, and `markdownToText` reduces a markdown link to its *label* — so the
    // labelled form would hand the plain-text part, the review pane, and the Copy / "send from my
    // own email" escape hatches a sentence with no URL in it. Visible URLs also read less like
    // bulk mail, which is the whole point of a message a human puts their name to.
    '{{portal.link}}',
    '',
    'If it is already handled, or you need more time, just reply to this email and tell me.',
    '',
    'Thanks,',
    '',
    escapeMarkdownText(organizerName),
  ].join('\n');

  return { subject, bodyMarkdown };
}

async function requireOutstandingAssignment(
  ctx: EventContext,
  assignmentId: string,
): Promise<OutstandingTaskRow> {
  // Read through the same report the dashboard renders. It is already event-scoped and
  // capability-checked, so an assignment id from another event cannot be nudged by guessing it.
  const row = (await listTaskCompletion(ctx)).find((entry) => entry.id === assignmentId);
  if (!row) throw notFound('Task assignment');
  if (row.status === 'completed' || row.status === 'waived') {
    throw invalid(`${row.participantName} has already settled ${row.taskName}`);
  }
  return row;
}

/**
 * Draft one nudge and render it against the real recipient, so an empty merge field is visible
 * before anyone approves it.
 *
 * `subject`/`bodyMarkdown` are optional: omitted, the organizer gets the composed first draft;
 * supplied, this re-renders whatever they have edited it into. Both cases go through
 * `previewParticipantEmail`, which is what makes the rendered text authoritative.
 */
export async function draftTaskNudge(
  ctx: EventContext,
  input: { assignmentId: string; subject?: string; bodyMarkdown?: string },
): Promise<TaskNudgeDraft> {
  requireCapability(ctx, 'comms:send');
  const row = await requireOutstandingAssignment(ctx, input.assignmentId);

  const composed = composeTaskNudge(row, ctx.actor.name?.trim() || ctx.actor.email);
  const subject = (input.subject ?? composed.subject).trim();
  const bodyMarkdown = (input.bodyMarkdown ?? composed.bodyMarkdown).trim();
  if (!subject) throw invalid('A nudge needs a subject');
  if (!bodyMarkdown) throw invalid('A nudge needs a message');

  const preview = await previewParticipantEmail({
    eventId: ctx.eventId,
    participantId: row.participantId,
    subject,
    bodyMarkdown,
  });

  return {
    assignmentId: row.id,
    participantId: row.participantId,
    taskName: row.taskName,
    recipient: { name: preview.recipient.name, email: preview.recipient.email },
    source: { subject, bodyMarkdown },
    rendered: {
      subject: preview.message.subject,
      text: preview.message.text,
      missing: preview.message.missing,
    },
    unknownVariables: preview.unknown,
    dynamicFields: preview.dynamicFields,
    lastRemindedAt: row.lastRemindedAt,
  };
}

/**
 * Send a nudge a human has read.
 *
 * `reviewed*` is the rendered text that was on screen when they pressed send, not a hint —
 * `sendParticipantEmail` re-resolves the recipient and re-renders the message and refuses if
 * either moved. That is what makes "the organizer saw this exact email" an enforced property
 * rather than a UI convention, and it is why there is no path from a task row to an outbound
 * message that skips the draft.
 */
export async function sendTaskNudge(
  ctx: EventContext,
  input: {
    assignmentId: string;
    subject: string;
    bodyMarkdown: string;
    reviewedRecipientEmail: string;
    reviewedSubject: string;
    reviewedBodyText: string;
  },
): Promise<TaskNudgeSendResult> {
  requireCapability(ctx, 'comms:send');
  const row = await requireOutstandingAssignment(ctx, input.assignmentId);
  if (!input.subject.trim() || !input.bodyMarkdown.trim()) {
    throw invalid('A nudge needs a subject and a message');
  }
  if (!input.reviewedRecipientEmail || !input.reviewedSubject || !input.reviewedBodyText) {
    throw invalid('Preview the nudge before sending it');
  }

  const sent = await sendParticipantEmail({
    eventId: ctx.eventId,
    participantId: row.participantId,
    subject: input.subject,
    bodyMarkdown: input.bodyMarkdown,
    templateKey: TASK_NUDGE_TEMPLATE_KEY,
    expectedRecipientEmail: input.reviewedRecipientEmail,
    expectedPreviewSubject: input.reviewedSubject,
    expectedPreviewBodyText: input.reviewedBodyText,
  });

  // Same stamp the automatic reminder writes, for the same reason: the next cron run should not
  // chase someone a human chased an hour ago. Nobody enjoys being reminded twice by two systems.
  const now = new Date();
  await getDb()
    .update(taskAssignment)
    .set({ lastRemindedAt: now, updatedAt: now })
    .where(eq(taskAssignment.id, row.id));

  return {
    recipientName: sent.recipient.name,
    recipientEmail: sent.recipient.email,
    subject: sent.message.subject,
    logId: sent.logId,
    delivered: sent.sent,
  };
}
