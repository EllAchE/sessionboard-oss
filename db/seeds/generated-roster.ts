/**
 * The people and proposals that make a sample event big.
 *
 * Nobody is going to hand-write four hundred abstracts, and a sample event that only has fourteen
 * of them cannot show what the product is for: a review queue, an agenda grid and an assignment
 * spread only become interesting under load. So the bulk of a sized event is generated here, while
 * the hand-authored core in `seed.ts` stays exactly as it is — a reader still meets Vitruvius and
 * Cornelia first, and the crowd behind them is filler that reads like a conference rather than like
 * `Speaker 214`.
 *
 * ## Everything is a pure function of an index
 *
 * There is no randomness. Slot `i` always produces the same person, the same email and the same
 * portrait, which is what makes a reseed non-destructive in the ways that matter: the same speaker
 * keeps their face and their sign-in address, a screenshot taken last week still matches, and the
 * invariant tests can assert on concrete output instead of on a shape. `Math.random()` here would
 * cost all of that and buy nothing — the names are already varied enough at the sizes we seed.
 *
 * Names are drawn by mixed-radix decomposition of the index rather than by hashing, so uniqueness
 * is a property of the arithmetic and not a hope: distinct indices give distinct
 * `(nomen, cognomen)` pairs for the first `NOMINA.length * COGNOMINA.length` people of each gender,
 * which is an order of magnitude more than the largest event seeds. `generated-roster.test.ts`
 * asserts it at the sizes actually used.
 *
 * ## Addresses
 *
 * Generated speakers live on `<event-slug>.example`. That is not decoration: `lib/demo-access.ts`
 * will only ever print an on-screen magic link for an address at an RFC 2606 / 6761 reserved
 * domain, because no mailbox can exist behind one. Moving these people to a domain that could
 * receive mail would quietly turn a demo convenience into an account-takeover path, so the domain
 * is derived in `event-sizes.ts` and never spelled by hand here.
 */

export type SpeakerGender = 'man' | 'woman';

export type GeneratedSpeaker = {
  email: string;
  name: string;
  gender: SpeakerGender;
  title: string;
  organization: string;
  bio: string;
  pronouns?: string;
};

export type GeneratedProposal = {
  email: string;
  title: string;
  abstract: string;
  takeaways: string;
  level: string;
  status: 'submitted' | 'under_review' | 'accepted' | 'declined' | 'waitlisted';
  /** Index into the event's track list, modulo its length. */
  trackIndex: number;
  /** Index into the event's format list, modulo its length. */
  formatIndex: number;
  daysAgo: number;
};

const PRAENOMINA = [
  'Gaius', 'Lucius', 'Marcus', 'Publius', 'Quintus', 'Titus', 'Tiberius', 'Sextus', 'Aulus',
  'Decimus', 'Gnaeus', 'Spurius', 'Manius', 'Servius', 'Appius', 'Numerius', 'Vibius',
] as const;

/** All end in `-ius`, so the feminine form is a rule rather than a second table. */
const NOMINA = [
  'Aemilius', 'Antonius', 'Aurelius', 'Caecilius', 'Calpurnius', 'Cassius', 'Claudius',
  'Cornelius', 'Curtius', 'Decius', 'Domitius', 'Duilius', 'Fabius', 'Flavius', 'Fulvius',
  'Furius', 'Gellius', 'Horatius', 'Hostilius', 'Julius', 'Junius', 'Licinius', 'Livius',
  'Lucretius', 'Manlius', 'Marcius', 'Memmius', 'Minucius', 'Mucius', 'Naevius', 'Octavius',
  'Papirius', 'Pompeius', 'Postumius', 'Quinctius', 'Rutilius', 'Sempronius', 'Servilius',
  'Sulpicius', 'Terentius', 'Valerius', 'Veturius', 'Vipsanius',
] as const;

const MALE_COGNOMINA = [
  'Agricola', 'Ahenobarbus', 'Balbus', 'Brutus', 'Caepio', 'Celsus', 'Cinna', 'Cotta', 'Crassus',
  'Crispus', 'Dentatus', 'Drusus', 'Faustus', 'Flaccus', 'Galba', 'Gracchus', 'Longinus', 'Lupus',
  'Macer', 'Magnus', 'Marcellus', 'Maximus', 'Nerva', 'Niger', 'Paullus', 'Pictor', 'Piso',
  'Priscus', 'Pulcher', 'Regulus', 'Rufus', 'Sabinus', 'Scaevola', 'Scipio', 'Severus', 'Silanus',
  'Strabo', 'Tubero', 'Varus', 'Vespillo',
] as const;

/** A separate table rather than a derived form: mechanical `-us` to `-a` produces bad Latin. */
const FEMALE_COGNOMINA = [
  'Agrippina', 'Balbina', 'Celsa', 'Crispina', 'Domitilla', 'Drusilla', 'Fausta', 'Flaccilla',
  'Galeria', 'Gratiana', 'Hostilia', 'Justina', 'Lepida', 'Longina', 'Lucilla', 'Marcella',
  'Marciana', 'Matidia', 'Maxima', 'Messalina', 'Nigrina', 'Paulina', 'Plancina', 'Plotina',
  'Prisca', 'Procula', 'Pulchra', 'Quarta', 'Regilla', 'Rufina', 'Sabina', 'Secunda', 'Serena',
  'Severa', 'Silana', 'Tertia', 'Tranquilla', 'Valeriana', 'Verula', 'Vibiana',
] as const;

const TITLES = [
  'Aqueduct engineer', 'Public works surveyor', 'Grain supply administrator', 'Legal advocate',
  'Archive keeper', 'Rhetoric instructor', 'Mint superintendent', 'Harbour master', 'Census clerk',
  'Military engineer', 'Road commissioner', 'Treasury auditor', 'Provincial administrator',
  'Medical practitioner', 'Cartographer', 'Master shipwright',
] as const;

const ORGANIZATIONS = [
  'Office of Public Works', 'Ostia Harbour Authority', 'Grain Board', 'Public Libraries',
  'Rhetoric School of Rhodes', 'Provincial Assembly of Baetica', 'Colonia Narbo Martius',
  'Aqueduct Commission', 'Treasury of Saturn', 'Legion Engineering Corps', 'Guild of Shipwrights',
  'Census Office', 'Via Appia Commission', 'Library of Alexandria',
] as const;

const BIO_FOCUS = [
  'measurement, tolerance, and what happens when neither is written down',
  'the last mile of a supply chain, where most of the losses actually are',
  'why maintenance is the first budget cut and the most expensive one',
  'making a public record legible to the people it describes',
  'the gap between what a plan says and what the site allows',
  'training replacements before they are urgently needed',
  'work that only gets noticed when it stops',
  'costing a decision honestly before anyone is committed to it',
  'the difference between a rule and a rule that is followed',
  'scheduling around weather, festivals, and the people who ignore both',
  'keeping a service running while it is being rebuilt',
  'inspection access as a design constraint rather than an afterthought',
] as const;

const BIO_CLOSERS = [
  'Prefers a small change that survives to a large one that does not.',
  'Keeps notes obsessively and shares them.',
  'Has opinions about drainage and will share them unprompted.',
  'Believes most disasters were legible in the paperwork first.',
  'Would rather be corrected early than right late.',
  'Learned all of this the expensive way.',
  'Argues for boring solutions in public and in writing.',
  'Thinks the interesting part of any project is the handover.',
] as const;

const TOPICS = [
  'aqueduct maintenance', 'grain convoy scheduling', 'road survey tolerances', 'harbour dredging',
  'census data quality', 'court calendar backlogs', 'apprenticeship pipelines',
  'concrete curing in winter', 'provincial tax appeals', 'archive indexing', 'signal relay latency',
  'bridge load testing', 'quarry logistics', 'water quality testing', 'public bath heating',
  'fire brigade response times', 'granary pest control', 'coin die wear',
  'legionary field hospitals', 'ferry timetables', 'boundary dispute mediation',
  'sewer inspection access', 'timber seasoning', 'olive press throughput', 'letter courier routing',
  'mosaic workshop scheduling', 'amphitheatre crowd flow', 'lighthouse keeping rotas',
  'well drilling records', 'milestone placement', 'ration accounting', 'shipwreck salvage',
  'contract arbitration', 'stone transport barges', 'aqueduct settling tanks',
  'street lighting trials', 'market weights and measures', 'garrison supply forecasting',
  'drainage in reclaimed marsh', 'public notice boards',
] as const;

/** Each shape takes the topic verbatim, so no shape may need it capitalised mid-sentence. */
const TITLE_SHAPES = [
  (topic: string) => `Lessons from ten years of ${topic}`,
  (topic: string) => `What we got wrong about ${topic}`,
  (topic: string) => `A practical guide to ${topic}`,
  (topic: string) => `Scaling ${topic} beyond one city`,
  (topic: string) => `Measuring ${topic} without guesswork`,
  (topic: string) => `The hidden cost of ${topic}`,
  (topic: string) => `Rebuilding ${topic} after a failure`,
  (topic: string) => `Who actually owns ${topic}`,
  (topic: string) => `Automating the tedious parts of ${topic}`,
  (topic: string) => `When ${topic} meets a shrinking budget`,
  (topic: string) => `Teaching ${topic} to people who just arrived`,
  (topic: string) => `The case against how we do ${topic}`,
] as const;

const ABSTRACT_OPENERS = [
  'A field report on what actually changed in',
  'Hard numbers, and some honest failures, from',
  'A working method for',
  'Three years of measurements on',
  'What the records show about',
  'An argument, with evidence, about',
  'A postmortem on',
  'The cheapest reliable approach we have found to',
] as const;

const ABSTRACT_CLOSERS = [
  'Expect specifics rather than principles.',
  'You should leave with a checklist you can use next week.',
  'Includes the numbers, the sources, and the parts that did not work.',
  'Aimed at people who have to make this decision with an incomplete budget.',
  'Assumes you have done this before and are tired of the usual advice.',
  'Every claim here is one you can check against the public record.',
  'The method is boring on purpose; that is the point.',
  'Bring your own constraints and we will work through them.',
] as const;

const TAKEAWAY_LINES = [
  'Write the tolerance down before anyone starts',
  'Budget for inspection, not just for construction',
  'Measure the thing you actually care about',
  'Plan the handover on the first day',
  'The cheap option is cheap until the second failure',
  'Publish the numbers even when they are bad',
  'Design for the person who maintains it',
  'Agree who decides before you need a decision',
  'Small reversible changes beat large irreversible ones',
  'Most surprises were visible in the paperwork',
  'Train two people, not one',
  'Test under the load you will actually see',
] as const;

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'] as const;

const NON_ACCEPTED: GeneratedProposal['status'][] = [
  'under_review', 'submitted', 'declined', 'waitlisted', 'under_review', 'declined',
];

function feminineNomen(nomen: string): string {
  return nomen.replace(/us$/, 'a');
}

function pick<T>(pool: readonly T[], index: number): T {
  return pool[index % pool.length]!;
}

/**
 * The person at slot `index`. Genders alternate so a roster of any length stays balanced, and each
 * gender walks its own name tables independently — which is why the two never collide on an email.
 */
export function generatedSpeakerAt(index: number, domain: string): GeneratedSpeaker {
  const gender: SpeakerGender = index % 2 === 0 ? 'woman' : 'man';
  const within = Math.floor(index / 2);

  const nomenIndex = within % NOMINA.length;
  const carry = Math.floor(within / NOMINA.length);
  const nomen = NOMINA[nomenIndex]!;

  const cognomina = gender === 'woman' ? FEMALE_COGNOMINA : MALE_COGNOMINA;
  const cognomen = cognomina[(carry + nomenIndex) % cognomina.length]!;

  const family = gender === 'woman' ? feminineNomen(nomen) : nomen;
  const name =
    gender === 'woman'
      ? `${family} ${cognomen}`
      : `${pick(PRAENOMINA, within + carry)} ${family} ${cognomen}`;

  const title = pick(TITLES, index * 5 + 1);
  const organization = pick(ORGANIZATIONS, index * 3 + 2);

  return {
    email: `${cognomen}.${family}@${domain}`.toLowerCase(),
    name,
    gender,
    title,
    organization,
    bio: `${title} at ${organization}, working on ${pick(BIO_FOCUS, index * 7)}. ${pick(BIO_CLOSERS, index * 3)}`,
    ...(gender === 'woman' ? { pronouns: 'she/her' } : {}),
  };
}

/** `count` distinct people on `domain`, starting from slot `startIndex`. */
export function generateSpeakers(
  count: number,
  options: { domain: string; startIndex?: number },
): GeneratedSpeaker[] {
  const start = options.startIndex ?? 0;
  return Array.from({ length: count }, (_, offset) =>
    generatedSpeakerAt(start + offset, options.domain),
  );
}

/**
 * One proposal per slot. The first `acceptedCount` are accepted and belong to distinct speakers in
 * roster order, so every confirmed speaker has exactly one talk to be scheduled into; the rest are
 * the queue that makes a review screen worth looking at, spread back over the same people.
 */
export function generateProposals(
  speakers: readonly GeneratedSpeaker[],
  options: { count: number; acceptedCount: number; titleOffset?: number },
): GeneratedProposal[] {
  const titleOffset = options.titleOffset ?? 0;

  return Array.from({ length: options.count }, (_, index) => {
    const accepted = index < options.acceptedCount;
    const speaker = speakers[index % speakers.length]!;
    const slot = titleOffset + index;

    // Each pass through the topic table advances the shape by five, and five is coprime with the
    // twelve shapes — so a topic never repeats with the same framing until every pairing is used.
    const topicIndex = slot % TOPICS.length;
    const topic = TOPICS[topicIndex]!;
    const shape =
      TITLE_SHAPES[
        (Math.floor(slot / TOPICS.length) * 5 + topicIndex) % TITLE_SHAPES.length
      ]!;

    return {
      email: speaker.email,
      title: shape(topic),
      abstract: `${pick(ABSTRACT_OPENERS, slot * 3)} ${topic}. ${pick(ABSTRACT_CLOSERS, slot * 5 + 1)}`,
      takeaways: [
        pick(TAKEAWAY_LINES, slot),
        pick(TAKEAWAY_LINES, slot * 2 + 1),
        pick(TAKEAWAY_LINES, slot * 3 + 5),
      ].join('\n'),
      level: pick(LEVELS, slot + 1),
      status: accepted ? 'accepted' : pick(NON_ACCEPTED, index),
      trackIndex: slot,
      formatIndex: slot * 2 + (accepted ? 0 : 1),
      daysAgo: 34 - (slot % 30),
    };
  });
}
