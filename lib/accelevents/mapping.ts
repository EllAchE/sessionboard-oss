import type { SpeakerDto } from './types';

/**
 * Field mapping, `N-1a`. Our model and theirs disagree in two places worth naming:
 *
 * `participant.displayName` is one string and `SpeakerDTO` wants `firstName`/`lastName`, so a name
 * with no space becomes a first name with an empty last — better than inventing a surname.
 *
 * Our bios are markdown and theirs is a plain string rendered as-is, so the markdown is flattened
 * here rather than shipped as raw syntax into their speaker page.
 */

export type SpeakerSource = {
  participantId: string;
  email: string;
  /** From `participant.displayName`, falling back to `user.name`. */
  name: string | null;
  jobTitle: string | null;
  company: string | null;
  bioMarkdown: string | null;
  pronouns: string | null;
  headshotUrl: string | null;
  links: { label: string; url: string }[];
  position: number;
};

export function splitName(name: string | null): {
  firstName: string;
  lastName: string;
} {
  const trimmed = (name ?? '').trim().replace(/\s+/g, ' ');
  if (trimmed === '') return { firstName: '', lastName: '' };
  const parts = trimmed.split(' ');
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  return {
    firstName: parts.slice(0, -1).join(' '),
    lastName: parts[parts.length - 1],
  };
}

/** Enough markdown stripping that a bio reads as prose on their side. Not a renderer. */
export function flattenMarkdown(markdown: string | null): string {
  if (!markdown) return '';
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/(\*\*|__|\*|_|`)/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function findLink(links: { label: string; url: string }[], host: RegExp): string | undefined {
  const match = links.find((link) => host.test(link.url) || host.test(link.label));
  return match?.url;
}

export function toSpeakerDto(source: SpeakerSource): SpeakerDto {
  const { firstName, lastName } = splitName(source.name);

  return {
    firstName,
    lastName,
    email: source.email.trim().toLowerCase(),
    title: source.jobTitle ?? undefined,
    company: source.company ?? undefined,
    bio: flattenMarkdown(source.bioMarkdown) || undefined,
    pronouns: source.pronouns ?? undefined,
    imageUrl: source.headshotUrl ?? undefined,
    linkedIn: findLink(source.links, /linkedin/i),
    twitter: findLink(source.links, /twitter|x\.com/i),
    instagram: findLink(source.links, /instagram/i),
    position: source.position,
    moderator: false,
    /** `N-1`'s reason for existing: the speaker gets portal access, which is what comps the ticket. */
    allowAttendeeAccess: true,
  };
}

/**
 * `4068906` makes duplicate email a hard reject rather than an upsert, so the same address must
 * never be pushed twice — including twice inside one batch, which is how a co-speaker on two
 * accepted talks would otherwise arrive.
 */
export function dedupeByEmail<T extends { email: string }>(
  rows: T[],
): { unique: T[]; duplicates: T[] } {
  const seen = new Set<string>();
  const unique: T[] = [];
  const duplicates: T[] = [];

  for (const row of rows) {
    const key = row.email.trim().toLowerCase();
    if (key === '') continue;
    if (seen.has(key)) {
      duplicates.push(row);
      continue;
    }
    seen.add(key);
    unique.push(row);
  }

  return { unique, duplicates };
}
