import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Every event-owned table carries `eventId` from day one. `E-6` (multi-event) is tagged OPTIONAL,
 * but `D-3` requires a judge's cold-created event to coexist with the seeded demo without either
 * clobbering the other — retrofitting the column later would be a rewrite.
 */

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

export const membershipRole = pgEnum('membership_role', ['organizer', 'reviewer', 'speaker']);
export const apiKeyScope = pgEnum('api_key_scope', ['read', 'write']);
export const webhookDeliveryStatus = pgEnum('webhook_delivery_status', [
  'queued',
  'delivered',
  'failed',
]);
export const formKind = pgEnum('form_kind', ['cfp', 'portal']);
/**
 * `F-4`. Orthogonal to `kind`, which says what the form is *for*. This says what a completed
 * submission *becomes*: an abstract that goes to the review queue, or a session that is already part
 * of the programme. Both write a `submission` row — the hybrid table is the only home the built-ins
 * have — but a session-target form lands it accepted and mints the `scheduled_session` alongside it,
 * so an invited talk reaches the agenda's unscheduled queue without a reviewer ever touching it.
 */
export const formTargetType = pgEnum('form_target_type', ['abstract', 'session']);
export const formStatus = pgEnum('form_status', ['draft', 'open', 'closed']);
/**
 * `F-6`. Which entity a question belongs to. Without it `builtin_key` is a single flat namespace and
 * `title` on the abstract and `firstName` on the person are indistinguishable to every consumer.
 */
export const formFieldEntity = pgEnum('form_field_entity', ['abstract', 'participant']);
export const fieldType = pgEnum('field_type', [
  'short_text',
  'long_text',
  'markdown',
  'select',
  'multi_select',
  'radio',
  'checkbox',
  'number',
  'email',
  'url',
  'date',
  'file',
  'section_break',
]);
export const submissionStatus = pgEnum('submission_status', [
  'draft',
  'submitted',
  'under_review',
  'accepted',
  'declined',
  'waitlisted',
  'withdrawn',
]);
export const participantRoleKind = pgEnum('participant_role_kind', [
  'speaker',
  'co_speaker',
  'moderator',
  'panelist',
]);
export const reviewRoundStatus = pgEnum('review_round_status', ['draft', 'open', 'closed']);
export const reviewAssignmentStatus = pgEnum('review_assignment_status', [
  'pending',
  'completed',
  'declined',
]);
/**
 * `V-1`. What an organizer said about a submission's *staging*, which is not a decision and never
 * writes a status. `hold` is the third value on purpose: without it there is no way to take a
 * proposal the panel's average put in a queue back out of it, and "remove from the queue" would
 * only ever mean "return it to the score's opinion of it".
 */
export const submissionStage = pgEnum('submission_stage', ['accept', 'decline', 'hold']);
/**
 * `ABS-12`. A recusal outlives the assignment it was made against, so it needs a state of its own.
 * `released` is not the same as no row at all: it records an organizer deciding this reviewer may
 * be handed this talk again, and that decision has to stick against the next auto-assign.
 */
export const reviewRecusalStatus = pgEnum('review_recusal_status', ['active', 'released']);
export const taskAudience = pgEnum('task_audience', [
  'all_participants',
  'accepted_participants',
  'manual',
]);
/**
 * `S-16` / `S-17`. Orthogonal to `audience`, which picks the *people*. This picks what one
 * assignment row *is*, and therefore how many of them a task produces and what its answers are
 * about:
 *
 * - `contact` — one row per person, attached to nobody's session. Today's behaviour, and the
 *   default, so every task written before this enum existed keeps meaning exactly what it meant.
 * - `submission` — one row per person *per session*. "Fill this in once for each accepted talk"
 *   was not representable before: a speaker with two accepted sessions got a single row pinned to
 *   whichever one the query happened to return first.
 * - `group` — one row per session's *speaking team*, shared. Every co-speaker sees and can complete
 *   the same row, and the answers belong to the team rather than to whoever got there first.
 *
 * A group is deliberately not a new entity. The only membership fact this schema holds is
 * `participant_role` — who speaks on what — and `S-12` already defines the portal's "Group" as the
 * co-speaker set of a session. A second membership table would drift from the first within a week.
 */
export const taskScope = pgEnum('task_scope', ['contact', 'group', 'submission']);
export const taskKind = pgEnum('task_kind', ['form', 'file_upload', 'acknowledge', 'link']);
export const taskStatus = pgEnum('task_status', [
  'not_started',
  'in_progress',
  'completed',
  'waived',
]);
export const contentRevisionKind = pgEnum('content_revision_kind', ['session', 'participant']);
export const emailStatus = pgEnum('email_status', ['queued', 'sent', 'failed']);
export const smsStatus = pgEnum('sms_status', [
  'queued',
  'sent',
  'delivered',
  'undelivered',
  'failed',
]);
export const smsConsentStatus = pgEnum('sms_consent_status', ['opted_in', 'opted_out']);
export const syncStatus = pgEnum('sync_status', ['pending', 'synced', 'failed']);
export const scheduledSessionStatus = pgEnum('scheduled_session_status', [
  'draft',
  'published',
  'cancelled',
]);
export const sessionRecordingSource = pgEnum('session_recording_source', ['upload', 'external']);
export const prospectStage = pgEnum('prospect_stage', [
  'researching',
  'identified',
  'contacted',
  'interested',
  'confirmed',
  'declined',
]);
export const contactActivityKind = pgEnum('contact_activity_kind', [
  'created',
  'imported',
  'updated',
  'stage_change',
  'event_added',
  'email_sent',
  'merged',
]);
export const segmentKind = pgEnum('segment_kind', ['dynamic', 'curated']);
/**
 * Separate from `scheduledSessionStatus`, which answers "is this slot on the published grid".
 * This one answers "has anyone read the abstract" — a session can be firmly scheduled while its
 * copy is still being argued over, and only the second question gates what the public sees.
 */
export const contentApprovalStatus = pgEnum('content_approval_status', [
  'in_review',
  'approved',
  'changes_requested',
]);
export const speakerWorkflowStatus = pgEnum('speaker_workflow_status', [
  'invited',
  'confirmed',
  'declined',
  'withdrawn',
]);
/**
 * `E-7`. One entity covers both, because the incumbent models them the same way — a *group* record
 * that is either a sponsor or an exhibitor — and the two differ by a single field: an exhibitor
 * stands somewhere on a floor and a sponsor does not. Two tables would duplicate name, tier, logo
 * and link to buy nothing, and a company that is both would become two unrelated rows.
 */
export const sponsorKind = pgEnum('sponsor_kind', ['sponsor', 'exhibitor']);
/** A sponsor is staged privately until an organizer explicitly puts it on public surfaces. */
export const sponsorStatus = pgEnum('sponsor_status', ['draft', 'published']);

// ---------------------------------------------------------------------------
// Identity. Users are global; everything role-shaped is event-scoped through
// `membership`. `role` decides which surface a session may enter and nothing
// more — `E-8` (Sessionboard's permission grid) stays excluded.
// ---------------------------------------------------------------------------

export const user = pgTable(
  'user',
  {
    id: id(),
    email: text('email').notNull().unique(),
    /**
     * The display name, kept as the single string every other surface already renders. `F-6` splits
     * capture into `firstName` / `lastName`; this stays as their join so the roster, the agenda, the
     * exports, the mail merge and the embeds keep reading one column instead of recomposing a name in
     * a dozen places that would each get the edge cases wrong.
     */
    name: text('name'),
    /** `F-6`. Nullable because a name imported as one string may have no surname to speak of. */
    firstName: text('first_name'),
    lastName: text('last_name'),
    phone: text('phone'),
    /** The current phone is not an SMS destination until an OTP bound to it has completed. */
    phoneVerifiedAt: timestamp('phone_verified_at', { withTimezone: true }),
    /** Log-mode proof is invalidated automatically if this deployment later enables Twilio. */
    phoneVerificationTransport: text('phone_verification_transport'),
    notifyEmail: boolean('notify_email').notNull().default(true),
    notifySms: boolean('notify_sms').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    phoneE164: check(
      'user_phone_e164_check',
      sql`${t.phone} is null or ${t.phone} ~ '^\\+[1-9][0-9]{7,14}$'`,
    ),
  }),
);

export const event = pgTable(
  'event',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    tagline: text('tagline'),
    descriptionMarkdown: text('description_markdown'),
    /** `E-2`. Organizer-authored rather than an enum — see `lib/services/events.ts`. */
    eventType: text('event_type'),
    /** `E-2`. The edition's theme, long form. */
    theme: text('theme'),
    timezone: text('timezone').notNull().default('America/Los_Angeles'),
    /**
     * `E-1`. When the event actually runs. Required, and a real instant rather than a date, because a
     * calendar invite and a countdown both need the time of day and "12 October" is two different
     * moments in Rome and in Los Angeles.
     */
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    /**
     * The date-only projection of `startsAt` / `endsAt` into `timezone`. Derived on every write by
     * `resolveEventWindow` and never authored directly — it exists because the public pages, the merge
     * fields and the shipped `/api/v1` payload all read a `YYYY-MM-DD` string, and changing where the
     * dates are stored should not change a contract somebody has already integrated against.
     */
    startsOn: text('starts_on').notNull(),
    endsOn: text('ends_on').notNull(),
    websiteUrl: text('website_url'),
    venueName: text('venue_name'),
    venueAddress: text('venue_address'),
    /** `E-3`. Square mark and wide banner, both rows in `file`. */
    logoFileId: uuid('logo_file_id'),
    bannerFileId: uuid('banner_file_id'),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => user.id),
    /** Per-event counters backing the human-readable refs (`ABS-12`, `SESS-4`) that `S-5` calls for. */
    submissionSeq: integer('submission_seq').notNull().default(0),
    sessionSeq: integer('session_seq').notNull().default(0),
    /**
     * `AR-35`. Whether a detected agenda clash refuses the write or is recorded as a warning the
     * organizer can see and act on. `warn` is the default because a programme is built by moving
     * things through invalid intermediate states — refusing every one of them means the only way to
     * swap two talks is to unschedule one first, and it also means `A-2`'s conflicts view can never
     * render a row. `block` restores the strict behaviour for an organizer who wants it.
     *
     * Only `error`-severity kinds (room, speaker) are ever blockable — see
     * `lib/services/schedule.ts`. Read by every agenda write path through `blockingConflicts`.
     */
    agendaConflictPolicy: text('agenda_conflict_policy').notNull().default('warn'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    conflictPolicy: check(
      'event_agenda_conflict_policy_check',
      sql`${t.agendaConflictPolicy} in ('warn', 'block')`,
    ),
  }),
);

export const membership = pgTable(
  'membership',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    role: membershipRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqueRole: unique('membership_user_event_role').on(t.userId, t.eventId, t.role),
    byEvent: index('membership_event_idx').on(t.eventId),
  }),
);

export const magicToken = pgTable(
  'magic_token',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'cascade' }),
    redirectTo: text('redirect_to'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ byUser: index('magic_token_user_idx').on(t.userId) }),
);

/**
 * `impersonatedByUserId` is what makes `S-10` full impersonation rather than preview: the session
 * acts as `userId` so every write is real, and stays attributable to the organizer who opened it.
 */
export const sessionCookie = pgTable(
  'session_cookie',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    impersonatedByUserId: uuid('impersonated_by_user_id').references(() => user.id, {
      onDelete: 'cascade',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => ({ byUser: index('session_cookie_user_idx').on(t.userId) }),
);

// ---------------------------------------------------------------------------
// Event taxonomy
// ---------------------------------------------------------------------------

export const track = pgTable(
  'track',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    description: text('description'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({
    byEvent: index('track_event_idx').on(t.eventId),
    uniqueName: unique('track_event_name').on(t.eventId, t.name),
  }),
);

export const room = pgTable(
  'room',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    capacity: integer('capacity'),
    floor: text('floor'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({
    byEvent: index('room_event_idx').on(t.eventId),
    uniqueName: unique('room_event_name').on(t.eventId, t.name),
  }),
);

export const sessionFormat = pgTable(
  'session_format',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    durationMinutes: integer('duration_minutes').notNull().default(30),
    description: text('description'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({ byEvent: index('session_format_event_idx').on(t.eventId) }),
);

export const tag = pgTable(
  'tag',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    color: text('color'),
    createdAt: createdAt(),
  },
  (t) => ({ uniqueName: unique('tag_event_name').on(t.eventId, t.name) }),
);

/** `E-5`: a persona is the audience segment a submission targets. */
export const persona = pgTable(
  'persona',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    description: text('description'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({ byEvent: index('persona_event_idx').on(t.eventId) }),
);

/** `E-5`: reusable question definitions an organizer can drop into any form. */
export const fieldLibraryEntry = pgTable(
  'field_library_entry',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    type: fieldType('type').notNull(),
    helpText: text('help_text'),
    options: jsonb('options').$type<string[]>(),
    createdAt: createdAt(),
  },
  (t) => ({ uniqueKey: unique('field_library_event_key').on(t.eventId, t.key) }),
);

// ---------------------------------------------------------------------------
// Sponsors and exhibitors — E-7
// ---------------------------------------------------------------------------

/**
 * `E-7`. The organisations backing an event, as against the people in `contact` and `participant`.
 * Event-scoped like every other collection here, and shaped like one: a name, an ordering, and a
 * handful of fields the organizer fills in.
 *
 * Deliberately not a CRM. There is no contact join, no contract, no invoice and no intake form —
 * `E-7` is Optional and asks for the entity, and the person-shaped records those would need already
 * exist in `contact`. Attaching them is the natural next migration, not this one.
 */
export const sponsor = pgTable(
  'sponsor',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    kind: sponsorKind('kind').notNull().default('sponsor'),
    status: sponsorStatus('status').notNull().default('draft'),
    name: text('name').notNull(),
    /**
     * Free text rather than a second event-scoped list. Tiers are named differently at every
     * conference — Gold/Silver, Principal/Supporting, Legatus/Centurio — they are ordered by the
     * row's own `position`, and nothing else in the app joins against them. A `sponsor_tier` table
     * would be a taxonomy for a taxonomy, and `E-7` does not ask for one.
     */
    tier: text('tier'),
    websiteUrl: text('website_url'),
    description: text('description'),
    /**
     * `boothLocation` is the only field that is about being an exhibitor rather than a sponsor. It
     * is not constrained to `kind = 'exhibitor'`: an organizer who gives a headline sponsor a stand
     * by the door is not making a mistake the database should refuse.
     */
    boothLocation: text('booth_location'),
    /**
     * A row in `file`, held as a bare uuid with no foreign key — the same shape as
     * `event.logo_file_id` and `participant.headshot_file_id`, and for the same reason: the image is
     * decoration, and losing it must never be able to take the sponsor row with it.
     */
    logoFileId: uuid('logo_file_id'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({
    byEvent: index('sponsor_event_idx').on(t.eventId),
    /**
     * `kind` is in the key because a company that sponsors *and* exhibits is two rows with the same
     * name, which is the ordinary case rather than a mistake. All three columns are `NOT NULL`, so
     * this needs none of the NULL-distinctness care a partial unique index would.
     */
    uniqueName: unique('sponsor_event_kind_name').on(t.eventId, t.kind, t.name),
  }),
);

// ---------------------------------------------------------------------------
// Forms
// ---------------------------------------------------------------------------

export const form = pgTable(
  'form',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    kind: formKind('kind').notNull().default('cfp'),
    /** `F-4` */
    targetType: formTargetType('target_type').notNull().default('abstract'),
    /** `F-4`: the participant block is a whole stage on the public flow, switched on or off here. */
    collectsParticipants: boolean('collects_participants').notNull().default(true),
    /** `F-9`: the internal name. Organizers only — it is never rendered publicly. */
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** `F-9`: what a submitter sees as the page title. Falls back to `name` while it is unset. */
    externalTitle: text('external_title'),
    /** `F-9`: the welcome screen's heading, capped at 15 characters by the brief. */
    pageHeading: text('page_heading'),
    /** `F-9`: hide the welcome copy without deleting it. */
    showWelcome: boolean('show_welcome').notNull().default(true),
    status: formStatus('status').notNull().default('draft'),
    introMarkdown: text('intro_markdown'),
    /** `F-7`: the overall participant cap, across every role. Null means no cap. */
    maxParticipants: integer('max_participants'),
    opensAt: timestamp('opens_at', { withTimezone: true }),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    /** `F-13` */
    maxSubmissionsPerUser: integer('max_submissions_per_user'),
    /** `F-14` */
    allowDrafts: boolean('allow_drafts').notNull().default(true),
    /** `F-16`: addresses notified on each new submission. */
    notifyEmails: jsonb('notify_emails').$type<string[]>().notNull().default([]),
    confirmationSubject: text('confirmation_subject'),
    confirmationBodyMarkdown: text('confirmation_body_markdown'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ uniqueSlug: unique('form_event_slug').on(t.eventId, t.slug) }),
);

/**
 * `builtinKey` places one of the six locked fields in the form's running order and lets an
 * organizer relabel it. The *value* still lands in its real `submission` column, never in
 * `submission.answers` — see `lib/forms/contract.ts`.
 *
 * `showIf` may reference only an earlier field, one hop, no chaining. That restriction removes
 * cyclic and cascading-condition bugs by construction rather than by testing.
 */
export const formField = pgTable(
  'form_field',
  {
    id: id(),
    formId: uuid('form_id')
      .notNull()
      .references(() => form.id, { onDelete: 'cascade' }),
    position: integer('position').notNull().default(0),
    step: integer('step').notNull().default(0),
    type: fieldType('type').notNull(),
    key: text('key').notNull(),
    builtinKey: text('builtin_key'),
    label: text('label').notNull(),
    helpText: text('help_text'),
    placeholder: text('placeholder'),
    required: boolean('required').notNull().default(false),
    /**
     * `F-6`. `builtin_key` is scoped by this: `title` is an abstract built-in and `firstName` is a
     * participant one, and the two sets never collide because they are read through different
     * metadata tables.
     */
    entity: formFieldEntity('entity').notNull().default('abstract'),
    options: jsonb('options').$type<string[]>(),
    showIf: jsonb('show_if').$type<{
      fieldId: string;
      op: 'eq' | 'neq' | 'includes' | 'gt' | 'lt' | 'is_empty' | 'not_empty';
      value?: string | number;
    }>(),
    minLength: integer('min_length'),
    maxLength: integer('max_length'),
    /** `F-15`: fields sharing a group are counted together against one combined limit. */
    charLimitGroup: text('char_limit_group'),
    libraryEntryId: uuid('library_entry_id').references(() => fieldLibraryEntry.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => ({
    byForm: index('form_field_form_idx').on(t.formId),
    uniqueKey: unique('form_field_form_key').on(t.formId, t.key),
  }),
);

/**
 * `F-7`. Which roles a given form offers, what the organizer calls each one, and how many people may
 * hold it. The row is per form rather than per event because two calls on the same event genuinely
 * differ — a panel form wants a moderator and three panelists, a lightning-talk form wants one
 * speaker and nothing else.
 *
 * `kind` stays the global `participant_role_kind` enum rather than becoming free text. Every other
 * surface in the app — the portal's group view, the review queue's speaker column, the agenda's
 * double-booking guard, the Accelevents push and the public embeds — reads `participant_role.kind`,
 * and an organizer-typed string there would mean each of them either renders an unknown token or
 * needs its own vocabulary map. What the organizer *does* own is which of the four a form offers,
 * what it is called on screen, its order, and its counts.
 */
export const formParticipantRole = pgTable(
  'form_participant_role',
  {
    id: id(),
    formId: uuid('form_id')
      .notNull()
      .references(() => form.id, { onDelete: 'cascade' }),
    kind: participantRoleKind('kind').notNull(),
    label: text('label').notNull(),
    position: integer('position').notNull().default(0),
    /** How many people must hold this role for a submission to be complete. 0 means optional. */
    minCount: integer('min_count').notNull().default(0),
    /** Null means no ceiling on this role, subject only to `form.maxParticipants`. */
    maxCount: integer('max_count'),
    createdAt: createdAt(),
  },
  (t) => ({
    byForm: index('form_participant_role_form_idx').on(t.formId),
    uniqueKind: unique('form_participant_role_form_kind').on(t.formId, t.kind),
  }),
);

// ---------------------------------------------------------------------------
// Submissions — the hybrid table. The six built-ins are real columns because
// the review queue sorts on them, the agenda joins on them, conflict detection
// compares them and the embeds filter on them. Everything else is `answers`,
// which is only ever read back whole, per submission.
// ---------------------------------------------------------------------------

export const submission = pgTable(
  'submission',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    formId: uuid('form_id')
      .notNull()
      .references(() => form.id, { onDelete: 'cascade' }),
    /** Human-readable ref rendered as `ABS-{ref}`. Unique within the event. */
    ref: integer('ref').notNull(),
    submitterUserId: uuid('submitter_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),

    title: text('title').notNull(),
    descriptionMarkdown: text('description_markdown'),
    formatId: uuid('format_id').references(() => sessionFormat.id, { onDelete: 'set null' }),
    trackId: uuid('track_id').references(() => track.id, { onDelete: 'set null' }),
    level: text('level'),
    personaId: uuid('persona_id').references(() => persona.id, { onDelete: 'set null' }),

    status: submissionStatus('status').notNull().default('draft'),
    /**
     * Defaults to approved because the review that decided to accept the talk *was* the read of the
     * abstract. Starting at `in_review` would silently empty the public agenda for every organizer
     * who never learns this gate exists, which is a worse failure than an unread edit going live.
     */
    contentStatus: contentApprovalStatus('content_status').notNull().default('approved'),
    /**
     * `V-1`. The organizer's own hand on the staging queues, held apart from `status` because
     * staging is not a decision: nothing here mails a speaker or makes a talk agenda-eligible.
     * `null` is the ordinary case and means "whatever the panel's average says", so an event that
     * nobody has staged by hand reads exactly as it did before this column existed. Event-wide
     * rather than per-user — a batch a co-chair cannot see is not a batch.
     */
    stagedDecision: submissionStage('staged_decision'),
    stagedAt: timestamp('staged_at', { withTimezone: true }),
    stagedByUserId: uuid('staged_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    answers: jsonb('answers').$type<Record<string, unknown>>().notNull().default({}),

    submittedAt: timestamp('submitted_at', { withTimezone: true }),
    decidedAt: timestamp('decided_at', { withTimezone: true }),
    decisionNote: text('decision_note'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uniqueRef: unique('submission_event_ref').on(t.eventId, t.ref),
    byEventStatus: index('submission_event_status_idx').on(t.eventId, t.status),
    byForm: index('submission_form_idx').on(t.formId),
  }),
);

export const submissionTag = pgTable(
  'submission_tag',
  {
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submission.id, { onDelete: 'cascade' }),
    tagId: uuid('tag_id')
      .notNull()
      .references(() => tag.id, { onDelete: 'cascade' }),
  },
  (t) => ({ uniquePair: unique('submission_tag_pair').on(t.submissionId, t.tagId) }),
);

/**
 * A person in the context of one event, carrying the portal-owned profile. The plan listed
 * `participant` and `profile` separately; they are folded together because every field on the
 * profile is event-scoped and one-to-one with the participant.
 */
export const participant = pgTable(
  'participant',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    displayName: text('display_name'),
    /**
     * `S-2`. Four separate things the brief names, and they are separate because they answer
     * different questions: `salutation` is how a letter opens ("Dear Ada"), `honorific` is the
     * title that precedes the name on the programme ("Dr", "Prof"), `pronouns` is how the MC
     * refers to them, and `gender` is what the organizer reports on.
     *
     * All free text. An enum would be wrong for `gender` on its face, and wrong for the other
     * three too — honorifics are unbounded across languages and professions, and a fixed list is
     * how a speaker ends up filed under the closest available lie.
     */
    salutation: text('salutation'),
    honorific: text('honorific'),
    pronouns: text('pronouns'),
    gender: text('gender'),
    jobTitle: text('job_title'),
    company: text('company'),
    bioMarkdown: text('bio_markdown'),
    headshotFileId: uuid('headshot_file_id'),
    links: jsonb('links').$type<{ label: string; url: string }[]>().notNull().default([]),
    timezone: text('timezone'),
    /** Where this person is in the organizer's own pipeline, independent of any one submission. */
    workflowStatus: speakerWorkflowStatus('workflow_status').notNull().default('invited'),
    dietaryNotes: text('dietary_notes'),
    accessibilityNotes: text('accessibility_notes'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ uniquePerEvent: unique('participant_event_user').on(t.eventId, t.userId) }),
);

export const participantRole = pgTable(
  'participant_role',
  {
    id: id(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submission.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participant.id, { onDelete: 'cascade' }),
    kind: participantRoleKind('kind').notNull().default('speaker'),
    isPrimary: boolean('is_primary').notNull().default(false),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({
    uniquePair: unique('participant_role_pair').on(t.submissionId, t.participantId),
    byParticipant: index('participant_role_participant_idx').on(t.participantId),
  }),
);

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/**
 * `F-3` and `V-5` are one model, not two: the track a submitter picks on the form is what decides
 * who reviews the talk, and the same rows are what fill a reviewer's queue. This table is that
 * model — a track, and the reviewers who cover it. Auto-assignment reads it to narrow the candidate
 * pool before the existing load balancing runs inside that pool; the reviewer surface reads it to
 * name the tracks a reviewer is responsible for.
 *
 * It is deliberately event-scoped rather than round-scoped. Coverage is a standing fact about a
 * panel ("Cicero reads the aqueduct talks"), and re-declaring it for every round is how the two
 * halves of the requirement would drift apart. `track` already carries the event, so the event is
 * not repeated here — `track.eventId` is the only place it can be wrong.
 */
export const trackReviewer = pgTable(
  'track_reviewer',
  {
    id: id(),
    trackId: uuid('track_id')
      .notNull()
      .references(() => track.id, { onDelete: 'cascade' }),
    reviewerUserId: uuid('reviewer_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => ({
    uniquePair: unique('track_reviewer_pair').on(t.trackId, t.reviewerUserId),
    byTrack: index('track_reviewer_track_idx').on(t.trackId),
    byReviewer: index('track_reviewer_reviewer_idx').on(t.reviewerUserId),
  }),
);

export const reviewRound = pgTable(
  'review_round',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    position: integer('position').notNull().default(0),
    status: reviewRoundStatus('status').notNull().default('draft'),
    /** Tenths on the shared 1–5 scale; integer storage avoids floating-point boundary drift. */
    decisionQueueBarTenths: integer('decision_queue_bar_tenths').notNull().default(30),
    /** Reviewers see each other's scores only once the round closes. */
    blindUntilClose: boolean('blind_until_close').notNull().default(true),
    /**
     * Blind in the other direction: the reviewer cannot see who wrote what. Organizers always see
     * identity, so acceptance decisions and conflict checks still have a name attached to them.
     */
    anonymized: boolean('anonymized').notNull().default(false),
    opensAt: timestamp('opens_at', { withTimezone: true }),
    closesAt: timestamp('closes_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({
    byEvent: index('review_round_event_idx').on(t.eventId),
    decisionQueueBarRange: check(
      'review_round_decision_queue_bar_range',
      sql`${t.decisionQueueBarTenths} between 10 and 50`,
    ),
  }),
);

export const scorecardCriterion = pgTable(
  'scorecard_criterion',
  {
    id: id(),
    reviewRoundId: uuid('review_round_id')
      .notNull()
      .references(() => reviewRound.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    description: text('description'),
    weight: integer('weight').notNull().default(1),
    maxScore: integer('max_score').notNull().default(5),
    position: integer('position').notNull().default(0),
  },
  (t) => ({ byRound: index('scorecard_criterion_round_idx').on(t.reviewRoundId) }),
);

export const reviewAssignment = pgTable(
  'review_assignment',
  {
    id: id(),
    reviewRoundId: uuid('review_round_id')
      .notNull()
      .references(() => reviewRound.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submission.id, { onDelete: 'cascade' }),
    reviewerUserId: uuid('reviewer_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: reviewAssignmentStatus('status').notNull().default('pending'),
    comment: text('comment'),
    assignedAt: createdAt(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => ({
    uniqueTriple: unique('review_assignment_triple').on(
      t.reviewRoundId,
      t.submissionId,
      t.reviewerUserId,
    ),
    byReviewer: index('review_assignment_reviewer_idx').on(t.reviewerUserId),
    bySubmission: index('review_assignment_submission_idx').on(t.submissionId),
  }),
);

/**
 * `ABS-12`, `V-5`. A recusal as a remembered fact rather than the absence of an assignment. The
 * assignment row is the *work*: an organizer frees it so somebody else can pick the talk up, and
 * freeing it used to delete the only trace that a reviewer had ever said no — after which
 * auto-assign handed them the same talk again on the next pass.
 *
 * Submission-scoped, not round-scoped, and for the same reason `track_reviewer` is event-scoped:
 * "I know the author" is a standing fact about a person and a talk, and re-declaring it every
 * round is how the reviewer ends up re-offered it in round two.
 */
export const reviewRecusal = pgTable(
  'review_recusal',
  {
    id: id(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submission.id, { onDelete: 'cascade' }),
    reviewerUserId: uuid('reviewer_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: reviewRecusalStatus('status').notNull().default('active'),
    /** The round it was made in, kept for context. Null once that round is deleted; the fact stays. */
    reviewRoundId: uuid('review_round_id').references(() => reviewRound.id, {
      onDelete: 'set null',
    }),
    reason: text('reason'),
    recusedAt: timestamp('recused_at', { withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp('released_at', { withTimezone: true }),
    releasedByUserId: uuid('released_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (t) => ({
    uniquePair: unique('review_recusal_pair').on(t.submissionId, t.reviewerUserId),
    bySubmission: index('review_recusal_submission_idx').on(t.submissionId),
    byReviewer: index('review_recusal_reviewer_idx').on(t.reviewerUserId),
  }),
);

export const score = pgTable(
  'score',
  {
    id: id(),
    reviewAssignmentId: uuid('review_assignment_id')
      .notNull()
      .references(() => reviewAssignment.id, { onDelete: 'cascade' }),
    criterionId: uuid('criterion_id')
      .notNull()
      .references(() => scorecardCriterion.id, { onDelete: 'cascade' }),
    value: integer('value').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ uniquePair: unique('score_assignment_criterion').on(t.reviewAssignmentId, t.criterionId) }),
);

/**
 * `V-9`. Kept out of `score` because an AI opinion is advisory and must never be averaged into a
 * human panel's numbers — an AI that silently decided an acceptance would be a worse product.
 */
export const aiReview = pgTable(
  'ai_review',
  {
    id: id(),
    submissionId: uuid('submission_id')
      .notNull()
      .references(() => submission.id, { onDelete: 'cascade' }),
    reviewRoundId: uuid('review_round_id').references(() => reviewRound.id, {
      onDelete: 'cascade',
    }),
    model: text('model').notNull(),
    rationaleMarkdown: text('rationale_markdown').notNull(),
    criterionScores: jsonb('criterion_scores')
      .$type<{ criterionId: string; value: number; note?: string }[]>()
      .notNull()
      .default([]),
    createdAt: createdAt(),
  },
  (t) => ({ bySubmission: index('ai_review_submission_idx').on(t.submissionId) }),
);

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

/**
 * `icsUid` is stable for the lifetime of the row and `icsSequence` increments on every change that
 * an attendee's calendar must see. Together they are what make `C-3` update an invite in place
 * instead of duplicating it.
 */
export const scheduledSession = pgTable(
  'scheduled_session',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    submissionId: uuid('submission_id').references(() => submission.id, { onDelete: 'set null' }),
    ref: integer('ref').notNull(),
    title: text('title').notNull(),
    descriptionMarkdown: text('description_markdown'),
    roomId: uuid('room_id').references(() => room.id, { onDelete: 'set null' }),
    trackId: uuid('track_id').references(() => track.id, { onDelete: 'set null' }),
    formatId: uuid('format_id').references(() => sessionFormat.id, { onDelete: 'set null' }),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    status: scheduledSessionStatus('status').notNull().default('draft'),
    /** `A-9` */
    ceuCredits: text('ceu_credits'),
    clientId: text('client_id'),
    icsUid: text('ics_uid').notNull(),
    icsSequence: integer('ics_sequence').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uniqueRef: unique('scheduled_session_event_ref').on(t.eventId, t.ref),
    byEventStart: index('scheduled_session_event_start_idx').on(t.eventId, t.startsAt),
    byRoom: index('scheduled_session_room_idx').on(t.roomId),
  }),
);

// ---------------------------------------------------------------------------
// Tasks and files
// ---------------------------------------------------------------------------

export const file = pgTable(
  'file',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    storageKey: text('storage_key').notNull(),
    filename: text('filename').notNull(),
    contentType: text('content_type').notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    uploadedByUserId: uuid('uploaded_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    /**
     * Re-uploading a deliverable supersedes rather than replaces: the new row points at the first
     * version of its lineage and takes the next `version`, so the old bytes stay downloadable.
     * Null means this row *is* the first version. Highest `version` in a lineage is the current one.
     */
    rootFileId: uuid('root_file_id'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => ({
    byEvent: index('file_event_idx').on(t.eventId),
    byRoot: index('file_root_idx').on(t.rootFileId),
  }),
);

/**
 * A post-conference recording is deliberately separate from the agenda's publication state. An
 * organizer may attach and review media while the programme remains public, then publish the
 * recording only after the session has ended. Exactly one source is retained: either an
 * event-scoped `file` row or a validated external HTTPS URL for recordings too large for the
 * application's bounded upload path.
 */
export const sessionRecording = pgTable(
  'session_recording',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => scheduledSession.id, { onDelete: 'cascade' }),
    source: sessionRecordingSource('source').notNull(),
    fileId: uuid('file_id').references(() => file.id, { onDelete: 'restrict' }),
    externalUrl: text('external_url'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    onePerSession: unique('session_recording_session_unique').on(t.sessionId),
    byEvent: index('session_recording_event_idx').on(t.eventId),
    exactlyOneSource: check(
      'session_recording_exactly_one_source',
      sql`(${t.source} = 'upload' AND ${t.fileId} IS NOT NULL AND ${t.externalUrl} IS NULL) OR (${t.source} = 'external' AND ${t.fileId} IS NULL AND ${t.externalUrl} IS NOT NULL)`,
    ),
  }),
);

/**
 * Review conversation on a deliverable, readable by organizer and speaker alike — the point is that
 * "slides need a bigger font on slide 4" reaches the person who can fix it without leaving the app.
 */
export const fileComment = pgTable(
  'file_comment',
  {
    id: id(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => file.id, { onDelete: 'cascade' }),
    authorUserId: uuid('author_user_id').references(() => user.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ byFile: index('file_comment_file_idx').on(t.fileId) }),
);

/**
 * A before-snapshot written on every organizer edit to session or speaker content, which is what
 * makes "who changed the abstract, and put it back" answerable. Storing the prior state rather than
 * a diff keeps restore a single write and survives later schema drift in the entity itself.
 */
export const contentRevision = pgTable(
  'content_revision',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    entityKind: contentRevisionKind('entity_kind').notNull(),
    entityId: uuid('entity_id').notNull(),
    snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
    summary: text('summary').notNull(),
    editorUserId: uuid('editor_user_id').references(() => user.id, { onDelete: 'set null' }),
    editorName: text('editor_name').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ byEntity: index('content_revision_entity_idx').on(t.entityKind, t.entityId) }),
);

const bytea = customType<{ data: Uint8Array; driverData: Buffer }>({
  dataType: () => 'bytea',
  fromDriver: (value) => new Uint8Array(value),
});

/**
 * Object storage of last resort, addressed by the same key R2 and S3 use. A deployment with neither
 * an R2 binding nor an S3 endpoint keeps uploads here: it costs a row per file, and it buys a
 * Cloudflare deploy that needs no second service — R2 cannot be enabled without a payment method on
 * the account — and a `docker compose up` with no MinIO in it.
 */
export const fileBlob = pgTable('file_blob', {
  storageKey: text('storage_key').primaryKey(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  bytes: bytea('bytes').notNull(),
  createdAt: createdAt(),
});

export const fileRequest = pgTable(
  'file_request',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    label: text('label').notNull(),
    helpText: text('help_text'),
    acceptedTypes: jsonb('accepted_types').$type<string[]>().notNull().default([]),
    maxSizeMb: integer('max_size_mb').notNull().default(25),
    allowMultiple: boolean('allow_multiple').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => ({ byEvent: index('file_request_event_idx').on(t.eventId) }),
);

export const task = pgTable(
  'task',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    descriptionMarkdown: text('description_markdown'),
    kind: taskKind('kind').notNull(),
    audience: taskAudience('audience').notNull().default('accepted_participants'),
    /** `S-16`. What one assignment row is. See `taskScope`. */
    scope: taskScope('scope').notNull().default('contact'),
    /**
     * `S-16`. Pins the task to one session — "this applies to SESS-4" — which the audience enum
     * alone could never say. Setting it also narrows the audience to that session's speakers,
     * because a task about a talk is not owed by people who are not on it.
     */
    submissionId: uuid('submission_id').references(() => submission.id, { onDelete: 'cascade' }),
    formId: uuid('form_id').references(() => form.id, { onDelete: 'set null' }),
    fileRequestId: uuid('file_request_id').references(() => fileRequest.id, {
      onDelete: 'set null',
    }),
    linkUrl: text('link_url'),
    dueAt: timestamp('due_at', { withTimezone: true }),
    required: boolean('required').notNull().default(true),
    position: integer('position').notNull().default(0),
    /** `C-7`: days before `dueAt` on which a reminder fires. Empty means no reminders. */
    reminderDaysBefore: jsonb('reminder_days_before').$type<number[]>().notNull().default([]),
    createdAt: createdAt(),
  },
  (t) => ({ byEvent: index('task_event_idx').on(t.eventId) }),
);

export const taskAssignment = pgTable(
  'task_assignment',
  {
    id: id(),
    taskId: uuid('task_id')
      .notNull()
      .references(() => task.id, { onDelete: 'cascade' }),
    /**
     * Who holds the row. On a `group` assignment this is the session's primary speaker — the row
     * still belongs to somebody so that the `B-1` dashboard, the reminder run and the deliverables
     * board keep working unchanged — but every co-speaker on that session can read and complete it.
     */
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participant.id, { onDelete: 'cascade' }),
    status: taskStatus('status').notNull().default('not_started'),
    /** Null on a `contact` assignment. The session this row is about on the other two scopes. */
    submissionId: uuid('submission_id').references(() => submission.id, { onDelete: 'cascade' }),
    /**
     * Copied from `task.scope` at fan-out. Denormalised for exactly two reasons: the group
     * uniqueness rule below is a partial index, and a partial index cannot reach into another
     * table; and the portal's read has to find a co-speaker's shared rows without joining `task`
     * twice. `reconcileAssignments` rewrites it whenever the task's own scope changes.
     */
    scope: taskScope('scope').notNull().default('contact'),
    fileId: uuid('file_id').references(() => file.id, { onDelete: 'set null' }),
    answers: jsonb('answers').$type<Record<string, unknown>>(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    lastRemindedAt: timestamp('last_reminded_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    /**
     * `S-16` widened this. It used to be a flat `unique(task_id, participant_id)` — one response
     * per person, ever — which is why "fill this in once per accepted session" could not be said.
     *
     * The replacement is two partial indexes rather than one three-column constraint, because a
     * plain `UNIQUE(task_id, participant_id, submission_id)` would stop constraining anything at
     * all on the contact scope: Postgres treats NULLs as distinct, so it would happily take two
     * `(task, person, NULL)` rows. `UNIQUE NULLS NOT DISTINCT` says it in one line but needs
     * Postgres 15, and this schema is deployed against whatever Postgres sits behind a customer's
     * Hyperdrive. Two partial indexes are exact and run anywhere.
     */
    uniqueContact: uniqueIndex('task_assignment_contact_key')
      .on(t.taskId, t.participantId)
      .where(sql`${t.submissionId} is null`),
    uniqueSession: uniqueIndex('task_assignment_session_key')
      .on(t.taskId, t.participantId, t.submissionId)
      .where(sql`${t.submissionId} is not null`),
    /** One shared row per session's speaking team, whoever happens to hold it. */
    uniqueGroup: uniqueIndex('task_assignment_group_key')
      .on(t.taskId, t.submissionId)
      .where(sql`${t.scope} = 'group'`),
    byParticipant: index('task_assignment_participant_idx').on(t.participantId),
    bySubmission: index('task_assignment_submission_idx').on(t.submissionId),
    byStatus: index('task_assignment_status_idx').on(t.status),
  }),
);

// ---------------------------------------------------------------------------
// Portal content and comms
// ---------------------------------------------------------------------------

/**
 * `allowRawHtml` is the brief's "HTML embed support for existing reference material." It is true
 * only for organizer-authored pages; speaker-authored markdown is always rendered with raw HTML
 * stripped. See `lib/markdown.ts`.
 */
export const portalPage = pgTable(
  'portal_page',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    bodyMarkdown: text('body_markdown').notNull().default(''),
    allowRawHtml: boolean('allow_raw_html').notNull().default(true),
    published: boolean('published').notNull().default(false),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ uniqueSlug: unique('portal_page_event_slug').on(t.eventId, t.slug) }),
);

export const portalTheme = pgTable('portal_theme', {
  id: id(),
  eventId: uuid('event_id')
    .notNull()
    .unique()
    .references(() => event.id, { onDelete: 'cascade' }),
  logoFileId: uuid('logo_file_id'),
  accentColor: text('accent_color'),
  welcomeMarkdown: text('welcome_markdown'),
  supportEmail: text('support_email'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const emailTemplate = pgTable(
  'email_template',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
    subject: text('subject').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    smsBody: text('sms_body'),
    enabled: boolean('enabled').notNull().default(true),
    attachIcs: boolean('attach_ics').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ uniqueKey: unique('email_template_event_key').on(t.eventId, t.key) }),
);

/**
 * Doubles as the dev mailbox rendered at `/admin/mail`, which satisfies `T-7a` and removes email
 * deliverability as a single point of failure during judging: a judge who never receives a message
 * can still read it.
 */
export const emailLog = pgTable(
  'email_log',
  {
    id: id(),
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'cascade' }),
    toEmail: text('to_email').notNull(),
    fromEmail: text('from_email').notNull(),
    subject: text('subject').notNull(),
    bodyHtml: text('body_html').notNull(),
    bodyText: text('body_text').notNull(),
    templateKey: text('template_key'),
    icsBody: text('ics_body'),
    status: emailStatus('status').notNull().default('queued'),
    error: text('error'),
    providerMessageId: text('provider_message_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ byEventCreated: index('email_log_event_created_idx').on(t.eventId, t.createdAt) }),
);

export const smsLog = pgTable(
  'sms_log',
  {
    id: id(),
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'cascade' }),
    toPhone: text('to_phone').notNull(),
    fromPhone: text('from_phone').notNull(),
    body: text('body').notNull(),
    templateKey: text('template_key'),
    status: smsStatus('status').notNull().default('queued'),
    error: text('error'),
    providerMessageId: text('provider_message_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    statusUpdatedAt: timestamp('status_updated_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({
    byEventCreated: index('sms_log_event_created_idx').on(t.eventId, t.createdAt),
    byProviderMessage: index('sms_log_provider_message_idx').on(t.providerMessageId),
  }),
);

/** Current permission for a destination. STOP may arrive before Cicero can resolve an account. */
export const smsConsent = pgTable('sms_consent', {
  phone: text('phone').primaryKey(),
  status: smsConsentStatus('status').notNull(),
  source: text('source').notNull(),
  consentedAt: timestamp('consented_at', { withTimezone: true }),
  optedOutAt: timestamp('opted_out_at', { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

/** Short-lived proof that the signed-in account controls one exact E.164 destination. */
export const phoneVerificationChallenge = pgTable(
  'phone_verification_challenge',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    phone: text('phone').notNull(),
    codeHash: text('code_hash').notNull(),
    deliveryTransport: text('delivery_transport').notNull(),
    attempts: integer('attempts').notNull().default(0),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({
    byUserCreated: index('phone_verification_user_created_idx').on(t.userId, t.createdAt),
    validTransport: check(
      'phone_verification_transport_check',
      sql`${t.deliveryTransport} in ('log', 'twilio')`,
    ),
  }),
);

/**
 * Recipient-owned delivery rules. `scopeKey` is either `global` or the event UUID and makes the
 * global row unique even though PostgreSQL normally treats two null event ids as distinct.
 * `templateKey` is `*` for channel/delivery defaults or a category (`submission`, `session`,
 * `task`, `form`, `adhoc`) for the AR-16 opt-out.
 */
export const notificationPreference = pgTable(
  'notification_preference',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'cascade' }),
    scopeKey: text('scope_key').notNull(),
    templateKey: text('template_key').notNull().default('*'),
    notifyEmail: boolean('notify_email'),
    notifySms: boolean('notify_sms'),
    timezone: text('timezone'),
    quietStartMinute: integer('quiet_start_minute'),
    quietEndMinute: integer('quiet_end_minute'),
    smsHourlyLimit: integer('sms_hourly_limit'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uniqueRule: unique('notification_preference_user_scope_template').on(
      t.userId,
      t.scopeKey,
      t.templateKey,
    ),
    byEvent: index('notification_preference_event_idx').on(t.eventId),
    validScope: check(
      'notification_preference_scope_check',
      sql`(${t.scopeKey} = 'global' and ${t.eventId} is null) or ${t.scopeKey} = ${t.eventId}::text`,
    ),
    validQuietStart: check(
      'notification_preference_quiet_start_check',
      sql`${t.quietStartMinute} is null or (${t.quietStartMinute} between 0 and 1439)`,
    ),
    validQuietEnd: check(
      'notification_preference_quiet_end_check',
      sql`${t.quietEndMinute} is null or (${t.quietEndMinute} between 0 and 1439)`,
    ),
    completeQuietWindow: check(
      'notification_preference_quiet_window_check',
      sql`(${t.quietStartMinute} is null) = (${t.quietEndMinute} is null)`,
    ),
    validRate: check(
      'notification_preference_sms_rate_check',
      sql`${t.smsHourlyLimit} is null or (${t.smsHourlyLimit} between 1 and 100)`,
    ),
  }),
);

/** A one-click email action stores only the digest; the bearer token exists in the email alone. */
export const unsubscribeToken = pgTable(
  'unsubscribe_token',
  {
    id: id(),
    tokenHash: text('token_hash').notNull().unique(),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    templateKey: text('template_key').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    usedAt: timestamp('used_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ byTokenHash: index('unsubscribe_token_hash_idx').on(t.tokenHash) }),
);

// ---------------------------------------------------------------------------
// Integrations, API, saved state
// ---------------------------------------------------------------------------

export const apiKey = pgTable(
  'api_key',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** `write` includes reads. Existing unscoped keys migrate to `write` to avoid a silent outage. */
    scope: apiKeyScope('scope').notNull().default('write'),
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ byPrefix: index('api_key_prefix_idx').on(t.prefix) }),
);

/**
 * One current fixed-window counter per caller identity. The row count is bounded per observed
 * identity rather than per request, and the upsert in `lib/rate-limit.ts` makes increments atomic
 * across Worker isolates and self-hosted processes. Operators may prune rows whose `updatedAt` is
 * older than their longest policy window; deletion is safe because the next request recreates one.
 */
export const inboundRateLimit = pgTable('inbound_rate_limit', {
  keyHash: text('key_hash').primaryKey(),
  windowStartedAt: timestamp('window_started_at', { withTimezone: true }).notNull(),
  requestCount: integer('request_count').notNull().default(1),
  updatedAt: updatedAt(),
});

export type WebhookEventType =
  | 'submission.received'
  | 'submission.decision_made'
  | 'session.scheduled';

export const webhookEndpoint = pgTable(
  'webhook_endpoint',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    url: text('url').notNull(),
    /** Required to sign deliveries, and never returned after the create response. */
    signingSecret: text('signing_secret').notNull(),
    secretPrefix: text('secret_prefix').notNull(),
    eventTypes: jsonb('event_types').$type<WebhookEventType[]>().notNull(),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    byEvent: index('webhook_endpoint_event_idx').on(t.eventId),
    uniqueUrl: unique('webhook_endpoint_event_url').on(t.eventId, t.url),
  }),
);

export const webhookDelivery = pgTable(
  'webhook_delivery',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    endpointId: uuid('endpoint_id')
      .notNull()
      .references(() => webhookEndpoint.id, { onDelete: 'cascade' }),
    eventType: text('event_type').$type<WebhookEventType>().notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
    status: webhookDeliveryStatus('status').notNull().default('queued'),
    attempts: integer('attempts').notNull().default(0),
    responseStatus: integer('response_status'),
    error: text('error'),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({
    byEventCreated: index('webhook_delivery_event_created_idx').on(t.eventId, t.createdAt),
    byEndpointCreated: index('webhook_delivery_endpoint_created_idx').on(
      t.endpointId,
      t.createdAt,
    ),
  }),
);

export const accelevantsSync = pgTable(
  'accelevents_sync',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id').references(() => participant.id, {
      onDelete: 'cascade',
    }),
    remoteId: text('remote_id'),
    status: syncStatus('status').notNull().default('pending'),
    error: text('error'),
    requestBody: jsonb('request_body'),
    responseBody: jsonb('response_body'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({ byEvent: index('accelevents_sync_event_idx').on(t.eventId) }),
);

export const airtableSync = pgTable(
  'airtable_sync',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    remoteRecordId: text('remote_record_id'),
    status: syncStatus('status').notNull().default('pending'),
    error: text('error'),
    syncedAt: timestamp('synced_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqueEntity: unique('airtable_sync_entity').on(t.eventId, t.entityType, t.entityId),
  }),
);

export const savedView = pgTable(
  'saved_view',
  {
    id: id(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    surface: text('surface').notNull(),
    name: text('name').notNull(),
    filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => ({ byUserSurface: index('saved_view_user_surface_idx').on(t.userId, t.surface) }),
);

/**
 * The speaker database sits *above* events, so it hangs off the organizer's account rather than
 * carrying the `eventId` every other table does. That is the whole point of it: a speaker who came
 * back for the third year running should not be re-keyed, and a prospect being sourced belongs to
 * nobody's event yet.
 */
export const contact = pgTable(
  'contact',
  {
    id: id(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    email: text('email').notNull(),
    jobTitle: text('job_title'),
    company: text('company'),
    bioMarkdown: text('bio_markdown'),
    headshotUrl: text('headshot_url'),
    location: text('location'),
    source: text('source'),
    tags: jsonb('tags').$type<string[]>().notNull().default([]),
    /** Values for the organizer's own `crm_field` definitions, keyed by that field's `key`. */
    customFields: jsonb('custom_fields').$type<Record<string, string>>().notNull().default({}),
    /**
     * Set when this record lost a merge. The row is kept rather than deleted so that links made
     * before the merge still resolve, and it is filtered out of every directory read.
     */
    mergedIntoContactId: uuid('merged_into_contact_id'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({
    uniqueEmail: unique('contact_owner_email').on(t.ownerUserId, t.email),
    byOwner: index('contact_owner_idx').on(t.ownerUserId),
    byName: index('contact_name_idx').on(t.name),
  }),
);

export const contactNote = pgTable(
  'contact_note',
  {
    id: id(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    /** Set when the note was written on a pipeline card rather than the contact itself. */
    prospectId: uuid('prospect_id'),
    authorUserId: uuid('author_user_id').references(() => user.id, { onDelete: 'set null' }),
    authorName: text('author_name').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ byContact: index('contact_note_contact_idx').on(t.contactId) }),
);

export const contactActivity = pgTable(
  'contact_activity',
  {
    id: id(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    prospectId: uuid('prospect_id'),
    kind: contactActivityKind('kind').notNull(),
    summary: text('summary').notNull(),
    actorUserId: uuid('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    actorName: text('actor_name').notNull(),
    createdAt: createdAt(),
  },
  (t) => ({ byContact: index('contact_activity_contact_idx').on(t.contactId) }),
);

/** What ties a cross-event contact to the per-event `participant` it was pushed into. */
export const contactEventLink = pgTable(
  'contact_event_link',
  {
    id: id(),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id').references(() => participant.id, {
      onDelete: 'set null',
    }),
    createdAt: createdAt(),
  },
  (t) => ({
    uniqueLink: unique('contact_event_link_pair').on(t.contactId, t.eventId),
    byContact: index('contact_event_link_contact_idx').on(t.contactId),
  }),
);

/** Organizer-defined columns on the directory, the CRM counterpart of `field_library_entry`. */
export const crmField = pgTable(
  'crm_field',
  {
    id: id(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    type: fieldType('type').notNull(),
    options: jsonb('options').$type<string[]>().notNull().default([]),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({ uniqueKey: unique('crm_field_owner_key').on(t.ownerUserId, t.key) }),
);

/**
 * A saved slice of the directory. A dynamic segment stores the filter and re-runs it, so a contact
 * imported tomorrow joins it on its own; a curated one stores the member ids and stays put.
 */
export const contactSegment = pgTable(
  'contact_segment',
  {
    id: id(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    kind: segmentKind('kind').notNull().default('dynamic'),
    filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
    memberContactIds: jsonb('member_contact_ids').$type<string[]>().notNull().default([]),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ byOwner: index('contact_segment_owner_idx').on(t.ownerUserId) }),
);

/** A contact being sourced: one card on the kanban board. */
export const prospect = pgTable(
  'prospect',
  {
    id: id(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id')
      .notNull()
      .references(() => contact.id, { onDelete: 'cascade' }),
    /** Null while sourcing is speculative — a prospect need not be aimed at an event yet. */
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'set null' }),
    stage: prospectStage('stage').notNull().default('identified'),
    score: integer('score'),
    rationale: text('rationale'),
    position: integer('position').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => ({ byOwnerStage: index('prospect_owner_stage_idx').on(t.ownerUserId, t.stage) }),
);

export const contactCampaign = pgTable(
  'contact_campaign',
  {
    id: id(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'set null' }),
    subject: text('subject').notNull(),
    bodyMarkdown: text('body_markdown').notNull(),
    recipientCount: integer('recipient_count').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => ({ byOwner: index('contact_campaign_owner_idx').on(t.ownerUserId) }),
);

export const contactCampaignRecipient = pgTable(
  'contact_campaign_recipient',
  {
    id: id(),
    campaignId: uuid('campaign_id')
      .notNull()
      .references(() => contactCampaign.id, { onDelete: 'cascade' }),
    contactId: uuid('contact_id').references(() => contact.id, { onDelete: 'set null' }),
    email: text('email').notNull(),
    /** The rendered subject after merge tags resolved, which is what the organizer needs to audit. */
    renderedSubject: text('rendered_subject').notNull(),
    emailLogId: uuid('email_log_id').references(() => emailLog.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => ({ byCampaign: index('contact_campaign_recipient_idx').on(t.campaignId) }),
);
