import { describe, expect, it } from 'vitest';
import { joinPersonName, parsePersonName, personNameColumns, splitPersonName } from './person-name';

/**
 * `F-6`. The split rule is mirrored in `db/migrations/0008_tiny_maximus.sql`, which backfills every
 * row that existed before first and last name were separate columns. A row written by the app and a
 * row written by that migration have to be indistinguishable, so what is asserted here is the rule
 * itself — not an implementation detail of either side.
 */

describe('splitPersonName', () => {
  it.each([
    ['Marcus Tullius Cicero', 'Marcus Tullius', 'Cicero'],
    ['Tullia Ciceronis', 'Tullia', 'Ciceronis'],
    ['Sulpicia', 'Sulpicia', null],
    ['  Gaius   Julius   Caesar  ', 'Gaius Julius', 'Caesar'],
    ['Livia\tDrusilla', 'Livia', 'Drusilla'],
    ['', null, null],
    ['   ', null, null],
  ])('splits %j', (input, firstName, lastName) => {
    expect(splitPersonName(input)).toEqual({ firstName, lastName });
  });

  it('treats null and undefined as no name at all', () => {
    expect(splitPersonName(null)).toEqual({ firstName: null, lastName: null });
    expect(splitPersonName(undefined)).toEqual({ firstName: null, lastName: null });
  });

  /**
   * The property that makes the split safe to run over a live table: it never loses characters. A
   * rule that dropped a particle or a suffix would quietly corrupt names on migration, and nobody
   * would notice until a badge was printed.
   */
  it.each([
    'Marcus Tullius Cicero',
    'Sulpicia',
    'Gaius   Julius   Caesar',
    'de la Cruz',
    '孔 丘',
  ])('round-trips %j back to the normalised original', (input) => {
    expect(joinPersonName(splitPersonName(input))).toBe(input.replace(/\s+/gu, ' ').trim());
  });
});

describe('joinPersonName', () => {
  it('copes with either half missing', () => {
    expect(joinPersonName({ firstName: 'Sulpicia', lastName: null })).toBe('Sulpicia');
    expect(joinPersonName({ firstName: null, lastName: 'Cicero' })).toBe('Cicero');
    expect(joinPersonName({ firstName: null, lastName: null })).toBeNull();
  });
});

describe('parsePersonName', () => {
  it('applies the same rejection rules a single speaker name gets', () => {
    expect(() => parsePersonName({ firstName: 'Marcus', lastName: 'Cicero' })).toThrow();
    expect(() => parsePersonName({ firstName: 'Marcus', lastName: 'C‮icero' })).toThrow();
  });

  it('keeps a legitimate joiner', () => {
    expect(parsePersonName({ firstName: 'Ada‍', lastName: 'Lovelace' })).toEqual({
      firstName: 'Ada‍',
      lastName: 'Lovelace',
    });
  });
});

describe('personNameColumns', () => {
  /**
   * The display name is recomputed rather than left alone. A `user.name` that disagrees with the
   * first and last name somebody just edited is the exact failure this module exists to prevent —
   * and it is what would happen if the two were written independently.
   */
  it('recomputes the display name from the two halves', () => {
    expect(personNameColumns({ firstName: 'Marcus Tullius', lastName: 'Cicero' })).toEqual({
      firstName: 'Marcus Tullius',
      lastName: 'Cicero',
      name: 'Marcus Tullius Cicero',
    });
  });

  it('leaves the display name null when neither half was given', () => {
    expect(personNameColumns({ firstName: '  ', lastName: null })).toEqual({
      firstName: null,
      lastName: null,
      name: null,
    });
  });
});
