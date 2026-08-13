import { and, desc, eq, gte, inArray, isNotNull, like, lte, notInArray, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  emailLog,
  emailTemplate,
  event as eventTable,
  form,
  magicToken,
  participant,
  participantRole,
  portalTheme,
  room,
  scheduledSession,
  sessionFormat,
  submission,
  task,
  taskAssignment,
  track,
  user,
} from '../../db/schema';
import { appUrl, env } from '../env';
import { invalid, notFound } from '../errors';
import {
  buildCancellation,
  buildDownload,
  buildInvite,
  icsFilename,
  type CalendarAttendee,
} from '../ics';
import { formatRef, hashToken, randomToken } from '../ids';
import { sendMail } from '../mail';
import { markdownToText, renderMarkdown } from '../markdown';
import { listEventsForUser, pickDefaultEvent } from './events';

/**
 * `C-1`–`C-7`. Everything between an organizer pressing Send and a row in `email_log`: what the
 * merge fields mean, who the audience resolves to, what the branded layout looks like, and when a
 * reminder is allowed to fire a second time.
 *
 * Two things here are worth knowing before changing anything.
 *
 * **Sequence bumping is owned here, not by the agenda.** `lib/ics.ts` formats whatever sequence it
 * is handed; `sendSessionInvites` is the only place that decides whether a send is the first
 * publication or a revision, and it persists the bump before the mail goes out. A caller that
 * writes `ics_sequence` itself will produce duplicate calendar entries.
 *
 * **Every scheduled job is re-entrant.** Cloudflare Cron Triggers deliver at least once and a
 * self-hosted crontab is usually configured twice by accident. The reminder path is gated on
 * `task_assignment.last_reminded_at` against a computed fire time rather than on "have we run
 * today", so a second call in the same window is a no-op instead of a second email.
 */

// ---------------------------------------------------------------------------
// Merge fields
// ---------------------------------------------------------------------------

/**
 * `{{speaker.name}}` — dotted path, optional whitespace, and an optional fallback after a pipe:
 * `{{speaker.company|their company}}`. The fallback is used when the value is missing *or empty*,
 * which is the case that matters: a speaker who never filled in their company should not receive a
 * sentence with a hole in it.
 *
 * No conditionals and no loops, deliberately. `{{tasks.list}}` is pre-rendered as markdown so the
 * one case that genuinely needs iteration does not require a template language.
 */
const VARIABLE_PATTERN = /\{\{\s*([a-zA-Z][\w]*(?:\.[a-zA-Z][\w]*)*)\s*(?:\|([^}]*))?\}\}/g;

export type TemplateVars = Record<string, string>;

export type TemplateVariable = { path: string; description: string };

/** The documented catalog. The template editor renders this, and `unknownVariables` checks it. */
export const TEMPLATE_VARIABLES: TemplateVariable[] = [
  { path: 'event.name', description: 'Event name' },
  { path: 'event.dates', description: 'Event dates, e.g. 14–16 September 2026' },
  { path: 'event.timezone', description: 'Event timezone' },
  { path: 'event.venue', description: 'Venue name' },
  { path: 'event.website', description: 'Event website URL' },
  { path: 'event.url', description: 'Public Cicero page for the event' },
  { path: 'event.supportEmail', description: 'Organizer support address' },
  { path: 'speaker.name', description: 'Speaker display name' },
  { path: 'speaker.firstName', description: 'First name only' },
  { path: 'speaker.email', description: 'Speaker email address' },
  { path: 'speaker.company', description: 'Company' },
  { path: 'speaker.jobTitle', description: 'Job title' },
  { path: 'speaker.pronouns', description: 'Pronouns' },
  { path: 'submission.title', description: 'Submission title' },
  { path: 'submission.ref', description: 'Submission reference, e.g. ABS-12' },
  { path: 'submission.status', description: 'Submission status' },
  { path: 'submission.decisionNote', description: 'Note left with the accept/decline decision' },
  { path: 'session.title', description: 'Scheduled session title' },
  { path: 'session.ref', description: 'Session reference, e.g. SESS-4' },
  { path: 'session.track', description: 'Track name' },
  { path: 'session.room', description: 'Room name' },
  { path: 'session.format', description: 'Session format' },
  { path: 'session.startsAt', description: 'Start, in the event timezone' },
  { path: 'session.endsAt', description: 'End, in the event timezone' },
  { path: 'session.calendarUrl', description: 'Add-to-calendar download link (C-3a)' },
  { path: 'tasks.count', description: 'Number of outstanding tasks' },
  { path: 'tasks.list', description: 'Outstanding tasks as a markdown list' },
  { path: 'tasks.next', description: 'Name of the next task due' },
  { path: 'task.name', description: 'Task name (reminder sends only)' },
  { path: 'task.dueAt', description: 'Task due date (reminder sends only)' },
  { path: 'portal.url', description: 'Speaker portal URL' },
  { path: 'portal.link', description: 'One-click sign-in link into the portal' },
  { path: 'form.name', description: 'Form name (deadline reminders only)' },
  { path: 'form.closesAt', description: 'Form close date (deadline reminders only)' },
  { path: 'form.url', description: 'Public form URL (deadline reminders only)' },
];

const KNOWN_PATHS = new Set(TEMPLATE_VARIABLES.map((entry) => entry.path));

export function renderTemplateText(source: string, vars: TemplateVars): string {
  return source.replace(VARIABLE_PATTERN, (_match, path: string, fallback?: string) => {
    const value = vars[path];
    if (value === undefined || value === null || value === '') return (fallback ?? '').trim();
    return value;
  });
}

export function templateVariablesUsed(source: string): string[] {
  const found = new Set<string>();
  for (const match of source.matchAll(VARIABLE_PATTERN)) found.add(match[1]);
  return [...found];
}

/** Surfaced in the editor and the preview: a typo'd merge field otherwise renders as nothing. */
export function unknownVariables(source: string): string[] {
  return templateVariablesUsed(source).filter((path) => !KNOWN_PATHS.has(path));
}

// ---------------------------------------------------------------------------
// Branded layout — C-6
// ---------------------------------------------------------------------------

/**
 * Email cannot read CSS custom properties: Gmail strips `:root`, and Outlook's word renderer never
 * had them. The colours below are therefore literal by necessity, and they are the only literals in
 * this workstream — see `tasks/W5-notes.md`. `accentColor` from the event's portal theme overrides
 * the first one, which is what makes the layout branded rather than generic.
 */
const EMAIL_PALETTE = {
  accent: '#B7391F',
  ink: '#211F1B',
  body: '#33302A',
  muted: '#6A6255',
  hairline: '#E4DFD3',
  page: '#F8F6F1',
  card: '#FFFFFF',
} as const;

export type EmailBranding = {
  eventName: string;
  accent: string;
  supportEmail: string | null;
  eventUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * A one-column table layout with inline styles, because that is the only thing every client agrees
 * on. Nothing here depends on media queries or `<style>` surviving the trip.
 */
export function wrapInBranding(branding: EmailBranding, contentHtml: string): string {
  const accent = branding.accent || EMAIL_PALETTE.accent;
  const footer = branding.supportEmail
    ? `Questions? Reply to this email or write to <a href="mailto:${escapeHtml(branding.supportEmail)}" style="color:${accent};">${escapeHtml(branding.supportEmail)}</a>.`
    : 'You are receiving this because you are taking part in this event.';

  return [
    `<div style="margin:0;padding:24px 0;background:${EMAIL_PALETTE.page};font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;color:${EMAIL_PALETTE.body};">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center">`,
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:100%;background:${EMAIL_PALETTE.card};border:1px solid ${EMAIL_PALETTE.hairline};border-radius:8px;overflow:hidden;">`,
    `<tr><td style="height:4px;background:${accent};font-size:0;line-height:0;">&nbsp;</td></tr>`,
    `<tr><td style="padding:24px 32px 8px 32px;">`,
    `<a href="${escapeHtml(branding.eventUrl)}" style="text-decoration:none;color:${EMAIL_PALETTE.ink};font-size:18px;font-weight:600;letter-spacing:-0.01em;">${escapeHtml(branding.eventName)}</a>`,
    `</td></tr>`,
    `<tr><td style="padding:8px 32px 24px 32px;font-size:15px;line-height:1.6;color:${EMAIL_PALETTE.body};">`,
    contentHtml,
    `</td></tr>`,
    `<tr><td style="padding:16px 32px 24px 32px;border-top:1px solid ${EMAIL_PALETTE.hairline};font-size:12px;line-height:1.5;color:${EMAIL_PALETTE.muted};">`,
    footer,
    `<br />Sent by Cicero on behalf of ${escapeHtml(branding.eventName)}.`,
    `</td></tr>`,
    `</table></td></tr></table></div>`,
  ].join('');
}

// ---------------------------------------------------------------------------
// Loading an event's comms context
// ---------------------------------------------------------------------------

type EventRow = typeof eventTable.$inferSelect;

export type CommsContext = {
  event: EventRow;
  branding: EmailBranding;
};

export async function loadCommsContext(eventId: string): Promise<CommsContext> {
  const db = getDb();
  const [row] = await db.select().from(eventTable).where(eq(eventTable.id, eventId)).limit(1);
  if (!row) throw notFound('That event');
  const [theme] = await db
    .select()
    .from(portalTheme)
    .where(eq(portalTheme.eventId, eventId))
    .limit(1);

  return {
    event: row,
    branding: {
      eventName: row.name,
      accent: theme?.accentColor ?? EMAIL_PALETTE.accent,
      supportEmail: theme?.supportEmail ?? null,
      eventUrl: `${appUrl()}/e/${row.slug}`,
    },
  };
}

function formatInZone(date: Date | null, timezone: string, withTime = true): string {
  if (!date) return '';
  try {
    return new Intl.DateTimeFormat('en-GB', {
      dateStyle: 'full',
      ...(withTime ? { timeStyle: 'short' as const } : {}),
      timeZone: timezone,
    }).format(date);
  } catch {
    return date.toISOString().replace('T', ' ').slice(0, withTime ? 16 : 10);
  }
}

function formatEventDates(event: EventRow): string {
  if (!event.startsOn) return '';
  if (!event.endsOn || event.endsOn === event.startsOn) return event.startsOn;
  return `${event.startsOn} – ${event.endsOn}`;
}

// ---------------------------------------------------------------------------
// Audiences — C-4
// ---------------------------------------------------------------------------

export type AudienceKind =
  | 'all_speakers'
  | 'accepted_speakers'
  | 'pending_speakers'
  | 'declined_speakers'
  | 'scheduled_speakers'
  | 'track'
  | 'format'
  | 'outstanding_tasks'
  | 'manual';

export type AudienceSpec = {
  kind: AudienceKind;
  trackId?: string | null;
  formatId?: string | null;
  taskId?: string | null;
  participantIds?: string[];
};

export const AUDIENCE_LABELS: Record<AudienceKind, string> = {
  all_speakers: 'Everyone with a submission',
  accepted_speakers: 'Accepted speakers',
  pending_speakers: 'Speakers awaiting a decision',
  declined_speakers: 'Declined speakers',
  scheduled_speakers: 'Speakers with a scheduled session',
  track: 'Speakers in one track',
  format: 'Speakers in one format',
  outstanding_tasks: 'Speakers with an outstanding task',
  manual: 'Hand-picked recipients',
};

export type RecipientSubmission = {
  id: string;
  ref: number;
  title: string;
  status: string;
  trackId: string | null;
  formatId: string | null;
  decisionNote: string | null;
};

export type RecipientTask = {
  taskId: string;
  name: string;
  dueAt: Date | null;
};

export type Recipient = {
  participantId: string;
  userId: string;
  email: string;
  name: string;
  submissions: RecipientSubmission[];
  openTasks: RecipientTask[];
  sessionId: string | null;
  vars: TemplateVars;
};

type Lookups = {
  tracks: Map<string, string>;
  rooms: Map<string, string>;
  formats: Map<string, string>;
};

/**
 * One pass over the event rather than a query per recipient. At the scale this product assumes
 * (hundreds of submissions) the whole graph is a few thousand rows and fits comfortably in memory,
 * which keeps audience filtering readable instead of spread across eight SQL variants.
 *
 * Loading it is the expensive part, so callers resolving many recipients in one request (a publish
 * batch notifying every session on a day) should load it once with `loadRecipientGraph` and pass it
 * to every `resolveRecipients`/`recipientForParticipant` call instead of letting each call reload it.
 */
export async function loadRecipientGraph(eventId: string) {
  const db = getDb();
  const { event, branding } = await loadCommsContext(eventId);

  const people = await db
    .select({
      participantId: participant.id,
      userId: participant.userId,
      email: user.email,
      userName: user.name,
      displayName: participant.displayName,
      company: participant.company,
      jobTitle: participant.jobTitle,
      pronouns: participant.pronouns,
    })
    .from(participant)
    .innerJoin(user, eq(user.id, participant.userId))
    .where(eq(participant.eventId, eventId));

  const submissionRows = await db
    .select({
      participantId: participantRole.participantId,
      id: submission.id,
      ref: submission.ref,
      title: submission.title,
      status: submission.status,
      trackId: submission.trackId,
      formatId: submission.formatId,
      decisionNote: submission.decisionNote,
      isPrimary: participantRole.isPrimary,
    })
    .from(participantRole)
    .innerJoin(submission, eq(submission.id, participantRole.submissionId))
    .where(eq(submission.eventId, eventId));

  const sessionRows = await db
    .select()
    .from(scheduledSession)
    .where(eq(scheduledSession.eventId, eventId));

  const taskRows = await db
    .select({
      participantId: taskAssignment.participantId,
      taskId: task.id,
      name: task.name,
      dueAt: task.dueAt,
    })
    .from(taskAssignment)
    .innerJoin(task, eq(task.id, taskAssignment.taskId))
    .where(
      and(
        eq(task.eventId, eventId),
        notInArray(taskAssignment.status, ['completed', 'waived']),
      ),
    );

  const lookups = await loadLookups(eventId);

  return { event, branding, people, submissionRows, sessionRows, taskRows, lookups };
}

export type RecipientGraph = Awaited<ReturnType<typeof loadRecipientGraph>>;

export async function resolveRecipients(
  eventId: string,
  spec: AudienceSpec,
  graph?: RecipientGraph,
): Promise<Recipient[]> {
  const { event, branding, people, submissionRows, sessionRows, taskRows, lookups } =
    graph ?? (await loadRecipientGraph(eventId));

  const submissionsByParticipant = new Map<string, RecipientSubmission[]>();
  for (const row of submissionRows) {
    const list = submissionsByParticipant.get(row.participantId) ?? [];
    list.push(row);
    submissionsByParticipant.set(row.participantId, list);
  }

  const sessionBySubmission = new Map<string, (typeof sessionRows)[number]>();
  for (const row of sessionRows) {
    if (row.submissionId) sessionBySubmission.set(row.submissionId, row);
  }

  const tasksByParticipant = new Map<string, RecipientTask[]>();
  for (const row of taskRows) {
    if (spec.kind === 'outstanding_tasks' && spec.taskId && row.taskId !== spec.taskId) continue;
    const list = tasksByParticipant.get(row.participantId) ?? [];
    list.push({ taskId: row.taskId, name: row.name, dueAt: row.dueAt });
    tasksByParticipant.set(row.participantId, list);
  }

  const manual = new Set(spec.participantIds ?? []);

  const recipients: Recipient[] = [];
  for (const person of people) {
    const submissions = submissionsByParticipant.get(person.participantId) ?? [];
    const openTasks = tasksByParticipant.get(person.participantId) ?? [];
    const session =
      submissions.map((s) => sessionBySubmission.get(s.id)).find((row) => row !== undefined) ??
      null;

    if (!matchesAudience(spec, { submissions, openTasks, session, manual, id: person.participantId })) {
      continue;
    }

    const name = person.displayName || person.userName || person.email.split('@')[0];
    const preferred =
      submissions.find((s) => s.status === 'accepted') ?? submissions[0] ?? null;
    const selectedTask =
      spec.kind === 'outstanding_tasks' && spec.taskId
        ? (openTasks.find((entry) => entry.taskId === spec.taskId) ?? null)
        : null;

    recipients.push({
      participantId: person.participantId,
      userId: person.userId,
      email: person.email,
      name,
      submissions,
      openTasks,
      sessionId: session?.id ?? null,
      vars: buildVars({
        event,
        branding,
        lookups,
        person: { ...person, name },
        submission: preferred,
        session,
        openTasks,
        selectedTask,
      }),
    });
  }

  return recipients.sort((a, b) => a.name.localeCompare(b.name));
}

function matchesAudience(
  spec: AudienceSpec,
  candidate: {
    id: string;
    submissions: RecipientSubmission[];
    openTasks: RecipientTask[];
    session: unknown;
    manual: Set<string>;
  },
): boolean {
  const { submissions, openTasks } = candidate;
  const has = (statuses: string[]) => submissions.some((s) => statuses.includes(s.status));

  switch (spec.kind) {
    case 'all_speakers':
      return submissions.length > 0;
    case 'accepted_speakers':
      return has(['accepted']);
    case 'pending_speakers':
      return has(['submitted', 'under_review', 'waitlisted']);
    case 'declined_speakers':
      return has(['declined']);
    case 'scheduled_speakers':
      return candidate.session !== null;
    case 'track':
      return submissions.some((s) => s.trackId === spec.trackId);
    case 'format':
      return submissions.some((s) => s.formatId === spec.formatId);
    case 'outstanding_tasks':
      return openTasks.length > 0;
    case 'manual':
      return candidate.manual.has(candidate.id);
    default:
      return false;
  }
}

async function loadLookups(eventId: string): Promise<Lookups> {
  const db = getDb();
  const [tracks, rooms, formats] = await Promise.all([
    db.select({ id: track.id, name: track.name }).from(track).where(eq(track.eventId, eventId)),
    db.select({ id: room.id, name: room.name }).from(room).where(eq(room.eventId, eventId)),
    db
      .select({ id: sessionFormat.id, name: sessionFormat.name })
      .from(sessionFormat)
      .where(eq(sessionFormat.eventId, eventId)),
  ]);
  return {
    tracks: new Map(tracks.map((t) => [t.id, t.name])),
    rooms: new Map(rooms.map((r) => [r.id, r.name])),
    formats: new Map(formats.map((f) => [f.id, f.name])),
  };
}

function buildVars(input: {
  event: EventRow;
  branding: EmailBranding;
  lookups: Lookups;
  person: { name: string; email: string; company: string | null; jobTitle: string | null; pronouns: string | null };
  submission: RecipientSubmission | null;
  session: typeof scheduledSession.$inferSelect | null;
  openTasks: RecipientTask[];
  selectedTask: RecipientTask | null;
}): TemplateVars {
  const {
    event,
    branding,
    lookups,
    person,
    submission: sub,
    session,
    openTasks,
    selectedTask,
  } = input;
  const zone = event.timezone;

  const sortedTasks = [...openTasks].sort((a, b) => {
    if (!a.dueAt) return 1;
    if (!b.dueAt) return -1;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });

  return {
    'event.name': event.name,
    'event.dates': formatEventDates(event),
    'event.timezone': zone,
    'event.venue': event.venueName ?? '',
    'event.website': event.websiteUrl ?? '',
    'event.url': branding.eventUrl,
    'event.supportEmail': branding.supportEmail ?? '',

    'speaker.name': person.name,
    'speaker.firstName': person.name.split(' ')[0] ?? person.name,
    'speaker.email': person.email,
    'speaker.company': person.company ?? '',
    'speaker.jobTitle': person.jobTitle ?? '',
    'speaker.pronouns': person.pronouns ?? '',

    'submission.title': sub?.title ?? '',
    'submission.ref': sub ? formatRef('submission', sub.ref) : '',
    'submission.status': sub?.status ?? '',
    'submission.decisionNote': sub?.decisionNote ?? '',

    'session.title': session?.title ?? sub?.title ?? '',
    'session.ref': session ? formatRef('session', session.ref) : '',
    'session.track': session?.trackId ? (lookups.tracks.get(session.trackId) ?? '') : '',
    'session.room': session?.roomId ? (lookups.rooms.get(session.roomId) ?? '') : '',
    'session.format': session?.formatId ? (lookups.formats.get(session.formatId) ?? '') : '',
    'session.startsAt': formatInZone(session?.startsAt ?? null, zone),
    'session.endsAt': formatInZone(session?.endsAt ?? null, zone),
    'session.calendarUrl': session ? calendarDownloadUrl(session.id) : '',

    'tasks.count': String(openTasks.length),
    'tasks.list': sortedTasks
      .map((t) => `- ${t.name}${t.dueAt ? ` — due ${formatInZone(t.dueAt, zone, false)}` : ''}`)
      .join('\n'),
    'tasks.next': sortedTasks[0]?.name ?? '',

    ...taskReminderVars(selectedTask),

    'portal.url': `${appUrl()}/portal`,
  };
}

function taskReminderVars(
  selectedTask: Pick<RecipientTask, 'name' | 'dueAt'> | null,
): TemplateVars {
  return {
    'task.name': selectedTask?.name ?? '',
    'task.dueAt': selectedTask?.dueAt
      ? ` and due ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(selectedTask.dueAt)}`
      : '',
  };
}

// ---------------------------------------------------------------------------
// Templates — C-1
// ---------------------------------------------------------------------------

export type EmailTemplateRow = typeof emailTemplate.$inferSelect;

/**
 * Every automatic send in the product is one of these keys. They are seeded per event so an
 * organizer can rewrite the acceptance email without touching code, and `sendTemplated` falls back
 * to the shipped copy if a row was deleted.
 */
export const DEFAULT_TEMPLATES: Array<{
  key: string;
  name: string;
  subject: string;
  bodyMarkdown: string;
  attachIcs?: boolean;
}> = [
  {
    key: 'submission.confirmation',
    name: 'Submission received',
    subject: 'We received "{{submission.title}}"',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'Thanks for submitting **{{submission.title}}** ({{submission.ref}}) to {{event.name}}.',
      '',
      'You can review or edit your submission in your speaker portal at any time:',
      '',
      '[Open your speaker portal]({{portal.link}})',
      '',
      'We will be in touch once the programme committee has reviewed it.',
    ].join('\n'),
  },
  {
    key: 'submission.accepted',
    name: 'Submission accepted',
    subject: 'Your talk was accepted for {{event.name}}',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'Good news: **{{submission.title}}** ({{submission.ref}}) has been accepted for {{event.name}}.',
      '',
      '{{submission.decisionNote}}',
      '',
      'Next, please complete your speaker onboarding:',
      '',
      '{{tasks.list}}',
      '',
      '[Open your speaker portal]({{portal.link}})',
    ].join('\n'),
  },
  {
    key: 'submission.declined',
    name: 'Submission declined',
    subject: 'An update on your {{event.name}} submission',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'Thank you for submitting **{{submission.title}}** to {{event.name}}. We had many more strong proposals than slots this year, and we are not able to include it in the programme.',
      '',
      '{{submission.decisionNote}}',
      '',
      'We hope you will submit again next time.',
    ].join('\n'),
  },
  {
    key: 'session.invite',
    name: 'Calendar invitation',
    subject: '{{session.title}} — {{session.startsAt}}',
    attachIcs: true,
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'Your session at {{event.name}} is scheduled. This email carries a calendar invitation. Accept it and the session lands on your own calendar, and it updates itself in place if we ever have to move you.',
      '',
      '- **Session:** {{session.title}} ({{session.ref}})',
      '- **Starts:** {{session.startsAt}}',
      '- **Ends:** {{session.endsAt}}',
      '- **Room:** {{session.room|to be confirmed}}',
      '- **Track:** {{session.track|—}}',
      '',
      'If your mail client did not show accept and decline buttons, you can [add it to your calendar directly]({{session.calendarUrl}}).',
    ].join('\n'),
  },
  {
    key: 'session.cancelled',
    name: 'Session cancelled',
    subject: 'Cancelled: {{session.title}}',
    attachIcs: true,
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      '**{{session.title}}** ({{session.ref}}) has been removed from the {{event.name}} programme, and this email cancels the calendar entry we sent you earlier.',
      '',
      'If this is unexpected, please reply to this email.',
    ].join('\n'),
  },
  {
    key: 'task.reminder',
    name: 'Task reminder',
    subject: 'Reminder: {{task.name}} for {{event.name}}',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'A quick reminder that **{{task.name}}** is still outstanding{{task.dueAt| }}.',
      '',
      'Everything still open on your list:',
      '',
      '{{tasks.list}}',
      '',
      '[Open your speaker portal]({{portal.link}})',
    ].join('\n'),
  },
  {
    key: 'form.deadline',
    name: 'Draft deadline reminder',
    subject: 'Your {{event.name}} draft closes {{form.closesAt}}',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'You have a draft submission for **{{event.name}}** that has not been submitted yet, and {{form.name}} closes on {{form.closesAt}}.',
      '',
      '[Finish your submission]({{form.url}})',
    ].join('\n'),
  },
];

export async function listTemplates(eventId: string): Promise<EmailTemplateRow[]> {
  const db = getDb();
  return db
    .select()
    .from(emailTemplate)
    .where(eq(emailTemplate.eventId, eventId))
    .orderBy(emailTemplate.key);
}

export async function getTemplate(
  eventId: string,
  key: string,
): Promise<EmailTemplateRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(emailTemplate)
    .where(and(eq(emailTemplate.eventId, eventId), eq(emailTemplate.key, key)))
    .limit(1);
  return row;
}

/** Idempotent: safe to call on every visit to the comms surface and from the seed script. */
export async function ensureDefaultTemplates(eventId: string): Promise<void> {
  const db = getDb();
  const existing = new Set((await listTemplates(eventId)).map((row) => row.key));
  const missing = DEFAULT_TEMPLATES.filter((template) => !existing.has(template.key));
  if (missing.length === 0) return;

  await db.insert(emailTemplate).values(
    missing.map((template) => ({
      eventId,
      key: template.key,
      name: template.name,
      subject: template.subject,
      bodyMarkdown: template.bodyMarkdown,
      attachIcs: template.attachIcs ?? false,
    })),
  );
}

export type TemplateInput = {
  eventId: string;
  key: string;
  name: string;
  subject: string;
  bodyMarkdown: string;
  enabled?: boolean;
  attachIcs?: boolean;
};

export async function saveTemplate(input: TemplateInput): Promise<EmailTemplateRow> {
  const db = getDb();
  if (!input.key.trim()) throw invalid('A template needs a key');
  if (!input.subject.trim()) throw invalid('A template needs a subject');

  const [row] = await db
    .insert(emailTemplate)
    .values({
      eventId: input.eventId,
      key: input.key.trim(),
      name: input.name.trim() || input.key.trim(),
      subject: input.subject,
      bodyMarkdown: input.bodyMarkdown,
      enabled: input.enabled ?? true,
      attachIcs: input.attachIcs ?? false,
    })
    .onConflictDoUpdate({
      target: [emailTemplate.eventId, emailTemplate.key],
      set: {
        name: input.name.trim() || input.key.trim(),
        subject: input.subject,
        bodyMarkdown: input.bodyMarkdown,
        enabled: input.enabled ?? true,
        attachIcs: input.attachIcs ?? false,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

export async function deleteTemplate(eventId: string, templateId: string): Promise<void> {
  const db = getDb();
  await db
    .delete(emailTemplate)
    .where(and(eq(emailTemplate.eventId, eventId), eq(emailTemplate.id, templateId)));
}

// ---------------------------------------------------------------------------
// Rendering and sending
// ---------------------------------------------------------------------------

export type RenderedMessage = {
  subject: string;
  html: string;
  text: string;
  missing: string[];
};

/**
 * Renders a subject and a markdown body against one recipient's variables. Markdown goes through
 * the untrusted renderer, so a merge field carrying speaker-authored text cannot inject markup into
 * everyone else's inbox.
 */
export function renderMessage(
  branding: EmailBranding,
  subject: string,
  bodyMarkdown: string,
  vars: TemplateVars,
): RenderedMessage {
  const renderedSubject = renderTemplateText(subject, vars).replace(/\s+/g, ' ').trim();
  const renderedBody = renderTemplateText(bodyMarkdown, vars);
  const missing = [...templateVariablesUsed(subject), ...templateVariablesUsed(bodyMarkdown)]
    .filter((path, index, all) => all.indexOf(path) === index)
    .filter((path) => !vars[path]);

  return {
    subject: renderedSubject,
    html: wrapInBranding(branding, renderMarkdown(renderedBody)),
    text: markdownToText(renderedBody),
    missing,
  };
}

/**
 * `T-4a` inside an email: a signed, single-use link straight into the portal, minted only when the
 * template actually asks for `{{portal.link}}`. Bulk-minting one per recipient regardless would put
 * live credentials in messages that never use them.
 */
async function mintPortalLink(
  userId: string,
  eventId: string,
  redirectTo = '/portal',
): Promise<string> {
  const db = getDb();
  const token = randomToken();
  await db.insert(magicToken).values({
    tokenHash: await hashToken(token),
    userId,
    eventId,
    redirectTo,
    // Longer than a sign-in link: an acceptance email is read days late and re-read weeks later.
    expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
  });
  return `${appUrl()}/auth/verify?token=${encodeURIComponent(token)}`;
}

const PORTAL_LINK_PATTERN = /\{\{\s*portal\.link/;

async function withPortalLink(
  recipient: Recipient,
  eventId: string,
  subject: string,
  body: string,
): Promise<TemplateVars> {
  if (!PORTAL_LINK_PATTERN.test(subject) && !PORTAL_LINK_PATTERN.test(body)) {
    return recipient.vars;
  }
  return { ...recipient.vars, 'portal.link': await mintPortalLink(recipient.userId, eventId) };
}

export type SendOutcome = {
  recipients: number;
  sent: number;
  failed: number;
  logIds: string[];
};

export type CampaignInput = {
  eventId: string;
  subject: string;
  bodyMarkdown: string;
  audience: AudienceSpec;
  templateKey?: string | null;
  /** `C-3`: attach the calendar invite for each recipient's scheduled session, where they have one. */
  attachIcs?: boolean;
};

/** `C-4`. One message per recipient, resolved and branded per person, logged either way. */
export async function sendCampaign(input: CampaignInput): Promise<SendOutcome> {
  const { branding, event } = await loadCommsContext(input.eventId);
  const recipients = await resolveRecipients(input.eventId, input.audience);

  const outcome: SendOutcome = { recipients: recipients.length, sent: 0, failed: 0, logIds: [] };

  for (const recipient of recipients) {
    const vars = await withPortalLink(
      recipient,
      input.eventId,
      input.subject,
      input.bodyMarkdown,
    );
    const message = renderMessage(branding, input.subject, input.bodyMarkdown, vars);
    // PUBLISH, not REQUEST. An ad-hoc send does not know whether it is a revision, and a REQUEST at
    // a sequence the speaker's calendar already holds is discarded as a duplicate — silently
    // undoing the invite. Real invitations go through `sendSessionInvites`, which owns the bump.
    const ics =
      input.attachIcs && recipient.sessionId
        ? ((await buildSessionCalendar(recipient.sessionId, { method: 'PUBLISH' }))?.body ??
          undefined)
        : undefined;

    const result = await sendMail({
      to: recipient.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      eventId: event.id,
      templateKey: input.templateKey ?? 'adhoc',
      ics,
    });

    outcome.logIds.push(result.id);
    if (result.sent) outcome.sent += 1;
    else outcome.failed += 1;
  }

  return outcome;
}

export type PreviewResult = {
  recipient: Recipient | null;
  audienceSize: number;
  message: RenderedMessage | null;
  unknown: string[];
};

/** Preview renders against a *real* recipient, so an empty merge field is visible before send. */
export async function previewCampaign(input: {
  eventId: string;
  subject: string;
  bodyMarkdown: string;
  audience: AudienceSpec;
  participantId?: string | null;
}): Promise<PreviewResult> {
  const { branding } = await loadCommsContext(input.eventId);
  const recipients = await resolveRecipients(input.eventId, input.audience);
  const recipient =
    recipients.find((row) => row.participantId === input.participantId) ?? recipients[0] ?? null;

  const unknown = [
    ...unknownVariables(input.subject),
    ...unknownVariables(input.bodyMarkdown),
  ].filter((path, index, all) => all.indexOf(path) === index);

  if (!recipient) {
    return { recipient: null, audienceSize: 0, message: null, unknown };
  }

  // Never mint a live sign-in token for a preview.
  const vars = { ...recipient.vars, 'portal.link': `${appUrl()}/portal` };
  return {
    recipient,
    audienceSize: recipients.length,
    message: renderMessage(branding, input.subject, input.bodyMarkdown, vars),
    unknown,
  };
}

/**
 * The automatic path (`C-2`). Looks the event's template up by key, falls back to the shipped copy,
 * and honours `enabled` so an organizer can turn one off without deleting it.
 */
async function sendTemplated(input: {
  eventId: string;
  key: string;
  recipient: Recipient;
  extraVars?: TemplateVars;
  ics?: string;
}): Promise<{ id: string; sent: boolean } | null> {
  const { branding, event } = await loadCommsContext(input.eventId);
  const stored = await getTemplate(input.eventId, input.key);
  if (stored && !stored.enabled) return null;

  const fallback = DEFAULT_TEMPLATES.find((template) => template.key === input.key);
  const subject = stored?.subject ?? fallback?.subject;
  const body = stored?.bodyMarkdown ?? fallback?.bodyMarkdown;
  if (!subject || !body) throw notFound(`Template ${input.key}`);

  const base = { ...input.recipient.vars, ...(input.extraVars ?? {}) };
  const withLink = PORTAL_LINK_PATTERN.test(subject) || PORTAL_LINK_PATTERN.test(body)
    ? { ...base, 'portal.link': await mintPortalLink(input.recipient.userId, input.eventId) }
    : base;

  const message = renderMessage(branding, subject, body, withLink);
  return sendMail({
    to: input.recipient.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    eventId: event.id,
    templateKey: input.key,
    ics: input.ics,
  });
}

async function recipientForParticipant(
  eventId: string,
  participantId: string,
  graph?: RecipientGraph,
): Promise<Recipient | null> {
  const recipients = await resolveRecipients(
    eventId,
    { kind: 'manual', participantIds: [participantId] },
    graph,
  );
  return recipients[0] ?? null;
}

// ---------------------------------------------------------------------------
// Triggered sends — C-2
// ---------------------------------------------------------------------------

async function participantsForSubmission(submissionId: string): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ participantId: participantRole.participantId })
    .from(participantRole)
    .where(eq(participantRole.submissionId, submissionId))
    .orderBy(desc(participantRole.isPrimary), participantRole.position);
  return rows.map((row) => row.participantId);
}

async function loadSubmission(submissionId: string) {
  const db = getDb();
  const [row] = await db.select().from(submission).where(eq(submission.id, submissionId)).limit(1);
  if (!row) throw notFound('That submission');
  return row;
}

/** `F-12`, called by the form engine once a submission leaves draft. */
export async function sendSubmissionConfirmation(submissionId: string): Promise<SendOutcome> {
  const row = await loadSubmission(submissionId);
  return fanOutSubmissionTemplate(row.eventId, submissionId, 'submission.confirmation');
}

/** `V-2` decisions. Picks the accept or decline template from the submission's own status. */
export async function sendDecisionNotice(submissionId: string): Promise<SendOutcome> {
  const row = await loadSubmission(submissionId);
  if (row.status !== 'accepted' && row.status !== 'declined') {
    throw invalid('Only an accepted or declined submission has a decision to send');
  }
  const key = row.status === 'accepted' ? 'submission.accepted' : 'submission.declined';
  return fanOutSubmissionTemplate(row.eventId, submissionId, key);
}

async function fanOutSubmissionTemplate(
  eventId: string,
  submissionId: string,
  key: string,
): Promise<SendOutcome> {
  const participantIds = await participantsForSubmission(submissionId);
  const outcome: SendOutcome = { recipients: 0, sent: 0, failed: 0, logIds: [] };

  for (const participantId of participantIds) {
    const recipient = await recipientForParticipant(eventId, participantId);
    if (!recipient) continue;
    outcome.recipients += 1;
    const result = await sendTemplated({ eventId, key, recipient });
    if (!result) continue;
    outcome.logIds.push(result.id);
    if (result.sent) outcome.sent += 1;
    else outcome.failed += 1;
  }

  return outcome;
}

// ---------------------------------------------------------------------------
// Calendar — C-3 and C-3a
// ---------------------------------------------------------------------------

export function calendarDownloadUrl(sessionId: string): string {
  return `${appUrl()}/api/calendar/${sessionId}`;
}

type SessionCalendar = {
  body: string;
  filename: string;
  uid: string;
  sequence: number;
};

async function loadSessionForCalendar(sessionId: string) {
  const db = getDb();
  const [row] = await db
    .select({
      session: scheduledSession,
      event: eventTable,
      roomName: room.name,
      trackName: track.name,
    })
    .from(scheduledSession)
    .innerJoin(eventTable, eq(eventTable.id, scheduledSession.eventId))
    .leftJoin(room, eq(room.id, scheduledSession.roomId))
    .leftJoin(track, eq(track.id, scheduledSession.trackId))
    .where(eq(scheduledSession.id, sessionId))
    .limit(1);
  return row;
}

async function attendeesForSession(
  submissionId: string | null,
): Promise<CalendarAttendee[]> {
  if (!submissionId) return [];
  const db = getDb();
  const rows = await db
    .select({ email: user.email, name: user.name, displayName: participant.displayName })
    .from(participantRole)
    .innerJoin(participant, eq(participant.id, participantRole.participantId))
    .innerJoin(user, eq(user.id, participant.userId))
    .where(eq(participantRole.submissionId, submissionId))
    .orderBy(desc(participantRole.isPrimary), participantRole.position);

  return rows.map((row) => ({
    email: row.email,
    name: row.displayName ?? row.name ?? null,
  }));
}

function organizerFor(eventName: string): { email: string; name: string } {
  const raw = env('MAIL_FROM') ?? 'cicero@localhost';
  return {
    email: raw.match(/<(.+)>/)?.[1] ?? raw,
    name: `${eventName} programme team`,
  };
}

/**
 * Builds the VCALENDAR for one scheduled session. `REQUEST` and `CANCEL` carry attendees, `PUBLISH`
 * is the anonymous add-to-calendar body behind `C-3a`.
 */
export async function buildSessionCalendar(
  sessionId: string,
  options: { method?: 'REQUEST' | 'CANCEL' | 'PUBLISH'; sequence?: number } = {},
): Promise<SessionCalendar | null> {
  const row = await loadSessionForCalendar(sessionId);
  if (!row) return null;
  const { session, event } = row;
  if (!session.startsAt || !session.endsAt) return null;

  const method = options.method ?? 'PUBLISH';
  const attendees = method === 'PUBLISH' ? [] : await attendeesForSession(session.submissionId);
  const sequence = options.sequence ?? session.icsSequence;

  const descriptionParts = [
    markdownToText(session.descriptionMarkdown),
    row.trackName ? `Track: ${row.trackName}` : '',
    `${event.name}${event.venueName ? ` · ${event.venueName}` : ''}`,
  ].filter(Boolean);

  const payload = {
    uid: session.icsUid,
    sequence,
    summary: session.title,
    description: descriptionParts.join('\n\n'),
    location: row.roomName ?? event.venueName ?? null,
    url: `${appUrl()}/e/${event.slug}/agenda`,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    organizer: organizerFor(event.name),
    attendees,
  };

  const body =
    method === 'CANCEL'
      ? buildCancellation(payload)
      : method === 'REQUEST'
        ? buildInvite(payload)
        : buildDownload(payload);

  return {
    body,
    filename: icsFilename(session.title),
    uid: session.icsUid,
    sequence,
  };
}

/** `C-3a`. Served by `app/api/calendar/[sessionId]/route.ts` and linked from the portal. */
export async function sessionCalendarDownload(
  sessionId: string,
): Promise<{ body: string; filename: string } | null> {
  const calendar = await buildSessionCalendar(sessionId, { method: 'PUBLISH' });
  return calendar ? { body: calendar.body, filename: calendar.filename } : null;
}

/**
 * Has this session's *invitation* ever gone out? Answered from `email_log` rather than from a flag,
 * because the log is the record that survives the row being edited by five other surfaces — and
 * because the answer decides whether the next send is sequence 0 or a bump.
 *
 * Scoped to the two invite templates on purpose: an ad-hoc campaign that attached the plain
 * add-to-calendar copy carries the same UID but is not a revision of anything.
 */
async function inviteAlreadySent(uid: string, eventId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db
    .select({ id: emailLog.id })
    .from(emailLog)
    .where(
      and(
        eq(emailLog.eventId, eventId),
        isNotNull(emailLog.icsBody),
        like(emailLog.icsBody, `%${uid}%`),
        inArray(emailLog.templateKey, ['session.invite', 'session.cancelled']),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export type SessionNotifyResult = SendOutcome & {
  sequence: number;
  skipped?: 'unscheduled' | 'no_attendees' | 'not_found';
};

/**
 * **The `C-3` entry point, and the one the agenda calls.**
 *
 * Call it after any change an attendee's calendar needs to see — a first placement, a time change,
 * a room move, a cancellation. It decides the sequence, persists it, builds the right method, and
 * mails every participant on the session.
 *
 * Do not bump `ics_sequence` yourself, and never regenerate `ics_uid` for an existing row: the
 * invite updates in place only while the UID is stable and the sequence rises.
 */
export async function sendSessionInvites(
  sessionId: string,
  options: { cancel?: boolean } = {},
  graph?: RecipientGraph,
): Promise<SessionNotifyResult> {
  const db = getDb();
  const empty: SendOutcome = { recipients: 0, sent: 0, failed: 0, logIds: [] };

  const row = await loadSessionForCalendar(sessionId);
  if (!row) return { ...empty, sequence: 0, skipped: 'not_found' };

  const { session, event } = row;
  if (!session.startsAt || !session.endsAt) {
    return { ...empty, sequence: session.icsSequence, skipped: 'unscheduled' };
  }

  const alreadySent = await inviteAlreadySent(session.icsUid, event.id);
  const sequence = alreadySent ? session.icsSequence + 1 : session.icsSequence;
  if (sequence !== session.icsSequence) {
    await db
      .update(scheduledSession)
      .set({ icsSequence: sequence, updatedAt: new Date() })
      .where(eq(scheduledSession.id, sessionId));
  }

  const calendar = await buildSessionCalendar(sessionId, {
    method: options.cancel ? 'CANCEL' : 'REQUEST',
    sequence,
  });
  if (!calendar) return { ...empty, sequence, skipped: 'unscheduled' };

  const participantIds = session.submissionId
    ? await participantsForSubmission(session.submissionId)
    : [];
  if (participantIds.length === 0) {
    return { ...empty, sequence, skipped: 'no_attendees' };
  }

  const key = options.cancel ? 'session.cancelled' : 'session.invite';
  const outcome: SendOutcome = { recipients: 0, sent: 0, failed: 0, logIds: [] };

  for (const participantId of participantIds) {
    const recipient = await recipientForParticipant(event.id, participantId, graph);
    if (!recipient) continue;
    outcome.recipients += 1;
    const result = await sendTemplated({
      eventId: event.id,
      key,
      recipient,
      extraVars: { 'session.calendarUrl': calendarDownloadUrl(sessionId) },
      ics: calendar.body,
    });
    if (!result) continue;
    outcome.logIds.push(result.id);
    if (result.sent) outcome.sent += 1;
    else outcome.failed += 1;
  }

  return { ...outcome, sequence };
}

/** Reads better at the agenda call site; both go through the same sequence logic. */
export const notifySessionScheduled = (sessionId: string) => sendSessionInvites(sessionId);
export const notifySessionRescheduled = (sessionId: string) => sendSessionInvites(sessionId);
export const notifySessionCancelled = (sessionId: string) =>
  sendSessionInvites(sessionId, { cancel: true });

// ---------------------------------------------------------------------------
// Scheduled jobs — C-7
// ---------------------------------------------------------------------------

export type ReminderRun = {
  taskRemindersSent: number;
  deadlineRemindersSent: number;
  checkedAt: string;
};

/**
 * `C-7`. Each task carries `reminder_days_before` — say `[14, 7, 1]` — which is a cadence, not a
 * schedule: the fire time is `due_at` minus each offset. A run sends at most one reminder per
 * assignment, for the most recent offset that has passed and has not already been covered by
 * `last_reminded_at`.
 *
 * That comparison is what makes the route re-entrant. Cron Triggers guarantee at-least-once
 * delivery, so "run this hourly" must mean "send once per offset", not "send once per run".
 */
export async function runTaskReminders(
  options: { eventId?: string; now?: Date } = {},
): Promise<number> {
  const db = getDb();
  const now = options.now ?? new Date();

  const tasks = await db
    .select()
    .from(task)
    .where(
      options.eventId
        ? and(eq(task.eventId, options.eventId), isNotNull(task.dueAt))
        : isNotNull(task.dueAt),
    );

  let sent = 0;

  for (const row of tasks) {
    const offsets = (row.reminderDaysBefore ?? []).filter((days) => Number.isFinite(days));
    if (offsets.length === 0 || !row.dueAt) continue;

    const fireTimes = offsets
      .map((days) => new Date(row.dueAt!.getTime() - days * 24 * 60 * 60 * 1000))
      .filter((when) => when.getTime() <= now.getTime())
      .sort((a, b) => b.getTime() - a.getTime());

    const fireAt = fireTimes[0];
    if (!fireAt) continue;

    const assignments = await db
      .select({
        id: taskAssignment.id,
        participantId: taskAssignment.participantId,
        lastRemindedAt: taskAssignment.lastRemindedAt,
      })
      .from(taskAssignment)
      .where(
        and(
          eq(taskAssignment.taskId, row.id),
          notInArray(taskAssignment.status, ['completed', 'waived']),
        ),
      );

    for (const assignment of assignments) {
      if (assignment.lastRemindedAt && assignment.lastRemindedAt.getTime() >= fireAt.getTime()) {
        continue;
      }
      const recipient = await recipientForParticipant(row.eventId, assignment.participantId);
      if (!recipient) continue;

      const result = await sendTemplated({
        eventId: row.eventId,
        key: 'task.reminder',
        recipient,
        extraVars: taskReminderVars(row),
      });

      // Stamped even when the template is disabled, so turning reminders back on does not
      // immediately fire the whole backlog at everyone.
      await db
        .update(taskAssignment)
        .set({ lastRemindedAt: now, updatedAt: now })
        .where(eq(taskAssignment.id, assignment.id));

      if (result?.sent) sent += 1;
    }
  }

  return sent;
}

const DEADLINE_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * `C-2`'s draft-deadline reminder. Fires once per submitter per form inside the three days before a
 * form closes; the guard is a lookup in `email_log`, which is the only durable record of a send.
 */
export async function runDraftDeadlineReminders(
  options: { eventId?: string; now?: Date } = {},
): Promise<number> {
  const db = getDb();
  const now = options.now ?? new Date();
  const horizon = new Date(now.getTime() + DEADLINE_WINDOW_MS);

  const forms = await db
    .select()
    .from(form)
    .where(
      and(
        eq(form.status, 'open'),
        isNotNull(form.closesAt),
        gte(form.closesAt, now),
        lte(form.closesAt, horizon),
        ...(options.eventId ? [eq(form.eventId, options.eventId)] : []),
      ),
    );

  let sent = 0;

  for (const row of forms) {
    const drafts = await db
      .select({ submissionId: submission.id, submitterUserId: submission.submitterUserId })
      .from(submission)
      .where(and(eq(submission.formId, row.id), eq(submission.status, 'draft')));

    if (drafts.length === 0) continue;

    const { branding, event } = await loadCommsContext(row.eventId);
    const userIds = [...new Set(drafts.map((draft) => draft.submitterUserId))];
    const people = await db
      .select({ id: user.id, email: user.email, name: user.name })
      .from(user)
      .where(inArray(user.id, userIds));

    for (const person of people) {
      const already = await db
        .select({ id: emailLog.id })
        .from(emailLog)
        .where(
          and(
            eq(emailLog.toEmail, person.email),
            eq(emailLog.templateKey, 'form.deadline'),
            gte(emailLog.createdAt, new Date(now.getTime() - DEADLINE_WINDOW_MS)),
          ),
        )
        .limit(1);
      if (already.length > 0) continue;

      const stored = await getTemplate(row.eventId, 'form.deadline');
      const fallback = DEFAULT_TEMPLATES.find((t) => t.key === 'form.deadline')!;
      if (stored && !stored.enabled) continue;

      const vars: TemplateVars = {
        'event.name': event.name,
        'event.url': branding.eventUrl,
        'speaker.name': person.name ?? person.email,
        'speaker.firstName': (person.name ?? person.email).split(' ')[0],
        'speaker.email': person.email,
        'form.name': row.name,
        'form.closesAt': formatInZone(row.closesAt, event.timezone, false),
        'form.url': `${appUrl()}/submit/${event.slug}/${row.slug}`,
      };

      const message = renderMessage(
        branding,
        stored?.subject ?? fallback.subject,
        stored?.bodyMarkdown ?? fallback.bodyMarkdown,
        vars,
      );
      const result = await sendMail({
        to: person.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        eventId: row.eventId,
        templateKey: 'form.deadline',
      });
      if (result.sent) sent += 1;
    }
  }

  return sent;
}

/**
 * Everything `/api/cron` runs. Safe to call repeatedly; each job carries its own guard.
 *
 * Cron passes no `eventId` because it is the whole deployment's clock. Anything triggered by a
 * person must pass one — otherwise pressing "Run scheduled reminders" mails every event in the
 * database, including events the presser has never heard of.
 */
export async function runScheduledJobs(
  options: { eventId?: string; now?: Date } = {},
): Promise<ReminderRun> {
  const now = options.now ?? new Date();
  const { eventId } = options;
  const taskRemindersSent = await runTaskReminders({ eventId, now });
  const deadlineRemindersSent = await runDraftDeadlineReminders({ eventId, now });
  return {
    taskRemindersSent,
    deadlineRemindersSent,
    checkedAt: now.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// The mailbox — C-5 and T-7a
// ---------------------------------------------------------------------------

export type MailboxEntry = typeof emailLog.$inferSelect;

export async function listMail(options: {
  eventId?: string | null;
  search?: string | null;
  limit?: number;
}): Promise<MailboxEntry[]> {
  const db = getDb();
  const clauses = [];
  if (options.eventId) clauses.push(eq(emailLog.eventId, options.eventId));
  if (options.search) {
    const needle = `%${options.search.toLowerCase()}%`;
    clauses.push(
      sql`(lower(${emailLog.toEmail}) like ${needle} or lower(${emailLog.subject}) like ${needle})`,
    );
  }

  return db
    .select()
    .from(emailLog)
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .orderBy(desc(emailLog.createdAt))
    .limit(options.limit ?? 100);
}

/**
 * The unscoped read, for `/api/mail/:id/ics`. That route serves the same calendar body the public
 * `/api/calendar/:sessionId` already serves to anyone, so the id is a capability URL rather than a
 * hole — but everything rendering *message* content wants `getMail` below.
 */
export async function getMailEntry(id: string): Promise<MailboxEntry | undefined> {
  const db = getDb();
  const [row] = await db.select().from(emailLog).where(eq(emailLog.id, id)).limit(1);
  return row;
}

/** `eventId` is not optional on purpose: a message id in a query string is not an authorisation. */
export async function getMail(eventId: string, id: string): Promise<MailboxEntry | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(emailLog)
    .where(and(eq(emailLog.id, id), eq(emailLog.eventId, eventId)))
    .limit(1);
  return row;
}

/** `C-5`: the "did she get it?" answer, per recipient. */
export async function mailForRecipient(
  eventId: string,
  email: string,
): Promise<MailboxEntry[]> {
  const db = getDb();
  return db
    .select()
    .from(emailLog)
    .where(and(eq(emailLog.eventId, eventId), eq(emailLog.toEmail, email)))
    .orderBy(desc(emailLog.createdAt))
    .limit(50);
}

// ---------------------------------------------------------------------------
// Admin event resolution
// ---------------------------------------------------------------------------

export type AdminEventOption = { id: string; name: string; slug: string };

/** Newest first, which is what a judge who just made an event wants to find at the top. */
export async function listEventsForAdmin(userId: string): Promise<AdminEventOption[]> {
  const rows = await listEventsForUser(userId);
  return rows.map(({ id, name, slug }) => ({ id, name, slug }));
}

/**
 * `/admin/comms` and `/admin/mail` carry no event segment, so the event comes from `?event=`, then
 * from the same cookie the rest of the admin shell reads, then from the caller's newest event. The
 * cookie step is what keeps the mailbox showing the event the sidebar says is selected.
 *
 * Both candidates are matched against the caller's own events rather than looked up directly. These
 * pages have no `requireEventContext` between them and the database, so resolving `?event=` by slug
 * would hand any signed-in organizer another event's mailbox for the price of guessing a slug.
 */
export async function resolveAdminEvent(options: {
  eventParam?: string | null;
  cookieEventId?: string | null;
  userId: string;
}): Promise<{ event: EventRow | null; options: AdminEventOption[] }> {
  const db = getDb();
  const mine = await listEventsForUser(options.userId);
  const all: AdminEventOption[] = mine.map(({ id, name, slug }) => ({ id, name, slug }));

  const pick = (wanted: string | null | undefined) =>
    wanted ? mine.find((entry) => entry.id === wanted || entry.slug === wanted) : undefined;

  const chosen = pick(options.eventParam) ?? pick(options.cookieEventId) ?? pickDefaultEvent(mine);
  if (!chosen) return { event: null, options: all };

  const [row] = await db.select().from(eventTable).where(eq(eventTable.id, chosen.id)).limit(1);
  return { event: row ?? null, options: all };
}

export async function listTracksAndFormats(eventId: string): Promise<{
  tracks: AdminEventOption[];
  formats: AdminEventOption[];
}> {
  const lookups = await loadLookups(eventId);
  return {
    tracks: [...lookups.tracks].map(([id, name]) => ({ id, name, slug: id })),
    formats: [...lookups.formats].map(([id, name]) => ({ id, name, slug: id })),
  };
}

export async function listTasksForEvent(eventId: string): Promise<AdminEventOption[]> {
  const db = getDb();
  const rows = await db
    .select({ id: task.id, name: task.name })
    .from(task)
    .where(eq(task.eventId, eventId))
    .orderBy(task.position);
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.id }));
}
