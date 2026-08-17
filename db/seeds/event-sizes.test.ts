import { describe, expect, it } from 'vitest';
import { ROMAN_SPEAKER_HEADSHOT_CAPACITY } from '../../lib/roman-speaker-headshots';
import {
  ALL_EVENT_SIZES,
  DEFAULT_EVENT_SIZE,
  EVENT_SIZES,
  SIZED_EVENT_SLUGS,
  generatedEmailDomain,
} from './event-sizes';
import { ROMAN_PROFILE_ART } from './roman-profile-art';

/**
 * These are the assertions that keep the three sizes from quietly interfering with each other. Each
 * one has a failure mode that is invisible on the seeded database and only shows up on a screen:
 * overlapping portrait ranges look like a bug in the generator, and an event whose accepted talks
 * outnumber its slots throws in the middle of a seed run that has already written half an event.
 */

describe('event size profiles', () => {
  it('keeps the default sample event on the `demo` slug', () => {
    expect(EVENT_SIZES[DEFAULT_EVENT_SIZE].slug).toBe('demo');
    expect(SIZED_EVENT_SLUGS[0]).toBe('demo');
  });

  it('grows monotonically, so the three are actually comparable', () => {
    const speakers = ALL_EVENT_SIZES.map((size) => size.speakers);
    const submissions = ALL_EVENT_SIZES.map((size) => size.submissions);
    expect(speakers).toEqual([...speakers].sort((a, b) => a - b));
    expect(submissions).toEqual([...submissions].sort((a, b) => a - b));
  });

  it('asks for more proposals than it accepts, or the review queue is empty', () => {
    for (const size of ALL_EVENT_SIZES) {
      expect(size.submissions).toBeGreaterThan(size.speakers);
    }
  });

  /**
   * `first-settlement` holds slots 0 to 12. Two events sharing a slot hand two different people the
   * same face, which reads as a broken generator rather than as a seed collision.
   */
  it('draws non-overlapping portrait ranges that fit the generator', () => {
    const ranges = [
      { key: 'first-settlement', from: 0, to: ROMAN_PROFILE_ART.length - 1 },
      ...ALL_EVENT_SIZES.map((size) => ({
        key: size.key,
        from: size.headshotSlotOffset,
        to: size.headshotSlotOffset + size.speakers - 1,
      })),
    ].sort((a, b) => a.from - b.from);

    for (const range of ranges) {
      expect(range.to).toBeLessThan(ROMAN_SPEAKER_HEADSHOT_CAPACITY);
    }
    for (const [index, range] of ranges.slice(1).entries()) {
      const previous = ranges[index]!;
      expect({ after: previous.key, key: range.key, clear: range.from > previous.to }).toEqual({
        after: previous.key,
        key: range.key,
        clear: true,
      });
    }
  });

  /**
   * `sized-roster.ts` schedules into 14 half-hour slots a day. `demo` reserves its first three rooms
   * for the hand-written agenda, so only the rooms past those count towards its capacity.
   */
  it('has room on the grid for every accepted talk', () => {
    const SLOTS_PER_DAY = 14;
    const reserved: Record<string, number> = { medium: 3 };
    for (const size of ALL_EVENT_SIZES) {
      const openRooms = size.rooms - (reserved[size.key] ?? 0);
      expect({ key: size.key, fits: openRooms * size.days * SLOTS_PER_DAY >= size.speakers }).toEqual(
        { key: size.key, fits: true },
      );
    }
  });

  it('puts generated identities on a domain nothing can be delivered to', () => {
    for (const size of ALL_EVENT_SIZES) {
      expect(generatedEmailDomain(size).endsWith('.example')).toBe(true);
    }
  });

  it('gives every size a distinct slug', () => {
    expect(new Set(SIZED_EVENT_SLUGS).size).toBe(SIZED_EVENT_SLUGS.length);
  });
});
