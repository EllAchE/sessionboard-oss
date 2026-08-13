import { and, eq } from 'drizzle-orm';
import { getDb } from '../../db/client';
import { participant, speakerWorkflowStatus, user } from '../../db/schema';
import { requireCapability, type EventContext } from '../context';
import { invalid, notFound } from '../errors';
import { normalizeHeader, parseCsvTable, toCsv } from '../csv';
import { parseSpeakerName } from '../speaker-name';
import { listSpeakers, type SpeakerRow } from './dashboard';
import { setHeadshot, updateProfile, type Participant, type ProfileInput } from './portal';
import { ensureParticipant } from './submissions';

/**
 * The organizer's side of a speaker. The speaker's own side lives in `./portal`, and the writes here
 * go through its `updateProfile` so a roster edit and a portal edit cannot validate differently.
 */

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export type SpeakerFieldKey =
  | 'name'
  | 'email'
  | 'pronouns'
  | 'jobTitle'
  | 'company'
  | 'bioMarkdown'
  | 'website'
  | 'workflowStatus'
  | 'timezone'
  | 'dietaryNotes'
  | 'accessibilityNotes';

export type SpeakerWorkflowStatus = (typeof speakerWorkflowStatus.enumValues)[number];

/** Pipeline order, so the roster filter and both selects present the same sequence. */
export const SPEAKER_WORKFLOW_OPTIONS: Array<{ value: SpeakerWorkflowStatus; label: string }> = [
  { value: 'invited', label: 'Invited' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'declined', label: 'Declined' },
  { value: 'withdrawn', label: 'Withdrawn' },
];

/**
 * Blank means "the caller said nothing", which leaves a stored status alone. Anything else resolves
 * to a real status: a spreadsheet column full of an unrecognised vocabulary should land the speaker
 * at the start of the pipeline, not throw away the row.
 */
export function toWorkflowStatus(value: string | undefined): SpeakerWorkflowStatus | undefined {
  const needle = value?.trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (!needle) return undefined;
  return SPEAKER_WORKFLOW_OPTIONS.find((option) => option.value === needle)?.value ?? 'invited';
}

export type SpeakerImportField = {
  key: SpeakerFieldKey;
  label: string;
  required: boolean;
  hint: string;
  example: string;
  /** Header spellings that auto-select this field. Matched through `normalizeHeader`. */
  aliases: string[];
};

export const SPEAKER_IMPORT_FIELDS: SpeakerImportField[] = [
  {
    key: 'email',
    label: 'Email',
    required: true,
    hint: 'Identifies the speaker. A row whose email already exists updates that speaker instead of adding a second one.',
    example: 'ada@example.com',
    aliases: ['email', 'e mail', 'email address', 'speaker email', 'contact email'],
  },
  {
    key: 'name',
    label: 'Full name',
    required: false,
    hint: 'Shown everywhere the speaker appears. Falls back to the email address when blank.',
    example: 'Ada Lovelace',
    aliases: ['name', 'full name', 'speaker', 'speaker name', 'display name', 'first name'],
  },
  {
    key: 'jobTitle',
    label: 'Job title',
    required: false,
    hint: 'Free text.',
    example: 'Principal Engineer',
    aliases: ['job title', 'title', 'role', 'position', 'job'],
  },
  {
    key: 'company',
    label: 'Company',
    required: false,
    hint: 'Free text.',
    example: 'Analytical Engines Ltd',
    aliases: ['company', 'organisation', 'organization', 'org', 'employer', 'affiliation'],
  },
  {
    key: 'bioMarkdown',
    label: 'Biography',
    required: false,
    hint: 'Stored as markdown. Newlines inside a quoted cell are kept.',
    example: 'Wrote the first algorithm intended for a machine.',
    aliases: ['bio', 'biography', 'about', 'speaker bio', 'profile', 'description'],
  },
  {
    key: 'pronouns',
    label: 'Pronouns',
    required: false,
    hint: 'Free text.',
    example: 'she/her',
    aliases: ['pronouns', 'preferred pronouns'],
  },
  {
    key: 'website',
    label: 'Website',
    required: false,
    hint: 'Saved as a profile link. A bare domain gets an https prefix.',
    example: 'https://example.com/ada',
    aliases: ['website', 'url', 'link', 'homepage', 'web site', 'personal site'],
  },
  {
    key: 'workflowStatus',
    label: 'Status',
    required: false,
    hint: 'Invited, confirmed, declined or withdrawn. Anything else lands as invited.',
    example: 'confirmed',
    aliases: [
      'status',
      'workflow status',
      'speaker status',
      'invite status',
      'stage',
      'pipeline',
      'rsvp',
      'confirmation',
    ],
  },
  {
    key: 'timezone',
    label: 'Timezone',
    required: false,
    hint: 'Travel and logistics. Free text, so `Europe/London` and `GMT` both import.',
    example: 'Europe/London',
    aliases: ['timezone', 'time zone', 'tz', 'location timezone'],
  },
  {
    key: 'dietaryNotes',
    label: 'Dietary needs',
    required: false,
    hint: 'Travel and logistics. Visible to organizers only.',
    example: 'Vegetarian, no nuts',
    aliases: ['dietary needs', 'dietary', 'dietary requirements', 'diet', 'food', 'allergies'],
  },
  {
    key: 'accessibilityNotes',
    label: 'Accessibility needs',
    required: false,
    hint: 'Travel and logistics. Also the right home for arrival and travel notes.',
    example: 'Step-free stage access; arrives Tue 14:00',
    aliases: [
      'accessibility needs',
      'accessibility',
      'accessibility requirements',
      'access',
      'accommodations',
      'accommodation',
      'travel',
      'travel notes',
      'arrival',
      'logistics',
    ],
  },
];

const FIELD_BY_KEY = new Map(SPEAKER_IMPORT_FIELDS.map((field) => [field.key, field]));

/** `''` is the explicit "ignore this column" choice, so the UI select has a real value for it. */
export type ColumnMapping = Array<SpeakerFieldKey | ''>;

export function autoMapColumns(headers: string[]): ColumnMapping {
  const taken = new Set<SpeakerFieldKey>();
  return headers.map((header) => {
    const needle = normalizeHeader(header);
    if (!needle) return '';
    const match = SPEAKER_IMPORT_FIELDS.find(
      (field) => !taken.has(field.key) && field.aliases.includes(needle),
    );
    if (!match) return '';
    taken.add(match.key);
    return match.key;
  });
}

export function speakerTemplateCsv(): string {
  return toCsv([
    SPEAKER_IMPORT_FIELDS.map((field) => field.label),
    SPEAKER_IMPORT_FIELDS.map((field) => field.example),
  ]);
}

// ---------------------------------------------------------------------------
// Reading the roster
// ---------------------------------------------------------------------------

export type SpeakerProfile = SpeakerRow & {
  displayName: string | null;
  bioMarkdown: string | null;
  headshotFileId: string | null;
  website: string | null;
  links: { label: string; url: string }[];
  /** `SPK-04`: where the organizer has this speaker in their own pipeline. */
  workflowStatus: SpeakerWorkflowStatus;
  timezone: string | null;
  dietaryNotes: string | null;
  accessibilityNotes: string | null;
  /** `SPK-15`: whether this speaker has any travel or logistics detail on file yet. */
  hasTravelDetail: boolean;
  updatedAt: string;
};

function websiteOf(links: { label: string; url: string }[]): string | null {
  return links.find((link) => link.label.toLowerCase() === 'website')?.url ?? null;
}

function toProfile(row: SpeakerRow, record: Participant): SpeakerProfile {
  return {
    ...row,
    displayName: record.displayName,
    bioMarkdown: record.bioMarkdown,
    headshotFileId: record.headshotFileId,
    website: websiteOf(record.links),
    links: record.links,
    workflowStatus: record.workflowStatus,
    timezone: record.timezone,
    dietaryNotes: record.dietaryNotes,
    accessibilityNotes: record.accessibilityNotes,
    hasTravelDetail: Boolean(
      record.timezone?.trim() || record.dietaryNotes?.trim() || record.accessibilityNotes?.trim(),
    ),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * The roster screen needs the tracking columns the dashboard already derives *and* the profile
 * fields it drops, so this composes `listSpeakers` rather than restating its task arithmetic.
 */
export async function listSpeakerProfiles(ctx: EventContext): Promise<SpeakerProfile[]> {
  requireCapability(ctx, 'submission:read_all');

  const [rows, records] = await Promise.all([
    listSpeakers(ctx),
    getDb().query.participant.findMany({ where: eq(participant.eventId, ctx.eventId) }),
  ]);

  const byId = new Map(records.map((record) => [record.id, record]));
  return rows.flatMap((row) => {
    const record = byId.get(row.id);
    return record ? [toProfile(row, record)] : [];
  });
}

/**
 * `S-10`. Impersonation is expressed to the organizer as a participant — a name on the roster — but
 * a session is opened against a user account, and the two are not the same thing: a person can be a
 * participant in several events behind one login. Resolving it here keeps the action from reaching
 * past the service layer for the join, and scoping to `ctx.eventId` is what stops an organizer of
 * one event from naming a participant id belonging to another.
 */
export async function userIdForParticipant(
  ctx: EventContext,
  participantId: string,
): Promise<string> {
  requireCapability(ctx, 'event:manage');
  const row = await getDb().query.participant.findFirst({
    where: and(eq(participant.id, participantId), eq(participant.eventId, ctx.eventId)),
    columns: { userId: true },
  });
  if (!row) throw notFound('That speaker');
  return row.userId;
}

export async function getSpeakerProfile(
  ctx: EventContext,
  participantId: string,
): Promise<SpeakerProfile> {
  const all = await listSpeakerProfiles(ctx);
  const found = all.find((row) => row.id === participantId);
  if (!found) throw notFound('That speaker');
  return found;
}

// ---------------------------------------------------------------------------
// Writing a speaker
// ---------------------------------------------------------------------------

export type SpeakerInput = {
  email?: string;
  name?: string;
  pronouns?: string;
  jobTitle?: string;
  company?: string;
  bioMarkdown?: string;
  website?: string;
  workflowStatus?: string;
  timezone?: string;
  dietaryNotes?: string;
  accessibilityNotes?: string;
  headshotFileId?: string | null;
};

function clean(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function requireEmail(value: string | undefined): string {
  const email = clean(value)?.toLowerCase();
  if (!email) throw invalid('A speaker needs an email address', { email: 'Email is required' });
  if (!EMAIL.test(email)) {
    throw invalid('That does not look like an email address', { email: 'Enter a valid address' });
  }
  return email;
}

function mergeLinks(
  current: { label: string; url: string }[],
  website: string | undefined,
): { label: string; url: string }[] {
  if (!website) return current;
  const rest = current.filter((link) => link.label.toLowerCase() !== 'website');
  return [{ label: 'Website', url: website }, ...rest].slice(0, 8);
}

/**
 * Every field is sent on every write because `updateProfile` replaces the whole profile; a value the
 * caller did not supply falls back to what is stored rather than blanking it.
 */
function mergedProfile(current: Participant, input: SpeakerInput): ProfileInput {
  return {
    displayName: clean(input.name) ?? clean(current.displayName),
    pronouns: clean(input.pronouns) ?? clean(current.pronouns),
    jobTitle: clean(input.jobTitle) ?? clean(current.jobTitle),
    company: clean(input.company) ?? clean(current.company),
    bioMarkdown: clean(input.bioMarkdown) ?? clean(current.bioMarkdown),
    timezone: clean(input.timezone) ?? clean(current.timezone),
    dietaryNotes: clean(input.dietaryNotes) ?? clean(current.dietaryNotes),
    accessibilityNotes: clean(input.accessibilityNotes) ?? clean(current.accessibilityNotes),
    links: mergeLinks(current.links, clean(input.website)),
  };
}

async function participantRow(eventId: string, participantId: string): Promise<Participant> {
  const row = await getDb().query.participant.findFirst({
    where: and(eq(participant.id, participantId), eq(participant.eventId, eventId)),
  });
  if (!row) throw notFound('That speaker');
  return row;
}

async function userIdForEmail(email: string, name: string | null | undefined): Promise<string> {
  const db = getDb();
  const existing = await db.query.user.findFirst({ where: eq(user.email, email) });
  if (existing) {
    if (!existing.name && name) {
      await db.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, existing.id));
    }
    return existing.id;
  }

  const [created] = await db
    .insert(user)
    .values({ email, name: name ?? null })
    .onConflictDoNothing()
    .returning();
  if (created) return created.id;

  const raced = await db.query.user.findFirst({ where: eq(user.email, email) });
  if (!raced) throw notFound('That account');
  return raced.id;
}

/**
 * `SPK-02`. Idempotent on email: an address already on the roster is edited rather than duplicated,
 * which is also what makes a re-run of a CSV import safe.
 */
export async function createSpeaker(
  ctx: EventContext,
  input: SpeakerInput,
): Promise<{ id: string; created: boolean }> {
  requireCapability(ctx, 'event:manage');

  const email = requireEmail(input.email);
  const name = parseSpeakerName(input.name);
  const userId = await userIdForEmail(email, name);

  const before = await getDb().query.participant.findFirst({
    where: and(eq(participant.eventId, ctx.eventId), eq(participant.userId, userId)),
  });
  const participantId = await ensureParticipant(ctx.eventId, userId, name ?? null);

  await applySpeaker(ctx, participantId, input);
  return { id: participantId, created: !before };
}

export async function updateSpeaker(
  ctx: EventContext,
  participantId: string,
  input: SpeakerInput,
): Promise<void> {
  requireCapability(ctx, 'event:manage');
  await applySpeaker(ctx, participantId, input);
}

async function applySpeaker(
  ctx: EventContext,
  participantId: string,
  input: SpeakerInput,
): Promise<void> {
  const current = await participantRow(ctx.eventId, participantId);
  await updateProfile(ctx, participantId, mergedProfile(current, input));
  if (input.headshotFileId !== undefined) {
    await setHeadshot(ctx, participantId, input.headshotFileId);
  }

  const status = toWorkflowStatus(input.workflowStatus);
  if (status && status !== current.workflowStatus) {
    await writeWorkflowStatus(ctx.eventId, participantId, status);
  }
}

/**
 * `SPK-04`. The pipeline status lives outside `updateProfile` because it is the organizer's judgement
 * about the speaker, not something the speaker maintains about themselves in the portal.
 */
export async function setSpeakerWorkflowStatus(
  ctx: EventContext,
  participantId: string,
  status: SpeakerWorkflowStatus,
): Promise<SpeakerWorkflowStatus> {
  requireCapability(ctx, 'event:manage');

  if (!SPEAKER_WORKFLOW_OPTIONS.some((option) => option.value === status)) {
    throw invalid('That is not a speaker status', { workflowStatus: 'Unknown status' });
  }

  await participantRow(ctx.eventId, participantId);
  await writeWorkflowStatus(ctx.eventId, participantId, status);
  return status;
}

async function writeWorkflowStatus(
  eventId: string,
  participantId: string,
  status: SpeakerWorkflowStatus,
): Promise<void> {
  await getDb()
    .update(participant)
    .set({ workflowStatus: status, updatedAt: new Date() })
    .where(and(eq(participant.id, participantId), eq(participant.eventId, eventId)));
}

// ---------------------------------------------------------------------------
// `SPK-03` — CSV import
// ---------------------------------------------------------------------------

export type SpeakerImportValues = Partial<Record<SpeakerFieldKey, string>>;

export type PlannedSpeaker = {
  line: number;
  action: 'create' | 'update';
  email: string;
  name: string;
  values: SpeakerImportValues;
  /** For a matched speaker, the fields this row would actually change. Empty means nothing moves. */
  changes: SpeakerFieldKey[];
};

export type SkippedRow = { line: number; label: string; reason: string };

export type SpeakerImportPlan = {
  headers: string[];
  mapping: ColumnMapping;
  /** The first data row, raw and aligned with `headers`, so the mapping UI can show an example. */
  sample: string[];
  rows: PlannedSpeaker[];
  skipped: SkippedRow[];
  /** File-level reasons the import cannot run at all. */
  problems: string[];
};

const STORED_BY_FIELD: Record<
  Exclude<SpeakerFieldKey, 'email' | 'name' | 'website'>,
  keyof Participant
> = {
  pronouns: 'pronouns',
  jobTitle: 'jobTitle',
  company: 'company',
  bioMarkdown: 'bioMarkdown',
  workflowStatus: 'workflowStatus',
  timezone: 'timezone',
  dietaryNotes: 'dietaryNotes',
  accessibilityNotes: 'accessibilityNotes',
};

function storedValue(record: Participant, key: SpeakerFieldKey): string | null {
  if (key === 'email') return null;
  if (key === 'name') return record.displayName;
  if (key === 'website') return websiteOf(record.links);
  const value = record[STORED_BY_FIELD[key]];
  return typeof value === 'string' ? value : null;
}

/**
 * The preview and the import both come from here, so what an organizer confirms is what runs. The
 * plan needs the event's existing speakers to tell a new row from a matched one, which is why it is
 * a service call rather than something the browser could work out from the file alone.
 */
export async function planSpeakerImport(
  ctx: EventContext,
  csv: string,
  chosen?: ColumnMapping,
): Promise<SpeakerImportPlan> {
  requireCapability(ctx, 'submission:read_all');

  const table = parseCsvTable(csv);
  if (table.headers.length === 0) {
    return {
      headers: [],
      mapping: [],
      sample: [],
      rows: [],
      skipped: [],
      problems: ['That file has no header row to map.'],
    };
  }

  const mapping =
    chosen && chosen.length === table.headers.length ? chosen : autoMapColumns(table.headers);

  const columnOf = new Map<SpeakerFieldKey, number>();
  mapping.forEach((key, column) => {
    if (key && !columnOf.has(key)) columnOf.set(key, column);
  });

  const problems: string[] = [];
  if (!columnOf.has('email')) {
    problems.push('Map one column to Email. It is what tells a new speaker from an existing one.');
  }
  if (table.rows.length === 0) {
    problems.push('That file has a header row and nothing under it.');
  }
  const sample = table.rows[0] ?? table.headers.map(() => '');
  if (problems.length > 0) {
    return { headers: table.headers, mapping, sample, rows: [], skipped: [], problems };
  }

  const db = getDb();
  const existing = await db
    .select({ record: participant, account: user })
    .from(participant)
    .innerJoin(user, eq(participant.userId, user.id))
    .where(eq(participant.eventId, ctx.eventId));
  const byEmail = new Map(existing.map((entry) => [entry.account.email.toLowerCase(), entry]));

  const rows: PlannedSpeaker[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Map<string, number>();

  table.rows.forEach((cells, index) => {
    const line = index + 2;
    const values: SpeakerImportValues = {};
    for (const [key, column] of columnOf) {
      const raw = cells[column] ?? '';
      const value = key === 'workflowStatus' ? (toWorkflowStatus(raw) ?? '') : raw;
      if (value) values[key] = value;
    }

    const email = (values.email ?? '').toLowerCase();
    const label = values.name || email || `Row ${line}`;

    if (!email) {
      skipped.push({ line, label, reason: 'No email address' });
      return;
    }
    if (!EMAIL.test(email)) {
      skipped.push({ line, label, reason: `"${email}" is not a valid email address` });
      return;
    }
    const duplicate = seen.get(email);
    if (duplicate) {
      skipped.push({ line, label, reason: `Same email as line ${duplicate}` });
      return;
    }
    seen.set(email, line);

    const match = byEmail.get(email);
    const changes: SpeakerFieldKey[] = [];
    if (match) {
      for (const [key, value] of Object.entries(values) as Array<[SpeakerFieldKey, string]>) {
        if (key !== 'email' && value !== (storedValue(match.record, key) ?? '')) changes.push(key);
      }
    }

    rows.push({
      line,
      action: match ? 'update' : 'create',
      email,
      name: values.name || match?.record.displayName || match?.account.name || email,
      values: { ...values, email },
      changes,
    });
  });

  return { headers: table.headers, mapping, sample, rows, skipped, problems: [] };
}

export type SpeakerImportResult = {
  created: number;
  updated: number;
  skipped: number;
  failed: Array<{ label: string; message: string }>;
};

export async function importSpeakers(
  ctx: EventContext,
  csv: string,
  mapping: ColumnMapping,
): Promise<SpeakerImportResult> {
  requireCapability(ctx, 'event:manage');

  const plan = await planSpeakerImport(ctx, csv, mapping);
  if (plan.problems.length > 0) throw invalid(plan.problems[0]);

  const result: SpeakerImportResult = {
    created: 0,
    updated: 0,
    skipped: plan.skipped.length,
    failed: [],
  };

  for (const row of plan.rows) {
    try {
      const { created } = await createSpeaker(ctx, {
        email: row.email,
        name: row.values.name,
        pronouns: row.values.pronouns,
        jobTitle: row.values.jobTitle,
        company: row.values.company,
        bioMarkdown: row.values.bioMarkdown,
        website: row.values.website,
        workflowStatus: row.values.workflowStatus,
        timezone: row.values.timezone,
        dietaryNotes: row.values.dietaryNotes,
        accessibilityNotes: row.values.accessibilityNotes,
      });
      if (created) result.created += 1;
      else result.updated += 1;
    } catch (error) {
      result.failed.push({
        label: row.name,
        message: error instanceof Error ? error.message : 'Could not be imported',
      });
    }
  }

  return result;
}

export function fieldLabel(key: SpeakerFieldKey): string {
  return FIELD_BY_KEY.get(key)?.label ?? key;
}
