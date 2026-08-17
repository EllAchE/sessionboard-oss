import { and, desc, eq, gte, inArray, isNotNull, like, lte, notInArray, or, sql } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  emailLog,
  emailTemplate,
  event as eventTable,
  form,
  magicToken,
  membership,
  participant,
  participantRole,
  portalTheme,
  room,
  scheduledSession,
  sessionFormat,
  smsLog,
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
  type CalendarMethod,
} from '../ics';
import { formatRef, hashToken, randomToken } from '../ids';
import { sendMail, type OutgoingIcs } from '../mail';
import { escapeMarkdownText, markdownToText, renderMarkdown } from '../markdown';
import { splitPersonName } from '../person-name';
import { activeSmsTransportName, sendSms } from '../sms';
import { listEventsForUser, pickDefaultEvent } from './events';
import {
  maySendSmsNow,
  phoneVerificationIsCurrent,
  resolveRecipientDelivery,
  type ResolvedDelivery,
} from './notification-preferences';

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
  {
    path: 'event.speakerDeadline',
    description: 'When the speaker roster is meant to be settled (empty when not tracked)',
  },
  {
    path: 'event.agendaDeadline',
    description: 'When the agenda is meant to be settled (empty when not tracked)',
  },
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
  {
    path: 'task.sessions',
    description: 'Sessions this task is still outstanding on, as a markdown list (empty otherwise)',
  },
  { path: 'portal.url', description: 'Speaker portal URL' },
  { path: 'portal.link', description: 'One-click sign-in link into the portal' },
  { path: 'form.name', description: 'Form name (deadline reminders only)' },
  { path: 'form.closesAt', description: 'Form close date (deadline reminders only)' },
  { path: 'form.url', description: 'Public form URL (deadline reminders only)' },
  {
    path: 'organizer.url',
    description: 'Organizer console for the event (milestone reminders only)',
  },
];

const KNOWN_PATHS = new Set(TEMPLATE_VARIABLES.map((entry) => entry.path));

export function renderTemplateText(source: string, vars: TemplateVars): string {
  return source.replace(VARIABLE_PATTERN, (_match, path: string, fallback?: string) => {
    const value = vars[path];
    if (value === undefined || value === null || value === '') return (fallback ?? '').trim();
    return value;
  });
}

const MARKDOWN_FRAGMENT_VARIABLES = new Set(['tasks.list']);
const MARKDOWN_URL_VARIABLES = new Set([
  'event.website',
  'event.url',
  'session.calendarUrl',
  'portal.url',
  'portal.link',
  'form.url',
  'organizer.url',
]);

function renderTemplateMarkdown(source: string, vars: TemplateVars): string {
  return source.replace(VARIABLE_PATTERN, (_match, path: string, fallback?: string) => {
    const value = vars[path];
    if (value === undefined || value === null || value === '') return (fallback ?? '').trim();
    if (MARKDOWN_FRAGMENT_VARIABLES.has(path) || MARKDOWN_URL_VARIABLES.has(path)) return value;
    return escapeMarkdownText(value);
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
  /**
   * `S-16`. One row per assignment, and a `submission`-scoped task has one assignment per accepted
   * session — so a speaker with three talks holds this task three times over. The session each
   * outstanding copy is about, so the difference between them can be said out loud instead of
   * printing the same line three times.
   */
  submissionTitle: string | null;
};

export type Recipient = {
  participantId: string;
  userId: string;
  email: string;
  phone: string | null;
  notifyEmail: boolean;
  notifySms: boolean;
  phoneVerified?: boolean;
  timezone?: string | null;
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
      phone: user.phone,
      notifyEmail: user.notifyEmail,
      notifySms: user.notifySms,
      phoneVerifiedAt: user.phoneVerifiedAt,
      phoneVerificationTransport: user.phoneVerificationTransport,
      userName: user.name,
      /** `F-6`. The real column, so `speaker.firstName` stops guessing at a string. */
      userFirstName: user.firstName,
      displayName: participant.displayName,
      company: participant.company,
      jobTitle: participant.jobTitle,
      pronouns: participant.pronouns,
      timezone: participant.timezone,
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
      submissionId: taskAssignment.submissionId,
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

  const titleBySubmission = new Map<string, string>();
  for (const row of submissionRows) titleBySubmission.set(row.id, row.title);

  const tasksByParticipant = new Map<string, RecipientTask[]>();
  for (const row of taskRows) {
    if (spec.kind === 'outstanding_tasks' && spec.taskId && row.taskId !== spec.taskId) continue;
    const list = tasksByParticipant.get(row.participantId) ?? [];
    list.push({
      taskId: row.taskId,
      name: row.name,
      dueAt: row.dueAt,
      submissionTitle: row.submissionId ? (titleBySubmission.get(row.submissionId) ?? null) : null,
    });
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
      phone: person.phone,
      notifyEmail: person.notifyEmail,
      notifySms: person.notifySms,
      phoneVerified: phoneVerificationIsCurrent(person, activeSmsTransportName()),
      timezone: person.timezone,
      name,
      submissions,
      openTasks,
      sessionId: session?.id ?? null,
      vars: buildVars({
        event,
        branding,
        lookups,
        person: { ...person, name, firstName: person.userFirstName },
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

/**
 * `F-6`. `speaker.firstName` opens most of the templates in this file, and it used to be
 * `name.split(' ')[0]` — which is not the first name of "Marcus Tullius Cicero", of anyone with a
 * two-word given name, or of anyone whose display name is a company. `user.first_name` is a real
 * column now and it is what the speaker typed into their own profile, so it wins outright.
 *
 * The fallback is the same one `getProfileName` gives the portal: an account imported before the
 * split has no halves, and `splitPersonName` derives them from the one string it does have. Two
 * surfaces guessing at the same missing value by two different rules is how a greeting and a profile
 * page end up disagreeing about somebody's name.
 */
export function speakerFirstName(
  firstName: string | null | undefined,
  displayName: string,
): string {
  return firstName?.trim() || splitPersonName(displayName).firstName || displayName;
}

function buildVars(input: {
  event: EventRow;
  branding: EmailBranding;
  lookups: Lookups;
  person: {
    name: string;
    firstName: string | null;
    email: string;
    company: string | null;
    jobTitle: string | null;
    pronouns: string | null;
  };
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
    /**
     * `AR-50`. Available to every template rather than only to the milestone reminders below, because
     * the one email a speaker is most likely to read — their acceptance — is also the best place to
     * tell them when the programme firms up. Empty when the edition does not track it, which
     * `{{event.agendaDeadline|soon}}` turns into whatever the organizer would rather say.
     */
    'event.speakerDeadline': formatInZone(event.speakerDeadlineAt, zone, false),
    'event.agendaDeadline': formatInZone(event.agendaDeadlineAt, zone, false),

    'speaker.name': person.name,
    'speaker.firstName': speakerFirstName(person.firstName, person.name),
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
    /**
     * One line per assignment, and on a `submission`-scoped task that is one line per session. The
     * session has to be named or the list reads as the same task repeated — which is what the
     * reader would be looking at, with no way to tell which slides are still missing.
     */
    'tasks.list': sortedTasks
      .map(
        (t) =>
          `- ${t.name}${t.submissionTitle ? ` (${t.submissionTitle})` : ''}` +
          `${t.dueAt ? ` — due ${formatInZone(t.dueAt, zone, false)}` : ''}`,
      )
      .join('\n'),
    'tasks.next': sortedTasks[0]?.name ?? '',

    ...taskReminderVars(selectedTask, outstandingSessions(openTasks, selectedTask?.taskId ?? null)),

    'portal.url': `${appUrl()}/portal`,
  };
}

/**
 * Every session this person still owes `taskId` on, in the order the assignments came back. Empty on
 * a `contact`-scoped task, which is about the person rather than about any session.
 */
export function outstandingSessions(
  openTasks: readonly RecipientTask[],
  taskId: string | null,
): string[] {
  if (!taskId) return [];
  const titles = new Set<string>();
  for (const entry of openTasks) {
    if (entry.taskId !== taskId || !entry.submissionTitle) continue;
    titles.add(entry.submissionTitle);
  }
  return [...titles];
}

function taskReminderVars(
  selectedTask: Pick<RecipientTask, 'name' | 'dueAt'> | null,
  sessions: readonly string[] = [],
): TemplateVars {
  return {
    'task.name': selectedTask?.name ?? '',
    'task.dueAt': selectedTask?.dueAt
      ? ` and due ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'UTC' }).format(selectedTask.dueAt)}`
      : '',
    /**
     * Carries its own connective prose and is empty when there is nothing to say, the same shape as
     * `task.dueAt` — so one template reads correctly whether the task is owed once by a person or
     * once per session. This is what lets a `submission`-scoped reminder be *one* email.
     */
    'task.sessions': sessions.length
      ? `\n\nIt applies to:\n\n${sessions.map((title) => `- ${title}`).join('\n')}`
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
 *
 * **Every template carries its own `smsBody`.** Without one, SMS falls back to the email body with
 * markdown stripped and a hard cut at `SMS_MAX_LENGTH` — which reads as a mangled email, not as a
 * text message. Three rules apply to that copy, and `comms.test.ts` enforces all three:
 *
 * 1. **GSM-7 characters only.** One curly quote, en dash or ellipsis flips the whole message to
 *    UCS-2, which takes the segment size from 153 characters to 67 — a 300-character message goes
 *    from two segments to five, so a single character costs 2.5x on every send. Straight quotes,
 *    plain hyphens, three periods.
 * 2. **Comfortably under the 300-character cap**, which is itself exactly two GSM-7 segments. The
 *    copy below stays under 285 even with a 51-character event name, a 63-character title and a
 *    91-character URL, so nothing truncates and nothing spills into a third segment.
 * 3. **Only merge fields the template is actually given.** An SMS has no subject and no thread, so
 *    each one names the event, says what happened, and points at the same destination as its email.
 *    `form.deadline` is built from its own narrow `vars` map in `runDraftDeadlineReminders`, not
 *    from `buildVars`, so it may only use the event, speaker and form fields.
 *
 * The shipped SMS copy deliberately uses `{{portal.url}}` where the email writes
 * `{{portal.link}}`. Custom SMS templates may now request the one-click link, and the SMS mailbox
 * gates it like the mail archive, but the plain URL keeps the default archive credential-free as
 * defence in depth. See `app/organizer/sms/magic-links.ts`.
 */
export const DEFAULT_TEMPLATES: Array<{
  key: string;
  name: string;
  subject: string;
  bodyMarkdown: string;
  smsBody?: string;
  attachIcs?: boolean;
}> = [
  {
    key: 'submission.confirmation',
    name: 'Submission received',
    subject: 'We received "{{submission.title}}"',
    smsBody:
      '{{event.name}}: we received "{{submission.title}}" ({{submission.ref}}). Portal: {{portal.url}}',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'We received **{{submission.title}}** ({{submission.ref}}) for {{event.name}}.',
      '',
      '[Open your speaker portal]({{portal.link}})',
      '',
      'We will be in touch after review.',
    ].join('\n'),
  },
  {
    key: 'submission.accepted',
    name: 'Submission accepted',
    subject: 'Your talk was accepted for {{event.name}}',
    smsBody:
      '{{event.name}}: "{{submission.title}}" is accepted. Next steps: {{portal.url}}',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      '**{{submission.title}}** ({{submission.ref}}) is accepted for {{event.name}}.',
      '',
      '{{submission.decisionNote}}',
      '',
      '{{tasks.list}}',
      '',
      '[Open your speaker portal]({{portal.link}})',
    ].join('\n'),
  },
  {
    key: 'submission.waitlisted',
    name: 'Submission waitlisted',
    subject: 'Your {{event.name}} submission is on the waitlist',
    smsBody:
      '{{event.name}}: "{{submission.title}}" is waitlisted. We will send an update. {{portal.url}}',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      '**{{submission.title}}** ({{submission.ref}}) is on the waitlist for {{event.name}}.',
      '',
      '{{submission.decisionNote}}',
      '',
      'We will send an update when its status changes.',
      '',
      '[Open your speaker portal]({{portal.link}})',
    ].join('\n'),
  },
  {
    key: 'submission.declined',
    name: 'Submission declined',
    subject: 'An update on your {{event.name}} submission',
    // No link: the decline email has none either, and there is nothing for the speaker to do.
    smsBody:
      '{{event.name}}: we cannot include "{{submission.title}}" this year. Thank you for submitting.',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'We cannot include **{{submission.title}}** in the {{event.name}} programme this year.',
      '',
      '{{submission.decisionNote}}',
      '',
      'Thank you for submitting.',
    ].join('\n'),
  },
  {
    key: 'session.invite',
    name: 'Calendar invitation',
    subject: '{{session.title}} — {{session.startsAt}}',
    attachIcs: true,
    // An SMS cannot carry the .ics part, so the add-to-calendar download (`C-3a`) is the link here.
    smsBody:
      '{{event.name}}: "{{session.title}}" is scheduled for {{session.startsAt}}. Calendar: {{session.calendarUrl}}',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'Your {{event.name}} session is scheduled. A calendar invitation is attached.',
      '',
      '- **Session:** {{session.title}} ({{session.ref}})',
      '- **Starts:** {{session.startsAt}}',
      '- **Ends:** {{session.endsAt}}',
      '- **Room:** {{session.room|to be confirmed}}',
      '- **Track:** {{session.track|—}}',
      '',
      '[Download the calendar invite]({{session.calendarUrl}})',
    ].join('\n'),
  },
  {
    key: 'session.cancelled',
    name: 'Session cancelled',
    subject: 'Cancelled: {{session.title}}',
    attachIcs: true,
    // "Reply to this email" does not translate: an SMS reply lands at the provider, not the
    // organizer, so the cancellation names the support address instead.
    smsBody:
      '{{event.name}}: "{{session.title}}" ({{session.ref}}) is cancelled. Contact {{event.supportEmail|the programme team}} with questions.',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      '**{{session.title}}** ({{session.ref}}) is cancelled. The calendar entry has been withdrawn.',
      '',
      'If this is unexpected, please reply to this email.',
    ].join('\n'),
  },
  {
    key: 'task.reminder',
    name: 'Task reminder',
    subject: 'Reminder: {{task.name}} for {{event.name}}',
    // `{{tasks.list}}` is a multi-line markdown list, so it is deliberately not here: over SMS it
    // collapses to one run-on line of unbounded length. One task and one link is the whole message.
    smsBody:
      '{{event.name}}: {{task.name}} is outstanding{{task.dueAt}}. {{portal.url}}',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'Reminder: **{{task.name}}** is outstanding{{task.dueAt| }}.{{task.sessions}}',
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
    // `runDraftDeadlineReminders` builds its own `vars`: event, speaker and form fields only.
    smsBody:
      '{{event.name}}: your draft is not submitted. {{form.name}} closes {{form.closesAt}}. {{form.url}}',
    bodyMarkdown: [
      'Hi {{speaker.firstName|there}},',
      '',
      'Your **{{event.name}}** draft is not submitted. {{form.name}} closes {{form.closesAt}}.',
      '',
      '[Finish your submission]({{form.url}})',
    ].join('\n'),
  },
  /*
   * `AR-50`. These two go to organizers, not speakers, which is why they say "your" about the work
   * rather than about a submission and point at the organizer surfaces. Both are built from the
   * narrow `vars` map in `runEventDeadlineReminders`, so like `form.deadline` above they may only
   * use the event fields — there is no speaker or submission in scope.
   *
   * Neither says anything is late or blocked. Nothing is: the milestone passing changes no
   * behaviour anywhere in the product, and copy implying otherwise would be a lie the schema
   * does not back up.
   */
  {
    key: 'deadline.speakers',
    name: 'Speaker roster milestone',
    subject: 'Your {{event.name}} speaker roster date is {{event.speakerDeadline}}',
    smsBody:
      '{{event.name}}: your speaker roster date is {{event.speakerDeadline}}. Review: {{organizer.url}}',
    bodyMarkdown: [
      'The date you set for the **{{event.name}}** speaker roster is {{event.speakerDeadline}}.',
      '',
      'This is a reminder, not a cutoff — nothing locks and you can still accept, decline or swap a',
      'speaker afterwards.',
      '',
      '[Review the speakers]({{organizer.url}})',
    ].join('\n'),
  },
  {
    key: 'deadline.agenda',
    name: 'Agenda milestone',
    subject: 'Your {{event.name}} agenda date is {{event.agendaDeadline}}',
    smsBody:
      '{{event.name}}: your agenda date is {{event.agendaDeadline}}. Review: {{organizer.url}}',
    bodyMarkdown: [
      'The date you set for the **{{event.name}}** agenda is {{event.agendaDeadline}}.',
      '',
      'This is a reminder, not a cutoff — nothing locks and you can still move a session afterwards.',
      '',
      '[Open the agenda]({{organizer.url}})',
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
      smsBody: template.smsBody ?? null,
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
  smsBody?: string | null;
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
      smsBody: input.smsBody?.trim() || null,
      enabled: input.enabled ?? true,
      attachIcs: input.attachIcs ?? false,
    })
    .onConflictDoUpdate({
      target: [emailTemplate.eventId, emailTemplate.key],
      set: {
        name: input.name.trim() || input.key.trim(),
        subject: input.subject,
        bodyMarkdown: input.bodyMarkdown,
        smsBody: input.smsBody?.trim() || null,
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
  const renderedBody = renderTemplateMarkdown(bodyMarkdown, vars);
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

/**
 * Any channel may request the one-click portal credential. The SMS path was deliberately omitted
 * until its archive gained the same read-time gate as `/organizer/mail`; keeping the test in one helper
 * prevents a future send path from silently rendering `{{portal.link}}` as an empty string again.
 */
const PORTAL_LINK_PATTERN = /\{\{\s*portal\.link/;

export function requestsPortalLink(...sources: Array<string | null | undefined>): boolean {
  return sources.some((source) => Boolean(source && PORTAL_LINK_PATTERN.test(source)));
}

async function withPortalLink(
  recipient: Recipient,
  eventId: string,
  subject: string,
  body: string,
  smsBody?: string | null,
): Promise<TemplateVars> {
  if (!requestsPortalLink(subject, body, smsBody)) {
    return recipient.vars;
  }
  return { ...recipient.vars, 'portal.link': await mintPortalLink(recipient.userId, eventId) };
}

/** Strips the markdown syntax a `bodyMarkdown` fallback carries, for a recipient with no `smsBody` override. */
function stripMarkdownForSms(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[#*_`>~]/g, '')
    .replace(/^-\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Two GSM-7 segments (153 characters each once concatenated). The shipped `smsBody` copy sits well
 * inside it; the truncation below only ever bites a hand-written body or the markdown fallback.
 */
export const SMS_MAX_LENGTH = 300;

/**
 * Three periods, not `…`. The ellipsis character is outside GSM-7, so appending it would re-encode
 * the whole message as UCS-2 and turn a two-segment text into five.
 */
const SMS_TRUNCATION_MARKER = '...';

/**
 * `smsBody` renders like the email body (merge fields, no markdown); with no override, SMS falls
 * back to a stripped, truncated read of the email's own markdown so every template works over SMS
 * without an organizer having to write a second copy.
 */
export function renderSmsText(
  smsBodyTemplate: string | null | undefined,
  fallbackBodyMarkdown: string,
  vars: TemplateVars,
): string {
  const source = smsBodyTemplate?.trim()
    ? smsBodyTemplate
    : stripMarkdownForSms(fallbackBodyMarkdown);
  const rendered = renderTemplateText(source, vars).replace(/\s+/g, ' ').trim();
  return rendered.length > SMS_MAX_LENGTH
    ? `${rendered.slice(0, SMS_MAX_LENGTH - SMS_TRUNCATION_MARKER.length)}${SMS_TRUNCATION_MARKER}`
    : rendered;
}

export type SendOutcome = {
  recipients: number;
  sent: number;
  failed: number;
  sentEmail: number;
  sentSms: number;
  logIds: string[];
};

/** `auto` respects each recipient's stored preference; `email`/`sms` forces that one channel. */
export type ChannelSelection = 'auto' | 'email' | 'sms';

type DispatchResult = {
  emailId: string | null;
  emailSent: boolean;
  smsId: string | null;
  smsSent: boolean;
} | null;

/** Folds one recipient's dispatch result into a running `SendOutcome` — shared by every send path. */
function applyDispatch(outcome: SendOutcome, result: DispatchResult): void {
  if (!result) return;
  if (result.emailId) {
    outcome.logIds.push(result.emailId);
    if (result.emailSent) outcome.sentEmail += 1;
  }
  if (result.smsId) {
    outcome.logIds.push(result.smsId);
    if (result.smsSent) outcome.sentSms += 1;
  }
  if (result.emailId || result.smsId) {
    if (result.emailSent || result.smsSent) outcome.sent += 1;
    else outcome.failed += 1;
  }
}

function wantsChannel(
  channel: ChannelSelection,
  forced: 'email' | 'sms',
  preferred: boolean,
  hasContact: boolean,
): boolean {
  if (!hasContact) return false;
  // A channel selector chooses among channels the recipient allowed; it never overrides opt-outs.
  if (!preferred) return false;
  if (channel === 'auto') return preferred;
  return channel === forced;
}

async function recipientDelivery(
  recipient: Recipient,
  eventId: string,
  templateKey: string,
): Promise<ResolvedDelivery> {
  return resolveRecipientDelivery({
    userId: recipient.userId,
    eventId,
    templateKey,
    baseEmail: recipient.notifyEmail,
    baseSms: recipient.notifySms,
    phoneVerified: Boolean(recipient.phoneVerified),
    participantTimezone: recipient.timezone,
  });
}


export type CampaignInput = {
  eventId: string;
  subject: string;
  bodyMarkdown: string;
  audience: AudienceSpec;
  templateKey?: string | null;
  /** `C-3`: attach the calendar invite for each recipient's scheduled session, where they have one. */
  attachIcs?: boolean;
  /** `auto` follows preferences; `sms` selects opted-in recipients and never overrides an opt-out. */
  channel?: ChannelSelection;
  smsBody?: string | null;
};

/** `C-4`. One message per recipient, resolved and branded per person, logged either way. */
export async function sendCampaign(input: CampaignInput): Promise<SendOutcome> {
  const { branding, event } = await loadCommsContext(input.eventId);
  const recipients = await resolveRecipients(input.eventId, input.audience);
  const channel = input.channel ?? 'auto';

  const outcome: SendOutcome = {
    recipients: recipients.length,
    sent: 0,
    failed: 0,
    sentEmail: 0,
    sentSms: 0,
    logIds: [],
  };

  for (const recipient of recipients) {
    const templateKey = input.templateKey ?? 'adhoc';
    const delivery = await recipientDelivery(recipient, event.id, templateKey);
    const vars = await withPortalLink(
      recipient,
      input.eventId,
      input.subject,
      input.bodyMarkdown,
      input.smsBody,
    );
    const rendered = renderMessage(branding, input.subject, input.bodyMarkdown, vars);
    // PUBLISH, not REQUEST. An ad-hoc send does not know whether it is a revision, and a REQUEST at
    // a sequence the speaker's calendar already holds is discarded as a duplicate — silently
    // undoing the invite. Real invitations go through `sendSessionInvites`, which owns the bump.
    const calendar =
      input.attachIcs && recipient.sessionId
        ? await buildSessionCalendar(recipient.sessionId, { method: 'PUBLISH' })
        : null;
    const ics: OutgoingIcs | undefined = calendar
      ? { body: calendar.body, method: calendar.method }
      : undefined;

    let emailId: string | null = null;
    let emailSent = false;
    if (wantsChannel(channel, 'email', delivery.notifyEmail, Boolean(recipient.email))) {
      const message = rendered;
      const result = await sendMail({
        to: recipient.email,
        subject: message.subject,
        html: message.html,
        text: message.text,
        eventId: event.id,
        templateKey,
        ics,
      });
      emailId = result.id;
      emailSent = result.sent;
    }

    let smsId: string | null = null;
    let smsSent = false;
    if (
      wantsChannel(channel, 'sms', delivery.notifySms, Boolean(recipient.phone)) &&
      (await maySendSmsNow(recipient.phone!, delivery))
    ) {
      const smsText = renderSmsText(input.smsBody, input.bodyMarkdown, vars);
      const result = await sendSms({
        to: recipient.phone!,
        body: smsText,
        eventId: event.id,
        templateKey,
      });
      smsId = result.id;
      smsSent = result.sent;
    }

    applyDispatch(outcome, emailId || smsId ? { emailId, emailSent, smsId, smsSent } : null);
  }

  return outcome;
}

export type PreviewResult = {
  recipient: Recipient | null;
  audienceSize: number;
  message: RenderedMessage | null;
  smsPreview: string | null;
  channelCounts: { email: number; sms: number; none: number };
  unknown: string[];
};

export type ParticipantEmailPreview = {
  recipient: Pick<Recipient, 'participantId' | 'userId' | 'email' | 'name' | 'notifyEmail'>;
  message: RenderedMessage;
  unknown: string[];
  /** A real credential is minted only during dispatch, never while an agent is previewing copy. */
  dynamicFields: string[];
};

async function requireParticipantEmailRecipient(
  eventId: string,
  participantId: string,
): Promise<Recipient> {
  const [recipient] = await resolveRecipients(eventId, {
    kind: 'manual',
    participantIds: [participantId],
  });
  if (!recipient) throw notFound('Recipient');
  if (!recipient.notifyEmail) {
    throw invalid('That recipient has email notifications disabled');
  }
  if (!recipient.email) throw invalid('That recipient does not have an email address');
  return recipient;
}

/**
 * The event-scoped, email-only boundary used by agent mail.
 *
 * It deliberately does not call `previewCampaign(..., { channel: 'email' })`: a forced organizer
 * campaign may override the email preference, while an autonomous sender must fail closed when the
 * person has disabled email. The target is a participant id already associated with the event, not
 * an address supplied by the caller, so this cannot become an arbitrary-address relay.
 */
export async function previewParticipantEmail(input: {
  eventId: string;
  participantId: string;
  subject: string;
  bodyMarkdown: string;
}): Promise<ParticipantEmailPreview> {
  const [{ branding }, recipient] = await Promise.all([
    loadCommsContext(input.eventId),
    requireParticipantEmailRecipient(input.eventId, input.participantId),
  ]);
  const requestsCredential = requestsPortalLink(input.subject, input.bodyMarkdown, null);
  const vars = {
    ...recipient.vars,
    // Never mint a live sign-in token for an agent preview. The source and rendered copy are bound
    // into the confirmation digest; the credential itself is filled only inside the send boundary.
    'portal.link': `${appUrl()}/portal`,
  };
  return {
    recipient: {
      participantId: recipient.participantId,
      userId: recipient.userId,
      email: recipient.email,
      name: recipient.name,
      notifyEmail: recipient.notifyEmail,
    },
    message: renderMessage(branding, input.subject, input.bodyMarkdown, vars),
    unknown: [
      ...unknownVariables(input.subject),
      ...unknownVariables(input.bodyMarkdown),
    ].filter((path, index, all) => all.indexOf(path) === index),
    dynamicFields: requestsCredential ? ['portal.link'] : [],
  };
}

/**
 * Dispatches one confirmed agent message through the ordinary mail boundary. `sendMail` owns the
 * audit row, transport selection, and live-transport magic-link redaction. The participant and
 * preference are resolved again here so a stale preview cannot send after either has changed.
 */
export async function sendParticipantEmail(input: {
  eventId: string;
  participantId: string;
  subject: string;
  bodyMarkdown: string;
  templateKey: string;
  expectedRecipientEmail: string;
  expectedPreviewSubject: string;
  expectedPreviewBodyText: string;
}): Promise<{
  recipient: Pick<Recipient, 'participantId' | 'email' | 'name'>;
  message: Pick<RenderedMessage, 'subject' | 'text'>;
  logId: string;
  sent: boolean;
}> {
  const [{ branding, event }, recipient] = await Promise.all([
    loadCommsContext(input.eventId),
    requireParticipantEmailRecipient(input.eventId, input.participantId),
  ]);
  const previewMessage = renderMessage(branding, input.subject, input.bodyMarkdown, {
    ...recipient.vars,
    'portal.link': `${appUrl()}/portal`,
  });
  if (
    recipient.email !== input.expectedRecipientEmail ||
    previewMessage.subject !== input.expectedPreviewSubject ||
    previewMessage.text !== input.expectedPreviewBodyText
  ) {
    throw invalid('The recipient or rendered message changed after confirmation; preview it again');
  }
  const vars = await withPortalLink(
    recipient,
    input.eventId,
    input.subject,
    input.bodyMarkdown,
    null,
  );
  const message = renderMessage(branding, input.subject, input.bodyMarkdown, vars);
  const result = await sendMail({
    to: recipient.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
    eventId: event.id,
    templateKey: input.templateKey,
  });
  return {
    recipient: {
      participantId: recipient.participantId,
      email: recipient.email,
      name: recipient.name,
    },
    message: { subject: message.subject, text: message.text },
    logId: result.id,
    sent: result.sent,
  };
}

/** Preview renders against a *real* recipient, so an empty merge field is visible before send. */
export async function previewCampaign(input: {
  eventId: string;
  subject: string;
  bodyMarkdown: string;
  audience: AudienceSpec;
  participantId?: string | null;
  channel?: ChannelSelection;
  smsBody?: string | null;
}): Promise<PreviewResult> {
  const { branding } = await loadCommsContext(input.eventId);
  const recipients = await resolveRecipients(input.eventId, input.audience);
  const channel = input.channel ?? 'auto';
  const recipient =
    recipients.find((row) => row.participantId === input.participantId) ?? recipients[0] ?? null;

  const unknown = [
    ...unknownVariables(input.subject),
    ...unknownVariables(input.bodyMarkdown),
    ...unknownVariables(input.smsBody ?? ''),
  ].filter((path, index, all) => all.indexOf(path) === index);

  const channelCounts = { email: 0, sms: 0, none: 0 };
  for (const row of recipients) {
    const delivery = await recipientDelivery(row, input.eventId, 'adhoc');
    const wantEmail = wantsChannel(channel, 'email', delivery.notifyEmail, Boolean(row.email));
    const wantSms = wantsChannel(channel, 'sms', delivery.notifySms, Boolean(row.phone));
    if (wantEmail) channelCounts.email += 1;
    if (wantSms) channelCounts.sms += 1;
    if (!wantEmail && !wantSms) channelCounts.none += 1;
  }

  if (!recipient) {
    return { recipient: null, audienceSize: 0, message: null, smsPreview: null, channelCounts, unknown };
  }

  // Never mint a live sign-in token for a preview.
  const vars = { ...recipient.vars, 'portal.link': `${appUrl()}/portal` };
  return {
    recipient,
    audienceSize: recipients.length,
    message: renderMessage(branding, input.subject, input.bodyMarkdown, vars),
    smsPreview: renderSmsText(input.smsBody, input.bodyMarkdown, vars),
    channelCounts,
    unknown,
  };
}

/**
 * The automatic path (`C-2`). Looks the event's template up by key, falls back to the shipped copy,
 * and honours `enabled` so an organizer can turn one off without deleting it.
 */
/** Triggered sends always respect the recipient's stored `notifyEmail`/`notifySms` preference. */
async function sendTemplated(input: {
  eventId: string;
  key: string;
  recipient: Recipient;
  extraVars?: TemplateVars;
  ics?: OutgoingIcs;
}): Promise<DispatchResult> {
  const { branding, event } = await loadCommsContext(input.eventId);
  const stored = await getTemplate(input.eventId, input.key);
  if (stored && !stored.enabled) return null;

  const fallback = DEFAULT_TEMPLATES.find((template) => template.key === input.key);
  const subject = stored?.subject ?? fallback?.subject;
  const body = stored?.bodyMarkdown ?? fallback?.bodyMarkdown;
  if (!subject || !body) throw notFound(`Template ${input.key}`);
  const smsBodyTemplate = stored?.smsBody ?? fallback?.smsBody ?? null;

  const base = { ...input.recipient.vars, ...(input.extraVars ?? {}) };
  const withLink = requestsPortalLink(subject, body, smsBodyTemplate)
    ? { ...base, 'portal.link': await mintPortalLink(input.recipient.userId, input.eventId) }
    : base;
  const delivery = await recipientDelivery(input.recipient, input.eventId, input.key);

  let emailId: string | null = null;
  let emailSent = false;
  if (delivery.notifyEmail && input.recipient.email) {
    const message = renderMessage(branding, subject, body, withLink);
    const result = await sendMail({
      to: input.recipient.email,
      subject: message.subject,
      html: message.html,
      text: message.text,
      eventId: event.id,
      templateKey: input.key,
      ics: input.ics,
    });
    emailId = result.id;
    emailSent = result.sent;
  }

  let smsId: string | null = null;
  let smsSent = false;
  if (
    input.recipient.phone &&
    (await maySendSmsNow(input.recipient.phone, delivery))
  ) {
    const result = await sendSms({
      to: input.recipient.phone,
      body: renderSmsText(smsBodyTemplate, body, withLink),
      eventId: event.id,
      templateKey: input.key,
    });
    smsId = result.id;
    smsSent = result.sent;
  }

  if (!emailId && !smsId) return null;
  return { emailId, emailSent, smsId, smsSent };
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
  return fanOutSubmissionTemplate(row, 'submission.confirmation');
}

/**
 * Every submission status that is a *decision* the speaker is owed an email about, and the template
 * that carries it. A waitlist is a decision too: it is the one a speaker is most likely to be left
 * guessing about, since nothing else in the product tells them their proposal is still alive.
 */
export const DECISION_TEMPLATES: Record<string, string> = {
  accepted: 'submission.accepted',
  waitlisted: 'submission.waitlisted',
  declined: 'submission.declined',
};

/** `V-2` decisions. Picks the template from the submission's own status. */
export async function sendDecisionNotice(submissionId: string): Promise<SendOutcome> {
  const row = await loadSubmission(submissionId);
  const key = DECISION_TEMPLATES[row.status];
  if (!key) {
    throw invalid('Only an accepted, waitlisted or declined submission has a decision to send');
  }
  return fanOutSubmissionTemplate(row, key);
}

async function fanOutSubmissionTemplate(
  row: typeof submission.$inferSelect,
  key: string,
): Promise<SendOutcome> {
  const participantIds = await participantsForSubmission(row.id);
  const submissionVars: TemplateVars = {
    'submission.title': row.title,
    'submission.ref': formatRef('submission', row.ref),
    'submission.status': row.status,
    'submission.decisionNote': row.decisionNote ?? '',
  };
  const outcome: SendOutcome = {
    recipients: 0,
    sent: 0,
    failed: 0,
    sentEmail: 0,
    sentSms: 0,
    logIds: [],
  };

  for (const participantId of participantIds) {
    const recipient = await recipientForParticipant(row.eventId, participantId);
    if (!recipient) continue;
    outcome.recipients += 1;
    applyDispatch(
      outcome,
      await sendTemplated({
        eventId: row.eventId,
        key,
        recipient,
        extraVars: submissionVars,
      }),
    );
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
  /**
   * Travels with the body all the way to the MIME part. The transports stamp
   * `text/calendar; method=…` from it, and a cancellation delivered under `REQUEST` re-invites the
   * speaker to the session it was meant to withdraw.
   */
  method: CalendarMethod;
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
    method,
    filename: icsFilename(session.title),
    uid: session.icsUid,
    sequence,
  };
}

/**
 * `C-3a`. Served by `app/api/calendar/[sessionId]/route.ts`, linked from acceptance mail, the
 * itinerary widget, and the speaker portal.
 */
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
  const empty: SendOutcome = {
    recipients: 0,
    sent: 0,
    failed: 0,
    sentEmail: 0,
    sentSms: 0,
    logIds: [],
  };

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
  const outcome: SendOutcome = {
    recipients: 0,
    sent: 0,
    failed: 0,
    sentEmail: 0,
    sentSms: 0,
    logIds: [],
  };

  for (const participantId of participantIds) {
    const recipient = await recipientForParticipant(event.id, participantId, graph);
    if (!recipient) continue;
    outcome.recipients += 1;
    applyDispatch(
      outcome,
      await sendTemplated({
        eventId: event.id,
        key,
        recipient,
        extraVars: { 'session.calendarUrl': calendarDownloadUrl(sessionId) },
        ics: { body: calendar.body, method: calendar.method },
      }),
    );
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
  /** `AR-50`. The event's own milestones, counted apart from the form deadlines above. */
  eventDeadlineRemindersSent: number;
  checkedAt: string;
};

/**
 * `C-7`. A task can carry two independent reminder rules:
 *
 * - `reminder_days_before` — say `[14, 7, 1]` — fires relative to `due_at`.
 * - `reminder_days_after_send` follows up that many days after the most recent task reminder or
 *   nudge. It has no first-send behavior of its own: without `last_reminded_at`, there is nothing to
 *   follow up.
 *
 * A run sends at most one reminder per **person per task**, when either rule is due. A dispatch
 * attempt becomes the next after-send anchor through `last_reminded_at`.
 *
 * That comparison is what makes the route re-entrant. Cron Triggers guarantee at-least-once
 * delivery, so "run this hourly" must mean "send once per offset", not "send once per run".
 *
 * ## Per person, not per assignment
 *
 * `S-16` made one task able to hold several assignment rows for the same person — a
 * `submission`-scoped task is owed once per accepted session, which is the whole point of the scope.
 * Fanning the reminder out over those rows, which is what this did, put three emails in a
 * three-talk speaker's inbox on the same morning, and every var in `task.reminder` is a fact about
 * the *person* — `task.name`, `task.dueAt`, `tasks.list`, `portal.link` — so the three were
 * byte-identical. Nothing in them said which session each was about, because nothing in them could.
 *
 * So the rows are grouped by participant and one reminder goes out naming every session still
 * outstanding, through `{{task.sessions}}`. Nothing is lost: the speaker learns about all three
 * talks in one email instead of one talk in none of three. Every row in the group is stamped, so the
 * cadence stays per-assignment even though the mail is per-person, and a row completed between runs
 * simply drops out of the next group.
 *
 * The campaign path already worked this way — `resolveRecipients` returns one recipient per person —
 * which is the other reason this was a defect rather than a design: the same task reminded twice by
 * two routes did not send the same number of emails.
 */
export async function runTaskReminders(
  options: { eventId?: string; now?: Date } = {},
): Promise<number> {
  const db = getDb();
  const now = options.now ?? new Date();

  const tasksWithReminderCadence = or(
    isNotNull(task.dueAt),
    isNotNull(task.reminderDaysAfterSend),
  );
  const tasks = await db
    .select()
    .from(task)
    .where(
      options.eventId
        ? and(eq(task.eventId, options.eventId), tasksWithReminderCadence)
        : tasksWithReminderCadence,
    );

  let sent = 0;

  for (const row of tasks) {
    const offsets = (row.reminderDaysBefore ?? []).filter(
      (days) => Number.isInteger(days) && days > 0,
    );
    const dueAt = row.dueAt;
    const deadlineFireAt = dueAt
      ? (offsets
          .map((days) => new Date(dueAt.getTime() - days * 24 * 60 * 60 * 1000))
          .filter((when) => when.getTime() <= now.getTime())
          .sort((a, b) => b.getTime() - a.getTime())[0] ?? null)
      : null;
    const configuredAfterSendDays = row.reminderDaysAfterSend;
    const afterSendDays =
      typeof configuredAfterSendDays === 'number' &&
      Number.isInteger(configuredAfterSendDays) &&
      configuredAfterSendDays > 0
        ? configuredAfterSendDays
        : null;
    if (!deadlineFireAt && !afterSendDays) continue;

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

    const byParticipant = new Map<
      string,
      Array<{ id: string; lastRemindedAt: Date | null }>
    >();
    for (const assignment of assignments) {
      const group = byParticipant.get(assignment.participantId) ?? [];
      group.push({ id: assignment.id, lastRemindedAt: assignment.lastRemindedAt });
      byParticipant.set(assignment.participantId, group);
    }

    for (const [participantId, participantAssignments] of byParticipant) {
      const due = participantAssignments.some((assignment) => {
        const deadlineDue = Boolean(
          deadlineFireAt &&
            (!assignment.lastRemindedAt ||
              assignment.lastRemindedAt.getTime() < deadlineFireAt.getTime()),
        );
        const afterSendDue = Boolean(
          afterSendDays &&
            assignment.lastRemindedAt &&
            assignment.lastRemindedAt.getTime() + afterSendDays * 24 * 60 * 60 * 1000 <=
              now.getTime(),
        );
        return deadlineDue || afterSendDue;
      });
      if (!due) continue;

      // Re-resolve through the outstanding-task audience immediately before dispatch. The first
      // assignment read chose what is due; this second read prevents a task completed or waived in
      // the meantime from being chased with stale state.
      const recipient = (
        await resolveRecipients(row.eventId, { kind: 'outstanding_tasks', taskId: row.id })
      ).find((candidate) => candidate.participantId === participantId);
      if (!recipient) continue;

      const result = await sendTemplated({
        eventId: row.eventId,
        key: 'task.reminder',
        recipient,
        // Named off the recipient's own open assignments, which are already loaded — so the one
        // email says which sessions it is about without a query per session.
        extraVars: taskReminderVars(row, outstandingSessions(recipient.openTasks, row.id)),
      });
      if (!result) continue;

      // Every pending row named by the one person-level email gets the same anchor. This matters
      // when only one of several session-scoped assignments made the follow-up due: leaving the
      // others untouched would produce duplicate emails on later hourly runs.
      await db
        .update(taskAssignment)
        .set({ lastRemindedAt: now, updatedAt: now })
        .where(
          and(
            inArray(
              taskAssignment.id,
              participantAssignments.map((assignment) => assignment.id),
            ),
            notInArray(taskAssignment.status, ['completed', 'waived']),
          ),
        );

      if (result?.emailSent || result?.smsSent) sent += 1;
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
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        firstName: user.firstName,
        phone: user.phone,
        phoneVerifiedAt: user.phoneVerifiedAt,
        phoneVerificationTransport: user.phoneVerificationTransport,
        notifyEmail: user.notifyEmail,
        notifySms: user.notifySms,
      })
      .from(user)
      .where(inArray(user.id, userIds));

    const stored = await getTemplate(row.eventId, 'form.deadline');
    const fallback = DEFAULT_TEMPLATES.find((t) => t.key === 'form.deadline')!;
    if (stored && !stored.enabled) continue;
    const bodyMarkdown = stored?.bodyMarkdown ?? fallback.bodyMarkdown;

    for (const person of people) {
      const delivery = await resolveRecipientDelivery({
        userId: person.id,
        eventId: row.eventId,
        templateKey: 'form.deadline',
        baseEmail: person.notifyEmail,
        baseSms: person.notifySms,
        phoneVerified: phoneVerificationIsCurrent(person, activeSmsTransportName()),
      });
      const alreadyEmailed = delivery.notifyEmail
        ? await db
            .select({ id: emailLog.id })
            .from(emailLog)
            .where(
              and(
                eq(emailLog.toEmail, person.email),
                eq(emailLog.templateKey, 'form.deadline'),
                gte(emailLog.createdAt, new Date(now.getTime() - DEADLINE_WINDOW_MS)),
              ),
            )
            .limit(1)
        : [];
      const alreadyTexted = delivery.notifySms && person.phone
        ? await db
            .select({ id: smsLog.id })
            .from(smsLog)
            .where(
              and(
                eq(smsLog.toPhone, person.phone),
                eq(smsLog.templateKey, 'form.deadline'),
                gte(smsLog.createdAt, new Date(now.getTime() - DEADLINE_WINDOW_MS)),
              ),
            )
            .limit(1)
        : [];

      const wantEmail = delivery.notifyEmail && alreadyEmailed.length === 0;
      const wantSms =
        Boolean(person.phone) &&
        alreadyTexted.length === 0 &&
        (await maySendSmsNow(person.phone!, delivery, now));
      if (!wantEmail && !wantSms) continue;

      const vars: TemplateVars = {
        'event.name': event.name,
        'event.url': branding.eventUrl,
        'speaker.name': person.name ?? person.email,
        'speaker.firstName': speakerFirstName(person.firstName, person.name ?? person.email),
        'speaker.email': person.email,
        'form.name': row.name,
        'form.closesAt': formatInZone(row.closesAt, event.timezone, false),
        'form.url': `${appUrl()}/submit/${event.slug}/${row.slug}`,
      };

      let dispatched = false;

      if (wantEmail) {
        const message = renderMessage(branding, stored?.subject ?? fallback.subject, bodyMarkdown, vars);
        const result = await sendMail({
          to: person.email,
          subject: message.subject,
          html: message.html,
          text: message.text,
          eventId: row.eventId,
          templateKey: 'form.deadline',
        });
        if (result.sent) dispatched = true;
      }

      if (wantSms) {
        const smsText = renderSmsText(stored?.smsBody ?? fallback.smsBody ?? null, bodyMarkdown, vars);
        const result = await sendSms({
          to: person.phone!,
          body: smsText,
          eventId: row.eventId,
          templateKey: 'form.deadline',
        });
        if (result.sent) dispatched = true;
      }

      if (dispatched) sent += 1;
    }
  }

  return sent;
}

/**
 * `AR-50`. The two advisory milestones on the event, in the order an edition reaches them.
 *
 * `field` names the column, `templateKey` the mail, and `variable` the merge field that carries the
 * date — kept together so a third milestone is one entry rather than three edits.
 */
const EVENT_MILESTONES = [
  {
    field: 'speakerDeadlineAt',
    column: eventTable.speakerDeadlineAt,
    templateKey: 'deadline.speakers',
  },
  { field: 'agendaDeadlineAt', column: eventTable.agendaDeadlineAt, templateKey: 'deadline.agenda' },
] as const;

/**
 * `AR-50`'s milestone reminder. Each of the two advisory deadlines fires once inside the three days
 * before it falls, guarded — like the draft reminder above — by a lookup in `email_log`, the only
 * durable record of a send.
 *
 * **Organizers only.** Both dates are the organizers' own commitment about work only they can do:
 * settling the roster and settling the agenda. A speaker cannot act on either, and mailing the whole
 * roster a date they have no lever on is noise. Speakers still read both — on the portal, on the
 * public page, and through the `{{event.speakerDeadline}}` / `{{event.agendaDeadline}}` merge fields
 * that every template can use — which is what carrying these to speakers actually means.
 *
 * Nothing changes when the date passes. The copy says so, and no write anywhere consults it.
 */
export async function runEventDeadlineReminders(
  options: { eventId?: string; now?: Date } = {},
): Promise<number> {
  const db = getDb();
  const now = options.now ?? new Date();
  const horizon = new Date(now.getTime() + DEADLINE_WINDOW_MS);
  const approaching = (column: (typeof EVENT_MILESTONES)[number]['column']) =>
    and(isNotNull(column), gte(column, now), lte(column, horizon));

  const rows = await db
    .select({ id: eventTable.id })
    .from(eventTable)
    .where(
      and(
        or(...EVENT_MILESTONES.map((milestone) => approaching(milestone.column))),
        ...(options.eventId ? [eq(eventTable.id, options.eventId)] : []),
      ),
    );

  let sent = 0;

  for (const row of rows) {
    const { branding, event } = await loadCommsContext(row.id);
    // Both dates go into every one of this event's milestone mails: an organizer being told the
    // roster date is days away is the same organizer who wants to know the agenda date behind it.
    const vars: TemplateVars = {
      'event.name': event.name,
      'event.url': branding.eventUrl,
      'event.speakerDeadline': formatInZone(event.speakerDeadlineAt, event.timezone, false),
      'event.agendaDeadline': formatInZone(event.agendaDeadlineAt, event.timezone, false),
      'organizer.url': `${appUrl()}/organizer`,
    };

    // Organizers of this event, not every member: reviewers and speakers hold no membership role
    // that makes either milestone their work.
    const organizers = await db
      .select({
        id: user.id,
        email: user.email,
        phone: user.phone,
        phoneVerifiedAt: user.phoneVerifiedAt,
        phoneVerificationTransport: user.phoneVerificationTransport,
        notifyEmail: user.notifyEmail,
        notifySms: user.notifySms,
      })
      .from(membership)
      .innerJoin(user, eq(user.id, membership.userId))
      .where(and(eq(membership.eventId, row.id), eq(membership.role, 'organizer')));

    if (organizers.length === 0) continue;

    for (const milestone of EVENT_MILESTONES) {
      const at = event[milestone.field];
      if (!at || at.getTime() < now.getTime() || at.getTime() > horizon.getTime()) continue;

      const stored = await getTemplate(row.id, milestone.templateKey);
      const fallback = DEFAULT_TEMPLATES.find((t) => t.key === milestone.templateKey)!;
      if (stored && !stored.enabled) continue;
      const bodyMarkdown = stored?.bodyMarkdown ?? fallback.bodyMarkdown;

      for (const person of organizers) {
        const delivery = await resolveRecipientDelivery({
          userId: person.id,
          eventId: row.id,
          templateKey: milestone.templateKey,
          baseEmail: person.notifyEmail,
          baseSms: person.notifySms,
          phoneVerified: phoneVerificationIsCurrent(person, activeSmsTransportName()),
        });
        const alreadyEmailed = delivery.notifyEmail
          ? await db
              .select({ id: emailLog.id })
              .from(emailLog)
              .where(
                and(
                  eq(emailLog.toEmail, person.email),
                  eq(emailLog.templateKey, milestone.templateKey),
                  gte(emailLog.createdAt, new Date(now.getTime() - DEADLINE_WINDOW_MS)),
                ),
              )
              .limit(1)
          : [];
        const alreadyTexted =
          delivery.notifySms && person.phone
            ? await db
                .select({ id: smsLog.id })
                .from(smsLog)
                .where(
                  and(
                    eq(smsLog.toPhone, person.phone),
                    eq(smsLog.templateKey, milestone.templateKey),
                    gte(smsLog.createdAt, new Date(now.getTime() - DEADLINE_WINDOW_MS)),
                  ),
                )
                .limit(1)
            : [];

        const wantEmail = delivery.notifyEmail && alreadyEmailed.length === 0;
        const wantSms =
          Boolean(person.phone) &&
          alreadyTexted.length === 0 &&
          (await maySendSmsNow(person.phone!, delivery, now));
        if (!wantEmail && !wantSms) continue;

        let dispatched = false;

        if (wantEmail) {
          const message = renderMessage(
            branding,
            stored?.subject ?? fallback.subject,
            bodyMarkdown,
            vars,
          );
          const result = await sendMail({
            to: person.email,
            subject: message.subject,
            html: message.html,
            text: message.text,
            eventId: row.id,
            templateKey: milestone.templateKey,
          });
          if (result.sent) dispatched = true;
        }

        if (wantSms) {
          const smsText = renderSmsText(
            stored?.smsBody ?? fallback.smsBody ?? null,
            bodyMarkdown,
            vars,
          );
          const result = await sendSms({
            to: person.phone!,
            body: smsText,
            eventId: row.id,
            templateKey: milestone.templateKey,
          });
          if (result.sent) dispatched = true;
        }

        if (dispatched) sent += 1;
      }
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
  const eventDeadlineRemindersSent = await runEventDeadlineReminders({ eventId, now });
  return {
    taskRemindersSent,
    deadlineRemindersSent,
    eventDeadlineRemindersSent,
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
// The SMS mailbox — same shape as the mailbox above, one table over
// ---------------------------------------------------------------------------

export type SmsMailboxEntry = typeof smsLog.$inferSelect;

/** A duplicated phone number cannot safely identify which account owns a credential. */
export function uniqueSmsRecipientEmail(rows: ReadonlyArray<{ email: string }>): string | null {
  return rows.length === 1 ? rows[0].email : null;
}

/**
 * Resolves the account whose credential an SMS body could carry. Phone numbers are normalized but
 * deliberately not unique, so anything other than one exact match is ambiguous and must fail
 * closed at the mailbox reader. `sms_log` receives the same E.164 value read from `user.phone`.
 */
export async function emailForSmsRecipient(phone: string): Promise<string | null> {
  const db = getDb();
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.phone, phone))
    .limit(2);
  return uniqueSmsRecipientEmail(rows);
}

export async function listSms(options: {
  eventId?: string | null;
  search?: string | null;
  limit?: number;
}): Promise<SmsMailboxEntry[]> {
  const db = getDb();
  const clauses = [];
  if (options.eventId) clauses.push(eq(smsLog.eventId, options.eventId));
  if (options.search) {
    const needle = `%${options.search.toLowerCase()}%`;
    clauses.push(
      sql`(lower(${smsLog.toPhone}) like ${needle} or lower(${smsLog.body}) like ${needle})`,
    );
  }

  return db
    .select()
    .from(smsLog)
    .where(clauses.length > 0 ? and(...clauses) : undefined)
    .orderBy(desc(smsLog.createdAt))
    .limit(options.limit ?? 100);
}

/** `eventId` is not optional on purpose: a message id in a query string is not an authorisation. */
export async function getSms(eventId: string, id: string): Promise<SmsMailboxEntry | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(smsLog)
    .where(and(eq(smsLog.id, id), eq(smsLog.eventId, eventId)))
    .limit(1);
  return row;
}

// ---------------------------------------------------------------------------
// Organizer event resolution
// ---------------------------------------------------------------------------

export type OrganizerEventOption = { id: string; name: string; slug: string };

/** Newest first, which is what a judge who just made an event wants to find at the top. */
export async function listEventsForOrganizer(userId: string): Promise<OrganizerEventOption[]> {
  const rows = await listEventsForUser(userId);
  return rows.map(({ id, name, slug }) => ({ id, name, slug }));
}

/**
 * `/organizer/comms` and `/organizer/mail` carry no event segment, so the event comes from `?event=`, then
 * from the same cookie the rest of the organizer shell reads, then from the caller's newest event. The
 * cookie step is what keeps the mailbox showing the event the sidebar says is selected.
 *
 * Both candidates are matched against the caller's own events rather than looked up directly. These
 * pages have no `requireEventContext` between them and the database, so resolving `?event=` by slug
 * would hand any signed-in organizer another event's mailbox for the price of guessing a slug.
 */
export async function resolveOrganizerEvent(options: {
  eventParam?: string | null;
  cookieEventId?: string | null;
  userId: string;
}): Promise<{ event: EventRow | null; options: OrganizerEventOption[] }> {
  const db = getDb();
  const mine = await listEventsForUser(options.userId);
  const all: OrganizerEventOption[] = mine.map(({ id, name, slug }) => ({ id, name, slug }));

  const pick = (wanted: string | null | undefined) =>
    wanted ? mine.find((entry) => entry.id === wanted || entry.slug === wanted) : undefined;

  const chosen = pick(options.eventParam) ?? pick(options.cookieEventId) ?? pickDefaultEvent(mine);
  if (!chosen) return { event: null, options: all };

  const [row] = await db.select().from(eventTable).where(eq(eventTable.id, chosen.id)).limit(1);
  return { event: row ?? null, options: all };
}

export async function listTracksAndFormats(eventId: string): Promise<{
  tracks: OrganizerEventOption[];
  formats: OrganizerEventOption[];
}> {
  const lookups = await loadLookups(eventId);
  return {
    tracks: [...lookups.tracks].map(([id, name]) => ({ id, name, slug: id })),
    formats: [...lookups.formats].map(([id, name]) => ({ id, name, slug: id })),
  };
}

export async function listTasksForEvent(eventId: string): Promise<OrganizerEventOption[]> {
  const db = getDb();
  const rows = await db
    .select({ id: task.id, name: task.name })
    .from(task)
    .where(eq(task.eventId, eventId))
    .orderBy(task.position);
  return rows.map((row) => ({ id: row.id, name: row.name, slug: row.id }));
}
