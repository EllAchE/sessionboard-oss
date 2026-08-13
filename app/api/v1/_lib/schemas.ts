import { z } from 'zod';
import { parseSpeakerName } from '@/lib/speaker-name';

/**
 * `Z-5`. One set of schemas, two jobs: they validate what comes in and they generate
 * `/api/v1/openapi.json`. A hand-written spec drifts from the handler the first time someone adds a
 * field; a generated one cannot.
 *
 * `.describe()` on a field is the description that reaches the spec, so it is documentation that
 * lives next to the validation rather than in a separate file that nobody updates.
 */

/**
 * `E-1` turned the event window into a required pair of instants. This payload is already shipped,
 * so the change is additive rather than a replacement: `startsOn` / `endsOn` keep their exact shape
 * — a date-only string, still declared nullable — and the instants arrive beside them as
 * `startsAt` / `endsAt`. Anything reading the old two fields sees no difference; anything that needs
 * the time of day now has it.
 */
export const eventSchema = z
  .object({
    slug: z.string().describe('URL-safe identifier for the event'),
    name: z.string(),
    tagline: z.string().nullable(),
    description: z.string().nullable().describe('Markdown'),
    eventType: z.string().nullable().describe('Organizer-set, e.g. Conference'),
    theme: z.string().nullable().describe('The theme of this edition, long form'),
    timezone: z.string().describe('IANA timezone, e.g. America/Los_Angeles'),
    startsOn: z.string().nullable().describe('ISO date, in the event timezone'),
    endsOn: z.string().nullable().describe('ISO date, in the event timezone'),
    startsAt: z.string().describe('ISO 8601 instant the event starts'),
    endsAt: z.string().describe('ISO 8601 instant the event ends'),
    websiteUrl: z.string().nullable(),
    venueName: z.string().nullable(),
    venueAddress: z.string().nullable(),
  })
  .describe('A conference or event');

export const sessionSchema = z
  .object({
    id: z.string().describe('UUID'),
    ref: z.string().describe('Human-readable reference, e.g. SESS-4'),
    title: z.string(),
    description: z.string().nullable().describe('Markdown'),
    status: z.enum(['draft', 'published', 'cancelled']),
    startsAt: z.string().nullable().describe('ISO 8601'),
    endsAt: z.string().nullable().describe('ISO 8601'),
    room: z.string().nullable(),
    track: z.string().nullable(),
    format: z.string().nullable(),
    ceuCredits: z.string().nullable(),
    speakers: z.array(
      z.object({
        id: z.string(),
        name: z.string(),
        jobTitle: z.string().nullable(),
        company: z.string().nullable(),
        isPrimary: z.boolean(),
      }),
    ),
  })
  .describe('A scheduled session on the agenda');

export const speakerSchema = z
  .object({
    id: z.string().describe('UUID'),
    name: z.string(),
    pronouns: z.string().nullable(),
    jobTitle: z.string().nullable(),
    company: z.string().nullable(),
    bio: z.string().nullable().describe('Markdown'),
    headshotUrl: z.string().nullable(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
    sessions: z.array(z.object({ id: z.string(), title: z.string() })),
  })
  .describe('A speaker with at least one accepted session');

export const agendaSchema = z
  .object({
    event: eventSchema,
    days: z.array(
      z.object({
        date: z.string().describe('ISO date in the event timezone'),
        sessions: z.array(sessionSchema),
      }),
    ),
    /** Published sessions with no time yet, so a consumer does not silently drop them. */
    unscheduled: z.array(sessionSchema),
  })
  .describe('The published agenda, grouped by day');

export const submissionSchema = z
  .object({
    id: z.string().describe('UUID'),
    ref: z.string().describe('Human-readable reference, e.g. ABS-12'),
    title: z.string(),
    description: z.string().nullable().describe('Markdown'),
    status: z.enum([
      'draft',
      'submitted',
      'under_review',
      'accepted',
      'declined',
      'waitlisted',
      'withdrawn',
    ]),
    track: z.string().nullable(),
    format: z.string().nullable(),
    level: z.string().nullable(),
    tags: z.array(z.string()),
    submitter: z.object({ name: z.string().nullable(), email: z.string() }),
    answers: z.record(z.unknown()).describe('Custom form answers, keyed by field key'),
    submittedAt: z.string().nullable().describe('ISO 8601'),
    decidedAt: z.string().nullable().describe('ISO 8601'),
  })
  .describe('A CFP submission. Requires an API key.');

const queryFilter = z.string().trim().min(1).max(120);
const listLimit = z
  .preprocess(
    (value) => (typeof value === 'string' && /^[1-9]\d{0,2}$/.test(value) ? Number(value) : value),
    z.number().int().min(1).max(200),
  )
  .optional()
  .describe('Defaults to 100; maximum 200');
const listOffset = z
  .preprocess(
    (value) => (typeof value === 'string' && /^(?:0|[1-9]\d*)$/.test(value) ? Number(value) : value),
    z.number().int().min(0).max(10_000),
  )
  .optional()
  .describe('Zero-based result offset; defaults to 0');

export const sessionListQuery = z
  .object({
    status: z.enum(['draft', 'published', 'cancelled']).optional().describe('Defaults to published'),
    q: queryFilter.optional().describe('Search title, description, taxonomy, and speaker names'),
    track: queryFilter.optional().describe('Track name or id'),
    room: queryFilter.optional().describe('Room name or id'),
    format: queryFilter.optional().describe('Session format name'),
    speaker: queryFilter.optional().describe('Speaker name or participant id'),
    startsAfter: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe('Keep sessions starting at or after this ISO 8601 instant'),
    startsBefore: z
      .string()
      .datetime({ offset: true })
      .optional()
      .describe('Keep sessions starting before this ISO 8601 instant'),
    limit: listLimit,
    offset: listOffset,
  })
  .strict();

export const speakerListQuery = z
  .object({
    q: queryFilter.optional().describe('Search name, biography, company, role, links, and sessions'),
    company: queryFilter.optional().describe('Company name'),
    session: queryFilter.optional().describe('Session title or id'),
    limit: listLimit,
    offset: listOffset,
  })
  .strict();

export const submissionListQuery = z
  .object({
    status: z
      .enum(['draft', 'submitted', 'under_review', 'accepted', 'declined', 'waitlisted', 'withdrawn'])
      .optional(),
    limit: listLimit,
  })
  .strict();

const answerText = z.string().max(20_000);
const answerValue = z.union([
  answerText,
  z.number(),
  z.boolean(),
  z.array(z.string().max(1_000)).max(100),
  z.null(),
]);
const answers = z.record(z.string().min(1).max(120), answerValue).superRefine((value, context) => {
  if (Object.keys(value).length > 100) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Answers are limited to 100 fields',
    });
  }
});

const speakerNameInput = z.string().transform((value, context) => {
  try {
    return parseSpeakerName(value) ?? undefined;
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid speaker name',
    });
    return z.NEVER;
  }
});

/**
 * `F-6`. The same rules the single `name` box gets, except that a participant's halves are not
 * optional: `PARTICIPANT_BUILTIN_META` locks First Name, Last Name and Email required, because a
 * person missing one of them is a row nobody can contact or print.
 */
const requiredSpeakerNameInput = z.string().transform((value, context) => {
  try {
    const parsed = parseSpeakerName(value);
    if (parsed) return parsed;
    context.addIssue({ code: 'custom', message: 'This name is required' });
  } catch (error) {
    context.addIssue({
      code: 'custom',
      message: error instanceof Error ? error.message : 'Invalid speaker name',
    });
  }
  return z.NEVER;
});

const participantRoleKind = z
  .enum(['speaker', 'co_speaker', 'moderator', 'panelist'])
  .describe('Must be a role this form offers; `F-7` counts are enforced against it');

/**
 * `F-6` / `F-7`. One person on a submission, exactly as the web CFP's participant stage collects
 * them: the two name halves and the email land on that person's own account, the biography on their
 * own participant row, and the role is checked against the form's configuration before anything is
 * written.
 */
export const createSubmissionParticipant = z
  .object({
    firstName: requiredSpeakerNameInput.describe('Given name'),
    lastName: requiredSpeakerNameInput.describe('Family name'),
    email: z
      .string()
      .email()
      .describe("The first person is the submitter, so their address must be the signed-in speaker's"),
    phone: z.string().max(40).nullish().describe('Mobile number, when the form asks for one'),
    biography: z.string().max(5_000).nullish().describe('Markdown'),
    role: participantRoleKind.default('speaker'),
  })
  .strict();

export const createSubmissionBody = z
  .object({
    email: z
      .string()
      .email()
      .optional()
      .describe('Optional consistency check; when present it must match the signed-in speaker'),
    name: speakerNameInput.optional().describe('Submitter display name'),
    mode: z
      .enum(['draft', 'submit'])
      .default('submit')
      .describe('Save a private draft or file the proposal for review'),
    answers: answers.describe(
      'Keyed by the form field key. Built-in keys are title, description, format, track, level, tags.',
    ),
    /**
     * Omitting this keeps the pre-`F-6` behaviour exactly — the signed-in speaker is linked as the
     * sole primary speaker — but it is still measured against the form's `F-7` minimums, because a
     * form that asks for a moderator does not stop asking because the submission arrived through a
     * different door.
     */
    participants: z
      .array(createSubmissionParticipant)
      .min(1)
      .max(50)
      .optional()
      .describe(
        'Only accepted by a form with collectsParticipants. The first person is the submitter. Omit to file as the signed-in speaker alone.',
      ),
  })
  .strict()
  .describe('A submission to a published form');

export const createSubmissionResponse = z.object({
  id: z.string(),
  ref: z.string(),
  /**
   * `F-4` is why `accepted` is here. A form whose `targetType` is `session` is collecting the
   * programme itself rather than proposals to decide on, so a completed submission to it lands
   * decided and mints its session immediately. Read `targetType` off the form to know which of the
   * two a submit will return.
   */
  status: z
    .enum(['draft', 'submitted', 'accepted'])
    .describe('accepted only on a form whose targetType is session'),
  title: z.string(),
});

const conditionSchema = z.object({
  fieldId: z.string(),
  op: z.enum(['eq', 'neq', 'includes', 'gt', 'lt', 'is_empty', 'not_empty']),
  value: z.union([z.string(), z.number()]).optional(),
});

/**
 * `F-6` split `form_field` into two namespaces, so `builtinKey` alone stopped being able to say what
 * a question is: `title` belongs to the abstract and `firstName` belongs to a person, and the two
 * sets are read through different metadata tables. `entity` is the discriminator that tells them
 * apart, and it arrives beside the existing keys rather than replacing any of them.
 *
 * `builtinKey` keeps its exact abstract-only enum — widening it to cover participant keys would
 * retype a shipped field and hand an existing consumer a value its switch has no case for. A
 * participant question carries `participantKey` instead, and `builtinKey` stays null there.
 */
export const formFieldSchema = z.object({
  id: z.string(),
  key: z.string(),
  entity: z
    .enum(['abstract', 'participant'])
    .describe('Which entity this question is about. Defaults to abstract, as it always did.'),
  builtinKey: z
    .enum(['title', 'description', 'format', 'track', 'level', 'tags'])
    .nullable()
    .describe('Abstract built-ins only; always null when entity is participant'),
  participantKey: z
    .enum(['firstName', 'lastName', 'email', 'phone', 'biography'])
    .nullable()
    .describe('Participant built-ins only; always null when entity is abstract'),
  type: z.enum([
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
  ]),
  label: z.string(),
  helpText: z.string().nullable(),
  placeholder: z.string().nullable(),
  position: z.number().int(),
  step: z.number().int(),
  required: z.boolean(),
  options: z.array(z.string()).nullable(),
  optionLabels: z.record(z.string()).nullable(),
  showIf: conditionSchema.nullable(),
  minLength: z.number().int().nullable(),
  maxLength: z.number().int().nullable(),
  charLimitGroup: z.string().nullable(),
});

/**
 * `F-9` exists because the internal form name was leaking onto public surfaces, and this is a public
 * surface. `name` therefore carries the same string the web CFP renders — the organizer's
 * `externalTitle` when they set one, the internal name until they do — which is exactly the fallback
 * the submit page uses. Nothing is renamed or retyped; a form with no external title set is byte for
 * byte what it was, and `externalTitle` arrives beside `name` for a consumer that wants the raw
 * field.
 */
const publicFormTitles = {
  name: z
    .string()
    .describe('The public title: externalTitle when the organizer set one, the internal name until then'),
  externalTitle: z.string().describe('`F-9`: what the submitter sees. Same fallback as `name`.'),
};

export const openCallSchema = z.object({
  slug: z.string(),
  ...publicFormTitles,
  closesAt: z.string().nullable().describe('ISO 8601'),
});

/** `F-7`. One role this form offers, what the organizer calls it, and how many may hold it. */
export const formParticipantRoleSchema = z.object({
  id: z.string(),
  kind: z.enum(['speaker', 'co_speaker', 'moderator', 'panelist']),
  label: z.string().describe('The organizer’s name for this role on this form'),
  position: z.number().int(),
  minCount: z.number().int().describe('How many must hold it for a submission to be complete'),
  maxCount: z.number().int().nullable().describe('Null means no ceiling beyond maxParticipants'),
});

/**
 * `0008` gave a form a target, a participant block and a welcome screen, and none of it reached this
 * payload — so an agent reading the contract could not tell a session-target form from an abstract
 * one, could not know participants were expected, and could not see the participant questions at
 * all. Every addition sits beside the existing keys; not one of them changes.
 */
export const publicFormSchema = z.object({
  id: z.string(),
  slug: z.string(),
  ...publicFormTitles,
  pageHeading: z.string().nullable().describe('`F-9`: the welcome screen heading, at most 15 characters'),
  showWelcome: z.boolean().describe('`F-9`: false hides the welcome copy without deleting it'),
  introMarkdown: z.string().nullable(),
  opensAt: z.string().nullable().describe('ISO 8601'),
  closesAt: z.string().nullable().describe('ISO 8601'),
  allowDrafts: z.boolean(),
  maxSubmissionsPerUser: z.number().int().nullable(),
  targetType: z
    .enum(['abstract', 'session'])
    .describe('`F-4`: a session-target form lands accepted and mints its session on submit'),
  collectsParticipants: z
    .boolean()
    .describe('`F-4`: true when a submission carries a cast, collected through participantFields'),
  maxParticipants: z.number().int().nullable().describe('`F-7`: null means no overall cap'),
  fields: z.array(formFieldSchema).describe('The abstract questions, in running order'),
  participantFields: z
    .array(formFieldSchema)
    .describe('`F-6`: the questions asked about each person. Empty unless collectsParticipants.'),
  roles: z.array(formParticipantRoleSchema).describe('`F-7`: the roles this form offers'),
});

export const mySubmissionSchema = z.object({
  id: z.string(),
  ref: z.string(),
  title: z.string(),
  descriptionMarkdown: z.string().nullable(),
  status: z.enum([
    'draft',
    'submitted',
    'under_review',
    'accepted',
    'declined',
    'waitlisted',
    'withdrawn',
  ]),
  level: z.string().nullable(),
  format: z.string().nullable(),
  track: z.string().nullable(),
  formId: z.string(),
  formSlug: z.string(),
  formName: z.string(),
  editable: z.boolean(),
  role: z.enum(['speaker', 'co_speaker', 'moderator', 'panelist']),
  isPrimary: z.boolean(),
  answers: answers,
  submittedAt: z.string().nullable().describe('ISO 8601'),
  scheduled: z
    .object({
      ref: z.string(),
      title: z.string(),
      startsAt: z.string().nullable().describe('ISO 8601'),
      endsAt: z.string().nullable().describe('ISO 8601'),
      room: z.string().nullable(),
      published: z.boolean(),
    })
    .nullable(),
});

export const updateMySubmissionBody = z
  .object({
    title: z.string().trim().min(3).max(255),
    descriptionMarkdown: z.string().max(5_000).optional(),
    level: z.string().trim().max(60).optional(),
    answers: answers.optional(),
  })
  .strict();

const profileLinkSchema = z.object({
  label: z.string().trim().min(1).max(60),
  url: z.string().trim().min(1).max(2_000),
});

/**
 * `S-2`, `F-6`. Both landed on `participant` / `user` and on the portal form without reaching this
 * payload, so the public contract described a narrower speaker than the one the app stores. The
 * additions are additive in the same sense `startsAt` / `endsAt` were on `eventSchema`: every field
 * a consumer already reads keeps its name, type and nullability.
 *
 * `firstName` / `lastName` are the halves `F-6` captures; the display name every other surface
 * renders is their join, held on `user.name` and not writable here — an independent third value
 * would be the exact disagreement `lib/person-name.ts` exists to prevent. `displayName` is a
 * different thing again: the event-scoped override on `participant`, which is why it stays writable.
 */
export const speakerProfileSchema = z.object({
  displayName: z.string().nullable().describe('Event-scoped override of the account name'),
  firstName: z.string().nullable().describe('Given name on the account'),
  lastName: z.string().nullable().describe('Family name on the account'),
  name: z
    .string()
    .nullable()
    .describe('Read-only join of firstName and lastName; edit the halves instead'),
  salutation: z.string().nullable().describe('How a letter opens, e.g. Ada'),
  honorific: z.string().nullable().describe('Title before the name on the programme, e.g. Dr'),
  pronouns: z.string().nullable(),
  gender: z.string().nullable().describe('Free text; organizers report on it'),
  jobTitle: z.string().nullable(),
  company: z.string().nullable(),
  bioMarkdown: z.string().nullable(),
  timezone: z.string().nullable(),
  dietaryNotes: z.string().nullable(),
  accessibilityNotes: z.string().nullable(),
  links: z.array(profileLinkSchema),
  email: z.string().email(),
  phone: z.string().nullable(),
  notifyEmail: z.boolean(),
  notifySms: z.boolean(),
});

/**
 * Every field is optional and an omitted one is left alone — `updateProfile` writes only the keys it
 * is handed. That is what lets these five arrive without breaking a caller that has never heard of
 * them. An empty string clears a field, which is how the portal form clears one too.
 *
 * The caps match `profileSchema` in `lib/services/portal.ts`, which validates again and owns the
 * real name rules; this outer gate only keeps an oversized paste from reaching the service.
 */
export const updateSpeakerProfileBody = z
  .object({
    displayName: z.string().max(200).optional(),
    firstName: z.string().max(200).optional(),
    lastName: z.string().max(200).optional(),
    salutation: z.string().max(40).optional(),
    honorific: z.string().max(40).optional(),
    pronouns: z.string().max(40).optional(),
    gender: z.string().max(60).optional(),
    jobTitle: z.string().max(120).optional(),
    company: z.string().max(120).optional(),
    bioMarkdown: z.string().max(5_000).optional(),
    timezone: z.string().max(64).optional(),
    dietaryNotes: z.string().max(1_000).optional(),
    accessibilityNotes: z.string().max(1_000).optional(),
    links: z.array(profileLinkSchema).max(8).optional(),
    phone: z.string().max(32).optional(),
    notifyEmail: z.boolean().optional(),
    notifySms: z.boolean().optional(),
  })
  .strict();

/**
 * `S-16` turned one task into several rows — one per session a speaker is on, or one shared row per
 * session team — and the payload still described the flat "one response per person, ever" world.
 * Without `taskId` a consumer cannot tell that four rows are four answers to the same question, and
 * without `scope` / `shared` it cannot tell the row it holds alone from the one its whole panel is
 * looking at and may already have filled in.
 */
export const speakerTaskSchema = z.object({
  assignmentId: z.string(),
  taskId: z.string().describe('`S-16`: the task these rows answer. Group rows by it.'),
  scope: z
    .enum(['contact', 'group', 'submission'])
    .describe('contact is once per person, submission once per session, group once per session team'),
  shared: z
    .boolean()
    .describe('True when the whole session team reads and completes this one row'),
  name: z.string(),
  descriptionMarkdown: z.string().nullable(),
  kind: z.enum(['form', 'file_upload', 'acknowledge', 'link']),
  status: z.enum(['not_started', 'in_progress', 'completed', 'waived']),
  required: z.boolean(),
  dueAt: z.string().nullable().describe('ISO 8601'),
  overdue: z.boolean(),
  completedAt: z.string().nullable().describe('ISO 8601'),
  linkUrl: z.string().nullable(),
  submissionId: z.string().nullable(),
  submissionTitle: z.string().nullable(),
  pinnedSubmissionId: z
    .string()
    .nullable()
    .describe(
      '`S-16`: the session the task itself is pinned to, which a contact-scoped task has without this row having one',
    ),
  answers: answers.nullable(),
  form: z
    .object({ id: z.string(), name: z.string(), fields: z.array(formFieldSchema) })
    .nullable(),
  fileRequest: z
    .object({
      id: z.string(),
      label: z.string(),
      helpText: z.string().nullable(),
      acceptedTypes: z.array(z.string()),
      maxSizeMb: z.number().int(),
      allowMultiple: z.boolean(),
    })
    .nullable(),
  files: z.array(
    z.object({
      id: z.string(),
      filename: z.string(),
      contentType: z.string(),
      sizeBytes: z.number().int(),
      createdAt: z.string().describe('ISO 8601'),
    }),
  ),
});

export const taskFormBody = z
  .object({ answers, submit: z.boolean().default(true) })
  .strict();

export const programSessionInputSchema = z.object({
  externalId: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe('Stable Accelevents session id; unique within this event'),
  title: z.string().trim().min(1).max(300),
  description: z
    .string()
    .max(50_000)
    .nullable()
    .describe('Required Markdown field; null or blank clears the description'),
  status: z.enum(['draft', 'published', 'cancelled']),
  startsAt: z.string().datetime({ offset: true }).nullable(),
  endsAt: z.string().datetime({ offset: true }).nullable(),
  room: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .describe('Event room id or exact name (case-insensitive)'),
  track: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .describe('Event track id or exact name (case-insensitive)'),
  format: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .nullable()
    .describe('Event format id or exact name (case-insensitive)'),
  ceuCredits: z.string().trim().max(50).nullable(),
});

export const programReconcileBody = z
  .object({
    source: z.literal('accelevents'),
    mode: z
      .enum(['merge', 'replace'])
      .default('merge')
      .describe(
        'merge upserts listed records; replace also deletes managed records that are absent',
      ),
    apply: z
      .boolean()
      .default(false)
      .describe('False previews the exact operations without writing'),
    confirmDeleteMissing: z
      .literal('DELETE_MISSING_SESSIONS')
      .optional()
      .describe('Required to apply replace mode when missing managed sessions would be deleted'),
    sessions: z.array(programSessionInputSchema).max(1_000).default([]),
    deleteExternalIds: z
      .array(z.string().trim().min(1).max(200))
      .max(1_000)
      .default([])
      .describe('Explicit source-managed sessions to delete in merge mode'),
  })
  .describe('An Accelevents-shaped program snapshot or patch');

export const programOperationSchema = z.object({
  externalId: z.string(),
  action: z.enum(['create', 'update', 'delete', 'noop', 'error']),
  sessionId: z.string().nullable(),
  changes: z.array(z.string()),
  message: z.string().nullable(),
});

export const programReconcileResponse = z.object({
  source: z.literal('accelevents'),
  mode: z.enum(['merge', 'replace']),
  applied: z.boolean(),
  canApply: z.boolean(),
  requiresDeleteConfirmation: z.boolean(),
  summary: z.object({
    create: z.number().int(),
    update: z.number().int(),
    delete: z.number().int(),
    noop: z.number().int(),
    error: z.number().int(),
  }),
  operations: z.array(programOperationSchema),
});

export const acceleventsProgramSyncBody = z
  .object({
    mode: z.enum(['preview', 'apply']).default('preview'),
    allowDeletes: z
      .boolean()
      .default(false)
      .describe('Must be true with apply mode before remote-only fixture records are deleted'),
    resetFixture: z
      .literal('drifted')
      .optional()
      .describe(
        'Fixture mode only: reset the remote collection to a repeatable drifted demo state',
      ),
  })
  .describe('Controls a one-way published-program sync to the fixture Accelevents adapter');

export const acceleventsProgramSyncResult = z.object({
  mode: z.enum(['preview', 'apply']),
  adapter: z.literal('fake'),
  eventUrl: z.string(),
  allowDeletes: z.boolean(),
  fixtureReset: z.boolean(),
  counts: z.object({
    create: z.number().int(),
    update: z.number().int(),
    delete: z.number().int(),
    noop: z.number().int(),
    blockedDeletes: z.number().int(),
  }),
  results: z.array(
    z.object({
      resourceType: z.enum(['event', 'session', 'speaker']),
      sourceId: z.string(),
      remoteId: z.string().nullable(),
      action: z.enum(['create', 'update', 'delete', 'noop']),
      status: z.enum(['planned', 'applied', 'blocked', 'unchanged']),
      message: z.string().nullable(),
    }),
  ),
});

export const errorResponse = z
  .object({
    error: z.object({
      code: z.enum([
        'unauthorized',
        'forbidden',
        'not_found',
        'invalid',
        'conflict',
        'rate_limited',
        'unavailable',
        'internal',
      ]),
      message: z.string(),
      details: z
        .record(z.string())
        .optional()
        .describe('Field-keyed messages when code is invalid'),
    }),
  })
  .describe('Every non-2xx response has this shape');

export type EventPayload = z.infer<typeof eventSchema>;
export type SessionPayload = z.infer<typeof sessionSchema>;
export type SpeakerPayload = z.infer<typeof speakerSchema>;
export type AgendaPayload = z.infer<typeof agendaSchema>;
export type SubmissionPayload = z.infer<typeof submissionSchema>;
