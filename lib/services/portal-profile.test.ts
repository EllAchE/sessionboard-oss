import { describe, expect, it } from 'vitest';
import { personNameColumns } from '../person-name';
import { profileSchema } from './portal';

/**
 * `S-2`. The brief names five profile fields — Biography (5,000), Salutation, Honorific, Pronouns,
 * Gender — and three of them existed at no layer of this app until now. These tests hold the
 * validation to the brief's numbers rather than to whatever the schema happens to say, which is the
 * only way a cap stays the cap through a later edit.
 */

function issues(input: Record<string, unknown>): Record<string, string> {
  const parsed = profileSchema.safeParse(input);
  if (parsed.success) return {};
  return Object.fromEntries(
    parsed.error.issues.map((issue) => [issue.path.join('.') || 'form', issue.message]),
  );
}

function parse(input: Record<string, unknown>) {
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) throw new Error(`expected valid, got ${JSON.stringify(parsed.error.issues)}`);
  return parsed.data;
}

describe('biography', () => {
  it('takes exactly five thousand characters', () => {
    expect(issues({ bioMarkdown: 'x'.repeat(5000) })).toEqual({});
  });

  it('refuses the five thousand and first, and says so in the speaker’s words', () => {
    expect(issues({ bioMarkdown: 'x'.repeat(5001) })).toEqual({
      bioMarkdown: 'Biography is limited to 5,000 characters',
    });
  });
});

describe('the three fields the brief asked for and the app never had', () => {
  it('accepts a salutation, an honorific and a gender', () => {
    const data = parse({ salutation: 'Ada', honorific: 'Dr', gender: 'Woman' });
    expect(data).toMatchObject({ salutation: 'Ada', honorific: 'Dr', gender: 'Woman' });
  });

  it('trims them, so a stray space does not become the stored value', () => {
    expect(parse({ honorific: '  Prof  ' })).toMatchObject({ honorific: 'Prof' });
  });

  /**
   * Free text, not enums. A fixed gender list is how a speaker ends up filed under the closest
   * available lie, and honorifics are unbounded across languages and professions.
   */
  it('takes a gender it has never seen before', () => {
    expect(issues({ gender: 'Non-binary' })).toEqual({});
    expect(issues({ gender: 'Prefer to self-describe: agender' })).toEqual({});
  });

  it('bounds each of them so a paste cannot become a profile', () => {
    expect(issues({ salutation: 'x'.repeat(41) })).toHaveProperty('salutation');
    expect(issues({ honorific: 'x'.repeat(41) })).toHaveProperty('honorific');
    expect(issues({ gender: 'x'.repeat(61) })).toHaveProperty('gender');
  });
});

/**
 * `F-6` split the captured name into halves and kept `user.name` as their join, but left the portal
 * editing only the event-scoped display name — so the two halves the call for speakers had just
 * collected were the one thing on the profile a speaker could not correct.
 */
describe('first and last name', () => {
  it('accepts both halves', () => {
    expect(parse({ firstName: 'Ada', lastName: 'Lovelace' })).toMatchObject({
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
  });

  it('holds each half to the same rules a whole speaker name gets', () => {
    expect(issues({ firstName: 'Ada​' })).toHaveProperty('firstName');
    expect(issues({ lastName: 'x'.repeat(200) })).toHaveProperty('lastName');
  });

  it('lets a speaker with no surname save one half', () => {
    expect(parse({ firstName: 'Sulpicia', lastName: '' })).toMatchObject({
      firstName: 'Sulpicia',
      lastName: null,
    });
  });

  it('recomposes the display name every other surface reads', () => {
    const data = parse({ firstName: 'Marcus Tullius', lastName: 'Cicero' });
    expect(personNameColumns({ firstName: data.firstName, lastName: data.lastName })).toEqual({
      firstName: 'Marcus Tullius',
      lastName: 'Cicero',
      name: 'Marcus Tullius Cicero',
    });
  });
});

/**
 * `updateProfile` writes only the keys it was given. The organizer's roster editor and the
 * `/api/v1` profile route both predate these columns and neither sends them; under the old
 * "everything or it is blanked" contract, either one saving a speaker would have wiped the
 * salutation, honorific and gender that speaker had just set.
 */
describe('a key that was not sent', () => {
  it('parses to undefined rather than to an empty value', () => {
    const data = parse({ bioMarkdown: 'A short bio.' });
    expect(data.salutation).toBeUndefined();
    expect(data.honorific).toBeUndefined();
    expect(data.gender).toBeUndefined();
    expect(data.firstName).toBeUndefined();
    expect(data.lastName).toBeUndefined();
  });

  it('is distinguishable from a key sent empty, which does mean "clear it"', () => {
    expect(parse({ honorific: '' }).honorific).toBe('');
  });
});

describe('SMS still needs a number', () => {
  it('refuses text alerts with no phone number, on the phone field', () => {
    expect(issues({ notifySms: true })).toEqual({
      phone: 'Add a phone number to receive SMS alerts',
    });
  });
});
