import { parseSpeakerName } from './speaker-name';

/**
 * `F-6` asks for First Name and Last Name as separate, separately-required questions. Every other
 * surface in this app renders one string, and `user.name` is what they all read.
 *
 * Rather than convert forty call sites, the two representations are kept in step here: capture is
 * split, storage keeps both, and `user.name` stays the join. That means exactly one place has to be
 * right about the awkward cases, which is the point.
 *
 * The split rule is "everything before the last whitespace-separated token is the given name". It is
 * wrong for some names, as every such rule is — but it is wrong in a recoverable way, because the
 * speaker can correct both halves in the portal, and it never loses characters: joining the two
 * halves back together always reproduces the normalised original.
 */

export type PersonName = { firstName: string | null; lastName: string | null };

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/gu, ' ').trim();
}

/** Splits a single display name into its two halves. A one-word name is all given name. */
export function splitPersonName(value: string | null | undefined): PersonName {
  const name = normalizeWhitespace(value ?? '');
  if (!name) return { firstName: null, lastName: null };

  const boundary = name.lastIndexOf(' ');
  if (boundary === -1) return { firstName: name, lastName: null };
  return { firstName: name.slice(0, boundary), lastName: name.slice(boundary + 1) };
}

/** The inverse. Either half may be missing; the result is null only when both are. */
export function joinPersonName(name: PersonName): string | null {
  const joined = normalizeWhitespace(
    [name.firstName ?? '', name.lastName ?? ''].join(' '),
  );
  return joined || null;
}

/**
 * `CNT-S3`, `SPK-S1`. What this event calls a person.
 *
 * `participant.display_name` is per-event and `user.name` is the account; renaming a speaker for one
 * conference writes the first and deliberately leaves the second alone. A surface reading the
 * account name directly therefore keeps showing whoever that person was before the organizer
 * renamed them — which is how one speaker's uploads, her comment thread and three of her submission
 * rows were all filed under a name no other screen in the app used for her.
 *
 * The email is the last resort rather than a blank, because "who uploaded this" is a question a
 * deliverables library has to answer even for an account that never filled in a name.
 */
export function eventPersonName(person: {
  displayName?: string | null;
  name?: string | null;
  email: string;
}): string {
  return person.displayName?.trim() || person.name?.trim() || person.email;
}

/**
 * Validates both halves with the same rules a single speaker name gets — control characters,
 * invisible joiners and length are rejected identically, so a name cannot slip past by arriving in
 * two pieces. Throws the same `invalid` error `parseSpeakerName` throws.
 */
export function parsePersonName(input: {
  firstName?: string | null;
  lastName?: string | null;
}): PersonName {
  return {
    firstName: parseSpeakerName(input.firstName),
    lastName: parseSpeakerName(input.lastName),
  };
}

/**
 * What to store on `user` when either half changes. `name` is recomputed from the halves rather than
 * left alone, because a display name that disagrees with the fields the speaker just edited is the
 * bug this module exists to prevent.
 */
export function personNameColumns(input: {
  firstName?: string | null;
  lastName?: string | null;
}): { firstName: string | null; lastName: string | null; name: string | null } {
  const parsed = parsePersonName(input);
  return { ...parsed, name: joinPersonName(parsed) };
}
