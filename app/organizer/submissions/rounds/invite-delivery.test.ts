import { describe, expect, it } from 'vitest';
import { inviteDelivery, inviteDeliveryCopy } from './invite-delivery';

const reviewer = { name: 'Reviewer One', email: 'reviewer@acme.test' };

describe('inviteDelivery', () => {
  /**
   * The regression this file exists for. `!delivered` used to be an OR-arm on the link, which made
   * any bounce a session as whoever was typed into the invite box.
   */
  it('never turns a failed send into a visible link', () => {
    expect(inviteDelivery(null, false)).toBe('undelivered');
  });

  it('tells the organizer the message left when it left', () => {
    expect(inviteDelivery(null, true)).toBe('email');
  });

  it('shows the link on an instance that delivers nothing, whatever the send reported', () => {
    expect(inviteDelivery('instance-delivers-nothing', true)).toBe('logged');
    expect(inviteDelivery('instance-delivers-nothing', false)).toBe('logged');
  });

  it('shows the link for a seeded demo identity, whatever the send reported', () => {
    expect(inviteDelivery('seeded-demo-account', true)).toBe('demo');
    expect(inviteDelivery('seeded-demo-account', false)).toBe('demo');
  });
});

describe('inviteDeliveryCopy', () => {
  it('says delivery failed rather than pretending the invitation arrived', () => {
    const copy = inviteDeliveryCopy('undelivered', reviewer);
    expect(copy.message).toContain('did not go out');
    expect(copy.note).toContain('reviewer@acme.test');
    expect(copy.note).toContain('again');
  });

  it('keeps the plain sent case quiet', () => {
    expect(inviteDeliveryCopy('email', reviewer)).toEqual({
      message: 'Invitation sent to reviewer@acme.test.',
      note: null,
    });
  });

  it('explains why the link is on screen in each of the two cases that allow it', () => {
    expect(inviteDeliveryCopy('demo', reviewer).note).toContain('reserved domain');
    expect(inviteDeliveryCopy('logged', reviewer).note).toContain('Email delivery is disabled');
  });
});
