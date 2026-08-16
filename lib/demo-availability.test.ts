import { describe, expect, it } from 'vitest';
import { hasDemoEntryMemberships } from './demo-availability';

describe('demo entry-point availability', () => {
  const complete = [
    { email: 'organizer@example.com', role: 'organizer' as const },
    { email: 'reviewer.cicero@example.com', role: 'reviewer' as const },
    { email: 'vitruvius@example.com', role: 'speaker' as const },
  ];

  it('requires the seeded organizer, reviewer, and speaker memberships together', () => {
    expect(hasDemoEntryMemberships(complete)).toBe(true);
    expect(hasDemoEntryMemberships(complete.slice(0, 2))).toBe(false);
    expect(hasDemoEntryMemberships([])).toBe(false);
  });

  it('does not mistake the right identities in the wrong roles for the seeded demo', () => {
    expect(
      hasDemoEntryMemberships([
        { email: 'organizer@example.com', role: 'speaker' },
        { email: 'reviewer.cicero@example.com', role: 'organizer' },
        { email: 'vitruvius@example.com', role: 'reviewer' },
      ]),
    ).toBe(false);
  });
});
