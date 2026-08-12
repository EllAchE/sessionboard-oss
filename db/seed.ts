import { eq, inArray } from 'drizzle-orm';
import { newIcsUid } from '../lib/ics';
import { ensureDefaultTemplates } from '../lib/services/comms';
import { getDb } from './client';
import {
  emailLog,
  event,
  fileRequest,
  form,
  formField,
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
  submission,
  submissionTag,
  tag,
  task,
  taskAssignment,
  track,
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
  { email: 'organizer@example.com', name: 'Robin Alcott' },
  { email: 'reviewer.chen@example.com', name: 'Wei Chen' },
  { email: 'reviewer.okafor@example.com', name: 'Ngozi Okafor' },
  { email: 'sam.rivera@example.com', name: 'Sam Rivera' },
  { email: 'priya.nair@example.com', name: 'Priya Nair' },
  { email: 'jonas.holm@example.com', name: 'Jonas Holm' },
  { email: 'mei.tanaka@example.com', name: 'Mei Tanaka' },
  { email: 'diego.ferrer@example.com', name: 'Diego Ferrer' },
  { email: 'amara.osei@example.com', name: 'Amara Osei' },
  { email: 'tomas.novak@example.com', name: 'Tomas Novak' },
] as const;

const [existing] = await db.select().from(event).where(eq(event.slug, SLUG));
if (existing) await db.delete(event).where(eq(event.id, existing.id));
await db.delete(user).where(
  inArray(
    user.email,
    PEOPLE.map((person) => person.email),
  ),
);

// ---------------------------------------------------------------------------
// People and the event
// ---------------------------------------------------------------------------

const users = await db
  .insert(user)
  .values(PEOPLE.map((person) => ({ email: person.email, name: person.name })))
  .returning();

const byEmail = new Map(users.map((row) => [row.email, row]));
const organizer = byEmail.get('organizer@example.com')!;
const reviewers = [byEmail.get('reviewer.chen@example.com')!, byEmail.get('reviewer.okafor@example.com')!];

const [demo] = await db
  .insert(event)
  .values({
    slug: SLUG,
    name: 'Cicero Demo Conf 2026',
    tagline: 'A two-day, single-city conference for people who build things',
    descriptionMarkdown:
      'A worked example with a call for speakers mid-review, a half-built agenda, and speakers ' +
      'partway through their onboarding tasks. Everything here is editable — break it freely.',
    timezone: 'America/Los_Angeles',
    startsOn: isoDate(day1),
    endsOn: isoDate(day2),
    websiteUrl: 'https://example.com',
    venueName: 'Pier 27 Pavilion',
    venueAddress: 'The Embarcadero, San Francisco, CA',
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
    { eventId: demo.id, name: 'Platform', color: 'lapis', position: 0 },
    { eventId: demo.id, name: 'Applied AI', color: 'vermilion', position: 1 },
    { eventId: demo.id, name: 'Developer Experience', color: 'verdigris', position: 2 },
    { eventId: demo.id, name: 'Operations', color: 'ochre', position: 3 },
  ])
  .returning();

const rooms = await db
  .insert(room)
  .values([
    { eventId: demo.id, name: 'Main Hall', capacity: 600, floor: 'Ground', position: 0 },
    { eventId: demo.id, name: 'Studio A', capacity: 180, floor: 'Ground', position: 1 },
    { eventId: demo.id, name: 'Workshop B', capacity: 60, floor: 'Mezzanine', position: 2 },
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
    { eventId: demo.id, name: 'case study', color: 'lapis' },
    { eventId: demo.id, name: 'needs A/V check', color: 'ochre' },
  ])
  .returning();

const personas = await db
  .insert(persona)
  .values([
    { eventId: demo.id, name: 'Practitioner', description: 'Builds and ships daily', position: 0 },
    { eventId: demo.id, name: 'Team lead', description: 'Decides what the team adopts', position: 1 },
  ])
  .returning();

const [keynote, talk, workshop] = formats;
const [platform, appliedAi, devEx, operations] = tracks;
const [mainHall, studioA, workshopB] = rooms;

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
    name: 'Call for Speakers 2026',
    slug: 'speak',
    status: 'open',
    introMarkdown:
      'We are looking for talks that show the work, not the pitch. Sessions are 30 minutes ' +
      'unless you pick a workshop. Submissions close six weeks before the event.',
    closesAt: new Date(day1.getTime() - 21 * DAY),
    maxSubmissionsPerUser: 3,
    notifyEmails: ['organizer@example.com'],
    confirmationSubject: 'We have your talk: {{submission.title}}',
    confirmationBodyMarkdown:
      'Thanks for submitting to Cicero Demo Conf. Your reference is **{{submission.ref}}**.\n\n' +
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
    {
      formId: cfp.id,
      position: 5,
      type: 'long_text' as const,
      key: 'takeaways',
      label: 'Three takeaways',
      helpText: 'One per line.',
      required: true,
      maxLength: 600,
    },
    {
      formId: cfp.id,
      position: 6,
      type: 'checkbox' as const,
      key: 'given_before',
      label: 'I have given this talk before',
    },
    {
      formId: cfp.id,
      position: 7,
      type: 'url' as const,
      key: 'prior_recording',
      label: 'Link to the recording',
      helpText: 'Only if it exists — an unlisted link is fine.',
    },
    {
      formId: cfp.id,
      position: 8,
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
    email: 'sam.rivera@example.com',
    title: 'Running Postgres for people who would rather not',
    abstract:
      'The five operational decisions that account for most self-hosted Postgres pain, and what ' +
      'to pick for each when nobody on the team wants to be the database person.',
    format: talk,
    track: platform,
    level: 'Intermediate',
    status: 'accepted',
    takeaways: 'Pick a connection pooler early\nBackups you have not restored are not backups\nWhen to stop tuning',
    daysAgo: 26,
  },
  {
    email: 'priya.nair@example.com',
    title: 'What we learned shipping an agent to 40,000 people',
    abstract:
      'A candid account of an agentic feature in production: what the evaluation harness caught, ' +
      'what it did not, and the two incidents that changed how we scope tool access.',
    format: keynote,
    track: appliedAi,
    level: 'Intermediate',
    status: 'accepted',
    takeaways: 'Evaluate on real traffic\nScope tools narrowly\nLog every tool call',
    givenBefore: true,
    daysAgo: 30,
  },
  {
    email: 'jonas.holm@example.com',
    title: 'Your build is slow because of four things',
    abstract:
      'A profiling walkthrough of a monorepo build that went from eleven minutes to ninety ' +
      'seconds, with the measurements that justified each change.',
    format: talk,
    track: devEx,
    level: 'Intermediate',
    status: 'accepted',
    takeaways: 'Measure before changing\nCache keys are the whole game\nDelete more than you add',
    daysAgo: 24,
  },
  {
    email: 'mei.tanaka@example.com',
    title: 'Designing for the keyboard first',
    abstract:
      'Dense, keyboard-driven interfaces are a minority taste that turns out to serve everyone. ' +
      'How to add a command palette without it becoming a junk drawer.',
    format: talk,
    track: devEx,
    level: 'Introductory',
    status: 'accepted',
    takeaways: 'Shortcuts need a home\nDiscoverability beats memorability\nTest with the mouse unplugged',
    daysAgo: 21,
  },
  {
    email: 'diego.ferrer@example.com',
    title: 'Incident review as a design tool',
    abstract:
      'Treating postmortems as a source of product requirements rather than a compliance ritual, ' +
      'with three examples where the fix was a UI change rather than an alert.',
    format: talk,
    track: operations,
    level: 'Intermediate',
    status: 'accepted',
    takeaways: 'Blameless is not toothless\nCount repeat causes\nShip a fix within the week',
    daysAgo: 19,
  },
  {
    email: 'amara.osei@example.com',
    title: 'A workshop on schema migrations that do not lock',
    abstract:
      'Hands-on: take a table with sixty million rows through four migrations without downtime. ' +
      'Bring a laptop with Docker.',
    format: workshop,
    track: platform,
    level: 'Advanced',
    status: 'accepted',
    takeaways: 'Expand then contract\nBackfill in batches\nNever add a NOT NULL default in one step',
    daysAgo: 28,
  },
  {
    email: 'tomas.novak@example.com',
    title: 'Retrieval is not the hard part',
    abstract:
      'Most retrieval systems fail on chunking and evaluation, not on the vector store. What to ' +
      'measure, and the three chunking strategies worth trying first.',
    format: talk,
    track: appliedAi,
    level: 'Intermediate',
    status: 'accepted',
    takeaways: 'Evaluate retrieval separately\nChunk on structure\nHybrid search usually wins',
    daysAgo: 22,
  },
  {
    email: 'sam.rivera@example.com',
    title: 'Read replicas will not save you',
    abstract: 'A short, opinionated tour of the read-replica failure modes that surprise teams.',
    format: talk,
    track: platform,
    level: 'Advanced',
    status: 'under_review',
    takeaways: 'Replication lag is user-visible\nRoute reads deliberately\nMonitor lag, not CPU',
    daysAgo: 12,
  },
  {
    email: 'priya.nair@example.com',
    title: 'Evaluation harnesses for teams without ML engineers',
    abstract: 'Building a useful eval suite with the people you already have.',
    format: workshop,
    track: appliedAi,
    level: 'Introductory',
    status: 'under_review',
    takeaways: 'Start with twenty examples\nDisagreement is signal\nVersion your prompts',
    daysAgo: 10,
  },
  {
    email: 'mei.tanaka@example.com',
    title: 'Type systems as documentation',
    abstract: 'Where types earn their keep as a communication tool rather than a correctness one.',
    format: talk,
    track: devEx,
    level: 'Intermediate',
    status: 'under_review',
    takeaways: 'Name your types after the domain\nParse, do not validate\nTypes rot without tests',
    daysAgo: 9,
  },
  {
    email: 'jonas.holm@example.com',
    title: 'Ten years of yak shaving',
    abstract: 'A retrospective on tooling investments that paid off and the ones that did not.',
    format: talk,
    track: devEx,
    level: 'Introductory',
    status: 'waitlisted',
    takeaways: 'Tooling compounds\nMeasure adoption\nRetire things loudly',
    daysAgo: 20,
  },
  {
    email: 'diego.ferrer@example.com',
    title: 'Why we moved back off Kubernetes',
    abstract: 'A migration away from an orchestrator, the numbers behind it, and what we gave up.',
    format: talk,
    track: operations,
    level: 'Intermediate',
    status: 'declined',
    takeaways: 'Match the tool to team size\nCount the operator burden\nReversibility is a feature',
    daysAgo: 23,
  },
  {
    email: 'tomas.novak@example.com',
    title: 'Notes on prompt versioning',
    abstract: 'Still drafting this one.',
    format: talk,
    track: appliedAi,
    level: 'Introductory',
    status: 'draft',
    takeaways: 'TBD',
    daysAgo: 2,
  },
  {
    email: 'amara.osei@example.com',
    title: 'The case for boring infrastructure',
    abstract: 'An argument for choosing the least interesting option that meets the requirement.',
    format: talk,
    track: platform,
    level: 'Introductory',
    status: 'submitted',
    takeaways: 'Novelty has a carrying cost\nCount the on-call hours\nBoring scales',
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
  'sam.rivera@example.com': {
    title: 'Staff Engineer',
    company: 'Meridian Data',
    bio: 'Spends most days keeping other people out of the database. Previously ran platform at two startups that no longer exist.',
  },
  'priya.nair@example.com': {
    title: 'Head of Product Engineering',
    company: 'Halcyon',
    bio: 'Builds assistive tooling for support teams. Interested in the boundary between evaluation and product research.',
    pronouns: 'she/her',
  },
  'jonas.holm@example.com': {
    title: 'Build Systems Engineer',
    company: 'Nordwerk',
    bio: 'Has strong opinions about caches and will share them unprompted.',
  },
  'mei.tanaka@example.com': {
    title: 'Design Engineer',
    company: 'Independent',
    bio: 'Works on dense interfaces for people who use one tool all day.',
    pronouns: 'she/her',
  },
  'diego.ferrer@example.com': {
    title: 'SRE Lead',
    company: 'Cobalt Logistics',
    bio: 'On call more than he would like. Writes the postmortems nobody else volunteers for.',
  },
  'amara.osei@example.com': {
    title: 'Principal Engineer',
    company: 'Ostrea',
    bio: 'Migrations, mostly. Has moved more rows than she cares to total up.',
    pronouns: 'she/her',
  },
  'tomas.novak@example.com': {
    title: 'ML Engineer',
    company: 'Brnolab',
    bio: 'Retrieval systems and the evaluation of same.',
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
  participantId: participantByUser.get(byEmail.get('sam.rivera@example.com')!.id)!.id,
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

/** Round one covered everything that had been submitted by then and is fully scored. */
const firstPassSubjects = submissions.filter((row) => row.status !== 'draft').slice(0, 12);
const firstAssignments = await db
  .insert(reviewAssignment)
  .values(
    firstPassSubjects.flatMap((row) =>
      reviewers.map((reviewer) => ({
        reviewRoundId: rounds[0].id,
        submissionId: row.id,
        reviewerUserId: reviewer.id,
        status: 'completed' as const,
        comment:
          'Clear scope and a concrete example. Would want the demo tightened before the day.',
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

/** Round two is live: one reviewer is done, the other has not started. */
const secondPassSubjects = submissions.filter((row) => row.status === 'under_review');
const secondAssignments = await db
  .insert(reviewAssignment)
  .values(
    secondPassSubjects.flatMap((row) => [
      {
        reviewRoundId: rounds[1].id,
        submissionId: row.id,
        reviewerUserId: reviewers[0].id,
        status: 'completed' as const,
        comment: 'Worth a slot if the schedule allows a third devex talk.',
        completedAt: ago(1),
      },
      {
        reviewRoundId: rounds[1].id,
        submissionId: row.id,
        reviewerUserId: reviewers[1].id,
        status: 'pending' as const,
      },
    ]),
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
  { submission: accepted[1], room: mainHall, start: at(day1, 9, 30), minutes: 45 },
  { submission: accepted[0], room: studioA, start: at(day1, 11, 0), minutes: 30 },
  { submission: accepted[2], room: studioA, start: at(day1, 13, 30), minutes: 30 },
  { submission: accepted[5], room: workshopB, start: at(day1, 14, 30), minutes: 90 },
  { submission: accepted[3], room: mainHall, start: at(day2, 10, 0), minutes: 30 },
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

const acceptedParticipants = accepted.map((row) => participantByUser.get(row.submitterUserId)!);
const uniqueAccepted = [...new Map(acceptedParticipants.map((row) => [row.id, row])).values()];

/** Front-loaded completion: the first task is nearly done, the last barely started. */
const STATUSES = ['completed', 'completed', 'in_progress', 'not_started', 'not_started'] as const;

await db.insert(taskAssignment).values(
  tasks.flatMap((row, taskIndex) =>
    uniqueAccepted.map((person, personIndex) => {
      const status = STATUSES[(taskIndex + personIndex) % STATUSES.length];
      return {
        taskId: row.id,
        participantId: person.id,
        status,
        completedAt: status === 'completed' ? ago(taskIndex + 1) : null,
      };
    }),
  ),
);

// ---------------------------------------------------------------------------
// Portal content and comms
// ---------------------------------------------------------------------------

await db.insert(portalTheme).values({
  eventId: demo.id,
  accentColor: 'vermilion',
  welcomeMarkdown:
    'Welcome, and thank you for speaking. Everything we need from you is on this page, in the ' +
    'order we need it.',
  supportEmail: 'speakers@example.com',
});

await db.insert(portalPage).values([
  {
    eventId: demo.id,
    slug: 'handbook',
    title: 'Speaker handbook',
    bodyMarkdown:
      '## Getting here\n\nThe venue is a ten minute walk from the Embarcadero station.\n\n' +
      '## On the day\n\nFind the speaker desk in the lobby an hour before your session. We will ' +
      'have your slides loaded and a mic fitted before you go on.\n\n' +
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
    toEmail: 'priya.nair@example.com',
    fromEmail: 'speakers@example.com',
    subject: 'Your talk was accepted: What we learned shipping an agent to 40,000 people',
    bodyHtml: '<p>We would love to have you. Your session is on day one at 9:30am.</p>',
    bodyText: 'We would love to have you. Your session is on day one at 9:30am.',
    templateKey: 'submission.accepted',
    status: 'sent',
    sentAt: ago(4),
  },
  {
    eventId: demo.id,
    toEmail: 'diego.ferrer@example.com',
    fromEmail: 'speakers@example.com',
    subject: 'About your submission to Cicero Demo Conf 2026',
    bodyHtml: '<p>We could not fit this one in this year. We hope you will submit again.</p>',
    bodyText: 'We could not fit this one in this year. We hope you will submit again.',
    templateKey: 'submission.declined',
    status: 'sent',
    sentAt: ago(4),
  },
  {
    eventId: demo.id,
    toEmail: 'amara.osei@example.com',
    fromEmail: 'speakers@example.com',
    subject: 'Reminder: send us your slides',
    bodyHtml: '<p>The A/V check is 48 hours before your workshop.</p>',
    bodyText: 'The A/V check is 48 hours before your workshop.',
    templateKey: 'task.reminder',
    status: 'sent',
    sentAt: ago(1),
  },
]);

console.log(
  `Seeded /${SLUG}: ${submissions.length} submissions, ${uniqueAccepted.length} speakers, ` +
    `${scheduled.length} scheduled sessions, ${tasks.length} tasks. ` +
    `Sign in as ${organizer.email} and read the link at /admin/mail.`,
);
process.exit(0);
