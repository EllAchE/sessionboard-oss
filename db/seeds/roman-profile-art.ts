import {
  romanSpeakerHeadshotBytes,
  type RomanSpeakerHeadshotGender,
} from '../../lib/roman-speaker-headshots';

export type RomanSeedProfile = {
  email: string;
  name: string;
  gender: RomanSpeakerHeadshotGender;
  pronouns: string;
  title: string;
  organization: string;
  bio: string;
  links: { label: string; url: string }[];
};

export const ROMAN_PROFILE_ART = [
  {
    email: 'octavian@first-settlement.example',
    name: 'Gaius Octavius',
    gender: 'man',
    pronouns: 'he/him',
    title: 'Consul for the seventh time',
    organization: 'House of Caesar',
    bio: 'Victor at Actium and principal author of the settlement. Presents himself here as the magistrate returning extraordinary powers to the state.',
    links: [{ label: 'Historical dossier', url: 'https://example.com/first-settlement/speakers' }],
  },
  {
    email: 'agrippa@first-settlement.example',
    name: 'Marcus Vipsanius Agrippa',
    gender: 'man',
    pronouns: 'he/him',
    title: 'Consul and commander',
    organization: 'Vipsanii',
    bio: 'Commander, administrator, and Octavian’s closest collaborator. Brings the practical questions of provinces, fleets, and public works.',
    links: [{ label: 'Historical dossier', url: 'https://example.com/first-settlement/speakers' }],
  },
  {
    email: 'plancus@first-settlement.example',
    name: 'Lucius Munatius Plancus',
    gender: 'man',
    pronouns: 'he/him',
    title: 'Consular senator',
    organization: 'Munatii Planci',
    bio: 'Senior statesman traditionally credited with proposing the honorific Augustus during the January settlement.',
    links: [{ label: 'Historical dossier', url: 'https://example.com/first-settlement/speakers' }],
  },
  {
    email: 'messalla@first-settlement.example',
    name: 'Marcus Valerius Messalla Corvinus',
    gender: 'man',
    pronouns: 'he/him',
    title: 'Senator and orator',
    organization: 'Valerii Messallae',
    bio: 'Former republican commander reconciled to the new order, with a practiced eye for the language that separates precedence from monarchy.',
    links: [{ label: 'Historical dossier', url: 'https://example.com/first-settlement/speakers' }],
  },
  {
    email: 'maecenas@first-settlement.example',
    name: 'Gaius Cilnius Maecenas',
    gender: 'man',
    pronouns: 'he/him',
    title: 'Adviser and patron',
    organization: 'Cilnii',
    bio: 'An equestrian guest among senators, concerned with diplomacy, civic culture, and how political settlements become public memory.',
    links: [{ label: 'Historical dossier', url: 'https://example.com/first-settlement/speakers' }],
  },
  {
    email: 'taurus@first-settlement.example',
    name: 'Titus Statilius Taurus',
    gender: 'man',
    pronouns: 'he/him',
    title: 'Commander and senator',
    organization: 'Statilii Tauri',
    bio: 'Veteran commander of the civil wars, focused on the military institutions that must outlast them without becoming a new emergency.',
    links: [{ label: 'Historical dossier', url: 'https://example.com/first-settlement/speakers' }],
  },
  {
    email: 'aemilia@first-settlement.example',
    name: 'Aemilia Fausta',
    gender: 'woman',
    pronouns: 'she/her',
    title: 'Civic historian',
    organization: 'Collegium Historiae',
    bio: 'Studies how decrees become public memory, with particular attention to civic ritual and the voices omitted from official records.',
    links: [{ label: 'Speaker dossier', url: 'https://example.com/first-settlement/speakers/aemilia' }],
  },
  {
    email: 'cornelia@first-settlement.example',
    name: 'Cornelia Prisca',
    gender: 'woman',
    pronouns: 'she/her',
    title: 'Advocate and jurist',
    organization: 'Cornelii',
    bio: 'Examines the legal language of emergency power and the safeguards required when temporary commands become durable institutions.',
    links: [{ label: 'Speaker dossier', url: 'https://example.com/first-settlement/speakers/cornelia' }],
  },
  {
    email: 'julia@first-settlement.example',
    name: 'Julia Marcella',
    gender: 'woman',
    pronouns: 'she/her',
    title: 'Conservator of temples',
    organization: 'Collegium Fabrum',
    bio: 'Connects public works, sacred space, and the practical labor required to make a political settlement visible across the city.',
    links: [{ label: 'Speaker dossier', url: 'https://example.com/first-settlement/speakers/julia' }],
  },
  {
    email: 'livia@first-settlement.example',
    name: 'Livia Sabina',
    gender: 'woman',
    pronouns: 'she/her',
    title: 'Provincial envoy',
    organization: 'Sabini',
    bio: 'Brings provincial administration into debates too often framed only around Rome, armies, and the ambitions of individual commanders.',
    links: [{ label: 'Speaker dossier', url: 'https://example.com/first-settlement/speakers/livia' }],
  },
  {
    email: 'tullia@first-settlement.example',
    name: 'Tullia Secunda',
    gender: 'woman',
    pronouns: 'she/her',
    title: 'Orator and educator',
    organization: 'Schola Palatina',
    bio: 'Teaches public argument and asks who gains authority when a new constitutional order controls the language used to describe it.',
    links: [{ label: 'Speaker dossier', url: 'https://example.com/first-settlement/speakers/tullia' }],
  },
  {
    email: 'valeria@first-settlement.example',
    name: 'Valeria Aucta',
    gender: 'woman',
    pronouns: 'she/her',
    title: 'Archivist of decrees',
    organization: 'Valerii',
    bio: 'Works at the boundary between debate and recordkeeping, where wording, sequence, and attribution decide what later generations inherit.',
    links: [{ label: 'Speaker dossier', url: 'https://example.com/first-settlement/speakers/valeria' }],
  },
] as const satisfies readonly RomanSeedProfile[];

const ROMAN_PROFILE_ART_GENDER = new Map<string, RomanSpeakerHeadshotGender>(
  ROMAN_PROFILE_ART.map((entry) => [entry.email, entry.gender]),
);

export const ROMAN_PROFILE_ART_CONTENT_TYPE = 'image/svg+xml';

export type RomanProfileArtAssignment<SpeakerKey extends string = string> = {
  speakerKey: SpeakerKey;
  slot: number;
  filename: string;
  contentType: typeof ROMAN_PROFILE_ART_CONTENT_TYPE;
  bytes: Uint8Array;
};

export function createRomanProfileArtAssignments<SpeakerKey extends string>(
  speakerKeys: readonly SpeakerKey[],
): RomanProfileArtAssignment<SpeakerKey>[] {
  return speakerKeys.map((speakerKey, slot) => ({
    speakerKey,
    slot,
    filename: `roman-speaker-${String(slot + 1).padStart(3, '0')}.svg`,
    contentType: ROMAN_PROFILE_ART_CONTENT_TYPE,
    bytes: romanSpeakerHeadshotBytes(speakerKey, slot, ROMAN_PROFILE_ART_GENDER.get(speakerKey)),
  }));
}
