import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '../../db/client';
import {
  event,
  form,
  formField,
  membership,
  participant,
  participantRole,
  portalPage,
  portalTheme,
  room,
  scheduledSession,
  sessionFormat,
  submission,
  track,
  user,
} from '../../db/schema';
import type { EventContext } from '../context';
import { can } from '../context';
import { appUrl } from '../env';
import { conflict, forbidden, invalid, notFound } from '../errors';
import type { AnswerMap, FormFieldSpec } from '../forms/contract';
import { clearHiddenAnswers, validateAnswers } from '../forms/contract';
import { formatRef } from '../ids';
import { sendMail } from '../mail';
import { markdownToText, renderMarkdown, renderTrustedMarkdown } from '../markdown';
import { personNameColumns, splitPersonName } from '../person-name';
import { e164PhoneInput } from '../phone';
import { normalizeAccent } from '../portal-appearance';
import { parseSpeakerName } from '../speaker-name';
import {
  blockSmsBeforePreferenceChange,
  grantSmsAfterPreferenceChange,
} from '../sms/consent';
import { activeSmsTransportName } from '../sms';
import { mutateAgendaAtomically } from './agenda-guard';
import { assertParticipantLimits } from './forms';
import { phoneVerificationIsCurrent } from './notification-preferences';

/**
 * `S-1`–`S-13`. Everything the speaker-facing surface reads or writes. The organizer side never
 * calls in here; it reads the same rows through its own services, which is why status transitions
 * live in `tasks.ts` and not in two places.
 */

export type PortalEvent = {
  id: string;
  slug: string;
  name: string;
  tagline: string | null;
  timezone: string;
  startsOn: string | null;
  endsOn: string | null;
  websiteUrl: string | null;
  venueName: string | null;
};

export async function getEventBySlug(slug: string): Promise<PortalEvent | null> {
  const row = await getDb().query.event.findFirst({ where: eq(event.slug, slug) });
  return row ?? null;
}

export type Participant = typeof participant.$inferSelect;

/**
 * A portal visitor always has a participant row, created on first arrival. Without this an organizer
 * impersonating a speaker who has never opened the portal would land on a broken page, and `S-10`
 * exists precisely to rescue speakers who are stuck.
 */
export async function ensureParticipant(ctx: EventContext): Promise<Participant> {
  const db = getDb();
  const existing = await db.query.participant.findFirst({
    where: and(eq(participant.eventId, ctx.eventId), eq(participant.userId, ctx.actor.userId)),
  });
  if (existing) return existing;

  await db
    .insert(participant)
    .values({
      eventId: ctx.eventId,
      userId: ctx.actor.userId,
      displayName: parseSpeakerName(ctx.actor.name),
    })
    .onConflictDoNothing();

  const created = await db.query.participant.findFirst({
    where: and(eq(participant.eventId, ctx.eventId), eq(participant.userId, ctx.actor.userId)),
  });
  if (!created) throw notFound('Your participant record');
  return created;
}

export type PortalBranding = {
  accentColor: string | null;
  logoFileId: string | null;
  welcomeHtml: string;
  supportEmail: string | null;
};

/**
 * `S-11`. `accentColor` is organizer data, so it is injected as a CSS custom property rather than
 * written into a stylesheet — the only route by which a color reaches this surface without a token.
 *
 * Every field is optional and an event with no `portal_theme` row at all is the ordinary case, not
 * an error: the row is created the first time an organizer saves the portal appearance panel, and
 * plenty of events never will. The layout and the home screen each fall back to their own copy, so
 * nothing here needs a placeholder — a `null` accent means "keep the design system's".
 *
 * `normalizeAccent` runs on the way out, not only on the way in. A row written by a seed or by hand
 * has been through no validation, and this value is interpolated into a `style` attribute.
 */
export async function getBranding(eventId: string): Promise<PortalBranding> {
  const row = await getDb().query.portalTheme.findFirst({ where: eq(portalTheme.eventId, eventId) });
  return {
    accentColor: normalizeAccent(row?.accentColor),
    logoFileId: row?.logoFileId ?? null,
    welcomeHtml: renderTrustedMarkdown(row?.welcomeMarkdown),
    supportEmail: row?.supportEmail ?? null,
  };
}

// ---------------------------------------------------------------------------
// Profile — `S-2`, `S-3`, `S-8`
// ---------------------------------------------------------------------------

const linkSchema = z.object({
  label: z.string().trim().min(1, 'Give the link a label').max(60),
  url: z
    .string()
    .trim()
    .min(1)
    .transform((value) => (/^[a-z][a-z0-9+.-]*:/i.test(value) ? value : `https://${value}`))
    .refine((value) => /^https?:\/\/[^\s]+$/i.test(value), 'Links must be http or https'),
});

const speakerNameInput = z.string().transform((value, ctx) => {
  try {
    return parseSpeakerName(value);
  } catch (error) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: error instanceof Error ? error.message : 'That speaker name is not valid',
    });
    return z.NEVER;
  }
});

export const profileSchema = z
  .object({
    displayName: speakerNameInput.optional(),
    /**
     * `F-6` split capture into these two and kept `user.name` as their join, but left the portal
     * editing only `participant.displayName` — so the halves the CFP had just collected were the
     * one thing on the profile a speaker could not correct. They validate through the same rules a
     * single speaker name gets, so a name cannot get past the guard by arriving in two pieces.
     */
    firstName: speakerNameInput.optional(),
    lastName: speakerNameInput.optional(),
    /** `S-2`. */
    salutation: z.string().trim().max(40).optional(),
    honorific: z.string().trim().max(40).optional(),
    gender: z.string().trim().max(60).optional(),
    pronouns: z.string().trim().max(40).optional(),
    jobTitle: z.string().trim().max(120).optional(),
    company: z.string().trim().max(120).optional(),
    bioMarkdown: z.string().max(5000, 'Biography is limited to 5,000 characters').optional(),
    timezone: z.string().trim().max(64).optional(),
    dietaryNotes: z.string().trim().max(1000).optional(),
    accessibilityNotes: z.string().trim().max(1000).optional(),
    links: z.array(linkSchema).max(8, 'Eight links is plenty').default([]),
    phone: e164PhoneInput.optional(),
    notifyEmail: z.boolean().optional(),
    notifySms: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.notifySms && !data.phone?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['phone'],
        message: 'Add a phone number to receive SMS alerts',
      });
    }
  });

export type ProfileInput = z.input<typeof profileSchema>;

function blankToNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export async function updateProfile(
  ctx: EventContext,
  participantId: string,
  input: ProfileInput,
): Promise<Participant> {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) {
    const details: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      details[issue.path.join('.') || 'form'] = issue.message;
    }
    throw invalid('Some of your details need attention', details);
  }

  const data = parsed.data;
  const db = getDb();

  /**
   * A key the caller left out is left alone rather than blanked. It used to be blanked, which is
   * why `lib/services/participants.ts` and the `/api/v1` profile route both re-send the entire
   * profile on every write — a discipline that silently breaks the moment a column is added to the
   * schema and one of them is not updated to carry it. Omission meaning "no opinion" makes adding
   * `salutation`, `honorific` and `gender` safe for callers that have never heard of them.
   */
  const column = <K extends string>(key: K, value: string | null | undefined) =>
    value === undefined ? {} : ({ [key]: blankToNull(value) } as Record<K, string | null>);

  const [row] = await db
    .update(participant)
    .set({
      ...column('displayName', data.displayName),
      ...column('salutation', data.salutation),
      ...column('honorific', data.honorific),
      ...column('pronouns', data.pronouns),
      ...column('gender', data.gender),
      ...column('jobTitle', data.jobTitle),
      ...column('company', data.company),
      ...column('bioMarkdown', data.bioMarkdown),
      ...column('timezone', data.timezone),
      ...column('dietaryNotes', data.dietaryNotes),
      ...column('accessibilityNotes', data.accessibilityNotes),
      ...(data.links === undefined ? {} : { links: data.links }),
      updatedAt: new Date(),
    })
    .where(and(eq(participant.id, participantId), eq(participant.eventId, ctx.eventId)))
    .returning();

  if (!row) throw notFound('Your profile');

  // Phone, channel preference and the name halves live on `user`, not `participant` — they are
  // global to the person, not per-event, which is what lets an organizer (no `participant` row)
  // set the same preference from `/admin/settings`.
  const namesChanged = data.firstName !== undefined || data.lastName !== undefined;
  if (
    namesChanged ||
    data.phone !== undefined ||
    data.notifyEmail !== undefined ||
    data.notifySms !== undefined
  ) {
    const smsChanged = data.phone !== undefined || data.notifySms !== undefined;
    let nextSms: { phone: string | null; enabled: boolean; phoneChanged: boolean } | null = null;
    if (smsChanged) {
      const currentUser = await db.query.user.findFirst({
        where: eq(user.id, row.userId),
        columns: {
          phone: true,
          phoneVerifiedAt: true,
          phoneVerificationTransport: true,
          notifySms: true,
        },
      });
      if (!currentUser) throw notFound('Your account');
      const nextPhone = data.phone !== undefined ? blankToNull(data.phone) : currentUser.phone;
      nextSms = {
        phone: nextPhone,
        enabled: Boolean(nextPhone) && (data.notifySms ?? currentUser.notifySms),
        phoneChanged: nextPhone !== currentUser.phone,
      };
      if (
        nextSms.enabled &&
        (nextSms.phone !== currentUser.phone ||
          !phoneVerificationIsCurrent(currentUser, activeSmsTransportName()))
      ) {
        throw invalid('Verify this phone number before enabling text messages', {
          phone: 'Request and enter the verification code first',
        });
      }
      await blockSmsBeforePreferenceChange({
        previousPhone: currentUser.phone,
        nextPhone: nextSms.phone,
        nextEnabled: nextSms.enabled,
        source: 'speaker_profile',
      });
    }
    /**
     * `name` is recomputed from the halves rather than edited beside them. Writing all three
     * through one helper is what keeps the join honest: forty read sites still read `user.name`,
     * and a display name that disagreed with the halves the speaker had just typed would be the
     * exact bug `F-6` set out to avoid.
     */
    const names = namesChanged
      ? personNameColumns({ firstName: data.firstName, lastName: data.lastName })
      : null;
    await db
      .update(user)
      .set({
        ...(names ?? {}),
        ...(nextSms
          ? {
              phone: nextSms.phone,
              ...(nextSms.phoneChanged
                ? { phoneVerifiedAt: null, phoneVerificationTransport: null }
                : {}),
            }
          : {}),
        ...(data.notifyEmail !== undefined ? { notifyEmail: data.notifyEmail } : {}),
        ...(nextSms ? { notifySms: nextSms.enabled } : {}),
      })
      // The account behind *this participant*, not behind whoever is holding the session. They are
      // the same person on the portal's own path, and are not when an organizer edits the roster.
      .where(eq(user.id, row.userId));
    if (nextSms) {
      await grantSmsAfterPreferenceChange(nextSms.phone, nextSms.enabled, 'speaker_profile');
    }
  }

  return row;
}

export type ProfileName = { firstName: string; lastName: string };

/**
 * `S-2`. What the profile form seeds its two name boxes with. A user imported before `F-6` has
 * `name` but neither half, so the halves are derived on read with the same rule the migration used
 * — the speaker then sees a filled-in guess they can correct, rather than two empty boxes that
 * would blank their name the first time they saved anything else.
 */
export async function getProfileName(userId: string): Promise<ProfileName> {
  const row = await getDb().query.user.findFirst({
    where: eq(user.id, userId),
    columns: { name: true, firstName: true, lastName: true },
  });
  if (!row) throw notFound('Your account');
  const fallback = splitPersonName(row.name);
  return {
    firstName: row.firstName ?? fallback.firstName ?? '',
    lastName: row.lastName ?? fallback.lastName ?? '',
  };
}

export async function setHeadshot(
  ctx: EventContext,
  participantId: string,
  fileId: string | null,
): Promise<void> {
  const [row] = await getDb()
    .update(participant)
    .set({ headshotFileId: fileId, updatedAt: new Date() })
    .where(and(eq(participant.id, participantId), eq(participant.eventId, ctx.eventId)))
    .returning({ id: participant.id });
  if (!row) throw notFound('Your profile');
}

export type ProfileGap = { key: string; label: string };

/** What the home screen leads with. Ordered by what an organizer chases speakers about. */
export function profileGaps(row: Participant): ProfileGap[] {
  const gaps: ProfileGap[] = [];
  if (!row.bioMarkdown?.trim()) gaps.push({ key: 'bio', label: 'Add a biography' });
  if (!row.headshotFileId) gaps.push({ key: 'headshot', label: 'Upload a headshot' });
  if (!row.jobTitle?.trim() || !row.company?.trim()) {
    gaps.push({ key: 'role', label: 'Add your job title and company' });
  }
  if (row.links.length === 0) gaps.push({ key: 'links', label: 'Add a link to your work' });
  return gaps;
}

// ---------------------------------------------------------------------------
// Wiki pages — `S-6`, `S-7`
// ---------------------------------------------------------------------------

export type PortalPageSummary = { id: string; slug: string; title: string; published: boolean };

export async function listPortalPages(
  eventId: string,
  includeUnpublished = false,
): Promise<PortalPageSummary[]> {
  const rows = await getDb()
    .select({
      id: portalPage.id,
      slug: portalPage.slug,
      title: portalPage.title,
      published: portalPage.published,
      position: portalPage.position,
    })
    .from(portalPage)
    .where(eq(portalPage.eventId, eventId))
    .orderBy(asc(portalPage.position), asc(portalPage.title));
  return rows.filter((row) => includeUnpublished || row.published);
}

export type PortalPageView = PortalPageSummary & { html: string; updatedAt: Date };

/**
 * `S-7`. `allowRawHtml` selects the trusted renderer, which is the brief's HTML-embed requirement.
 * Only an organizer can author a `portal_page` row; speaker-authored text never reaches this call.
 */
export async function getPortalPage(
  eventId: string,
  slug: string,
  includeUnpublished = false,
): Promise<PortalPageView | null> {
  const row = await getDb().query.portalPage.findFirst({
    where: and(eq(portalPage.eventId, eventId), eq(portalPage.slug, slug)),
  });
  if (!row) return null;
  if (!row.published && !includeUnpublished) return null;
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    published: row.published,
    updatedAt: row.updatedAt,
    html: row.allowRawHtml ? renderTrustedMarkdown(row.bodyMarkdown) : renderMarkdown(row.bodyMarkdown),
  };
}

// ---------------------------------------------------------------------------
// Submissions — `S-5`, `S-9`
// ---------------------------------------------------------------------------

export type PortalSubmission = {
  id: string;
  ref: string;
  title: string;
  descriptionMarkdown: string | null;
  descriptionHtml: string;
  status: (typeof submission.$inferSelect)['status'];
  level: string | null;
  formatName: string | null;
  trackName: string | null;
  formId: string;
  formSlug: string;
  formName: string;
  formStatus: (typeof form.$inferSelect)['status'];
  formClosesAt: Date | null;
  editable: boolean;
  myRole: (typeof participantRole.$inferSelect)['kind'];
  isPrimary: boolean;
  answers: AnswerMap;
  submittedAt: Date | null;
  scheduled: ScheduledSlot | null;
};

export type ScheduledSlot = {
  /** Addresses `app/api/calendar/[sessionId]`, so the portal can offer the download emails already link. */
  id: string;
  ref: string;
  title: string;
  startsAt: Date | null;
  endsAt: Date | null;
  roomName: string | null;
  published: boolean;
};

function isEditable(
  status: (typeof submission.$inferSelect)['status'],
  formStatus: (typeof form.$inferSelect)['status'],
  closesAt: Date | null,
  now = new Date(),
): boolean {
  if (status === 'withdrawn' || status === 'declined') return false;
  if (formStatus !== 'open') return false;
  return !closesAt || closesAt.getTime() > now.getTime();
}

export async function listMySubmissions(participantId: string): Promise<PortalSubmission[]> {
  const db = getDb();
  const rows = await db
    .select({
      submission,
      role: participantRole,
      form,
      formatName: sessionFormat.name,
      trackName: track.name,
    })
    .from(participantRole)
    .innerJoin(submission, eq(submission.id, participantRole.submissionId))
    .innerJoin(form, eq(form.id, submission.formId))
    .leftJoin(sessionFormat, eq(sessionFormat.id, submission.formatId))
    .leftJoin(track, eq(track.id, submission.trackId))
    .where(eq(participantRole.participantId, participantId))
    .orderBy(desc(submission.createdAt));

  if (rows.length === 0) return [];

  const scheduled = await db
    .select({ session: scheduledSession, roomName: room.name })
    .from(scheduledSession)
    .leftJoin(room, eq(room.id, scheduledSession.roomId))
    .where(
      inArray(
        scheduledSession.submissionId,
        rows.map((row) => row.submission.id),
      ),
    );
  const slotBySubmission = new Map(
    scheduled
      .filter((row) => row.session.submissionId)
      .map((row) => [
        row.session.submissionId as string,
        {
          id: row.session.id,
          ref: formatRef('session', row.session.ref),
          title: row.session.title,
          startsAt: row.session.startsAt,
          endsAt: row.session.endsAt,
          roomName: row.roomName,
          published: row.session.status === 'published',
        } satisfies ScheduledSlot,
      ]),
  );

  return rows.map(({ submission: row, role, form: parent, formatName, trackName }) => ({
    id: row.id,
    ref: formatRef('submission', row.ref),
    title: row.title,
    descriptionMarkdown: row.descriptionMarkdown,
    descriptionHtml: renderMarkdown(row.descriptionMarkdown),
    status: row.status,
    level: row.level,
    formatName,
    trackName,
    formId: parent.id,
    formSlug: parent.slug,
    formName: parent.name,
    formStatus: parent.status,
    formClosesAt: parent.closesAt,
    editable: isEditable(row.status, parent.status, parent.closesAt),
    myRole: role.kind,
    isPrimary: role.isPrimary,
    answers: (row.answers ?? {}) as AnswerMap,
    submittedAt: row.submittedAt,
    scheduled: slotBySubmission.get(row.id) ?? null,
  }));
}

export async function getMySubmission(
  participantId: string,
  submissionId: string,
): Promise<PortalSubmission> {
  const all = await listMySubmissions(participantId);
  const found = all.find((row) => row.id === submissionId);
  if (!found) throw notFound('That session');
  return found;
}

/** The organizer-authored questions a speaker can still answer from the portal. */
export async function submissionFields(formId: string): Promise<FormFieldSpec[]> {
  const rows = await getDb()
    .select()
    .from(formField)
    .where(eq(formField.formId, formId))
    .orderBy(asc(formField.position));
  return rows
    .filter((row) => !row.builtinKey && row.type !== 'file')
    .map((row) => ({
      id: row.id,
      key: row.key,
      builtinKey: null,
      type: row.type,
      label: row.label,
      position: row.position,
      step: row.step,
      required: row.required,
      options: row.options ?? null,
      showIf: row.showIf ?? null,
      minLength: row.minLength,
      maxLength: row.maxLength,
      charLimitGroup: row.charLimitGroup,
    }));
}

export const submissionEditSchema = z.object({
  title: z.string().trim().min(3, 'Give the session a title').max(255),
  descriptionMarkdown: z.string().max(5000, 'Description is limited to 5,000 characters').optional(),
  level: z.string().trim().max(60).optional(),
});

export type SubmissionEditInput = z.infer<typeof submissionEditSchema> & { answers?: AnswerMap };

async function requireMyRole(participantId: string, submissionId: string) {
  const row = await getDb().query.participantRole.findFirst({
    where: and(
      eq(participantRole.participantId, participantId),
      eq(participantRole.submissionId, submissionId),
    ),
  });
  if (!row) throw notFound('That session');
  return row;
}

export async function updateMySubmission(
  ctx: EventContext,
  participantId: string,
  submissionId: string,
  input: SubmissionEditInput,
): Promise<void> {
  await requireMyRole(participantId, submissionId);
  const current = await getMySubmission(participantId, submissionId);
  if (!current.editable) {
    throw conflict(
      current.formStatus === 'open'
        ? 'That form has closed, so this session can no longer be edited'
        : 'This session can no longer be edited from the portal',
    );
  }

  const parsed = submissionEditSchema.safeParse(input);
  if (!parsed.success) {
    const details: Record<string, string> = {};
    for (const issue of parsed.error.issues) details[issue.path.join('.') || 'form'] = issue.message;
    throw invalid('Some details need attention', details);
  }

  const fields = await submissionFields(current.formId);
  const answers = input.answers ? clearHiddenAnswers(fields, input.answers) : current.answers;
  if (input.answers) validateAnswers(fields, answers);

  await getDb()
    .update(submission)
    .set({
      title: parsed.data.title,
      descriptionMarkdown: blankToNull(parsed.data.descriptionMarkdown),
      level: blankToNull(parsed.data.level),
      answers,
      updatedAt: new Date(),
    })
    .where(and(eq(submission.id, submissionId), eq(submission.eventId, ctx.eventId)));
}

/**
 * Withdrawing is a status change, never a delete: the review queue, the send log and the dashboard
 * all reference the row, and an organizer needs to see that a talk was pulled rather than find a
 * gap where it used to be.
 */
export async function withdrawSubmission(
  ctx: EventContext,
  participantId: string,
  submissionId: string,
): Promise<void> {
  const role = await requireMyRole(participantId, submissionId);
  if (!role.isPrimary && !can(ctx, 'submission:decide')) {
    throw forbidden('Only the primary speaker can withdraw this session');
  }
  const current = await getMySubmission(participantId, submissionId);
  if (current.status === 'withdrawn') throw conflict('That session is already withdrawn');

  await getDb()
    .update(submission)
    .set({ status: 'withdrawn', updatedAt: new Date() })
    .where(and(eq(submission.id, submissionId), eq(submission.eventId, ctx.eventId)));
}

// ---------------------------------------------------------------------------
// Group portal access — `S-13`
// ---------------------------------------------------------------------------

export type GroupMember = {
  participantId: string;
  name: string;
  email: string;
  kind: (typeof participantRole.$inferSelect)['kind'];
  isPrimary: boolean;
  isMe: boolean;
};

export async function listGroupMembers(
  submissionId: string,
  meParticipantId: string,
): Promise<GroupMember[]> {
  const rows = await getDb()
    .select({ role: participantRole, participant, user })
    .from(participantRole)
    .innerJoin(participant, eq(participant.id, participantRole.participantId))
    .innerJoin(user, eq(user.id, participant.userId))
    .where(eq(participantRole.submissionId, submissionId))
    .orderBy(desc(participantRole.isPrimary), asc(participantRole.position));

  return rows.map(({ role, participant: row, user: account }) => ({
    participantId: row.id,
    name: row.displayName ?? account.name ?? account.email,
    email: account.email,
    kind: role.kind,
    isPrimary: role.isPrimary,
    isMe: row.id === meParticipantId,
  }));
}

export const shareSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  name: speakerNameInput.optional(),
  kind: z.enum(['co_speaker', 'moderator', 'panelist', 'speaker']).default('co_speaker'),
});

/**
 * `F-7` at share time. The cast this submission would have *after* the invite is what gets checked,
 * so the answer is about the end state rather than about the person being added in isolation.
 *
 * Minimums are deliberately not enforced here: a share can only ever add somebody, so a submission
 * that already satisfies the form still does, and one that does not is not made worse by this. Only
 * the ceilings — the per-role maximum and the overall cap — can be crossed by adding a person.
 */
async function assertShareWithinFormLimits(
  submissionId: string,
  kind: (typeof participantRole.$inferSelect)['kind'],
): Promise<void> {
  const db = getDb();
  const row = await db.query.submission.findFirst({ where: eq(submission.id, submissionId) });
  if (!row) throw notFound('That submission');

  const existing = await db
    .select({ kind: participantRole.kind })
    .from(participantRole)
    .where(eq(participantRole.submissionId, submissionId));

  await assertParticipantLimits(
    row.formId,
    [...existing.map((entry) => entry.kind), kind],
    'ceilings',
  );
}

/**
 * `S-13`. Sharing grants a real speaker membership on the event, so the invitee gets their own
 * portal with their own tasks rather than a link into someone else's — a shared login is how
 * co-speaker details end up wrong on the programme.
 */
export async function shareSubmissionAccess(
  ctx: EventContext,
  participantId: string,
  submissionId: string,
  input: z.input<typeof shareSchema>,
): Promise<GroupMember> {
  const role = await requireMyRole(participantId, submissionId);
  if (!role.isPrimary && !can(ctx, 'task:manage')) {
    throw forbidden('Only the primary speaker can share this session');
  }

  const parsed = shareSchema.safeParse(input);
  if (!parsed.success) {
    throw invalid(parsed.error.issues[0]?.message ?? 'Check the details and try again', {
      email: parsed.error.issues[0]?.message ?? 'Check this address',
    });
  }
  const { email, name, kind } = parsed.data;

  /**
   * `F-7`. The same guard the public submit path runs, reading the same per-form configuration — a
   * limit enforced only at submission is a limit anyone can walk around by adding the fourth panelist
   * from their portal instead. It runs before the transaction because it only reads, and because a
   * rejection here should cost nothing.
   */
  await assertShareWithinFormLimits(submissionId, kind);

  const { account, invitee } = await mutateAgendaAtomically(ctx.eventId, async (transaction) => {
    let account = await transaction.query.user.findFirst({ where: eq(user.email, email) });
    if (!account) {
      [account] = await transaction
        .insert(user)
        .values({ email, name: name ?? null, ...splitPersonName(name ?? null) })
        .returning();
    }

    await transaction
      .insert(membership)
      .values({ userId: account.id, eventId: ctx.eventId, role: 'speaker' })
      .onConflictDoNothing();

    await transaction
      .insert(participant)
      .values({
        eventId: ctx.eventId,
        userId: account.id,
        displayName: parseSpeakerName(name ?? account.name),
      })
      .onConflictDoNothing();

    const invitee = await transaction.query.participant.findFirst({
      where: and(eq(participant.eventId, ctx.eventId), eq(participant.userId, account.id)),
    });
    if (!invitee) throw notFound('That participant');

    const existing = await transaction.query.participantRole.findFirst({
      where: and(
        eq(participantRole.submissionId, submissionId),
        eq(participantRole.participantId, invitee.id),
      ),
    });
    if (existing) throw conflict('They already have access to this session');

    const siblings = await transaction
      .select({ position: participantRole.position })
      .from(participantRole)
      .where(eq(participantRole.submissionId, submissionId));

    await transaction.insert(participantRole).values({
      submissionId,
      participantId: invitee.id,
      kind,
      isPrimary: false,
      position: siblings.length,
    });

    const session = await transaction.query.scheduledSession.findFirst({
      where: and(
        eq(scheduledSession.eventId, ctx.eventId),
        eq(scheduledSession.submissionId, submissionId),
      ),
    });
    return {
      data: { account, invitee },
      changedSessionIds: session ? [session.id] : [],
    };
  });

  await sendShareInvite(ctx, account.email, account.name, submissionId);

  return {
    participantId: invitee.id,
    name: invitee.displayName ?? account.name ?? account.email,
    email: account.email,
    kind,
    isPrimary: false,
    isMe: false,
  };
}

async function sendShareInvite(
  ctx: EventContext,
  email: string,
  name: string | null,
  submissionId: string,
): Promise<void> {
  const db = getDb();
  const [eventRow] = await db
    .select({ slug: event.slug, name: event.name })
    .from(event)
    .where(eq(event.id, ctx.eventId));
  const [session] = await db
    .select({ title: submission.title })
    .from(submission)
    .where(eq(submission.id, submissionId));
  if (!eventRow || !session) return;

  const link = `${appUrl()}/portal/${eventRow.slug}`;
  const body = [
    `Hi${name ? ` ${name}` : ''},`,
    '',
    `You have been added to **${session.title}** at ${eventRow.name}.`,
    '',
    `[Open the ${eventRow.name} speaker portal](${link})`,
  ].join('\n');

  await sendMail({
    to: email,
    subject: `You have been added to ${session.title}`,
    html: renderMarkdown(body),
    text: markdownToText(body).replace(`Open the ${eventRow.name} speaker portal`, link),
    eventId: ctx.eventId,
    templateKey: 'portal.access_shared',
  });
}

export async function revokeSubmissionAccess(
  ctx: EventContext,
  participantId: string,
  submissionId: string,
  targetParticipantId: string,
): Promise<void> {
  const role = await requireMyRole(participantId, submissionId);
  if (!role.isPrimary && !can(ctx, 'task:manage')) {
    throw forbidden('Only the primary speaker can change who has access');
  }
  if (targetParticipantId === participantId) throw invalid('You cannot remove yourself');

  const target = await getDb().query.participantRole.findFirst({
    where: and(
      eq(participantRole.submissionId, submissionId),
      eq(participantRole.participantId, targetParticipantId),
    ),
  });
  if (!target) throw notFound('That co-speaker');
  if (target.isPrimary) throw conflict('The primary speaker cannot be removed');

  await getDb().delete(participantRole).where(eq(participantRole.id, target.id));
}

// ---------------------------------------------------------------------------
// Portal types — `S-12`
// ---------------------------------------------------------------------------

export type PortalType = {
  id: 'contact' | 'group' | 'submission';
  label: string;
  description: string;
  href: string;
  count: number | null;
};

/**
 * `S-12`. Sessionboard ships three portal types; here they are three views over the same identity
 * rather than three logins, because a co-speaker who has to remember which portal they were invited
 * to is a support ticket.
 */
export function portalTypes(
  eventSlug: string,
  submissions: PortalSubmission[],
  groupSize: number,
): PortalType[] {
  return [
    {
      id: 'contact',
      label: 'My portal',
      description: 'Your profile, tasks and deadlines',
      href: `/portal/${eventSlug}`,
      count: null,
    },
    {
      id: 'submission',
      label: 'Sessions',
      description: 'Everything attached to a talk you are speaking on',
      href: `/portal/${eventSlug}/submissions`,
      count: submissions.length,
    },
    {
      id: 'group',
      label: 'Group',
      description: 'Co-speakers and shared access',
      href: `/portal/${eventSlug}/group`,
      count: groupSize,
    },
  ];
}
