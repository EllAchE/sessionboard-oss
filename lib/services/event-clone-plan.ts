import { getTableColumns, getTableName, is } from 'drizzle-orm';
import { getTableConfig, PgTable } from 'drizzle-orm/pg-core';
import * as schema from '@/db/schema';

/**
 * `AD-1`. What a cloned event carries over, declared once and executed from the declaration.
 *
 * An organizer running the same conference again should not retype the forms, the tracks, the
 * rooms, the task list, the email templates and the review criteria. Cloning is the whole feature.
 * But a clone that copies *everything* is not a convenience, it is a privacy incident: last year's
 * speakers never agreed to appear in this year's event, last year's reviews say nothing about this
 * year's talks, and a copied `magic_token` row is a live credential in a place nobody expects one.
 *
 * The dangerous failure is silence. Somebody adds a table next month, nobody remembers this file,
 * and the clone either quietly starts copying personal data or quietly stops copying configuration
 * the organizer thinks they have. So the plan below is **exhaustive over every event-scoped table**
 * and `event-clone-plan.test.ts` fails the build when the schema and this file disagree — in either
 * direction. Adding a table to `db/schema.ts` is therefore a decision you are forced to write down,
 * not one you can forget to make.
 *
 * The same holds one level down: every *column* of every copied table, and every column of `event`
 * itself, carries a rule. A new column on `form` is a new decision, and the test says so.
 */

// ---------------------------------------------------------------------------
// Deriving the blast radius from the schema, rather than from a list
// ---------------------------------------------------------------------------

type TableMeta = {
  name: string;
  table: PgTable;
  columnNames: string[];
  /** Table names this one points at, whatever the column. */
  references: string[];
};

function schemaTables(): TableMeta[] {
  const out: TableMeta[] = [];
  for (const value of Object.values(schema)) {
    if (!is(value as never, PgTable)) continue;
    const table = value as PgTable;
    const config = getTableConfig(table);
    out.push({
      name: getTableName(table),
      table,
      columnNames: Object.keys(getTableColumns(table)),
      references: config.foreignKeys.map((fk) => getTableName(fk.reference().foreignTable)),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export const SCHEMA_TABLES: readonly TableMeta[] = schemaTables();

const BY_NAME = new Map(SCHEMA_TABLES.map((meta) => [meta.name, meta]));

export function tableMeta(name: string): TableMeta {
  const meta = BY_NAME.get(name);
  if (!meta) throw new Error(`No such table in db/schema.ts: ${name}`);
  return meta;
}

/**
 * A table belongs to an event if it says so itself — an `eventId` column or a foreign key to
 * `event` — or if it hangs off something that does. The transitive half matters: `score` has no
 * `eventId`, but it reaches `event` through `review_assignment` → `review_round`, and a clone that
 * only looked at the direct column would miss thirteen tables including every review artefact.
 *
 * Derived at runtime from Drizzle's own metadata rather than maintained by hand, because a hand
 * list is exactly the thing that goes stale.
 */
export function deriveEventScopedTables(): string[] {
  const scoped = new Set<string>();
  for (const meta of SCHEMA_TABLES) {
    if (meta.name === 'event') continue;
    if (meta.columnNames.includes('eventId') || meta.references.includes('event')) {
      scoped.add(meta.name);
    }
  }

  for (let changed = true; changed; ) {
    changed = false;
    for (const meta of SCHEMA_TABLES) {
      if (meta.name === 'event' || scoped.has(meta.name)) continue;
      if (meta.references.some((target) => scoped.has(target))) {
        scoped.add(meta.name);
        changed = true;
      }
    }
  }

  return [...scoped].sort();
}

// ---------------------------------------------------------------------------
// Column rules
// ---------------------------------------------------------------------------

export type ColumnRule =
  /** The database supplies it: a fresh `defaultRandom()` id, a `defaultNow()` stamp. */
  | { kind: 'generated' }
  /** The new event's id. */
  | { kind: 'event' }
  /** Carried across unchanged. */
  | { kind: 'copy' }
  /** A foreign key into another copied table, rewritten to the new row's id. Null stays null. */
  | { kind: 'remap'; table: string }
  /** Forced to null, because the value would be a lie or a leak in the new event. */
  | { kind: 'clear'; reason: string }
  /** Forced to a specific value. */
  | { kind: 'reset'; value: unknown; reason: string }
  /** Supplied by the caller of the clone, not by the source row. */
  | { kind: 'input'; reason: string };

const generated = (): ColumnRule => ({ kind: 'generated' });
const eventRef = (): ColumnRule => ({ kind: 'event' });
const copy = (): ColumnRule => ({ kind: 'copy' });
const remap = (table: string): ColumnRule => ({ kind: 'remap', table });
const clear = (reason: string): ColumnRule => ({ kind: 'clear', reason });
const reset = (value: unknown, reason: string): ColumnRule => ({ kind: 'reset', value, reason });
const input = (reason: string): ColumnRule => ({ kind: 'input', reason });

/**
 * Why a table is *not* copied. Grouped so the tests can assert a property over a whole class —
 * "nothing in `credential` is ever copied" is a rule worth enforcing without naming every token
 * table, since the next token table will be added by someone who never read this file.
 */
export type SkipCategory =
  | 'people'
  | 'submissions'
  | 'credential'
  | 'operational-log'
  | 'integration-state'
  | 'files'
  | 'user-preference'
  | 'commercial';

/** Categories where copying a single row would be a security or privacy defect, not a mess. */
export const NEVER_COPYABLE: readonly SkipCategory[] = [
  'credential',
  'people',
  'submissions',
  'operational-log',
];

export type CopyEntry = {
  action: 'copy';
  reason: string;
  /**
   * How rows of this table are found for the source event. `eventId` for a table that carries the
   * column; otherwise the parent column and the copied table it points at.
   */
  scope: { column: 'eventId' } | { column: string; parent: string };
  columns: Record<string, ColumnRule>;
  /**
   * Rows to leave behind. Declared rather than written as a predicate so it is readable in a
   * review and assertable in a test.
   */
  skipRow?: { column: string; when: 'not-null'; reason: string };
};

export type SkipEntry = {
  action: 'skip';
  category: SkipCategory;
  reason: string;
};

export type PlanEntry = CopyEntry | SkipEntry;

// ---------------------------------------------------------------------------
// The plan
// ---------------------------------------------------------------------------

/**
 * Keyed by table name, exhaustive over `deriveEventScopedTables()`. Tables that are not event
 * scoped — `user`, `event`, `session_cookie`, `file_blob`, `sms_consent`, `inbound_rate_limit`,
 * `phone_verification_challenge` and the account-level CRM (`contact`, `contact_note`,
 * `contact_activity`, `crm_field`, `contact_segment`) — must not appear here at all, and the test
 * checks that too. They belong to a user or to the installation, not to an edition.
 */
export const CLONE_PLAN: Record<string, PlanEntry> = {
  // -------------------------------------------------------------------------
  // Configuration — the point of the feature
  // -------------------------------------------------------------------------

  form: {
    action: 'copy',
    reason: 'The CFP and portal forms are the single biggest thing an organizer would retype.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      kind: copy(),
      targetType: copy(),
      collectsParticipants: copy(),
      name: copy(),
      slug: copy(),
      externalTitle: copy(),
      pageHeading: copy(),
      showWelcome: copy(),
      /**
       * Reset because `opensAt` / `closesAt` are cleared below. An `open` form with no closing date
       * is a form that accepts submissions forever, on an event whose dates the organizer has not
       * finished setting. Draft is the state they can review and then open deliberately.
       */
      status: reset('draft', 'An intake window with its dates cleared must not be live.'),
      introMarkdown: copy(),
      maxParticipants: copy(),
      opensAt: clear("Last year's call window is a trap, not a default."),
      closesAt: clear("Last year's call window is a trap, not a default."),
      maxSubmissionsPerUser: copy(),
      allowDrafts: copy(),
      notifyEmails: copy(),
      confirmationSubject: copy(),
      confirmationBodyMarkdown: copy(),
      createdAt: generated(),
      updatedAt: generated(),
    },
  },

  form_field: {
    action: 'copy',
    reason: 'A form without its fields is not a copied form.',
    scope: { column: 'formId', parent: 'form' },
    columns: {
      id: generated(),
      formId: remap('form'),
      position: copy(),
      step: copy(),
      type: copy(),
      key: copy(),
      builtinKey: copy(),
      label: copy(),
      helpText: copy(),
      placeholder: copy(),
      required: copy(),
      entity: copy(),
      options: copy(),
      showIf: copy(),
      minLength: copy(),
      maxLength: copy(),
      charLimitGroup: copy(),
      libraryEntryId: remap('field_library_entry'),
      createdAt: generated(),
    },
  },

  form_participant_role: {
    action: 'copy',
    reason: 'How many speakers a form asks for is part of the form, not of any submission.',
    scope: { column: 'formId', parent: 'form' },
    columns: {
      id: generated(),
      formId: remap('form'),
      kind: copy(),
      label: copy(),
      position: copy(),
      minCount: copy(),
      maxCount: copy(),
      createdAt: generated(),
    },
  },

  field_library_entry: {
    action: 'copy',
    reason: 'The reusable field definitions the forms are built from.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      key: copy(),
      label: copy(),
      type: copy(),
      helpText: copy(),
      options: copy(),
      createdAt: generated(),
    },
  },

  track: {
    action: 'copy',
    reason: 'Programme taxonomy. Reused verbatim year on year.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      name: copy(),
      color: copy(),
      description: copy(),
      position: copy(),
      createdAt: generated(),
    },
  },

  session_format: {
    action: 'copy',
    reason: 'Programme taxonomy. Reused verbatim year on year.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      name: copy(),
      durationMinutes: copy(),
      description: copy(),
      position: copy(),
      createdAt: generated(),
    },
  },

  room: {
    action: 'copy',
    reason: 'Same venue, same rooms — and re-entering a floor plan by hand is the complaint.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      name: copy(),
      capacity: copy(),
      floor: copy(),
      position: copy(),
      createdAt: generated(),
    },
  },

  tag: {
    action: 'copy',
    reason: 'Programme taxonomy. The tags carry over; what was tagged does not.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      name: copy(),
      color: copy(),
      createdAt: generated(),
    },
  },

  persona: {
    action: 'copy',
    reason: 'Audience personas describe who the conference is for, which does not change annually.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      name: copy(),
      description: copy(),
      position: copy(),
      createdAt: generated(),
    },
  },

  file_request: {
    action: 'copy',
    reason: 'What the event asks speakers to upload — a definition, holding no uploaded bytes.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      label: copy(),
      helpText: copy(),
      acceptedTypes: copy(),
      maxSizeMb: copy(),
      allowMultiple: copy(),
      createdAt: generated(),
    },
  },

  task: {
    action: 'copy',
    reason: 'The speaker checklist. Rebuilding it by hand every year is the AD-1 complaint verbatim.',
    scope: { column: 'eventId' },
    /**
     * A task with `submissionId` set is pinned to one talk — "this applies to SESS-4" — and
     * narrows its own audience to that talk's speakers. Submissions are not copied, so such a row
     * has no meaning here. Nulling the column instead would silently widen the task from four
     * speakers to the whole roster, which is worse than not copying it.
     */
    skipRow: {
      column: 'submissionId',
      when: 'not-null',
      reason: 'A task pinned to one talk is instance data, not a reusable definition.',
    },
    columns: {
      id: generated(),
      eventId: eventRef(),
      name: copy(),
      descriptionMarkdown: copy(),
      kind: copy(),
      audience: copy(),
      scope: copy(),
      submissionId: clear('Submissions are not copied; pinned tasks are dropped by `skipRow`.'),
      formId: remap('form'),
      fileRequestId: remap('file_request'),
      linkUrl: copy(),
      dueAt: clear("Last year's deadline on next year's checklist fires reminders about nothing."),
      required: copy(),
      position: copy(),
      reminderDaysBefore: copy(),
      reminderDaysAfterSend: copy(),
      createdAt: generated(),
    },
  },

  email_template: {
    action: 'copy',
    reason: 'The event voice. Rewriting every acceptance and reminder mail is pure retyping.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      key: copy(),
      name: copy(),
      subject: copy(),
      bodyMarkdown: copy(),
      smsBody: copy(),
      enabled: copy(),
      attachIcs: copy(),
      createdAt: generated(),
      updatedAt: generated(),
    },
  },

  review_round: {
    action: 'copy',
    reason: 'The review process — rounds, blinding, the decision bar — is reused, its verdicts are not.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      name: copy(),
      position: copy(),
      /** Same rule as `form.status`: dates cleared, so the window must not be open. */
      status: reset('draft', 'A review window with its dates cleared must not be live.'),
      decisionQueueBarTenths: copy(),
      blindUntilClose: copy(),
      anonymized: copy(),
      opensAt: clear("Last year's review window is a trap, not a default."),
      closesAt: clear("Last year's review window is a trap, not a default."),
      createdAt: generated(),
    },
  },

  scorecard_criterion: {
    action: 'copy',
    reason: 'The review criteria named in AD-1. Weights and maxima are the rubric, not a score.',
    scope: { column: 'reviewRoundId', parent: 'review_round' },
    columns: {
      id: generated(),
      reviewRoundId: remap('review_round'),
      label: copy(),
      description: copy(),
      // `ABS-03`: which question the criterion asks, and a dropdown's choices. Both are rubric, so
      // the next edition inherits the same scorecard rather than a numeric shadow of it.
      type: copy(),
      options: copy(),
      weight: copy(),
      maxScore: copy(),
      position: copy(),
    },
  },

  portal_page: {
    action: 'copy',
    reason: 'Speaker-portal guidance pages: authored content, reused each edition.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      slug: copy(),
      title: copy(),
      bodyMarkdown: copy(),
      allowRawHtml: copy(),
      /**
       * Carried, unlike `form.status`. Publishing here only exposes the page inside the new
       * event's own portal, which has no participants yet, and no date was cleared underneath it.
       */
      published: copy(),
      position: copy(),
      createdAt: generated(),
      updatedAt: generated(),
    },
  },

  portal_theme: {
    action: 'copy',
    reason: 'Portal branding and welcome copy — the "branding" half of AD-1.',
    scope: { column: 'eventId' },
    columns: {
      id: generated(),
      eventId: eventRef(),
      logoFileId: clear('File rows are not copied; see the `file` entry.'),
      accentColor: copy(),
      welcomeMarkdown: copy(),
      supportEmail: copy(),
      createdAt: generated(),
      updatedAt: generated(),
    },
  },

  // -------------------------------------------------------------------------
  // People — nobody is enrolled in an event they have not heard of
  // -------------------------------------------------------------------------

  membership: {
    action: 'skip',
    category: 'people',
    reason:
      'Roles are consent to work on one edition. The organizer running the clone is granted ' +
      'organizer on the new event directly; nobody else is enrolled without being invited.',
  },
  participant: {
    action: 'skip',
    category: 'people',
    reason: "Last year's speakers did not agree to appear in this year's event.",
  },
  participant_role: {
    action: 'skip',
    category: 'people',
    reason: 'Who spoke on what, for talks that no longer exist here.',
  },
  track_reviewer: {
    action: 'skip',
    category: 'people',
    reason: 'A reviewer volunteers per edition; re-rostering them silently is not consent.',
  },
  speaker_unavailability: {
    action: 'skip',
    category: 'people',
    reason:
      'One named speaker saying they cannot present between two specific instants. It is people ' +
      "data and time-bearing data at once: it hangs off a participant who is not copied, and its " +
      "window falls inside last year's event dates, so it could only ever block the wrong hours.",
  },
  notification_preference: {
    action: 'skip',
    category: 'user-preference',
    reason:
      'A per-user contact preference, including quiet hours and SMS limits. Copying it decides ' +
      'on their behalf how a new event may contact them.',
  },
  saved_view: {
    action: 'skip',
    category: 'user-preference',
    reason:
      "One organizer's private filter set, whose `filters` blob names track and tag ids from the " +
      'source event that would not resolve here.',
  },

  // -------------------------------------------------------------------------
  // Submissions, reviews, decisions — meaningless against a different call
  // -------------------------------------------------------------------------

  submission: {
    action: 'skip',
    category: 'submissions',
    reason: 'A proposal was made to one call for papers. It is not a proposal to the next one.',
  },
  submission_tag: {
    action: 'skip',
    category: 'submissions',
    reason: 'Tagging of submissions that are not copied.',
  },
  scheduled_session: {
    action: 'skip',
    category: 'submissions',
    reason: "Last year's agenda, at last year's times, for last year's talks.",
  },
  session_recording: {
    action: 'skip',
    category: 'submissions',
    reason: 'A recording of a talk that happened, attached to a session that is not copied.',
  },
  review_assignment: {
    action: 'skip',
    category: 'submissions',
    reason: 'Who was asked to read what, for submissions that do not exist here.',
  },
  review_recusal: {
    action: 'skip',
    category: 'submissions',
    reason: 'A declared conflict of interest against one specific talk.',
  },
  score: {
    action: 'skip',
    category: 'submissions',
    reason: "A number one reviewer gave one talk. It says nothing about next year's programme.",
  },
  ai_review: {
    action: 'skip',
    category: 'submissions',
    reason: 'Model-generated assessment of a specific submission.',
  },
  task_assignment: {
    action: 'skip',
    category: 'people',
    reason:
      'One person owing one task, with their uploaded file and their answers. The task definition ' +
      'is copied; who owes it is not.',
  },

  // -------------------------------------------------------------------------
  // Credentials — copying any of these is a security defect, not untidiness
  // -------------------------------------------------------------------------

  magic_token: {
    action: 'skip',
    category: 'credential',
    reason: 'A live sign-in credential. Duplicating one mints a second way to become that user.',
  },
  unsubscribe_token: {
    action: 'skip',
    category: 'credential',
    reason: 'A bearer token that acts on a mail preference without authentication.',
  },
  api_key: {
    action: 'skip',
    category: 'credential',
    reason:
      'A hashed API credential scoped to one event. A copy silently widens what an issued key ' +
      'can reach.',
  },
  webhook_endpoint: {
    action: 'skip',
    category: 'credential',
    reason:
      'Holds `signingSecret`. Copying it shares one secret across two events, and points a fresh ' +
      "event's traffic at last year's integration without anyone re-confirming the URL.",
  },
  share_link: {
    action: 'skip',
    category: 'credential',
    reason:
      'Holds `tokenHash`, a bearer credential that shows a draft programme to anyone holding the ' +
      "URL and never asks them to sign in. A copy would hand every recipient of last year's link " +
      "an unannounced window onto next year's unpublished draft. `expiresAt` is set against the " +
      'source event, so the copy would also arrive already expired or expiring at an arbitrary ' +
      'moment, and the unique `tokenHash` means one link could only ever be shared, not reissued.',
  },

  // -------------------------------------------------------------------------
  // Operational history — a record of things that happened, which did not happen here
  // -------------------------------------------------------------------------

  email_log: {
    action: 'skip',
    category: 'operational-log',
    reason: 'Rendered message bodies and recipient addresses for mail already sent.',
  },
  sms_log: {
    action: 'skip',
    category: 'operational-log',
    reason: 'Recipient phone numbers and message bodies for texts already sent.',
  },
  webhook_delivery: {
    action: 'skip',
    category: 'operational-log',
    reason: 'Delivery attempts and payloads for an endpoint that is not copied either.',
  },
  content_revision: {
    action: 'skip',
    category: 'operational-log',
    reason:
      'The edit trail, including full JSON snapshots of sessions and participants and the name of ' +
      'the person who made each change. Copying it re-materializes participant data through the ' +
      'back door even though `participant` is skipped.',
  },
  contact_campaign: {
    action: 'skip',
    category: 'operational-log',
    reason: 'A CRM send that already went out, tagged with the event it went out for.',
  },
  contact_campaign_recipient: {
    action: 'skip',
    category: 'operational-log',
    reason: 'Per-recipient send record, with the address and the rendered subject.',
  },
  airtable_sync: {
    action: 'skip',
    category: 'integration-state',
    reason:
      'Bookkeeping that maps local ids to remote record ids. Every local id here is about to be ' +
      'different, so a copied row points at the wrong remote record.',
  },
  accelevents_sync: {
    action: 'skip',
    category: 'integration-state',
    reason: 'Same as `airtable_sync`, plus stored request and response bodies.',
  },

  // -------------------------------------------------------------------------
  // Files and commercial relationships
  // -------------------------------------------------------------------------

  file: {
    action: 'skip',
    category: 'files',
    reason:
      'Not a judgment call once you read `storageKey()` in `lib/storage`: keys are minted as ' +
      '`events/<sourceEventId>/<uuid>/<name>`. A copied row would leave the new event addressing ' +
      "an object filed under the old event's prefix, and `deleteFile` in the source event deletes " +
      'the whole lineage from storage — silently emptying the clone. Most rows are also headshots ' +
      'and decks, which is participant data.',
  },
  file_comment: {
    action: 'skip',
    category: 'files',
    reason: 'Organizer review notes on a specific uploaded deck.',
  },
  event_exhibitor_map: {
    action: 'skip',
    category: 'files',
    reason:
      "A `file` row for last year's floor plan, and files are not copied. The unique constraint " +
      'on `fileId` would also make any sharing scheme fail outright.',
  },
  sponsor: {
    action: 'skip',
    category: 'commercial',
    reason:
      'A signed commercial relationship with a tier, a booth and a publication status. Copying it ' +
      "would republish last year's sponsors on this year's public wall, which is a claim the " +
      'organizer has not earned the right to make yet.',
  },
  prospect: {
    action: 'skip',
    category: 'people',
    reason: 'A named person in a sales pipeline, with a stage and a score.',
  },
  contact_event_link: {
    action: 'skip',
    category: 'people',
    reason: 'Links an account-level CRM contact to this edition. That is per-edition, by design.',
  },
};

// ---------------------------------------------------------------------------
// `event` itself
// ---------------------------------------------------------------------------

/**
 * The root row is built column by column rather than spread from the source, so a column added to
 * `event` is a decision somebody has to make instead of a value that leaks across by default.
 * `event-clone-plan.test.ts` fails when this map and `db/schema.ts` disagree — which is the point,
 * and is what will happen the first time someone lands a new `event` column.
 */
export const EVENT_COLUMN_PLAN: Record<string, ColumnRule> = {
  id: generated(),
  slug: input('A second event cannot share a URL; the caller names the new one.'),
  name: input('The edition changes — "…2027" — so the caller names it.'),
  tagline: copy(),
  descriptionMarkdown: copy(),
  eventType: copy(),
  theme: copy(),
  timezone: copy(),
  startsAt: input("Required, and last year's dates are the trap AD-1 warns about."),
  endsAt: input("Required, and last year's dates are the trap AD-1 warns about."),
  startsOn: input('Derived from the new window by `resolveEventWindow`, never authored.'),
  endsOn: input('Derived from the new window by `resolveEventWindow`, never authored.'),
  websiteUrl: copy(),
  venueName: copy(),
  venueAddress: copy(),
  logoFileId: clear('Points into `file`, which is not copied.'),
  bannerFileId: clear('Points into `file`, which is not copied.'),
  ownerUserId: input('The organizer running the clone owns what they created.'),
  submissionSeq: reset(0, 'The new event numbers its own submissions from ABS-1.'),
  sessionSeq: reset(0, 'The new event numbers its own sessions from SESS-1.'),
  agendaConflictPolicy: copy(),
  createdAt: generated(),
  updatedAt: generated(),
};

// ---------------------------------------------------------------------------
// Reading the plan
// ---------------------------------------------------------------------------

export function copiedTables(): string[] {
  return Object.entries(CLONE_PLAN)
    .filter(([, entry]) => entry.action === 'copy')
    .map(([name]) => name);
}

export function copyEntry(name: string): CopyEntry {
  const entry = CLONE_PLAN[name];
  if (!entry || entry.action !== 'copy') throw new Error(`${name} is not a copied table`);
  return entry;
}

/**
 * Copy order: a table lands after every table it points at, so `remap` always has an id map to
 * read. Derived from the plan's own `remap` and `scope.parent` declarations rather than written
 * down, so adding a copied table with a new dependency cannot leave the order stale. Throws on a
 * cycle instead of looping, and throws when a `remap` names a table the plan does not copy — which
 * is the mistake that would otherwise produce a dangling foreign key.
 */
export function copyOrder(): string[] {
  const names = copiedTables();
  const deps = new Map<string, string[]>();

  for (const name of names) {
    const entry = copyEntry(name);
    const targets = new Set<string>();
    if ('parent' in entry.scope) targets.add(entry.scope.parent);
    for (const rule of Object.values(entry.columns)) {
      if (rule.kind === 'remap') targets.add(rule.table);
    }
    for (const target of targets) {
      if (!names.includes(target)) {
        throw new Error(`${name} remaps into ${target}, which the plan does not copy`);
      }
    }
    deps.set(name, [...targets]);
  }

  const ordered: string[] = [];
  const state = new Map<string, 'visiting' | 'done'>();

  const visit = (name: string, trail: string[]): void => {
    const seen = state.get(name);
    if (seen === 'done') return;
    if (seen === 'visiting') {
      throw new Error(`Cycle in the clone plan: ${[...trail, name].join(' -> ')}`);
    }
    state.set(name, 'visiting');
    for (const dep of deps.get(name) ?? []) visit(dep, [...trail, name]);
    state.set(name, 'done');
    ordered.push(name);
  };

  for (const name of [...names].sort()) visit(name, []);
  return ordered;
}
