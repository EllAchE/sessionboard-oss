import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb } from '../../db/client';
import {
  contact,
  contactActivity,
  contactCampaign,
  contactCampaignRecipient,
  contactEventLink,
  contactNote,
  contactSegment,
  crmField,
  event,
  membership,
  participant,
  prospect,
  user,
} from '../../db/schema';
import type { Actor } from '../context';
import { parseCsvTable, normalizeHeader, type CsvTable } from '../csv';
import { conflict, invalid, notFound } from '../errors';
import { slugify } from '../ids';
import { sendMail } from '../mail';
import { markdownToText, renderMarkdown } from '../markdown';

/**
 * The speaker CRM's domain half. Every row here hangs off an organizer's account rather than an
 * event, which is the whole point of the area: a speaker who came back for the third year running
 * is one record, not three.
 *
 * A merge never deletes. The losing row keeps its id and gains `mergedIntoContactId`, so a link or
 * an email log written before the merge still resolves to a real row; every directory read filters
 * the tombstones out instead.
 */

export type ContactRow = typeof contact.$inferSelect;
export type NoteRow = typeof contactNote.$inferSelect;
export type ActivityRow = typeof contactActivity.$inferSelect;
export type CrmFieldRow = typeof crmField.$inferSelect;
export type SegmentRow = typeof contactSegment.$inferSelect;
export type ProspectRow = typeof prospect.$inferSelect;
export type ProspectStage = ProspectRow['stage'];
export type CrmFieldType = CrmFieldRow['type'];
export type SegmentKind = SegmentRow['kind'];
export type ActivityKind = ActivityRow['kind'];

export const PROSPECT_STAGES: readonly ProspectStage[] = [
  'researching',
  'identified',
  'contacted',
  'interested',
  'confirmed',
  'declined',
];

export const STAGE_LABELS: Record<ProspectStage, string> = {
  researching: 'Researching',
  identified: 'Identified',
  contacted: 'Contacted',
  interested: 'Interested',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

export const CRM_FIELD_TYPES: readonly CrmFieldType[] = [
  'short_text',
  'long_text',
  'select',
  'multi_select',
  'number',
  'url',
  'date',
];

function actorName(actor: Actor): string {
  return actor.name?.trim() || actor.email;
}

function trimmed(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  return text === '' ? null : text;
}

function isEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value);
}

/* ------------------------------------------------------------------ filters */

export type DirectoryFilters = {
  search?: string | null;
  company?: string | null;
  jobTitle?: string | null;
  tag?: string | null;
  source?: string | null;
  location?: string | null;
  custom?: Record<string, string>;
};

export function toFilters(raw: Record<string, unknown> | null | undefined): DirectoryFilters {
  const source = raw ?? {};
  const text = (key: string): string | null => {
    const value = source[key];
    return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
  };
  const custom: Record<string, string> = {};
  const rawCustom = source.custom;
  if (rawCustom && typeof rawCustom === 'object') {
    for (const [key, value] of Object.entries(rawCustom as Record<string, unknown>)) {
      if (typeof value === 'string' && value.trim() !== '') custom[key] = value.trim();
    }
  }
  return {
    search: text('search'),
    company: text('company'),
    jobTitle: text('jobTitle'),
    tag: text('tag'),
    source: text('source'),
    location: text('location'),
    custom,
  };
}

export function filtersAreEmpty(filters: DirectoryFilters): boolean {
  return (
    !filters.search &&
    !filters.company &&
    !filters.jobTitle &&
    !filters.tag &&
    !filters.source &&
    !filters.location &&
    Object.keys(filters.custom ?? {}).length === 0
  );
}

function sameText(value: string | null | undefined, wanted: string): boolean {
  return (value ?? '').trim().toLowerCase() === wanted.trim().toLowerCase();
}

/** Every criterion narrows: two filters AND together rather than widening the result. */
export function contactMatches(row: ContactRow, filters: DirectoryFilters): boolean {
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    const haystack = [row.name, row.email, row.company, row.jobTitle, row.location, ...row.tags]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (!haystack.includes(search)) return false;
  }
  if (filters.company && !sameText(row.company, filters.company)) return false;
  if (filters.jobTitle && !sameText(row.jobTitle, filters.jobTitle)) return false;
  if (filters.source && !sameText(row.source, filters.source)) return false;
  if (filters.location && !sameText(row.location, filters.location)) return false;
  if (filters.tag && !row.tags.some((tag) => sameText(tag, filters.tag as string))) return false;
  for (const [key, value] of Object.entries(filters.custom ?? {})) {
    if (!sameText(row.customFields[key], value)) return false;
  }
  return true;
}

/* ------------------------------------------------------------------ reads */

async function ownedContacts(actor: Actor): Promise<ContactRow[]> {
  return getDb().query.contact.findMany({
    where: and(eq(contact.ownerUserId, actor.userId), isNull(contact.mergedIntoContactId)),
    orderBy: [asc(contact.name)],
  });
}

export type DirectoryFacets = {
  companies: string[];
  jobTitles: string[];
  tags: string[];
  sources: string[];
  locations: string[];
};

function facetsOf(rows: ContactRow[]): DirectoryFacets {
  const collect = (pick: (row: ContactRow) => Array<string | null>): string[] =>
    [
      ...new Set(
        rows
          .flatMap(pick)
          .map((value) => (value ?? '').trim())
          .filter(Boolean),
      ),
    ].sort((a, b) => a.localeCompare(b));
  return {
    companies: collect((row) => [row.company]),
    jobTitles: collect((row) => [row.jobTitle]),
    tags: collect((row) => row.tags),
    sources: collect((row) => [row.source]),
    locations: collect((row) => [row.location]),
  };
}

export type Directory = {
  rows: ContactRow[];
  total: number;
  facets: DirectoryFacets;
  fields: CrmFieldRow[];
};

export async function listDirectory(
  actor: Actor,
  filters: DirectoryFilters = {},
): Promise<Directory> {
  const [rows, fields] = await Promise.all([ownedContacts(actor), listFields(actor)]);
  return {
    rows: rows.filter((row) => contactMatches(row, filters)),
    total: rows.length,
    facets: facetsOf(rows),
    fields,
  };
}

export type ContactEventLinkRow = {
  eventId: string;
  eventName: string;
  eventSlug: string;
  participantId: string | null;
  linkedAt: Date;
};

export type ContactProfile = {
  contact: ContactRow;
  notes: NoteRow[];
  activity: ActivityRow[];
  events: ContactEventLinkRow[];
  prospects: Array<ProspectRow & { eventName: string | null }>;
  fields: CrmFieldRow[];
};

export async function getContactProfile(actor: Actor, contactId: string): Promise<ContactProfile> {
  const db = getDb();
  const row = await db.query.contact.findFirst({
    where: and(eq(contact.id, contactId), eq(contact.ownerUserId, actor.userId)),
  });
  if (!row) throw notFound('Contact');

  const [notes, activity, links, cards, fields] = await Promise.all([
    db.query.contactNote.findMany({
      where: and(eq(contactNote.contactId, contactId), isNull(contactNote.prospectId)),
      orderBy: [desc(contactNote.createdAt)],
    }),
    db.query.contactActivity.findMany({
      where: eq(contactActivity.contactId, contactId),
      orderBy: [desc(contactActivity.createdAt)],
    }),
    db
      .select({ link: contactEventLink, name: event.name, slug: event.slug })
      .from(contactEventLink)
      .innerJoin(event, eq(contactEventLink.eventId, event.id))
      .where(eq(contactEventLink.contactId, contactId)),
    db
      .select({ card: prospect, eventName: event.name })
      .from(prospect)
      .leftJoin(event, eq(prospect.eventId, event.id))
      .where(eq(prospect.contactId, contactId)),
    listFields(actor),
  ]);

  return {
    contact: row,
    notes,
    activity,
    events: links.map((entry) => ({
      eventId: entry.link.eventId,
      eventName: entry.name,
      eventSlug: entry.slug,
      participantId: entry.link.participantId,
      linkedAt: entry.link.createdAt,
    })),
    prospects: cards.map((entry) => ({
      ...entry.card,
      eventName: entry.eventName,
    })),
    fields,
  };
}

/* ------------------------------------------------------------------ activity */

type ActivityInput = {
  contactId: string;
  prospectId?: string | null;
  kind: ActivityKind;
  summary: string;
};

async function logActivity(actor: Actor, entries: ActivityInput[]): Promise<void> {
  if (entries.length === 0) return;
  await getDb()
    .insert(contactActivity)
    .values(
      entries.map((entry) => ({
        contactId: entry.contactId,
        prospectId: entry.prospectId ?? null,
        kind: entry.kind,
        summary: entry.summary,
        actorUserId: actor.userId,
        actorName: actorName(actor),
      })),
    );
}

/* ------------------------------------------------------------------ contacts */

export type ContactInput = {
  name: string;
  email: string;
  jobTitle?: string | null;
  company?: string | null;
  bioMarkdown?: string | null;
  headshotUrl?: string | null;
  location?: string | null;
  source?: string | null;
  tags?: string[];
  customFields?: Record<string, string>;
};

export function normalizeTags(tags: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of tags ?? []) {
    const tag = raw.trim();
    if (tag === '') continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

export function parseTagList(value: string | null | undefined): string[] {
  return normalizeTags((value ?? '').split(/[,;|]/));
}

function validateContact(input: ContactInput): { name: string; email: string } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const details: Record<string, string> = {};
  if (name === '') details.name = 'A name is required';
  if (!isEmail(email)) details.email = 'Enter a valid email address';
  if (Object.keys(details).length > 0) throw invalid('Check the contact details', details);
  return { name, email };
}

export async function createContact(actor: Actor, input: ContactInput): Promise<ContactRow> {
  const { name, email } = validateContact(input);
  const db = getDb();

  const existing = await db.query.contact.findFirst({
    where: and(eq(contact.ownerUserId, actor.userId), eq(contact.email, email)),
  });
  if (existing)
    throw conflict(`${email} is already in the directory`, {
      email: 'Already exists',
    });

  const [row] = await db
    .insert(contact)
    .values({
      ownerUserId: actor.userId,
      name,
      email,
      jobTitle: trimmed(input.jobTitle),
      company: trimmed(input.company),
      bioMarkdown: trimmed(input.bioMarkdown),
      headshotUrl: trimmed(input.headshotUrl),
      location: trimmed(input.location),
      source: trimmed(input.source) ?? 'manual',
      tags: normalizeTags(input.tags),
      customFields: input.customFields ?? {},
    })
    .returning();

  await logActivity(actor, [
    {
      contactId: row.id,
      kind: 'created',
      summary: `${name} added to the speaker database`,
    },
  ]);
  return row;
}

export async function updateContact(
  actor: Actor,
  contactId: string,
  input: Partial<ContactInput>,
): Promise<ContactRow> {
  const db = getDb();
  const current = await db.query.contact.findFirst({
    where: and(eq(contact.id, contactId), eq(contact.ownerUserId, actor.userId)),
  });
  if (!current) throw notFound('Contact');

  const next: Partial<typeof contact.$inferInsert> = { updatedAt: new Date() };
  const changed: string[] = [];

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (name === '') throw invalid('A name is required', { name: 'A name is required' });
    if (name !== current.name) changed.push('name');
    next.name = name;
  }
  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();
    if (!isEmail(email)) throw invalid('Enter a valid email address', { email: 'Invalid email' });
    if (email !== current.email) changed.push('email');
    next.email = email;
  }
  const textFields = [
    'jobTitle',
    'company',
    'bioMarkdown',
    'headshotUrl',
    'location',
    'source',
  ] as const;
  for (const key of textFields) {
    if (input[key] === undefined) continue;
    const value = trimmed(input[key]);
    if (value !== current[key]) changed.push(key);
    next[key] = value;
  }
  if (input.tags !== undefined) {
    next.tags = normalizeTags(input.tags);
    changed.push('tags');
  }
  if (input.customFields !== undefined) {
    next.customFields = { ...current.customFields, ...input.customFields };
    changed.push('custom fields');
  }

  const [row] = await db.update(contact).set(next).where(eq(contact.id, contactId)).returning();

  if (changed.length > 0) {
    await logActivity(actor, [
      {
        contactId,
        kind: 'updated',
        summary: `Updated ${[...new Set(changed)].join(', ')}`,
      },
    ]);
  }
  return row;
}

export async function addNote(
  actor: Actor,
  input: { contactId: string; prospectId?: string | null; body: string },
): Promise<NoteRow> {
  const body = input.body.trim();
  if (body === '') throw invalid('Write something first', { body: 'A note cannot be empty' });

  const db = getDb();
  const owned = await db.query.contact.findFirst({
    where: and(eq(contact.id, input.contactId), eq(contact.ownerUserId, actor.userId)),
  });
  if (!owned) throw notFound('Contact');

  const [row] = await db
    .insert(contactNote)
    .values({
      contactId: input.contactId,
      prospectId: input.prospectId ?? null,
      authorUserId: actor.userId,
      authorName: actorName(actor),
      bodyMarkdown: body,
    })
    .returning();
  return row;
}

/* ------------------------------------------------------------------ custom fields */

export async function listFields(actor: Actor): Promise<CrmFieldRow[]> {
  return getDb().query.crmField.findMany({
    where: eq(crmField.ownerUserId, actor.userId),
    orderBy: [asc(crmField.position), asc(crmField.createdAt)],
  });
}

export function parseOptionList(value: string | null | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of (value ?? '').split(/[,\n]/)) {
    const option = raw.trim();
    if (option === '' || seen.has(option.toLowerCase())) continue;
    seen.add(option.toLowerCase());
    out.push(option);
  }
  return out;
}

export function fieldTakesOptions(type: CrmFieldType): boolean {
  return type === 'select' || type === 'multi_select';
}

export async function createField(
  actor: Actor,
  input: { label: string; type: CrmFieldType; options?: string[] },
): Promise<CrmFieldRow> {
  const label = input.label.trim();
  if (label === '') throw invalid('Name the field', { label: 'A label is required' });

  const options = fieldTakesOptions(input.type) ? normalizeTags(input.options) : [];
  if (fieldTakesOptions(input.type) && options.length === 0) {
    throw invalid('A dropdown needs at least one option', {
      options: 'Add an option',
    });
  }

  const db = getDb();
  const existing = await listFields(actor);
  const base = slugify(label) || 'field';
  let key = base;
  for (let suffix = 2; existing.some((field) => field.key === key); suffix += 1) {
    key = `${base}-${suffix}`;
  }

  const [row] = await db
    .insert(crmField)
    .values({
      ownerUserId: actor.userId,
      key,
      label,
      type: input.type,
      options,
      position: existing.length,
    })
    .returning();
  return row;
}

export async function deleteField(actor: Actor, fieldId: string): Promise<void> {
  await getDb()
    .delete(crmField)
    .where(and(eq(crmField.id, fieldId), eq(crmField.ownerUserId, actor.userId)));
}

/* ------------------------------------------------------------------ segments */

export type SegmentSummary = { segment: SegmentRow; memberCount: number };

export async function listSegments(actor: Actor): Promise<SegmentSummary[]> {
  const [segments, rows] = await Promise.all([
    getDb().query.contactSegment.findMany({
      where: eq(contactSegment.ownerUserId, actor.userId),
      orderBy: [desc(contactSegment.createdAt)],
    }),
    ownedContacts(actor),
  ]);
  return segments.map((segment) => ({
    segment,
    memberCount: resolveSegmentMembers(segment, rows).length,
  }));
}

/**
 * The dynamic/curated split is the only thing that distinguishes the two kinds at read time: a
 * dynamic segment re-runs its filter so tomorrow's import joins it on its own, a curated one
 * returns exactly the ids that were captured when it was saved.
 */
export function resolveSegmentMembers(
  segment: Pick<SegmentRow, 'kind' | 'filters' | 'memberContactIds'>,
  contacts: ContactRow[],
): ContactRow[] {
  if (segment.kind === 'curated') {
    const wanted = new Set(segment.memberContactIds);
    return contacts.filter((row) => wanted.has(row.id));
  }
  const filters = toFilters(segment.filters);
  return contacts.filter((row) => contactMatches(row, filters));
}

export async function createSegment(
  actor: Actor,
  input: {
    name: string;
    kind: SegmentKind;
    filters: DirectoryFilters;
    memberContactIds?: string[];
  },
): Promise<SegmentRow> {
  const name = input.name.trim();
  if (name === '') throw invalid('Name the segment', { name: 'A name is required' });

  const members = input.kind === 'curated' ? (input.memberContactIds ?? []) : [];

  const [row] = await getDb()
    .insert(contactSegment)
    .values({
      ownerUserId: actor.userId,
      name,
      kind: input.kind,
      filters: { ...input.filters } as Record<string, unknown>,
      memberContactIds: members,
    })
    .returning();
  return row;
}

export async function getSegment(
  actor: Actor,
  segmentId: string,
): Promise<{
  segment: SegmentRow;
  members: ContactRow[];
  fields: CrmFieldRow[];
}> {
  const db = getDb();
  const segment = await db.query.contactSegment.findFirst({
    where: and(eq(contactSegment.id, segmentId), eq(contactSegment.ownerUserId, actor.userId)),
  });
  if (!segment) throw notFound('Segment');

  const [rows, fields] = await Promise.all([ownedContacts(actor), listFields(actor)]);
  return { segment, members: resolveSegmentMembers(segment, rows), fields };
}

export async function deleteSegment(actor: Actor, segmentId: string): Promise<void> {
  await getDb()
    .delete(contactSegment)
    .where(and(eq(contactSegment.id, segmentId), eq(contactSegment.ownerUserId, actor.userId)));
}

/* ------------------------------------------------------------------ duplicates and merge */

export function normalizeName(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export type DuplicateGroup = { key: string; contacts: ContactRow[] };

/** Same person, two addresses — the shape a CSV import from a second event reliably produces. */
export function duplicateGroups(contacts: ContactRow[]): DuplicateGroup[] {
  const byName = new Map<string, ContactRow[]>();
  for (const row of contacts) {
    const key = normalizeName(row.name);
    if (key === '') continue;
    byName.set(key, [...(byName.get(key) ?? []), row]);
  }
  return [...byName.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([key, rows]) => ({
      key,
      contacts: [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()),
    }))
    .sort((a, b) => a.contacts[0].name.localeCompare(b.contacts[0].name));
}

export async function listDuplicateGroups(actor: Actor): Promise<DuplicateGroup[]> {
  return duplicateGroups(await ownedContacts(actor));
}

export const MERGEABLE_FIELDS = [
  'name',
  'email',
  'jobTitle',
  'company',
  'bioMarkdown',
  'headshotUrl',
  'location',
  'source',
] as const;

export type MergeableField = (typeof MERGEABLE_FIELDS)[number];
export type MergeChoice = Partial<Record<MergeableField, string>>;

export type MergedValues = Record<MergeableField, string | null> & {
  tags: string[];
  customFields: Record<string, string>;
};

/**
 * The primary's own value always beats a loser's; a loser only ever fills a gap. An explicit
 * side-by-side choice beats both, which is what makes field-level selection meaningful rather than
 * decorative.
 */
export function mergeContactValues(
  primary: ContactRow,
  losers: ContactRow[],
  choices: MergeChoice = {},
): MergedValues {
  const merged = {} as MergedValues;

  for (const field of MERGEABLE_FIELDS) {
    const chosen = trimmed(choices[field]);
    if (chosen) {
      merged[field] = chosen;
      continue;
    }
    const own = trimmed(primary[field]);
    merged[field] = own ?? losers.map((row) => trimmed(row[field])).find(Boolean) ?? null;
  }

  merged.tags = normalizeTags([primary.tags, ...losers.map((row) => row.tags)].flat());

  const customFields: Record<string, string> = {};
  for (const row of [...losers].reverse()) Object.assign(customFields, row.customFields);
  Object.assign(customFields, primary.customFields);
  merged.customFields = Object.fromEntries(
    Object.entries(customFields).filter(([, value]) => (value ?? '').trim() !== ''),
  );

  return merged;
}

export async function mergeContacts(
  actor: Actor,
  input: { primaryId: string; loserIds: string[]; choices?: MergeChoice },
): Promise<ContactRow> {
  const loserIds = input.loserIds.filter((id) => id !== input.primaryId);
  if (loserIds.length === 0) throw invalid('Pick at least one record to merge in');

  const db = getDb();
  const rows = await db.query.contact.findMany({
    where: and(
      eq(contact.ownerUserId, actor.userId),
      inArray(contact.id, [input.primaryId, ...loserIds]),
    ),
  });
  const primary = rows.find((row) => row.id === input.primaryId);
  if (!primary) throw notFound('Contact');
  const losers = loserIds
    .map((id) => rows.find((row) => row.id === id))
    .filter((row): row is ContactRow => Boolean(row));
  if (losers.length === 0) throw notFound('Contact');

  const merged = mergeContactValues(primary, losers, input.choices);

  // History and links move to the survivor before the tombstones are stamped, so the merged
  // profile carries the whole story rather than only the primary's half of it.
  await db
    .update(contactNote)
    .set({ contactId: primary.id })
    .where(inArray(contactNote.contactId, loserIds));
  await db
    .update(contactActivity)
    .set({ contactId: primary.id })
    .where(inArray(contactActivity.contactId, loserIds));
  await db
    .update(prospect)
    .set({ contactId: primary.id })
    .where(inArray(prospect.contactId, loserIds));

  const existingLinks = await db.query.contactEventLink.findMany({
    where: inArray(contactEventLink.contactId, [primary.id, ...loserIds]),
  });
  const keptEvents = new Set(
    existingLinks.filter((link) => link.contactId === primary.id).map((link) => link.eventId),
  );
  for (const link of existingLinks) {
    if (link.contactId === primary.id) continue;
    if (keptEvents.has(link.eventId)) {
      await db.delete(contactEventLink).where(eq(contactEventLink.id, link.id));
      continue;
    }
    keptEvents.add(link.eventId);
    await db
      .update(contactEventLink)
      .set({ contactId: primary.id })
      .where(eq(contactEventLink.id, link.id));
  }

  await db
    .update(contact)
    .set({ mergedIntoContactId: primary.id, updatedAt: new Date() })
    .where(inArray(contact.id, loserIds));

  const [row] = await db
    .update(contact)
    .set({
      name: merged.name ?? primary.name,
      email: merged.email ?? primary.email,
      jobTitle: merged.jobTitle,
      company: merged.company,
      bioMarkdown: merged.bioMarkdown,
      headshotUrl: merged.headshotUrl,
      location: merged.location,
      source: merged.source,
      tags: merged.tags,
      customFields: merged.customFields,
      updatedAt: new Date(),
    })
    .where(eq(contact.id, primary.id))
    .returning();

  await logActivity(actor, [
    {
      contactId: primary.id,
      kind: 'merged',
      summary: `Merged ${losers.map((loser) => loser.email).join(', ')} into this record`,
    },
  ]);
  return row;
}

/* ------------------------------------------------------------------ pipeline */

export type ProspectCard = {
  id: string;
  contactId: string;
  name: string;
  email: string;
  company: string | null;
  jobTitle: string | null;
  tags: string[];
  stage: ProspectStage;
  score: number | null;
  rationale: string | null;
  position: number;
  eventId: string | null;
  eventName: string | null;
  noteCount: number;
  updatedAt: Date;
};

export type PipelineColumn = {
  stage: ProspectStage;
  label: string;
  cards: ProspectCard[];
};

export async function listPipeline(actor: Actor): Promise<PipelineColumn[]> {
  const db = getDb();
  const [rows, notes] = await Promise.all([
    db
      .select({ card: prospect, person: contact, eventName: event.name })
      .from(prospect)
      .innerJoin(contact, eq(prospect.contactId, contact.id))
      .leftJoin(event, eq(prospect.eventId, event.id))
      .where(eq(prospect.ownerUserId, actor.userId))
      .orderBy(asc(prospect.position), asc(prospect.createdAt)),
    db
      .select({ prospectId: contactNote.prospectId })
      .from(contactNote)
      .innerJoin(contact, eq(contactNote.contactId, contact.id))
      .where(eq(contact.ownerUserId, actor.userId)),
  ]);

  const noteCounts = new Map<string, number>();
  for (const note of notes) {
    if (!note.prospectId) continue;
    noteCounts.set(note.prospectId, (noteCounts.get(note.prospectId) ?? 0) + 1);
  }

  const cards: ProspectCard[] = rows.map((row) => ({
    id: row.card.id,
    contactId: row.card.contactId,
    name: row.person.name,
    email: row.person.email,
    company: row.person.company,
    jobTitle: row.person.jobTitle,
    tags: row.person.tags,
    stage: row.card.stage,
    score: row.card.score,
    rationale: row.card.rationale,
    position: row.card.position,
    eventId: row.card.eventId,
    eventName: row.eventName,
    noteCount: noteCounts.get(row.card.id) ?? 0,
    updatedAt: row.card.updatedAt,
  }));

  return PROSPECT_STAGES.map((stage) => ({
    stage,
    label: STAGE_LABELS[stage],
    cards: cards.filter((card) => card.stage === stage),
  }));
}

export async function enrollProspect(
  actor: Actor,
  input: {
    contactId: string;
    stage?: ProspectStage;
    score?: number | null;
    rationale?: string | null;
    eventId?: string | null;
  },
): Promise<ProspectRow> {
  const db = getDb();
  const person = await db.query.contact.findFirst({
    where: and(eq(contact.id, input.contactId), eq(contact.ownerUserId, actor.userId)),
  });
  if (!person) throw notFound('Contact');

  const stage = input.stage ?? 'researching';
  if (input.score !== null && input.score !== undefined) {
    if (!Number.isFinite(input.score) || input.score < 0 || input.score > 100) {
      throw invalid('A score runs from 0 to 100', { score: 'Enter 0–100' });
    }
  }

  const existing = await db.query.prospect.findMany({
    where: and(eq(prospect.ownerUserId, actor.userId), eq(prospect.stage, stage)),
  });

  const [row] = await db
    .insert(prospect)
    .values({
      ownerUserId: actor.userId,
      contactId: input.contactId,
      eventId: input.eventId ?? null,
      stage,
      score: input.score ?? null,
      rationale: trimmed(input.rationale),
      position: existing.length,
    })
    .returning();

  const scoreNote = row.score === null ? '' : ` with a score of ${row.score}`;
  await logActivity(actor, [
    {
      contactId: input.contactId,
      prospectId: row.id,
      kind: 'stage_change',
      summary: `Enrolled in sourcing at ${STAGE_LABELS[stage]}${scoreNote}`,
    },
  ]);
  return row;
}

export async function moveProspect(
  actor: Actor,
  input: { prospectId: string; stage: ProspectStage; position?: number },
): Promise<ProspectRow> {
  const db = getDb();
  const card = await db.query.prospect.findFirst({
    where: and(eq(prospect.id, input.prospectId), eq(prospect.ownerUserId, actor.userId)),
  });
  if (!card) throw notFound('Prospect');

  const siblings = await db.query.prospect.findMany({
    where: and(eq(prospect.ownerUserId, actor.userId), eq(prospect.stage, input.stage)),
    orderBy: [asc(prospect.position), asc(prospect.createdAt)],
  });
  const ordered = siblings.filter((row) => row.id !== card.id).map((row) => row.id);
  const index = Math.max(0, Math.min(ordered.length, input.position ?? ordered.length));
  ordered.splice(index, 0, card.id);

  await Promise.all(
    ordered.map((id, order) =>
      db
        .update(prospect)
        .set(
          id === card.id
            ? { stage: input.stage, position: order, updatedAt: new Date() }
            : { position: order },
        )
        .where(eq(prospect.id, id)),
    ),
  );

  if (card.stage !== input.stage) {
    await logActivity(actor, [
      {
        contactId: card.contactId,
        prospectId: card.id,
        kind: 'stage_change',
        summary: `${STAGE_LABELS[card.stage]} → ${STAGE_LABELS[input.stage]}`,
      },
    ]);
  }

  const updated = await db.query.prospect.findFirst({
    where: eq(prospect.id, card.id),
  });
  if (!updated) throw notFound('Prospect');
  return updated;
}

export async function removeProspect(actor: Actor, prospectId: string): Promise<void> {
  await getDb()
    .delete(prospect)
    .where(and(eq(prospect.id, prospectId), eq(prospect.ownerUserId, actor.userId)));
}

export type ProspectDetail = {
  card: ProspectRow;
  contact: ContactRow;
  eventName: string | null;
  notes: NoteRow[];
  history: ActivityRow[];
};

export async function getProspectDetail(actor: Actor, prospectId: string): Promise<ProspectDetail> {
  const db = getDb();
  const [found] = await db
    .select({ card: prospect, person: contact, eventName: event.name })
    .from(prospect)
    .innerJoin(contact, eq(prospect.contactId, contact.id))
    .leftJoin(event, eq(prospect.eventId, event.id))
    .where(and(eq(prospect.id, prospectId), eq(prospect.ownerUserId, actor.userId)));
  if (!found) throw notFound('Prospect');

  const [notes, history] = await Promise.all([
    db.query.contactNote.findMany({
      where: eq(contactNote.prospectId, prospectId),
      orderBy: [desc(contactNote.createdAt)],
    }),
    db.query.contactActivity.findMany({
      where: eq(contactActivity.prospectId, prospectId),
      orderBy: [desc(contactActivity.createdAt)],
    }),
  ]);

  return {
    card: found.card,
    contact: found.person,
    eventName: found.eventName,
    notes,
    history,
  };
}

/* ------------------------------------------------------------------ push to event */

export type OrganizerEvent = { id: string; name: string; slug: string };

export async function listOrganizerEvents(actor: Actor): Promise<OrganizerEvent[]> {
  const rows = await getDb()
    .select({ id: event.id, name: event.name, slug: event.slug })
    .from(membership)
    .innerJoin(event, eq(membership.eventId, event.id))
    .where(and(eq(membership.userId, actor.userId), eq(membership.role, 'organizer')))
    .orderBy(desc(event.createdAt));
  return rows;
}

/**
 * `CRM-10`. The contact is *linked* into the event rather than copied: the directory row stays the
 * one place the bio lives, and the event gets a `participant` seeded from it so the speakers module
 * shows the person without anyone re-keying a field.
 */
export async function pushContactToEvent(
  actor: Actor,
  input: { contactId: string; eventId: string },
): Promise<{ participantId: string; created: boolean; eventName: string }> {
  const db = getDb();
  const [person, target] = await Promise.all([
    db.query.contact.findFirst({
      where: and(eq(contact.id, input.contactId), eq(contact.ownerUserId, actor.userId)),
    }),
    db.query.membership.findFirst({
      where: and(
        eq(membership.userId, actor.userId),
        eq(membership.eventId, input.eventId),
        eq(membership.role, 'organizer'),
      ),
    }),
  ]);
  if (!person) throw notFound('Contact');
  if (!target) throw notFound('An event you can manage');

  const targetEvent = await db.query.event.findFirst({
    where: eq(event.id, input.eventId),
  });
  if (!targetEvent) throw notFound('Event');

  let account = await db.query.user.findFirst({
    where: eq(user.email, person.email),
  });
  if (!account) {
    [account] = await db
      .insert(user)
      .values({ email: person.email, name: person.name })
      .returning();
  }

  const speakerRole = await db.query.membership.findFirst({
    where: and(
      eq(membership.userId, account.id),
      eq(membership.eventId, input.eventId),
      eq(membership.role, 'speaker'),
    ),
  });
  if (!speakerRole) {
    await db
      .insert(membership)
      .values({ userId: account.id, eventId: input.eventId, role: 'speaker' })
      .onConflictDoNothing();
  }

  const existing = await db.query.participant.findFirst({
    where: and(eq(participant.eventId, input.eventId), eq(participant.userId, account.id)),
  });

  let participantId: string;
  let created: boolean;
  if (existing) {
    participantId = existing.id;
    created = false;
    await db
      .update(participant)
      .set({
        displayName: existing.displayName ?? person.name,
        jobTitle: existing.jobTitle ?? person.jobTitle,
        company: existing.company ?? person.company,
        bioMarkdown: existing.bioMarkdown ?? person.bioMarkdown,
        updatedAt: new Date(),
      })
      .where(eq(participant.id, existing.id));
  } else {
    const [row] = await db
      .insert(participant)
      .values({
        eventId: input.eventId,
        userId: account.id,
        displayName: person.name,
        jobTitle: person.jobTitle,
        company: person.company,
        bioMarkdown: person.bioMarkdown,
      })
      .returning({ id: participant.id });
    participantId = row.id;
    created = true;
  }

  const link = await db.query.contactEventLink.findFirst({
    where: and(
      eq(contactEventLink.contactId, person.id),
      eq(contactEventLink.eventId, input.eventId),
    ),
  });
  if (link) {
    await db
      .update(contactEventLink)
      .set({ participantId })
      .where(eq(contactEventLink.id, link.id));
  } else {
    await db
      .insert(contactEventLink)
      .values({ contactId: person.id, eventId: input.eventId, participantId });
    await logActivity(actor, [
      {
        contactId: person.id,
        kind: 'event_added',
        summary: `Pushed to ${targetEvent.name}`,
      },
    ]);
  }

  return { participantId, created, eventName: targetEvent.name };
}

/* ------------------------------------------------------------------ campaigns */

export const MERGE_TAGS = ['first_name', 'name', 'company', 'job_title', 'email'] as const;

export function mergeValuesFor(row: Pick<ContactRow, 'name' | 'email' | 'company' | 'jobTitle'>) {
  return {
    first_name: row.name.trim().split(/\s+/)[0] ?? '',
    name: row.name,
    company: row.company ?? '',
    job_title: row.jobTitle ?? '',
    email: row.email,
  } satisfies Record<(typeof MERGE_TAGS)[number], string>;
}

/** An unresolved tag renders as empty rather than as itself; a stray `{{ }}` in an inbox is worse. */
export function renderMergeTags(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z0-9_.]+)\s*\}\}/gi, (_, key: string) => values[key] ?? '');
}

export type CampaignPreview = {
  email: string;
  name: string;
  subject: string;
  body: string;
};

export function previewCampaign(
  subject: string,
  body: string,
  row: Pick<ContactRow, 'name' | 'email' | 'company' | 'jobTitle'>,
): CampaignPreview {
  const values = mergeValuesFor(row);
  return {
    email: row.email,
    name: row.name,
    subject: renderMergeTags(subject, values),
    body: renderMergeTags(body, values),
  };
}

export type CampaignSummary = {
  id: string;
  subject: string;
  bodyMarkdown: string;
  recipientCount: number;
  createdAt: Date;
  recipients: Array<{
    email: string;
    renderedSubject: string;
    emailLogId: string | null;
  }>;
};

export async function listCampaigns(actor: Actor): Promise<CampaignSummary[]> {
  const db = getDb();
  const campaigns = await db.query.contactCampaign.findMany({
    where: eq(contactCampaign.ownerUserId, actor.userId),
    orderBy: [desc(contactCampaign.createdAt)],
  });
  if (campaigns.length === 0) return [];

  const recipients = await db.query.contactCampaignRecipient.findMany({
    where: inArray(
      contactCampaignRecipient.campaignId,
      campaigns.map((row) => row.id),
    ),
    orderBy: [asc(contactCampaignRecipient.createdAt)],
  });

  return campaigns.map((row) => ({
    id: row.id,
    subject: row.subject,
    bodyMarkdown: row.bodyMarkdown,
    recipientCount: row.recipientCount,
    createdAt: row.createdAt,
    recipients: recipients
      .filter((entry) => entry.campaignId === row.id)
      .map((entry) => ({
        email: entry.email,
        renderedSubject: entry.renderedSubject,
        emailLogId: entry.emailLogId,
      })),
  }));
}

export async function sendCampaign(
  actor: Actor,
  input: {
    subject: string;
    bodyMarkdown: string;
    contactIds: string[];
    eventId?: string | null;
  },
): Promise<{ campaignId: string; sent: number; failed: number }> {
  const subject = input.subject.trim();
  const body = input.bodyMarkdown.trim();
  const details: Record<string, string> = {};
  if (subject === '') details.subject = 'A subject is required';
  if (body === '') details.body = 'Write a message first';
  if (input.contactIds.length < 2) details.recipients = 'Pick at least two contacts';
  if (Object.keys(details).length > 0) throw invalid('Check the campaign', details);

  const db = getDb();
  const rows = await db.query.contact.findMany({
    where: and(
      eq(contact.ownerUserId, actor.userId),
      isNull(contact.mergedIntoContactId),
      inArray(contact.id, input.contactIds),
    ),
  });
  if (rows.length === 0) throw notFound('Those contacts');

  const [campaign] = await db
    .insert(contactCampaign)
    .values({
      ownerUserId: actor.userId,
      eventId: input.eventId ?? null,
      subject,
      bodyMarkdown: body,
      recipientCount: rows.length,
    })
    .returning();

  let sent = 0;
  let failed = 0;
  for (const row of rows) {
    const rendered = previewCampaign(subject, body, row);
    const result = await sendMail({
      to: row.email,
      subject: rendered.subject,
      html: renderMarkdown(rendered.body),
      text: markdownToText(rendered.body),
      eventId: input.eventId ?? null,
      templateKey: 'crm_campaign',
    });
    if (result.sent) sent += 1;
    else failed += 1;

    await db.insert(contactCampaignRecipient).values({
      campaignId: campaign.id,
      contactId: row.id,
      email: row.email,
      renderedSubject: rendered.subject,
      emailLogId: result.id,
    });
  }

  await logActivity(
    actor,
    rows.map((row) => ({
      contactId: row.id,
      kind: 'email_sent' as const,
      summary: `Sent “${previewCampaign(subject, body, row).subject}”`,
    })),
  );

  return { campaignId: campaign.id, sent, failed };
}

/* ------------------------------------------------------------------ CSV import */

export type ImportField = {
  key: keyof ContactInput;
  label: string;
  required: boolean;
  aliases: string[];
};

export const IMPORT_FIELDS: ImportField[] = [
  {
    key: 'name',
    label: 'Name',
    required: true,
    aliases: ['name', 'full name', 'speaker', 'contact', 'first name'],
  },
  {
    key: 'email',
    label: 'Email',
    required: true,
    aliases: ['email', 'email address', 'e mail'],
  },
  {
    key: 'jobTitle',
    label: 'Job title',
    required: false,
    aliases: ['job title', 'title', 'role', 'position'],
  },
  {
    key: 'company',
    label: 'Company',
    required: false,
    aliases: ['company', 'organisation', 'organization', 'employer'],
  },
  {
    key: 'location',
    label: 'Location',
    required: false,
    aliases: ['location', 'city', 'country', 'region'],
  },
  {
    key: 'bioMarkdown',
    label: 'Bio',
    required: false,
    aliases: ['bio', 'biography', 'about'],
  },
  {
    key: 'headshotUrl',
    label: 'Headshot URL',
    required: false,
    aliases: ['headshot', 'headshot url', 'photo', 'avatar'],
  },
  {
    key: 'tags',
    label: 'Tags',
    required: false,
    aliases: ['tags', 'topics', 'areas of focus', 'expertise'],
  },
  {
    key: 'source',
    label: 'Source',
    required: false,
    aliases: ['source', 'origin', 'channel'],
  },
];

export type ImportMapping = Record<string, string>;

export function suggestMapping(headers: string[]): ImportMapping {
  const normalized = headers.map((header) => normalizeHeader(header));
  const mapping: ImportMapping = {};
  const taken = new Set<string>();

  for (const field of IMPORT_FIELDS) {
    const index = normalized.findIndex(
      (header, position) => !taken.has(headers[position]) && field.aliases.includes(header),
    );
    if (index >= 0) {
      mapping[field.key] = headers[index];
      taken.add(headers[index]);
    } else {
      mapping[field.key] = '';
    }
  }
  return mapping;
}

export type ImportIssue = { severity: 'error' | 'warning'; message: string };

export type ImportPreviewRow = {
  line: number;
  values: Record<string, string>;
  issues: ImportIssue[];
  action: 'create' | 'update' | 'skip';
};

export type ImportPreview = {
  headers: string[];
  mapping: ImportMapping;
  rows: ImportPreviewRow[];
  counts: { create: number; update: number; skip: number };
};

function readMapped(
  headers: string[],
  row: string[],
  mapping: ImportMapping,
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const field of IMPORT_FIELDS) {
    const header = mapping[field.key];
    const index = header ? headers.indexOf(header) : -1;
    values[field.key] = index >= 0 ? (row[index] ?? '').trim() : '';
  }
  return values;
}

/**
 * The mapping step earns its keep by refusing to guess: a row without a usable email is reported
 * with its line number and left out, rather than imported as a record nobody can ever email.
 */
export function buildImportPreview(
  table: CsvTable,
  mapping: ImportMapping,
  existingEmails: string[],
): ImportPreview {
  const known = new Set(existingEmails.map((email) => email.toLowerCase()));
  const seen = new Set<string>();
  const rows: ImportPreviewRow[] = table.rows.map((row, index) => {
    const values = readMapped(table.headers, row, mapping);
    const issues: ImportIssue[] = [];
    const email = values.email.toLowerCase();

    if (values.name === '') issues.push({ severity: 'error', message: 'Missing name' });
    if (email === '') issues.push({ severity: 'error', message: 'Missing email' });
    else if (!isEmail(email))
      issues.push({
        severity: 'error',
        message: `“${values.email}” is not an email address`,
      });
    else if (seen.has(email)) issues.push({ severity: 'error', message: 'Repeated in this file' });
    else if (known.has(email))
      issues.push({
        severity: 'warning',
        message: 'Already in the directory — will be updated',
      });

    if (email !== '') seen.add(email);

    const blocked = issues.some((issue) => issue.severity === 'error');
    const action: ImportPreviewRow['action'] = blocked
      ? 'skip'
      : known.has(email)
        ? 'update'
        : 'create';

    return { line: index + 2, values, issues, action };
  });

  return {
    headers: table.headers,
    mapping,
    rows,
    counts: {
      create: rows.filter((row) => row.action === 'create').length,
      update: rows.filter((row) => row.action === 'update').length,
      skip: rows.filter((row) => row.action === 'skip').length,
    },
  };
}

export async function previewImport(
  actor: Actor,
  csv: string,
  mapping?: ImportMapping,
): Promise<ImportPreview> {
  const table = parseCsvTable(csv);
  if (table.headers.length === 0) throw invalid('That file has no header row');
  const existing = await ownedContacts(actor);
  const resolved = mapping ?? suggestMapping(table.headers);
  return buildImportPreview(
    table,
    resolved,
    existing.map((row) => row.email),
  );
}

export type ImportResult = {
  created: number;
  updated: number;
  skipped: number;
};

export async function importContacts(
  actor: Actor,
  csv: string,
  mapping?: ImportMapping,
): Promise<ImportResult> {
  const preview = await previewImport(actor, csv, mapping);
  const db = getDb();
  const existing = await ownedContacts(actor);
  const byEmail = new Map(existing.map((row) => [row.email.toLowerCase(), row]));

  let created = 0;
  let updated = 0;

  for (const row of preview.rows) {
    if (row.action === 'skip') continue;
    const email = row.values.email.toLowerCase();
    const input: ContactInput = {
      name: row.values.name,
      email,
      jobTitle: row.values.jobTitle || null,
      company: row.values.company || null,
      location: row.values.location || null,
      bioMarkdown: row.values.bioMarkdown || null,
      headshotUrl: row.values.headshotUrl || null,
      source: row.values.source || 'csv_import',
      tags: parseTagList(row.values.tags),
    };

    const match = byEmail.get(email);
    if (match) {
      await db
        .update(contact)
        .set({
          name: input.name,
          jobTitle: input.jobTitle ?? match.jobTitle,
          company: input.company ?? match.company,
          location: input.location ?? match.location,
          bioMarkdown: input.bioMarkdown ?? match.bioMarkdown,
          headshotUrl: input.headshotUrl ?? match.headshotUrl,
          tags: normalizeTags([...match.tags, ...(input.tags ?? [])]),
          updatedAt: new Date(),
        })
        .where(eq(contact.id, match.id));
      await logActivity(actor, [
        {
          contactId: match.id,
          kind: 'imported',
          summary: 'Refreshed from a CSV import',
        },
      ]);
      updated += 1;
      continue;
    }

    const [inserted] = await db
      .insert(contact)
      .values({
        ownerUserId: actor.userId,
        name: input.name,
        email,
        jobTitle: input.jobTitle,
        company: input.company,
        location: input.location,
        bioMarkdown: input.bioMarkdown,
        headshotUrl: input.headshotUrl,
        source: input.source,
        tags: input.tags ?? [],
      })
      .returning({ id: contact.id });
    await logActivity(actor, [
      {
        contactId: inserted.id,
        kind: 'imported',
        summary: 'Imported from CSV',
      },
    ]);
    created += 1;
  }

  return { created, updated, skipped: preview.counts.skip };
}

/* ------------------------------------------------------------------ dashboard */

export type Breakdown = { label: string; count: number };

export type CrmDashboard = {
  totals: {
    contacts: number;
    companies: number;
    tagged: number;
    withBio: number;
    prospects: number;
    confirmed: number;
    segments: number;
    eventLinks: number;
    emailsSent: number;
  };
  topCompanies: Breakdown[];
  bySource: Breakdown[];
  byLocation: Breakdown[];
  topTags: Breakdown[];
  byStage: Array<Breakdown & { stage: ProspectStage }>;
};

function rank(values: Array<string | null>, limit = 6): Breakdown[] {
  const counts = new Map<string, number>();
  for (const raw of values) {
    const label = (raw ?? '').trim();
    if (label === '') continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

export async function getCrmDashboard(actor: Actor): Promise<CrmDashboard> {
  const db = getDb();
  const [rows, cards, segments, links, campaigns] = await Promise.all([
    ownedContacts(actor),
    db.query.prospect.findMany({
      where: eq(prospect.ownerUserId, actor.userId),
    }),
    db.query.contactSegment.findMany({
      where: eq(contactSegment.ownerUserId, actor.userId),
    }),
    db
      .select({ id: contactEventLink.id })
      .from(contactEventLink)
      .innerJoin(contact, eq(contactEventLink.contactId, contact.id))
      .where(eq(contact.ownerUserId, actor.userId)),
    db.query.contactCampaign.findMany({
      where: eq(contactCampaign.ownerUserId, actor.userId),
    }),
  ]);

  return {
    totals: {
      contacts: rows.length,
      companies: new Set(rows.map((row) => (row.company ?? '').trim()).filter(Boolean)).size,
      tagged: rows.filter((row) => row.tags.length > 0).length,
      withBio: rows.filter((row) => (row.bioMarkdown ?? '').trim() !== '').length,
      prospects: cards.length,
      confirmed: cards.filter((card) => card.stage === 'confirmed').length,
      segments: segments.length,
      eventLinks: links.length,
      emailsSent: campaigns.reduce((total, row) => total + row.recipientCount, 0),
    },
    topCompanies: rank(rows.map((row) => row.company)),
    bySource: rank(rows.map((row) => row.source)),
    byLocation: rank(rows.map((row) => row.location)),
    topTags: rank(rows.flatMap((row) => row.tags)),
    byStage: PROSPECT_STAGES.map((stage) => ({
      stage,
      label: STAGE_LABELS[stage],
      count: cards.filter((card) => card.stage === stage).length,
    })),
  };
}

/* ------------------------------------------------------------------ sample data */

export const SAMPLE_CSV = `Name,Email,Job Title,Company,Location,Tags,Source,Bio
Amara Okonkwo,amara.okonkwo@helioslabs.io,Principal Research Scientist,Helios Labs,"Lagos, NG","AI, Machine Learning",conference,Leads the applied reasoning group at Helios Labs.
Amara Okonkwo,a.okonkwo@heliosresearch.org,Head of AI Research,Helios Research,"Lagos, NG","AI, Ethics",referral,Runs the ethics review board for applied ML.
Bjorn Halvorsen,bjorn@northwind.dev,Staff Engineer,Northwind,"Oslo, NO","Platform, Kubernetes",referral,Builds the deployment platform behind Northwind.
Priya Raghunathan,priya@quantcastle.com,VP Data,QuantCastle,"Bengaluru, IN","AI, Analytics",inbound,Fifteen years of data platform work across fintech.
Tomás Rivera,tomas.rivera@aurorasystems.mx,Developer Advocate,Aurora Systems,"Mexico City, MX","DevRel, Community",conference,Runs the largest Spanish-language developer community in LATAM.
Grace Whitfield,grace@meridianhealth.org,Chief Medical Informatics Officer,Meridian Health,"Boston, US","Healthcare, AI",inbound,Writes on clinical decision support and model governance.
Kenji Nakamura,kenji@sakuracloud.jp,Distinguished Engineer,Sakura Cloud,"Tokyo, JP","Platform, Databases",referral,Maintainer of two widely used storage engines.
Lucia Ferrante,lucia@borgocode.it,Engineering Manager,BorgoCode,"Milan, IT","Leadership, Teams",conference,Speaks on scaling engineering orgs past 200 people.
Samuel Adeyemi,samuel@ridgelinefin.com,Head of Platform,Ridgeline Financial,"London, UK","Platform, Fintech",inbound,Owns the payments platform at Ridgeline.
Hannah Voss,hannah@atlasrobotics.de,Robotics Lead,Atlas Robotics,"Berlin, DE","Robotics, AI",conference,Builds warehouse autonomy stacks.
Diego Marquez,diego@vectorbio.cl,Computational Biologist,VectorBio,"Santiago, CL","AI, Biotech",referral,Applies transformers to protein folding pipelines.
Nadia Rahman,nadia@lumenanalytics.ca,Director of Analytics,Lumen Analytics,"Toronto, CA","Analytics, Leadership",inbound,Built the analytics function at three startups.
`;

/**
 * A cold directory cannot demonstrate search, filters or duplicate detection, and the seed script
 * is event-scoped. This gives an organizer opening the area for the first time something real to
 * work against, including one deliberate same-name pair for the merge flow.
 */
export async function loadSampleContacts(actor: Actor): Promise<ImportResult> {
  return importContacts(actor, SAMPLE_CSV);
}
