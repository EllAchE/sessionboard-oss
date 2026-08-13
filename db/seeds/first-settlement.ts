import { eq, inArray } from 'drizzle-orm';
import { requireEventWindow } from '../../lib/event-dates';
import { newIcsUid } from '../../lib/ics';
import { ensureDefaultTemplates } from '../../lib/services/comms';
import { getStorage, storageKey } from '../../lib/storage';
import type { Database } from '../client';
import {
  emailLog,
  event,
  file,
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
} from '../schema';
import {
  createRomanProfileArtAssignments,
  ROMAN_PROFILE_ART,
} from './roman-profile-art';

const SLUG = 'first-settlement';
const DAY = 86_400_000;

const SENATE_PEOPLE = [
  { email: 'octavian@first-settlement.example', name: 'Gaius Octavius' },
  {
    email: 'agrippa@first-settlement.example',
    name: 'Marcus Vipsanius Agrippa',
  },
  {
    email: 'plancus@first-settlement.example',
    name: 'Lucius Munatius Plancus',
  },
  {
    email: 'messalla@first-settlement.example',
    name: 'Marcus Valerius Messalla Corvinus',
  },
  {
    email: 'maecenas@first-settlement.example',
    name: 'Gaius Cilnius Maecenas',
  },
  { email: 'taurus@first-settlement.example', name: 'Titus Statilius Taurus' },
  {
    email: 'calvisius@first-settlement.example',
    name: 'Gaius Calvisius Sabinus',
  },
  { email: 'arruntius@first-settlement.example', name: 'Lucius Arruntius' },
] as const;

const REVIEWER_EMAILS = ['calvisius@first-settlement.example', 'arruntius@first-settlement.example'] as const;

const SPEAKER_EMAILS = ROMAN_PROFILE_ART.map((entry) => entry.email);

async function inBatches<T>(
  items: readonly T[],
  size: number,
  operation: (item: T) => Promise<void>,
): Promise<void> {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(items.slice(start, start + size).map(operation));
  }
}

type SenateUser = { id: string; email: string; name: string | null };

export type FirstSettlementSeedStore = {
  findTargetEvent: () => Promise<{ id: string } | undefined>;
  deleteTargetEvent: (eventId: string) => Promise<void>;
  findSenatePeople: (emails: readonly string[]) => Promise<SenateUser[]>;
  createSenatePeople: (people: readonly { email: string; name: string }[]) => Promise<SenateUser[]>;
};

export async function prepareFirstSettlementSeed(
  store: FirstSettlementSeedStore,
): Promise<Map<string, SenateUser>> {
  const existingEvent = await store.findTargetEvent();
  if (existingEvent) await store.deleteTargetEvent(existingEvent.id);

  const existingPeople = await store.findSenatePeople(SENATE_PEOPLE.map((person) => person.email));
  const existingEmails = new Set(existingPeople.map((person) => person.email));
  const missingPeople = SENATE_PEOPLE.filter((person) => !existingEmails.has(person.email));
  const createdPeople = missingPeople.length > 0 ? await store.createSenatePeople(missingPeople) : [];

  return new Map([...existingPeople, ...createdPeople].map((person) => [person.email, person]));
}

async function removeEventFiles(db: Database, eventId: string): Promise<void> {
  const records = await db.select({ storageKey: file.storageKey }).from(file).where(eq(file.eventId, eventId));
  const storage = getStorage();
  await inBatches(records, 24, (record) => storage.delete(record.storageKey));
}

async function seedProfileArt(
  db: Database,
  eventId: string,
  uploadedByUserId: string,
): Promise<Map<(typeof SPEAKER_EMAILS)[number], string>> {
  const storage = getStorage();
  const artwork = createRomanProfileArtAssignments(SPEAKER_EMAILS);
  const uploads = artwork.map((assignment) => ({
    assignment,
    row: {
      eventId,
      storageKey: storageKey(eventId, assignment.filename),
      filename: assignment.filename,
      contentType: assignment.contentType,
      sizeBytes: assignment.bytes.byteLength,
      uploadedByUserId,
    },
  }));

  await inBatches(uploads, 24, ({ assignment, row }) =>
    storage.put(row.storageKey, assignment.bytes, assignment.contentType),
  );

  const records = await db
    .insert(file)
    .values(uploads.map(({ row }) => row))
    .returning({ id: file.id, storageKey: file.storageKey });
  const idByStorageKey = new Map(records.map((record) => [record.storageKey, record.id]));
  return new Map(
    uploads.map(({ assignment, row }) => {
      const fileId = idByStorageKey.get(row.storageKey);
      if (!fileId) throw new Error(`Profile art insert omitted ${row.storageKey}`);
      return [assignment.speakerKey, fileId] as const;
    }),
  );
}

function currentOrNextAnniversary(now: Date): Date {
  const thisYear = new Date(Date.UTC(now.getUTCFullYear(), 0, 13));
  const thisYearMeetingEnds = new Date(Date.UTC(now.getUTCFullYear(), 0, 17));
  return thisYearMeetingEnds.getTime() > now.getTime() ? thisYear : new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 13));
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function atRome(day: Date, hour: number, minute = 0): Date {
  return new Date(day.getTime() + (hour - 1) * 3_600_000 + minute * 60_000);
}

export async function seedFirstSettlement(
  db: Database,
  organizerUserId: string,
  now: Date,
): Promise<{
  slug: string;
  submissions: number;
  speakers: number;
  scheduledSessions: number;
  tasks: number;
}> {
  const userByEmail = await prepareFirstSettlementSeed({
    findTargetEvent: async () => {
      const [existingEvent] = await db.select({ id: event.id }).from(event).where(eq(event.slug, SLUG));
      return existingEvent;
    },
    deleteTargetEvent: async (eventId) => {
      await removeEventFiles(db, eventId);
      await db.delete(event).where(eq(event.id, eventId));
    },
    findSenatePeople: (emails) =>
      db
        .select({ id: user.id, email: user.email, name: user.name })
        .from(user)
        .where(inArray(user.email, [...emails])),
    createSenatePeople: (people) =>
      db
        .insert(user)
        .values([...people])
        .returning({ id: user.id, email: user.email, name: user.name }),
  });
  const reviewers = REVIEWER_EMAILS.map((email) => userByEmail.get(email)!);

  const day1 = currentOrNextAnniversary(now);
  const day2 = new Date(day1.getTime() + DAY);
  const day4 = new Date(day1.getTime() + 3 * DAY);
  const ago = (days: number) => new Date(now.getTime() - days * DAY);

  /** `E-1`: the Senate sits from the first morning to the close of the fourth day, Rome time. */
  const senateWindow = requireEventWindow(
    'Europe/Rome',
    `${isoDate(day1)}T09:00`,
    `${isoDate(day4)}T17:00`,
  );

  const [senate] = await db
    .insert(event)
    .values({
      slug: SLUG,
      name: 'The First Settlement',
      tagline: 'Four days that recast a republic as an empire',
      descriptionMarkdown:
        'A historically inspired reenactment of the Roman Senate sessions of 13–16 January ' +
        '27 BCE, when Octavian returned extraordinary powers, accepted a new provincial command, ' +
        'and received the name Augustus. The programme imagines the motions, arguments, and ' +
        'unresolved questions as a living conference rather than a literal transcript.',
      eventType: 'Symposium',
      theme:
        'Powers returned and powers granted — what a republic keeps when it hands command to one ' +
        'man for the sake of peace.',
      timezone: senateWindow.timezone,
      startsAt: senateWindow.startsAt,
      endsAt: senateWindow.endsAt,
      startsOn: senateWindow.startsOn,
      endsOn: senateWindow.endsOn,
      websiteUrl: 'https://example.com/first-settlement',
      venueName: 'Curia Julia',
      venueAddress: 'Forum Romanum, Rome',
      ownerUserId: organizerUserId,
    })
    .returning();

  await db.insert(membership).values([
    { userId: organizerUserId, eventId: senate.id, role: 'organizer' as const },
    ...reviewers.map((reviewer) => ({
      userId: reviewer.id,
      eventId: senate.id,
      role: 'reviewer' as const,
    })),
    ...SPEAKER_EMAILS.map((email) => ({
      userId: userByEmail.get(email)!.id,
      eventId: senate.id,
      role: 'speaker' as const,
    })),
  ]);

  const tracks = await db
    .insert(track)
    .values([
      {
        eventId: senate.id,
        name: 'Constitution & Office',
        color: 'vermilion',
        position: 0,
      },
      {
        eventId: senate.id,
        name: 'Provinces & Frontiers',
        color: 'lapis',
        position: 1,
      },
      {
        eventId: senate.id,
        name: 'Peace & Public Works',
        color: 'verdigris',
        position: 2,
      },
      {
        eventId: senate.id,
        name: 'Memory & Legitimacy',
        color: 'ochre',
        position: 3,
      },
    ])
    .returning();

  const rooms = await db
    .insert(room)
    .values([
      {
        eventId: senate.id,
        name: 'Curia Julia',
        capacity: 300,
        floor: 'Forum',
        position: 0,
      },
      {
        eventId: senate.id,
        name: 'Portico of Octavia',
        capacity: 180,
        floor: 'Campus Martius',
        position: 1,
      },
      {
        eventId: senate.id,
        name: 'Temple of Apollo',
        capacity: 120,
        floor: 'Palatine',
        position: 2,
      },
    ])
    .returning();

  const formats = await db
    .insert(sessionFormat)
    .values([
      { eventId: senate.id, name: 'Oratio', durationMinutes: 45, position: 0 },
      { eventId: senate.id, name: 'Relatio', durationMinutes: 30, position: 1 },
      {
        eventId: senate.id,
        name: 'Consilium',
        durationMinutes: 60,
        position: 2,
      },
    ])
    .returning();

  const tags = await db
    .insert(tag)
    .values([
      {
        eventId: senate.id,
        name: 'constitutional question',
        color: 'vermilion',
      },
      { eventId: senate.id, name: 'requires division', color: 'ochre' },
      { eventId: senate.id, name: 'frontier command', color: 'lapis' },
    ])
    .returning();

  const personas = await db
    .insert(persona)
    .values([
      {
        eventId: senate.id,
        name: 'Senator',
        description: 'Debates and votes on the settlement',
        position: 0,
      },
      {
        eventId: senate.id,
        name: 'Magistrate',
        description: 'Must administer the restored order',
        position: 1,
      },
      {
        eventId: senate.id,
        name: 'Provincial governor',
        description: 'Carries the settlement beyond Rome',
        position: 2,
      },
    ])
    .returning();

  const [oratio, relatio, consilium] = formats;
  const [constitution, provinces, publicWorks, legitimacy] = tracks;
  const [curia, portico, temple] = rooms;

  const [callForMotions] = await db
    .insert(form)
    .values({
      eventId: senate.id,
      kind: 'cfp',
      name: 'Order of Debate',
      slug: 'motions',
      status: 'open',
      introMarkdown:
        'Submit a motion, oration, or counsel for the January settlement. State the power at ' +
        'issue, the public benefit, and the limit that keeps the proposal compatible with a ' +
        'restored republic.',
      closesAt: new Date(day1.getTime() - 30 * DAY),
      maxSubmissionsPerUser: 3,
      notifyEmails: ['organizer@example.com'],
      confirmationSubject: 'Motion received: {{submission.title}}',
      confirmationBodyMarkdown:
        'Your motion has been entered into the order of debate as **{{submission.ref}}**. ' +
        'The consular committee will return its recommendation before the Senate convenes.',
    })
    .returning();

  await db.insert(formField).values([
    {
      formId: callForMotions.id,
      position: 0,
      type: 'short_text' as const,
      key: 'title',
      builtinKey: 'title',
      label: 'Title of the motion',
      required: true,
      maxLength: 140,
    },
    {
      formId: callForMotions.id,
      position: 1,
      type: 'markdown' as const,
      key: 'description',
      builtinKey: 'description',
      label: 'Argument before the Senate',
      required: true,
      maxLength: 2400,
    },
    {
      formId: callForMotions.id,
      position: 2,
      type: 'select' as const,
      key: 'format',
      builtinKey: 'format',
      label: 'Form of address',
      required: true,
    },
    {
      formId: callForMotions.id,
      position: 3,
      type: 'select' as const,
      key: 'track',
      builtinKey: 'track',
      label: 'Order of business',
      required: true,
    },
    {
      formId: callForMotions.id,
      position: 4,
      type: 'radio' as const,
      key: 'level',
      builtinKey: 'level',
      label: 'Scope of the motion',
      options: ['Advisory', 'Senatorial decree', 'Constitutional settlement'],
      required: true,
    },
    {
      formId: callForMotions.id,
      position: 5,
      type: 'long_text' as const,
      key: 'guardrails',
      label: 'Limits and guardrails',
      helpText: 'Name the term, review, or precedent that constrains the proposed power.',
      required: true,
      maxLength: 600,
    },
    {
      formId: callForMotions.id,
      position: 6,
      type: 'checkbox' as const,
      key: 'requires_division',
      label: 'This motion requires a recorded division',
    },
  ]);

  type SeedMotion = {
    email: (typeof SPEAKER_EMAILS)[number];
    title: string;
    argument: string;
    format: (typeof formats)[number];
    track: (typeof tracks)[number];
    level: string;
    status: 'submitted' | 'under_review' | 'accepted' | 'declined' | 'waitlisted' | 'draft';
    guardrails: string;
    requiresDivision?: boolean;
    daysAgo: number;
  };

  const motions: SeedMotion[] = [
    {
      email: 'octavian@first-settlement.example',
      title: 'On Returning the Republic to Senate and People',
      argument:
        'A statement surrendering the emergency powers accumulated during civil war and asking ' +
        'the Senate to restore ordinary government without reopening the conflict that ended at Actium.',
      format: oratio,
      track: constitution,
      level: 'Constitutional settlement',
      status: 'accepted',
      guardrails: 'Every continuing command must return to a named office, province, and term.',
      requiresDivision: true,
      daysAgo: 45,
    },
    {
      email: 'agrippa@first-settlement.example',
      title: 'A Ten-Year Command for the Unsettled Provinces',
      argument:
        'Place the provinces requiring standing armies under one temporary command while the ' +
        'Senate resumes responsibility for peaceful provinces and their civil administration.',
      format: relatio,
      track: provinces,
      level: 'Senatorial decree',
      status: 'accepted',
      guardrails: 'A ten-year term, a stated list of provinces, and a new vote before renewal.',
      requiresDivision: true,
      daysAgo: 41,
    },
    {
      email: 'plancus@first-settlement.example',
      title: 'Augustus: A Name Equal to the Settlement',
      argument:
        'Honor the architect of the peace without reviving the royal language Rome rejected. ' +
        'The title should mark civic authority and religious dignity rather than kingship.',
      format: oratio,
      track: legitimacy,
      level: 'Senatorial decree',
      status: 'accepted',
      guardrails: 'The honor is a name, not a magistracy, hereditary office, or independent command.',
      requiresDivision: true,
      daysAgo: 38,
    },
    {
      email: 'messalla@first-settlement.example',
      title: 'First Among Senators, Not Master of Them',
      argument:
        'Define precedence in the Senate so exceptional auctoritas can coexist with debate, ' +
        'magistracies, and the visible forms of republican government.',
      format: consilium,
      track: constitution,
      level: 'Constitutional settlement',
      status: 'accepted',
      guardrails: 'Precedence in speaking must not become an exclusive power to decide.',
      daysAgo: 34,
    },
    {
      email: 'maecenas@first-settlement.example',
      title: 'Peace as a Public Programme',
      argument:
        'Turn the end of civil war into visible civic confidence through restored temples, ' +
        'public works, patronage, and a common language of renewal.',
      format: relatio,
      track: publicWorks,
      level: 'Advisory',
      status: 'accepted',
      guardrails: 'Public memory must belong to Rome, not only to the household that funds it.',
      daysAgo: 31,
    },
    {
      email: 'taurus@first-settlement.example',
      title: 'Frontiers After Actium',
      argument:
        'Set priorities for demobilization, provincial security, and the commands that remain ' +
        'necessary after the last civil-war fleet has surrendered.',
      format: relatio,
      track: provinces,
      level: 'Senatorial decree',
      status: 'accepted',
      guardrails: 'Military commands follow provincial assignments rather than personal loyalty.',
      daysAgo: 29,
    },
    {
      email: 'agrippa@first-settlement.example',
      title: 'A Census Worth Trusting',
      argument:
        'A practical proposal for restoring the census, clarifying the Senate roll, and making ' +
        'the obligations of citizenship legible after a generation of exceptional rule.',
      format: consilium,
      track: constitution,
      level: 'Senatorial decree',
      status: 'under_review',
      guardrails: 'Publish the criteria before reviewing any individual name.',
      daysAgo: 16,
    },
    {
      email: 'messalla@first-settlement.example',
      title: 'Who Guards the New Peace?',
      argument:
        'Examine whether Rome can protect its magistrates and public spaces without making a ' +
        'permanent military camp part of civic life.',
      format: consilium,
      track: provinces,
      level: 'Advisory',
      status: 'under_review',
      guardrails: 'Any guard remains outside the pomerium and answerable to a civil magistrate.',
      daysAgo: 13,
    },
    {
      email: 'plancus@first-settlement.example',
      title: 'Romulus or Augustus?',
      argument:
        'Compare the names available to the new settlement and the constitutional story each ' +
        'would ask the Roman people to accept.',
      format: relatio,
      track: legitimacy,
      level: 'Advisory',
      status: 'waitlisted',
      guardrails: 'Reject any title that implies kingship or refounds Rome around one living man.',
      daysAgo: 24,
    },
    {
      email: 'taurus@first-settlement.example',
      title: 'A Permanent Fleet for a Peaceful Sea',
      argument:
        'Keep a standing maritime force after Actium to suppress piracy and secure the grain ' +
        'routes without recreating a war fleet searching for a rival.',
      format: relatio,
      track: provinces,
      level: 'Senatorial decree',
      status: 'declined',
      guardrails: 'Annual accounts and divided commands at Misenum and Ravenna.',
      daysAgo: 27,
    },
    {
      email: 'maecenas@first-settlement.example',
      title: 'The Poets’ Place in a Restored Republic',
      argument: 'Notes toward a session on patronage, memory, and the stories a durable peace requires.',
      format: consilium,
      track: legitimacy,
      level: 'Advisory',
      status: 'draft',
      guardrails: 'TBD',
      daysAgo: 3,
    },
  ];

  const submissions = await db
    .insert(submission)
    .values(
      motions.map((motion, index) => ({
        eventId: senate.id,
        formId: callForMotions.id,
        ref: index + 1,
        submitterUserId: userByEmail.get(motion.email)!.id,
        title: motion.title,
        descriptionMarkdown: motion.argument,
        formatId: motion.format.id,
        trackId: motion.track.id,
        level: motion.level,
        personaId: personas[index % personas.length].id,
        status: motion.status,
        answers: {
          guardrails: motion.guardrails,
          requires_division: motion.requiresDivision ?? false,
        },
        submittedAt: motion.status === 'draft' ? null : ago(motion.daysAgo),
        decidedAt: ['accepted', 'declined', 'waitlisted'].includes(motion.status) ? ago(6) : null,
        decisionNote:
          motion.status === 'declined'
            ? 'Important operational question, but the provincial-command debate already covers this ground.'
            : null,
        createdAt: ago(motion.daysAgo),
      })),
    )
    .returning();

  await db.update(event).set({ submissionSeq: submissions.length }).where(eq(event.id, senate.id));

  await db.insert(submissionTag).values([
    { submissionId: submissions[0].id, tagId: tags[0].id },
    { submissionId: submissions[1].id, tagId: tags[2].id },
    { submissionId: submissions[2].id, tagId: tags[1].id },
    { submissionId: submissions[7].id, tagId: tags[0].id },
  ]);

  const profileArt = await seedProfileArt(db, senate.id, organizerUserId);

  const profiles: Record<(typeof SPEAKER_EMAILS)[number], { title: string; house: string; bio: string }> = {
    'octavian@first-settlement.example': {
      title: 'Consul for the seventh time',
      house: 'House of Caesar',
      bio: 'Victor at Actium and principal author of the settlement. Presents himself here as the magistrate returning extraordinary powers to the state.',
    },
    'agrippa@first-settlement.example': {
      title: 'Consul and commander',
      house: 'Vipsanii',
      bio: 'Commander, administrator, and Octavian’s closest collaborator. Brings the practical questions of provinces, fleets, and public works.',
    },
    'plancus@first-settlement.example': {
      title: 'Consular senator',
      house: 'Munatii Planci',
      bio: 'Senior statesman traditionally credited with proposing the honorific Augustus during the January settlement.',
    },
    'messalla@first-settlement.example': {
      title: 'Senator and orator',
      house: 'Valerii Messallae',
      bio: 'Former republican commander reconciled to the new order, with a practiced eye for the language that separates precedence from monarchy.',
    },
    'maecenas@first-settlement.example': {
      title: 'Adviser and patron',
      house: 'Cilnii',
      bio: 'An equestrian guest among senators, concerned with diplomacy, civic culture, and how political settlements become public memory.',
    },
    'taurus@first-settlement.example': {
      title: 'Commander and senator',
      house: 'Statilii Tauri',
      bio: 'Veteran commander of the civil wars, focused on the military institutions that must outlast them without becoming a new emergency.',
    },
  };

  const participants = await db
    .insert(participant)
    .values(
      SPEAKER_EMAILS.map((email) => ({
        eventId: senate.id,
        userId: userByEmail.get(email)!.id,
        displayName: userByEmail.get(email)!.name ?? SENATE_PEOPLE.find((person) => person.email === email)!.name,
        jobTitle: profiles[email].title,
        company: profiles[email].house,
        bioMarkdown: profiles[email].bio,
        headshotFileId: profileArt.get(email),
        timezone: 'Europe/Rome',
        workflowStatus: 'confirmed' as const,
        links: [
          {
            label: 'Historical dossier',
            url: 'https://example.com/first-settlement/speakers',
          },
        ],
      })),
    )
    .returning();

  const participantByUser = new Map(participants.map((person) => [person.userId, person]));
  await db.insert(participantRole).values(
    submissions.map((motion) => ({
      submissionId: motion.id,
      participantId: participantByUser.get(motion.submitterUserId)!.id,
      kind: 'speaker' as const,
      isPrimary: true,
    })),
  );

  await db.insert(participantRole).values({
    submissionId: submissions[1].id,
    participantId: participantByUser.get(userByEmail.get('taurus@first-settlement.example')!.id)!.id,
    kind: 'co_speaker',
    position: 1,
  });

  const [round] = await db
    .insert(reviewRound)
    .values({
      eventId: senate.id,
      name: 'Consular committee',
      position: 0,
      status: 'open',
      blindUntilClose: true,
      anonymized: false,
      opensAt: ago(8),
      closesAt: new Date(now.getTime() + 8 * DAY),
    })
    .returning();

  const criteria = await db
    .insert(scorecardCriterion)
    .values([
      {
        reviewRoundId: round.id,
        label: 'Public necessity',
        description: 'Does the settlement need this motion now?',
        weight: 2,
        maxScore: 5,
        position: 0,
      },
      {
        reviewRoundId: round.id,
        label: 'Republican restraint',
        description: 'Are the limits as concrete as the power being proposed?',
        weight: 2,
        maxScore: 5,
        position: 1,
      },
      {
        reviewRoundId: round.id,
        label: 'Durability',
        description: 'Can the arrangement survive the people in this room?',
        weight: 1,
        maxScore: 5,
        position: 2,
      },
    ])
    .returning();

  const reviewSubjects = submissions.filter((motion) => motion.status === 'under_review');
  const assignments = await db
    .insert(reviewAssignment)
    .values(
      reviewSubjects.flatMap((motion) => [
        {
          reviewRoundId: round.id,
          submissionId: motion.id,
          reviewerUserId: reviewers[0].id,
          status: 'completed' as const,
          comment: 'Necessary question. The proposed limit should be stated as a term, not a custom.',
          completedAt: ago(2),
        },
        {
          reviewRoundId: round.id,
          submissionId: motion.id,
          reviewerUserId: reviewers[1].id,
          status: 'pending' as const,
        },
      ]),
    )
    .returning();

  await db.insert(score).values(
    assignments
      .filter((assignment) => assignment.status === 'completed')
      .flatMap((assignment, assignmentIndex) =>
        criteria.map((criterion, criterionIndex) => ({
          reviewAssignmentId: assignment.id,
          criterionId: criterion.id,
          value: 3 + ((assignmentIndex + criterionIndex) % 3),
        })),
      ),
  );

  const accepted = submissions.filter((motion) => motion.status === 'accepted');
  const placements = [
    {
      motion: accepted[0],
      room: curia,
      startsAt: atRome(day1, 9, 0),
      minutes: 45,
    },
    {
      motion: accepted[1],
      room: curia,
      startsAt: atRome(day1, 10, 30),
      minutes: 30,
    },
    {
      motion: accepted[3],
      room: portico,
      startsAt: atRome(day1, 14, 0),
      minutes: 60,
    },
    {
      motion: accepted[4],
      room: temple,
      startsAt: atRome(day2, 10, 0),
      minutes: 30,
    },
    {
      motion: accepted[2],
      room: curia,
      startsAt: atRome(day4, 11, 0),
      minutes: 45,
    },
  ];

  const scheduled = await db
    .insert(scheduledSession)
    .values(
      placements.map((placement, index) => ({
        eventId: senate.id,
        submissionId: placement.motion.id,
        ref: index + 1,
        title: placement.motion.title,
        descriptionMarkdown: placement.motion.descriptionMarkdown,
        roomId: placement.room.id,
        trackId: placement.motion.trackId,
        formatId: placement.motion.formatId,
        startsAt: placement.startsAt,
        endsAt: new Date(placement.startsAt.getTime() + placement.minutes * 60_000),
        status: 'published' as const,
        icsUid: newIcsUid(),
      })),
    )
    .returning();

  await db.update(event).set({ sessionSeq: scheduled.length }).where(eq(event.id, senate.id));

  const [orationRequest] = await db
    .insert(fileRequest)
    .values({
      eventId: senate.id,
      label: 'Written oration',
      helpText: 'A clean copy for the acta and the public record.',
      acceptedTypes: ['application/pdf', 'text/plain'],
      maxSizeMb: 20,
    })
    .returning();

  const [protocolForm] = await db
    .insert(form)
    .values({
      eventId: senate.id,
      kind: 'portal',
      name: 'Attendance and protocol',
      slug: 'protocol',
      status: 'open',
      introMarkdown: 'Confirm the practical details before the lictors close the doors.',
    })
    .returning();

  await db.insert(formField).values([
    {
      formId: protocolForm.id,
      position: 0,
      type: 'select' as const,
      key: 'arrival',
      label: 'When will you arrive at the Forum?',
      options: ['Before first light', 'Before the auspices', 'Before my motion'],
      required: true,
    },
    {
      formId: protocolForm.id,
      position: 1,
      type: 'checkbox' as const,
      key: 'conflict',
      label: 'I have a personal command or provincial interest to declare',
    },
  ]);

  const tasks = await db
    .insert(task)
    .values([
      {
        eventId: senate.id,
        name: 'Confirm attendance at the Curia',
        descriptionMarkdown: 'Acknowledge your place in the published order of business.',
        kind: 'acknowledge' as const,
        audience: 'accepted_participants' as const,
        dueAt: new Date(day1.getTime() - 21 * DAY),
        position: 0,
        reminderDaysBefore: [7, 2],
      },
      {
        eventId: senate.id,
        name: 'File the written oration',
        descriptionMarkdown: 'The clerks need a copy before the debate begins.',
        kind: 'file_upload' as const,
        audience: 'accepted_participants' as const,
        fileRequestId: orationRequest.id,
        dueAt: new Date(day1.getTime() - 7 * DAY),
        position: 1,
        reminderDaysBefore: [7, 1],
      },
      {
        eventId: senate.id,
        name: 'Complete attendance and protocol',
        kind: 'form' as const,
        audience: 'accepted_participants' as const,
        formId: protocolForm.id,
        dueAt: new Date(day1.getTime() - 14 * DAY),
        position: 2,
        reminderDaysBefore: [5],
      },
      {
        eventId: senate.id,
        name: 'Read the order of business',
        kind: 'link' as const,
        audience: 'all_participants' as const,
        linkUrl: 'https://example.com/first-settlement/order',
        required: false,
        position: 3,
      },
    ])
    .returning();

  const acceptedParticipants = [
    ...new Map(
      accepted.map((motion) => {
        const person = participantByUser.get(motion.submitterUserId)!;
        return [person.id, person] as const;
      }),
    ).values(),
  ];
  const statuses = ['completed', 'in_progress', 'not_started', 'completed'] as const;

  await db.insert(taskAssignment).values(
    tasks.flatMap((seedTask, taskIndex) =>
      acceptedParticipants.map((person, personIndex) => {
        const proposedStatus = statuses[(taskIndex + personIndex) % statuses.length];
        const needsEvidence = seedTask.kind === 'file_upload' || seedTask.kind === 'form';
        const status = needsEvidence && proposedStatus === 'completed' ? 'in_progress' : proposedStatus;
        return {
          taskId: seedTask.id,
          participantId: person.id,
          status,
          completedAt: status === 'completed' ? ago(taskIndex + personIndex + 1) : null,
        };
      }),
    ),
  );

  await db.insert(portalTheme).values({
    eventId: senate.id,
    accentColor: 'vermilion',
    welcomeMarkdown:
      'Welcome to the Curia. Your motion, speaking order, and every item the clerks still need ' + 'appear below.',
    supportEmail: 'clerks@first-settlement.example',
  });

  await db.insert(portalPage).values([
    {
      eventId: senate.id,
      slug: 'order-of-business',
      title: 'Order of business',
      bodyMarkdown:
        '## 13 January\n\nReturn of extraordinary powers and division of the provinces.\n\n' +
        '## 16 January\n\nHonors, civic precedence, and the name Augustus.',
      published: true,
      position: 0,
    },
    {
      eventId: senate.id,
      slug: 'curia-protocol',
      title: 'Curia protocol',
      bodyMarkdown:
        'Enter by speaking order, give the clerks a written copy, and declare any provincial ' +
        'command before debate. Laurel is reserved for a voted honor.',
      published: true,
      position: 1,
    },
    {
      eventId: senate.id,
      slug: 'historical-note',
      title: 'Historical note',
      bodyMarkdown:
        'This programme is a modern dramatization built around the First Settlement of January ' +
        '27 BCE. Session titles and abstracts are interpretive, not surviving transcripts.',
      published: true,
      position: 2,
    },
  ]);

  await ensureDefaultTemplates(senate.id);

  await db.insert(emailLog).values([
    {
      eventId: senate.id,
      toEmail: 'plancus@first-settlement.example',
      fromEmail: 'clerks@first-settlement.example',
      subject: 'Your motion was accepted: Augustus: A Name Equal to the Settlement',
      bodyHtml: '<p>The Senate will hear your motion in the Curia on the fourth day.</p>',
      bodyText: 'The Senate will hear your motion in the Curia on the fourth day.',
      templateKey: 'submission.accepted',
      status: 'sent',
      sentAt: ago(6),
    },
    {
      eventId: senate.id,
      toEmail: 'messalla@first-settlement.example',
      fromEmail: 'clerks@first-settlement.example',
      subject: 'Reminder: file the written oration',
      bodyHtml: '<p>The clerks need your written oration before the Senate convenes.</p>',
      bodyText: 'The clerks need your written oration before the Senate convenes.',
      templateKey: 'task.reminder',
      status: 'sent',
      sentAt: ago(1),
    },
  ]);

  return {
    slug: SLUG,
    submissions: submissions.length,
    speakers: acceptedParticipants.length,
    scheduledSessions: scheduled.length,
    tasks: tasks.length,
  };
}
