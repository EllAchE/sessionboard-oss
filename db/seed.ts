import { eq, inArray } from 'drizzle-orm';
import { requireEventWindow } from '../lib/event-dates';
import { newIcsUid } from '../lib/ics';
import { ensureDefaultTemplates } from '../lib/services/comms';
import {
  PARTICIPANT_BUILTIN_FIELDS,
  PARTICIPANT_BUILTIN_META,
} from '../lib/forms/contract';
import { splitPersonName } from '../lib/person-name';
import { getDb } from './client';
import { seedFirstSettlement } from './seeds/first-settlement';
import {
  emailLog,
  event,
  fileRequest,
  form,
  formField,
  formParticipantRole,
  membership,
  participant,
  participantRole,
  persona,
  portalPage,
  portalTheme,
  reviewAssignment,
  reviewRound,
  room,
  scheduledSession,
  score,
  scorecardCriterion,
  sessionFormat,
  sponsor,
  submission,
  submissionTag,
  tag,
  task,
  taskAssignment,
  track,
  trackReviewer,
  user,
} from './schema';

/**
 * Demo data for `D-3`: a judge lands on a populated event rather than an empty shell, and can still
 * create their own from scratch beside it without either seeing the other.
 *
 * Everything here is deliberately mid-flight — submissions in five states, a review round half
 * scored, an agenda with two accepted talks still sitting in the unscheduled rail, tasks that are
 * overdue for some speakers and done for others. A seed where every row is finished demonstrates
 * nothing; the product is about the work in between.
 *
 * Re-runnable: the demo event and its users are dropped first, so this never accumulates.
 */

const SLUG = 'demo';
const TIMEZONE = 'America/Los_Angeles';

/** Fixed offsets from the run date, so the demo is always a conference about six weeks out. */
const DAY = 86_400_000;
const now = new Date();
const day1 = new Date(now.getTime() + 42 * DAY);
day1.setUTCHours(0, 0, 0, 0);
const day2 = new Date(day1.getTime() + DAY);

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Wall-clock time on a conference day, expressed in the event's UTC-8 timezone. */
function at(day: Date, hour: number, minute = 0): Date {
  return new Date(day.getTime() + (hour + 8) * 3_600_000 + minute * 60_000);
}

function ago(days: number): Date {
  return new Date(now.getTime() - days * DAY);
}

const db = getDb();

// ---------------------------------------------------------------------------
// Reset. Deleting the event cascades through every event-scoped table; users
// are global and outlive it, so they go separately and last.
// ---------------------------------------------------------------------------

const PEOPLE = [
  { email: 'organizer@example.com', name: 'Tullia Ciceronis' },
  { email: 'reviewer.cicero@example.com', name: 'Marcus Tullius Cicero' },
  { email: 'reviewer.hortensius@example.com', name: 'Quintus Hortensius Hortalus' },
  { email: 'vitruvius@example.com', name: 'Marcus Vitruvius Pollio' },
  { email: 'sulpicia@example.com', name: 'Sulpicia' },
  { email: 'varro@example.com', name: 'Marcus Terentius Varro' },
  { email: 'tiro@example.com', name: 'Marcus Tullius Tiro' },
  { email: 'cornelia@example.com', name: 'Cornelia Africana' },
  { email: 'marius@example.com', name: 'Gaius Marius' },
  { email: 'servilia@example.com', name: 'Servilia Caepionis' },
] as const;

// Keep reseeds clean after the fixture rename; these addresses can otherwise survive as global users.
const LEGACY_DEMO_EMAILS = [
  'reviewer.chen@example.com',
  'reviewer.okafor@example.com',
  'sam.rivera@example.com',
  'priya.nair@example.com',
  'jonas.holm@example.com',
  'mei.tanaka@example.com',
  'diego.ferrer@example.com',
  'amara.osei@example.com',
  'tomas.novak@example.com',
] as const;
const DEMO_IDENTITY_EMAILS = [
  ...PEOPLE.map((person) => person.email),
  ...LEGACY_DEMO_EMAILS,
];

const [existing] = await db.select().from(event).where(eq(event.slug, SLUG));
if (existing) await db.delete(event).where(eq(event.id, existing.id));

// Anything else a demo identity owns goes with them. `event.owner_user_id` is a restricting
// reference, so a rehearsal event created while signed in as one of these addresses would block
// the user delete below and leave the seed half-applied — with the demo event already gone.
const demoUsers = await db
  .select({ id: user.id })
  .from(user)
  .where(
    inArray(
      user.email,
      DEMO_IDENTITY_EMAILS,
    ),
  );
if (demoUsers.length > 0) {
  await db.delete(event).where(
    inArray(
      event.ownerUserId,
      demoUsers.map((row) => row.id),
    ),
  );
}

await db.delete(user).where(
  inArray(
    user.email,
    DEMO_IDENTITY_EMAILS,
  ),
);

// ---------------------------------------------------------------------------
// People and the event
// ---------------------------------------------------------------------------

const users = await db
  .insert(user)
  // `F-6`: both halves stored, `name` still the join. A seed that only wrote `name` would leave every
  // demo speaker with an empty First Name on the very screen the requirement is about.
  .values(
    PEOPLE.map((person) => ({
      email: person.email,
      name: person.name,
      ...splitPersonName(person.name),
    })),
  )
  .returning();

const byEmail = new Map(users.map((row) => [row.email, row]));
const organizer = byEmail.get('organizer@example.com')!;
const reviewers = [
  byEmail.get('reviewer.cicero@example.com')!,
  byEmail.get('reviewer.hortensius@example.com')!,
];

/** `E-1`: doors at 09:00 on day one, close at 17:00 on day two, both read in the event's own zone. */
const demoWindow = requireEventWindow(TIMEZONE, `${isoDate(day1)}T09:00`, `${isoDate(day2)}T17:00`);

const [demo] = await db
  .insert(event)
  .values({
    slug: SLUG,
    name: 'Cicero Forum 2026',
    tagline: 'Infrastructure, governance, and public life in the Roman world',
    descriptionMarkdown:
      'A fictional Roman-themed conference with a call for speakers mid-review, a half-built ' +
      'agenda, and speakers partway through their onboarding tasks. The programme is historically ' +
      'inspired rather than a literal reconstruction. Everything here is editable — break it freely.',
    eventType: 'Conference',
    theme:
      'What Rome built and how it was argued over — the aqueducts, the courts, and the public ' +
      'life that ran between them.',
    timezone: demoWindow.timezone,
    startsAt: demoWindow.startsAt,
    endsAt: demoWindow.endsAt,
    startsOn: demoWindow.startsOn,
    endsOn: demoWindow.endsOn,
    websiteUrl: 'https://example.com/cicero-forum',
    venueName: 'The Getty Villa',
    venueAddress: '17985 Pacific Coast Highway, Pacific Palisades, CA',
    ownerUserId: organizer.id,
  })
  .returning();

await db.insert(membership).values([
  { userId: organizer.id, eventId: demo.id, role: 'organizer' as const },
  ...reviewers.map((reviewer) => ({
    userId: reviewer.id,
    eventId: demo.id,
    role: 'reviewer' as const,
  })),
  ...PEOPLE.slice(3).map((person) => ({
    userId: byEmail.get(person.email)!.id,
    eventId: demo.id,
    role: 'speaker' as const,
  })),
]);

// ---------------------------------------------------------------------------
// Taxonomy
// ---------------------------------------------------------------------------

const tracks = await db
  .insert(track)
  .values([
    { eventId: demo.id, name: 'Infrastructure', color: 'lapis', position: 0 },
    { eventId: demo.id, name: 'Governance', color: 'vermilion', position: 1 },
    { eventId: demo.id, name: 'Knowledge & Communication', color: 'verdigris', position: 2 },
    { eventId: demo.id, name: 'Logistics & Operations', color: 'ochre', position: 3 },
  ])
  .returning();

const rooms = await db
  .insert(room)
  .values([
    { eventId: demo.id, name: 'Outer Peristyle', capacity: 600, floor: 'Ground', position: 0 },
    { eventId: demo.id, name: 'Basilica Gallery', capacity: 180, floor: 'Ground', position: 1 },
    { eventId: demo.id, name: 'Villa Workshop', capacity: 60, floor: 'Lower level', position: 2 },
  ])
  .returning();

const formats = await db
  .insert(sessionFormat)
  .values([
    { eventId: demo.id, name: 'Keynote', durationMinutes: 45, position: 0 },
    { eventId: demo.id, name: 'Talk', durationMinutes: 30, position: 1 },
    { eventId: demo.id, name: 'Workshop', durationMinutes: 90, position: 2 },
  ])
  .returning();

const tags = await db
  .insert(tag)
  .values([
    { eventId: demo.id, name: 'first-time speaker', color: 'verdigris' },
    { eventId: demo.id, name: 'historical case study', color: 'lapis' },
    { eventId: demo.id, name: 'needs A/V check', color: 'ochre' },
  ])
  .returning();

const personas = await db
  .insert(persona)
  .values([
    {
      eventId: demo.id,
      name: 'Public works engineer',
      description: 'Builds and maintains the city',
      position: 0,
    },
    {
      eventId: demo.id,
      name: 'Civic leader',
      description: 'Makes policy and coordinates institutions',
      position: 1,
    },
  ])
  .returning();

/**
 * `E-7`. Sponsors and exhibitors, seeded partly filled in — a tier here, a booth there, one row
 * with nothing but a name — because that is the state an organizer's list is actually in, and a
 * uniformly complete list would hide how the surface reads when a field is empty. No logos: the
 * seed writes no image bytes anywhere, and the upload route is the only way one arrives.
 *
 * `Fabrica Vitraria` appears in both lists on purpose. It is the case the unique constraint is
 * keyed on `kind` to allow — a company that both sponsors and exhibits — so the demo data covers
 * it rather than leaving it to a migration test.
 */
await db.insert(sponsor).values([
  {
    eventId: demo.id,
    kind: 'sponsor',
    name: 'Aquae Urbanae',
    tier: 'Principal',
    websiteUrl: 'https://example.com/aquae-urbanae',
    description: 'Aqueduct survey and maintenance for the western provinces.',
    position: 0,
  },
  {
    eventId: demo.id,
    kind: 'sponsor',
    name: 'Fabrica Vitraria',
    tier: 'Supporting',
    websiteUrl: 'https://example.com/fabrica-vitraria',
    description: 'Glassworks, and the reason the Basilica Gallery has windows.',
    position: 1,
  },
  {
    eventId: demo.id,
    kind: 'sponsor',
    name: 'Scriptorium Municipale',
    tier: 'Supporting',
    position: 2,
  },
  { eventId: demo.id, kind: 'sponsor', name: 'Collegium Fabrorum', position: 3 },
  {
    eventId: demo.id,
    kind: 'exhibitor',
    name: 'Officina Ferraria',
    tier: 'Standard',
    boothLocation: 'Peristyle, stand 3',
    websiteUrl: 'https://example.com/officina-ferraria',
    description: 'Ironmongery and survey instruments.',
    position: 0,
  },
  {
    eventId: demo.id,
    kind: 'exhibitor',
    name: 'Fabrica Vitraria',
    boothLocation: 'Peristyle, stand 7',
    description: 'The same firm as the sponsor above, with a stand of its own.',
    position: 1,
  },
  {
    eventId: demo.id,
    kind: 'exhibitor',
    name: 'Horrea Publica',
    boothLocation: 'Lower level, stand 12',
    position: 2,
  },
]);

const [keynote, talk, workshop] = formats;
const [infrastructure, governance, knowledge, logistics] = tracks;
const [outerPeristyle, basilicaGallery, villaWorkshop] = rooms;

/**
 * `F-3` / `V-5`: which reviewer reads which track. The split overlaps deliberately — two tracks
 * both of them read, one each that only one of them does — so the demo shows routing narrowing a
 * pool without reducing every talk to a single opinion.
 */
const routing = new Map<string, (typeof reviewers)[number][]>([
  [infrastructure.id, [reviewers[0]]],
  [governance.id, reviewers],
  [knowledge.id, reviewers],
  [logistics.id, [reviewers[1]]],
]);

await db.insert(trackReviewer).values(
  [...routing].flatMap(([trackId, covering]) =>
    covering.map((reviewer) => ({ trackId, reviewerUserId: reviewer.id })),
  ),
);

/** Who may read a given talk. Everything the seed assigns below goes through this. */
const routedReviewers = (trackId: string | null) =>
  trackId ? (routing.get(trackId) ?? []) : [];

// ---------------------------------------------------------------------------
// The call for speakers. Four of the six built-ins are placed explicitly so the
// builder shows them in a deliberate order; the custom fields exercise the
// `answers` column and the one-hop `showIf` rule.
// ---------------------------------------------------------------------------

const [cfp] = await db
  .insert(form)
  .values({
    eventId: demo.id,
    kind: 'cfp',
    // `F-4`
    targetType: 'abstract',
    collectsParticipants: true,
    // `F-9`: the internal name is the organizer's filing label and the external title is what a
    // speaker reads. They differ here deliberately — a demo where they are identical proves nothing.
    name: 'CFP 2026 — main call',
    externalTitle: 'Cicero Forum 2026 call for speakers',
    pageHeading: 'Speak in 2026',
    showWelcome: true,
    slug: 'speak',
    status: 'open',
    // `F-7`: four people at the outside, however the roles are shared out.
    maxParticipants: 4,
    introMarkdown:
      'We are looking for practical talks rooted in Roman infrastructure, governance, knowledge, ' +
      'or logistics. Show the work rather than the legend. Sessions are 30 minutes unless you ' +
      'pick a workshop. Submissions close six weeks before the event.',
    closesAt: new Date(day1.getTime() - 21 * DAY),
    maxSubmissionsPerUser: 3,
    notifyEmails: ['organizer@example.com'],
    confirmationSubject: 'We have your talk: {{submission.title}}',
    confirmationBodyMarkdown:
      'Thanks for submitting to Cicero Forum 2026. Your reference is **{{submission.ref}}**.\n\n' +
      'Reviews finish in about three weeks and you will hear from us either way.',
  })
  .returning();

const cfpFields = await db
  .insert(formField)
  .values([
    {
      formId: cfp.id,
      position: 0,
      type: 'short_text' as const,
      key: 'title',
      builtinKey: 'title',
      label: 'Talk title',
      required: true,
      maxLength: 120,
    },
    {
      formId: cfp.id,
      position: 1,
      type: 'markdown' as const,
      key: 'description',
      builtinKey: 'description',
      label: 'Abstract',
      helpText: 'What will someone be able to do after your talk that they could not before?',
      required: true,
      maxLength: 2400,
      charLimitGroup: 'abstract',
    },
    {
      formId: cfp.id,
      position: 2,
      type: 'select' as const,
      key: 'format',
      builtinKey: 'format',
      label: 'Session format',
      required: true,
    },
    {
      formId: cfp.id,
      position: 3,
      type: 'select' as const,
      key: 'track',
      builtinKey: 'track',
      label: 'Track',
      required: true,
    },
    {
      formId: cfp.id,
      position: 4,
      type: 'radio' as const,
      key: 'level',
      builtinKey: 'level',
      label: 'Audience level',
      options: ['Introductory', 'Intermediate', 'Advanced'],
      required: true,
    },
    // `F-5`: the sixth built-in. It was missing here, and `publishForm` requires all six — so this
    // seeded form worked until an organizer opened it in the builder and pressed Publish.
    {
      formId: cfp.id,
      position: 5,
      type: 'multi_select' as const,
      key: 'tags',
      builtinKey: 'tags',
      label: 'Tags',
      helpText: 'Pick the ones a browsing attendee would search for.',
      required: true,
    },
    {
      formId: cfp.id,
      position: 6,
      type: 'long_text' as const,
      key: 'takeaways',
      label: 'Three takeaways',
      helpText: 'One per line.',
      required: true,
      maxLength: 600,
    },
    {
      formId: cfp.id,
      position: 7,
      type: 'checkbox' as const,
      key: 'given_before',
      label: 'I have given this talk before',
    },
    {
      formId: cfp.id,
      position: 8,
      type: 'url' as const,
      key: 'prior_recording',
      label: 'Link to the recording',
      helpText: 'Only if it exists — an unlisted link is fine.',
    },
    {
      formId: cfp.id,
      position: 9,
      type: 'long_text' as const,
      key: 'accommodations',
      label: 'Anything we should know to make speaking here work for you?',
      maxLength: 500,
    },
  ])
  .returning();

/** `prior_recording` appears only for someone who ticked the box directly above it. */
const givenBefore = cfpFields.find((field) => field.key === 'given_before')!;
await db
  .update(formField)
  .set({ showIf: { fieldId: givenBefore.id, op: 'eq', value: 'true' } })
  .where(eq(formField.key, 'prior_recording'));

// `F-6`: the participant question set, with the two optional ones both switched on so the demo
// actually shows a mobile number and a biography being collected at submission time.
await db.insert(formField).values(
  PARTICIPANT_BUILTIN_FIELDS.map((key, index) => ({
    formId: cfp.id,
    position: index,
    entity: 'participant' as const,
    type: PARTICIPANT_BUILTIN_META[key].type,
    key,
    builtinKey: key,
    label: PARTICIPANT_BUILTIN_META[key].label,
    required: key === 'biography' ? true : PARTICIPANT_BUILTIN_META[key].required,
    maxLength: PARTICIPANT_BUILTIN_META[key].maxLength,
    helpText:
      key === 'biography'
        ? 'Two or three sentences. This is what appears beside you in the programme.'
        : key === 'phone'
          ? 'Only used for day-of logistics.'
          : null,
  })),
);

// `F-7`: exactly one speaker, up to two co-speakers, four people overall. Real limits rather than
// the permissive defaults, because a demo of an unenforced limit demonstrates nothing.
await db.insert(formParticipantRole).values([
  { formId: cfp.id, kind: 'speaker' as const, label: 'Speaker', position: 0, minCount: 1, maxCount: 1 },
  {
    formId: cfp.id,
    kind: 'co_speaker' as const,
    label: 'Co-speaker',
    position: 1,
    minCount: 0,
    maxCount: 2,
  },
  {
    formId: cfp.id,
    kind: 'moderator' as const,
    label: 'Moderator',
    position: 2,
    minCount: 0,
    maxCount: 1,
  },
]);

// ---------------------------------------------------------------------------
// Submissions
// ---------------------------------------------------------------------------

type SeedSubmission = {
  email: string;
  title: string;
  abstract: string;
  format: (typeof formats)[number];
  track: (typeof tracks)[number];
  level: string;
  status: 'submitted' | 'under_review' | 'accepted' | 'declined' | 'waitlisted' | 'draft';
  takeaways: string;
  givenBefore?: boolean;
  daysAgo: number;
};

const SUBMISSIONS: SeedSubmission[] = [
  {
    email: 'vitruvius@example.com',
    title: 'Keeping an aqueduct running for a million people',
    abstract:
      'The design and maintenance choices that keep a gravity-fed water network reliable as a ' +
      'city grows, from gradients and settling tanks to inspection access and redundant routes.',
    format: talk,
    track: infrastructure,
    level: 'Intermediate',
    status: 'accepted',
    takeaways:
      'Design every section for inspection\nBuild alternate routes before they are needed\nMaintenance is part of the architecture',
    daysAgo: 26,
  },
  {
    email: 'cornelia@example.com',
    title: 'Building public trust without holding office',
    abstract:
      'A practical account of building legitimacy through education, patronage, and visible public ' +
      'service when formal authority belongs to someone else.',
    format: keynote,
    track: governance,
    level: 'Intermediate',
    status: 'accepted',
    takeaways:
      'Make outcomes visible\nInvest in institutions that outlast you\nInfluence is strongest when it is accountable',
    givenBefore: true,
    daysAgo: 30,
  },
  {
    email: 'varro@example.com',
    title: 'An archive that outlives its builders',
    abstract:
      'A tour of the classification rules, cross-references, and copying practices that let a ' +
      'large public archive remain useful across generations of librarians.',
    format: talk,
    track: knowledge,
    level: 'Intermediate',
    status: 'accepted',
    takeaways:
      'Classify for future readers\nRecord provenance beside the claim\nPlan for formats to change',
    daysAgo: 24,
  },
  {
    email: 'tiro@example.com',
    title: 'Capturing every word without slowing the room',
    abstract:
      'How a shorthand system can preserve fast-moving debate accurately, remain readable to ' +
      'other scribes, and become a durable record after the meeting ends.',
    format: talk,
    track: knowledge,
    level: 'Introductory',
    status: 'accepted',
    takeaways:
      'Optimize for common phrases\nTeach a system, not personal tricks\nReview notes while context is fresh',
    daysAgo: 21,
  },
  {
    email: 'marius@example.com',
    title: 'Moving an army without starving a province',
    abstract:
      'What supply lines, standardized equipment, and regional purchasing teach about scaling a ' +
      'large organization without exhausting the communities around it.',
    format: talk,
    track: logistics,
    level: 'Intermediate',
    status: 'accepted',
    takeaways:
      'Standardize what must move quickly\nBuy locally without stripping local supply\nTreat roads as operational infrastructure',
    daysAgo: 19,
  },
  {
    email: 'servilia@example.com',
    title: 'Planning a city that can survive a siege',
    abstract:
      'A hands-on planning exercise covering water, grain, communications, and political alliances ' +
      'when every normal route into the city may be cut off.',
    format: workshop,
    track: logistics,
    level: 'Advanced',
    status: 'accepted',
    takeaways:
      'Inventory dependencies before the crisis\nCreate more than one route for essentials\nInclude political risk in the plan',
    daysAgo: 28,
  },
  {
    email: 'sulpicia@example.com',
    title: 'Writing for a city, not a court',
    abstract:
      'How to keep a distinctive human voice when patrons, conventions, and public expectations ' +
      'all exert pressure on what can be said and who is expected to say it.',
    format: talk,
    track: knowledge,
    level: 'Intermediate',
    status: 'accepted',
    takeaways:
      'Write for a real reader\nUse convention deliberately\nProtect the voice the record usually omits',
    daysAgo: 22,
  },
  {
    email: 'vitruvius@example.com',
    title: 'Redundancy on the Appian Way',
    abstract:
      'A short, opinionated tour of road, bridge, and staging-post failures that can isolate a ' +
      'network even when every individual section looks sound.',
    format: talk,
    track: infrastructure,
    level: 'Advanced',
    status: 'under_review',
    takeaways:
      'A route is only as strong as its bottleneck\nPlan detours before repairs begin\nInspect bridges, not just roads',
    daysAgo: 12,
  },
  {
    email: 'cornelia@example.com',
    title: 'Decision records for councils that disagree',
    abstract:
      'A workshop on documenting choices, dissent, and follow-up responsibilities without turning ' +
      'the record into propaganda for whichever faction prevailed.',
    format: workshop,
    track: governance,
    level: 'Introductory',
    status: 'under_review',
    takeaways:
      'Record the rejected options\nName who owns the next action\nPreserve principled disagreement',
    daysAgo: 10,
  },
  {
    email: 'tiro@example.com',
    title: 'A practical system for indexing correspondence',
    abstract:
      'How names, dates, subjects, and cross-references turn a lifetime of letters into a collection ' +
      'that another person can navigate without its author standing beside them.',
    format: talk,
    track: knowledge,
    level: 'Intermediate',
    status: 'under_review',
    takeaways:
      'Index for the questions people ask\nKeep original order recoverable\nCross-reference people and events',
    daysAgo: 9,
  },
  {
    email: 'varro@example.com',
    title: 'Ten years cataloguing the known world',
    abstract:
      'A retrospective on classification systems that clarified a sprawling body of knowledge and ' +
      'the elegant schemes that collapsed as soon as real material arrived.',
    format: talk,
    track: knowledge,
    level: 'Introductory',
    status: 'waitlisted',
    takeaways:
      'Categories are arguments\nTest a scheme against awkward cases\nRetire dead classifications clearly',
    daysAgo: 20,
  },
  {
    email: 'marius@example.com',
    title: 'Why we abandoned the giant siege engine',
    abstract:
      'The field numbers behind retiring an impressive machine whose transport, staffing, and ' +
      'repair costs outweighed the narrow situations where it helped.',
    format: talk,
    track: logistics,
    level: 'Intermediate',
    status: 'declined',
    takeaways:
      'Count the transport cost\nMatch equipment to the campaign\nPrestige is not operational value',
    daysAgo: 23,
  },
  {
    email: 'sulpicia@example.com',
    title: 'Notes on patronage and independence',
    abstract: 'Still drafting this one.',
    format: talk,
    track: governance,
    level: 'Introductory',
    status: 'draft',
    takeaways: 'TBD',
    daysAgo: 2,
  },
  {
    email: 'servilia@example.com',
    title: 'The case for boring alliances',
    abstract:
      'An argument for durable agreements with clear mutual obligations instead of dramatic ' +
      'coalitions that collapse when the immediate crisis passes.',
    format: talk,
    track: governance,
    level: 'Introductory',
    status: 'submitted',
    takeaways:
      'Write down mutual obligations\nPrefer repeatable cooperation\nLeave room for peaceful exit',
    daysAgo: 5,
  },
];

const submissions = await db
  .insert(submission)
  .values(
    SUBMISSIONS.map((row, index) => ({
      eventId: demo.id,
      formId: cfp.id,
      ref: index + 1,
      submitterUserId: byEmail.get(row.email)!.id,
      title: row.title,
      descriptionMarkdown: row.abstract,
      formatId: row.format.id,
      trackId: row.track.id,
      level: row.level,
      personaId: personas[index % personas.length].id,
      status: row.status,
      answers: {
        takeaways: row.takeaways,
        given_before: row.givenBefore ?? false,
        ...(row.givenBefore ? { prior_recording: 'https://example.com/recording' } : {}),
      },
      submittedAt: row.status === 'draft' ? null : ago(row.daysAgo),
      decidedAt: ['accepted', 'declined', 'waitlisted'].includes(row.status) ? ago(4) : null,
      decisionNote:
        row.status === 'declined'
          ? 'Strong talk, but it overlaps heavily with an accepted session in the same track.'
          : null,
      createdAt: ago(row.daysAgo),
    })),
  )
  .returning();

await db.update(event).set({ submissionSeq: submissions.length }).where(eq(event.id, demo.id));

await db.insert(submissionTag).values([
  { submissionId: submissions[3].id, tagId: tags[0].id },
  { submissionId: submissions[0].id, tagId: tags[1].id },
  { submissionId: submissions[5].id, tagId: tags[2].id },
  { submissionId: submissions[4].id, tagId: tags[1].id },
]);

// ---------------------------------------------------------------------------
// Speaker profiles. Only submitters get a participant row, which is what the
// portal keys off.
// ---------------------------------------------------------------------------

const PROFILES: Record<string, { title: string; company: string; bio: string; pronouns?: string }> = {
  'vitruvius@example.com': {
    title: 'Architect and engineer',
    company: 'Office of Public Works',
    bio: 'Designs buildings, machines, and water systems. Believes durable infrastructure begins with proportion, inspection, and maintenance.',
  },
  'sulpicia@example.com': {
    title: 'Poet',
    company: 'Independent',
    bio: 'Writes about public life, private obligation, and whose voice survives in the historical record.',
    pronouns: 'she/her',
  },
  'varro@example.com': {
    title: 'Scholar and archivist',
    company: 'Public Libraries',
    bio: 'Catalogues language, agriculture, history, and almost everything else. Has never met a subject that could not use an index.',
  },
  'tiro@example.com': {
    title: 'Secretary and author',
    company: 'House of Cicero',
    bio: 'Developed a shorthand system for fast debate and maintains a large correspondence archive.',
  },
  'cornelia@example.com': {
    title: 'Civic patron and educator',
    company: 'Rome',
    bio: 'Builds durable public influence through education, patronage, and a formidable network of civic relationships.',
    pronouns: 'she/her',
  },
  'marius@example.com': {
    title: 'General and reformer',
    company: 'Roman Army',
    bio: 'Focuses on recruitment, standardized equipment, and the logistics required to keep a large force moving.',
  },
  'servilia@example.com': {
    title: 'Political strategist',
    company: 'Servilian House',
    bio: 'Works across competing factions and plans for the second-order consequences of every alliance.',
    pronouns: 'she/her',
  },
};

const participants = await db
  .insert(participant)
  .values(
    Object.entries(PROFILES).map(([email, profile]) => ({
      eventId: demo.id,
      userId: byEmail.get(email)!.id,
      displayName: byEmail.get(email)!.name,
      pronouns: profile.pronouns ?? null,
      jobTitle: profile.title,
      company: profile.company,
      bioMarkdown: profile.bio,
      timezone: 'America/Los_Angeles',
      links: [{ label: 'Website', url: 'https://example.com' }],
    })),
  )
  .returning();

const participantByUser = new Map(participants.map((row) => [row.userId, row]));

await db.insert(participantRole).values(
  submissions.map((row) => ({
    submissionId: row.id,
    participantId: participantByUser.get(row.submitterUserId)!.id,
    kind: 'speaker' as const,
    isPrimary: true,
  })),
);

/** One co-speaker, because a session with two people is where the interesting bugs live. */
await db.insert(participantRole).values({
  submissionId: submissions[5].id,
  participantId: participantByUser.get(byEmail.get('vitruvius@example.com')!.id)!.id,
  kind: 'co_speaker',
  position: 1,
});

// ---------------------------------------------------------------------------
// Review: one closed round that produced the decisions, one open round that has
// not finished, so the queue has real work waiting in it.
// ---------------------------------------------------------------------------

const rounds = await db
  .insert(reviewRound)
  .values([
    {
      eventId: demo.id,
      name: 'First pass',
      position: 0,
      status: 'closed',
      blindUntilClose: true,
      opensAt: ago(30),
      closesAt: ago(5),
    },
    {
      eventId: demo.id,
      name: 'Second pass',
      position: 1,
      status: 'open',
      blindUntilClose: true,
      opensAt: ago(4),
      closesAt: new Date(now.getTime() + 7 * DAY),
    },
  ])
  .returning();

const criteria = await db
  .insert(scorecardCriterion)
  .values(
    rounds.flatMap((round) => [
      {
        reviewRoundId: round.id,
        label: 'Relevance',
        description: 'Does this matter to the audience we are convening?',
        weight: 2,
        maxScore: 5,
        position: 0,
      },
      {
        reviewRoundId: round.id,
        label: 'Depth',
        description: 'Is there something here you cannot get from a blog post?',
        weight: 2,
        maxScore: 5,
        position: 1,
      },
      {
        reviewRoundId: round.id,
        label: 'Speaker readiness',
        description: 'Evidence they can deliver it well.',
        weight: 1,
        maxScore: 5,
        position: 2,
      },
    ]),
  )
  .returning();

const criteriaByRound = new Map(
  rounds.map((round) => [round.id, criteria.filter((row) => row.reviewRoundId === round.id)]),
);

/**
 * Round one covered everything that had been submitted by then and is fully scored. Who scored
 * what follows the track routing above rather than handing every talk to everyone — the seeded
 * assignments are what auto-assign would have produced.
 */
const firstPassSubjects = submissions.filter((row) => row.status !== 'draft').slice(0, 12);
const firstAssignments = await db
  .insert(reviewAssignment)
  .values(
    firstPassSubjects.flatMap((row) =>
      routedReviewers(row.trackId).map((reviewer) => ({
        reviewRoundId: rounds[0].id,
        submissionId: row.id,
        reviewerUserId: reviewer.id,
        status: 'completed' as const,
        comment:
          'Clear scope and a concrete historical example. Tighten the demonstration before the event.',
        completedAt: ago(6),
      })),
    ),
  )
  .returning();

/**
 * Deterministic pseudo-random scores. A real spread matters — every submission scoring 4 would make
 * the sorted queue meaningless, which is the one thing the review surface is for.
 */
function scoreFor(seed: number, max: number): number {
  return ((seed * 7919) % max) + 1;
}

await db.insert(score).values(
  firstAssignments.flatMap((assignment, index) =>
    criteriaByRound.get(rounds[0].id)!.map((criterion, position) => ({
      reviewAssignmentId: assignment.id,
      criterionId: criterion.id,
      value: scoreFor(index + position * 3 + 1, criterion.maxScore),
    })),
  ),
);

/** Round two is live: the first reviewer routed to a talk is done, anyone after them is not. */
const secondPassSubjects = submissions.filter((row) => row.status === 'under_review');
const secondAssignments = await db
  .insert(reviewAssignment)
  .values(
    secondPassSubjects.flatMap((row) =>
      routedReviewers(row.trackId).map((reviewer, index) =>
        index === 0
          ? {
              reviewRoundId: rounds[1].id,
              submissionId: row.id,
              reviewerUserId: reviewer.id,
              status: 'completed' as const,
              comment: 'Worth a slot if the schedule allows a third knowledge talk.',
              completedAt: ago(1),
            }
          : {
              reviewRoundId: rounds[1].id,
              submissionId: row.id,
              reviewerUserId: reviewer.id,
              status: 'pending' as const,
              comment: null,
              completedAt: null,
            },
      ),
    ),
  )
  .returning();

await db.insert(score).values(
  secondAssignments
    .filter((assignment) => assignment.status === 'completed')
    .flatMap((assignment, index) =>
      criteriaByRound.get(rounds[1].id)!.map((criterion, position) => ({
        reviewAssignmentId: assignment.id,
        criterionId: criterion.id,
        value: scoreFor(index * 2 + position + 3, criterion.maxScore),
      })),
    ),
);

// ---------------------------------------------------------------------------
// Agenda. Five accepted talks are placed; two are deliberately left in the
// unscheduled rail so the drag-and-drop has something to do on first load.
// ---------------------------------------------------------------------------

const accepted = submissions.filter((row) => row.status === 'accepted');
const placements: Array<{
  submission: (typeof submissions)[number];
  room: (typeof rooms)[number];
  start: Date;
  minutes: number;
}> = [
  { submission: accepted[1], room: outerPeristyle, start: at(day1, 9, 30), minutes: 45 },
  { submission: accepted[0], room: basilicaGallery, start: at(day1, 11, 0), minutes: 30 },
  { submission: accepted[2], room: basilicaGallery, start: at(day1, 13, 30), minutes: 30 },
  { submission: accepted[5], room: villaWorkshop, start: at(day1, 14, 30), minutes: 90 },
  { submission: accepted[3], room: outerPeristyle, start: at(day2, 10, 0), minutes: 30 },
];

const scheduled = await db
  .insert(scheduledSession)
  .values(
    placements.map((placement, index) => ({
      eventId: demo.id,
      submissionId: placement.submission.id,
      ref: index + 1,
      title: placement.submission.title,
      descriptionMarkdown: placement.submission.descriptionMarkdown,
      roomId: placement.room.id,
      trackId: placement.submission.trackId,
      formatId: placement.submission.formatId,
      startsAt: placement.start,
      endsAt: new Date(placement.start.getTime() + placement.minutes * 60_000),
      status: 'published' as const,
      icsUid: newIcsUid(),
    })),
  )
  .returning();

await db.update(event).set({ sessionSeq: scheduled.length }).where(eq(event.id, demo.id));

// ---------------------------------------------------------------------------
// Onboarding tasks. Mixed completion is the point — `B-1` is the one dashboard
// the incumbent does not have, and an all-green board would not show it.
// ---------------------------------------------------------------------------

const [slidesRequest, headshotRequest] = await db
  .insert(fileRequest)
  .values([
    {
      eventId: demo.id,
      label: 'Slide deck',
      helpText: 'PDF or Keynote. We need it 48 hours before your session for the A/V check.',
      acceptedTypes: ['application/pdf', 'application/vnd.apple.keynote'],
      maxSizeMb: 60,
    },
    {
      eventId: demo.id,
      label: 'Headshot',
      helpText: 'At least 800px on the short edge.',
      acceptedTypes: ['image/jpeg', 'image/png'],
      maxSizeMb: 10,
    },
  ])
  .returning();

const [portalForm] = await db
  .insert(form)
  .values({
    eventId: demo.id,
    kind: 'portal',
    name: 'Travel and logistics',
    slug: 'travel',
    status: 'open',
    introMarkdown: 'So we can book the right things. Ten minutes, once.',
  })
  .returning();

await db.insert(formField).values([
  {
    formId: portalForm.id,
    position: 0,
    type: 'select' as const,
    key: 'arrival',
    label: 'When do you arrive?',
    options: ['Day before', 'Morning of', 'Already local'],
    required: true,
  },
  {
    formId: portalForm.id,
    position: 1,
    type: 'short_text' as const,
    key: 'dietary',
    label: 'Dietary requirements',
  },
  {
    formId: portalForm.id,
    position: 2,
    type: 'checkbox' as const,
    key: 'hotel',
    label: 'I need a hotel room booked',
  },
]);

const tasks = await db
  .insert(task)
  .values([
    {
      eventId: demo.id,
      name: 'Confirm your session',
      descriptionMarkdown: 'Read the details and confirm you can make the time slot.',
      kind: 'acknowledge' as const,
      audience: 'accepted_participants' as const,
      dueAt: new Date(now.getTime() + 3 * DAY),
      position: 0,
      reminderDaysBefore: [7, 2],
    },
    {
      eventId: demo.id,
      name: 'Upload your headshot',
      descriptionMarkdown: 'Used on the website and in the printed programme.',
      kind: 'file_upload' as const,
      audience: 'accepted_participants' as const,
      fileRequestId: headshotRequest.id,
      dueAt: new Date(now.getTime() + 10 * DAY),
      position: 1,
      reminderDaysBefore: [7, 1],
    },
    {
      eventId: demo.id,
      name: 'Travel and logistics form',
      kind: 'form' as const,
      audience: 'accepted_participants' as const,
      formId: portalForm.id,
      dueAt: new Date(now.getTime() + 14 * DAY),
      position: 2,
      reminderDaysBefore: [5],
    },
    {
      eventId: demo.id,
      name: 'Send us your slides',
      descriptionMarkdown: 'Needed 48 hours ahead for the A/V check.',
      kind: 'file_upload' as const,
      audience: 'accepted_participants' as const,
      fileRequestId: slidesRequest.id,
      dueAt: new Date(day1.getTime() - 2 * DAY),
      position: 3,
      reminderDaysBefore: [14, 3],
    },
    {
      eventId: demo.id,
      name: 'Read the speaker handbook',
      kind: 'link' as const,
      audience: 'all_participants' as const,
      linkUrl: 'https://example.com/handbook',
      required: false,
      position: 4,
    },
  ])
  .returning();

/**
 * `S-16`. The two scopes the audience enum on its own could never express, seeded so `B-1` shows
 * what they do rather than leaving them to be described. A speaker on two accepted talks owes the
 * per-session one twice; a session's whole cast shares a single answer to the per-group one.
 */
const scopedTasks = await db
  .insert(task)
  .values([
    {
      eventId: demo.id,
      name: 'Describe this session for the programme',
      descriptionMarkdown: 'Once for each talk you are on — they are printed separately.',
      kind: 'acknowledge' as const,
      audience: 'accepted_participants' as const,
      scope: 'submission' as const,
      dueAt: new Date(now.getTime() + 7 * DAY),
      position: 5,
      reminderDaysBefore: [3],
    },
    {
      eventId: demo.id,
      name: 'Agree your running order',
      descriptionMarkdown: 'One answer per session. Whoever gets there first answers for the rest.',
      kind: 'acknowledge' as const,
      audience: 'accepted_participants' as const,
      scope: 'group' as const,
      dueAt: new Date(now.getTime() + 12 * DAY),
      position: 6,
    },
  ])
  .returning();

const acceptedParticipants = accepted.map((row) => participantByUser.get(row.submitterUserId)!);
const uniqueAccepted = [...new Map(acceptedParticipants.map((row) => [row.id, row])).values()];

/** Front-loaded completion: the first task is nearly done, the last barely started. */
const STATUSES = ['completed', 'completed', 'in_progress', 'not_started', 'not_started'] as const;

await db.insert(taskAssignment).values(
  tasks.flatMap((row, taskIndex) =>
    uniqueAccepted.map((person, personIndex) => {
      const rotated = STATUSES[(taskIndex + personIndex) % STATUSES.length];
      /**
       * This loop never inserts a `file` row or an `answers` payload, so `file_upload` and `form`
       * tasks have no evidence to back a `completed` status — `listPortalTasks` would immediately
       * read it back down to `in_progress` anyway (see `reconcileStatus` in `lib/services/tasks.ts`),
       * and a seed that ships a row it knows will be reinterpreted on read is worse than one that
       * just tells the truth. `acknowledge` and `link` tasks have no separate evidence — the status
       * flag *is* the evidence — so they still rotate all the way to done.
       */
      const needsEvidence = row.kind === 'file_upload' || row.kind === 'form';
      const status = needsEvidence && rotated === 'completed' ? 'in_progress' : rotated;
      return {
        taskId: row.id,
        participantId: person.id,
        status,
        completedAt: status === 'completed' ? ago(taskIndex + 1) : null,
      };
    }),
  ),
);

/**
 * The scoped tasks are fanned out from the speaking roles rather than from the participant list,
 * because that is the whole difference between them: one row per person-and-session for the first,
 * one row per session for the second, held by that session's primary speaker.
 */
const acceptedRoles = accepted.flatMap((row) => {
  const primary = participantByUser.get(row.submitterUserId)!;
  const co =
    row.id === submissions[5].id
      ? [participantByUser.get(byEmail.get('vitruvius@example.com')!.id)!]
      : [];
  return [{ submissionId: row.id, participant: primary, isPrimary: true }].concat(
    co.map((person) => ({ submissionId: row.id, participant: person, isPrimary: false })),
  );
});

const [perSession, perGroup] = scopedTasks;
await db.insert(taskAssignment).values([
  ...acceptedRoles.map((role, index) => ({
    taskId: perSession.id,
    participantId: role.participant.id,
    submissionId: role.submissionId,
    scope: 'submission' as const,
    status: index % 3 === 0 ? ('completed' as const) : ('not_started' as const),
    completedAt: index % 3 === 0 ? ago(2) : null,
  })),
  ...acceptedRoles
    .filter((role) => role.isPrimary)
    .map((role, index) => ({
      taskId: perGroup.id,
      participantId: role.participant.id,
      submissionId: role.submissionId,
      scope: 'group' as const,
      status: index % 4 === 0 ? ('completed' as const) : ('in_progress' as const),
      completedAt: index % 4 === 0 ? ago(1) : null,
    })),
]);

// ---------------------------------------------------------------------------
// Portal content and comms
// ---------------------------------------------------------------------------

/**
 * `S-11`. A hex, not the colour's name. `vermilion` is not a CSS colour keyword, so the accent this
 * seed had been writing since it was first run resolved to nothing in the portal and was dropped on
 * the way into email — the seeded events looked exactly like the unseeded ones. The panel under
 * Settings → Speaker portal now writes hex and nothing else, and this is `--vermilion-500`.
 */
await db.insert(portalTheme).values({
  eventId: demo.id,
  accentColor: '#B7391F',
  welcomeMarkdown:
    'Welcome to Cicero Forum, and thank you for speaking. Everything we need from you is on this ' +
    'page, in the order we need it.',
  supportEmail: 'speakers@cicero.example',
});

await db.insert(portalPage).values([
  {
    eventId: demo.id,
    slug: 'handbook',
    title: 'Speaker handbook',
    bodyMarkdown:
      '## Getting here\n\nThe event shuttle leaves Santa Monica for the Getty Villa every thirty minutes.\n\n' +
      '## On the day\n\nFind the speaker desk by the Outer Peristyle an hour before your session. ' +
      'We will have your slides loaded and a mic fitted before you go on.\n\n' +
      '## A/V\n\n16:9, HDMI. Bring your own adapter if you present from a laptop.',
    published: true,
    position: 0,
  },
  {
    eventId: demo.id,
    slug: 'expenses',
    title: 'Travel and expenses',
    bodyMarkdown:
      'We cover a return trip and two nights. Submit receipts within thirty days of the event.',
    published: true,
    position: 1,
  },
  {
    eventId: demo.id,
    slug: 'sponsors',
    title: 'Sponsor guidelines',
    bodyMarkdown: 'Draft — not published yet.',
    published: false,
    position: 2,
  },
]);

await ensureDefaultTemplates(demo.id);

await db.insert(emailLog).values([
  {
    eventId: demo.id,
    toEmail: 'cornelia@example.com',
    fromEmail: 'speakers@cicero.example',
    subject: 'Your talk was accepted: Building public trust without holding office',
    bodyHtml:
      '<p>We would love to have you. Your session is on day one at 9:30am in the Outer Peristyle.</p>',
    bodyText:
      'We would love to have you. Your session is on day one at 9:30am in the Outer Peristyle.',
    templateKey: 'submission.accepted',
    status: 'sent',
    sentAt: ago(4),
  },
  {
    eventId: demo.id,
    toEmail: 'marius@example.com',
    fromEmail: 'speakers@cicero.example',
    subject: 'About your submission to Cicero Forum 2026',
    bodyHtml: '<p>We could not fit this one in this year. We hope you will submit again.</p>',
    bodyText: 'We could not fit this one in this year. We hope you will submit again.',
    templateKey: 'submission.declined',
    status: 'sent',
    sentAt: ago(4),
  },
  {
    eventId: demo.id,
    toEmail: 'servilia@example.com',
    fromEmail: 'speakers@cicero.example',
    subject: 'Reminder: send us your slides',
    bodyHtml: '<p>The A/V check is 48 hours before your workshop.</p>',
    bodyText: 'The A/V check is 48 hours before your workshop.',
    templateKey: 'task.reminder',
    status: 'sent',
    sentAt: ago(1),
  },
]);

const firstSettlement = await seedFirstSettlement(db, organizer.id, now);

console.log(
  `Seeded /${SLUG}: ${submissions.length} submissions, ${uniqueAccepted.length} speakers, ` +
    `${scheduled.length} scheduled sessions, ${tasks.length + scopedTasks.length} tasks. ` +
    `Sign in as ${organizer.email} and read the link at /admin/mail.`,
);
console.log(
  `Seeded /${firstSettlement.slug}: ${firstSettlement.submissions} submissions, ` +
    `${firstSettlement.speakers} speakers, ${firstSettlement.scheduledSessions} scheduled sessions, ` +
    `${firstSettlement.tasks} tasks.`,
);
process.exit(0);
