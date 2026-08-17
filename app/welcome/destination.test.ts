import { describe, expect, it } from 'vitest';
import { welcomeDestination } from './destination';

describe('welcomeDestination', () => {
  it('holds a membershipless account here rather than sending it to the event form', () => {
    expect(welcomeDestination([])).toBeNull();
  });

  it('sends each single role to its own surface', () => {
    expect(welcomeDestination([{ roles: ['organizer'] }])).toBe('/organizer');
    expect(welcomeDestination([{ roles: ['reviewer'] }])).toBe('/review');
    expect(welcomeDestination([{ roles: ['speaker'] }])).toBe('/portal');
  });

  /**
   * The precedence `app/organizer/layout.tsx` already applies. A speaker who also reviews is a
   * supported state rather than a conflict, so the tie is broken by the widest surface the account
   * can actually open, not by refusing to choose.
   */
  it('prefers the widest surface when one account holds several roles', () => {
    expect(welcomeDestination([{ roles: ['speaker', 'reviewer'] }])).toBe('/review');
    expect(welcomeDestination([{ roles: ['speaker', 'reviewer', 'organizer'] }])).toBe('/organizer');
  });

  it('reads roles across every event, not just the first', () => {
    expect(
      welcomeDestination([{ roles: ['speaker'] }, { roles: ['organizer'] }]),
    ).toBe('/organizer');
  });

  /** An event row carrying no roles cannot promote anybody. */
  it('ignores an event with no roles on it', () => {
    expect(welcomeDestination([{ roles: [] }])).toBeNull();
  });
});
