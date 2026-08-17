import { describe, expect, it } from 'vitest';
import { authCopy, deliveryCopy } from './copy';

describe('authentication copy', () => {
  it('presents account creation as a distinct flow, and names the job it starts', () => {
    expect(authCopy('sign-up')).toMatchObject({
      title: 'Start an event on Cicero',
      submit: 'Create my account',
      switchHref: '/signin',
    });
  });

  /**
   * Sign-up is the organizer's door: `inviteReviewer` and the speaker paths create the account and
   * mail a link themselves, so an invitation already is an account. A title that said only "create
   * an account" left the invited speaker to discover on the next screen that the product had
   * assumed they run the conference.
   */
  it('tells an invited speaker or reviewer on sign-up that they can skip it', () => {
    const { note } = authCopy('sign-up');
    expect(note).toContain('invite link is your account');
    expect(authCopy('sign-in').note).toBeNull();
  });

  it('does not explain the log transport', () => {
    expect(deliveryCopy('sign-up', 'logged', 'new@example.com')).toEqual({
      lead: 'Your account is ready.',
      hint: null,
    });
  });

  it('does not explain seeded demo delivery', () => {
    expect(deliveryCopy('sign-in', 'demo', 'organizer@example.com')).toEqual({
      lead: 'Your secure sign-in link is ready.',
      hint: null,
    });
  });

  it('only tells users to check email when a message was delivered', () => {
    expect(deliveryCopy('sign-in', 'email', 'person@example.com')).toEqual({
      lead: 'Check person@example.com for your sign-in link.',
      hint: null,
    });
  });
});
