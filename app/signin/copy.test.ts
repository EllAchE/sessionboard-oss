import { describe, expect, it } from 'vitest';
import { authCopy, deliveryCopy } from './copy';

describe('authentication copy', () => {
  it('presents account creation as a distinct flow', () => {
    expect(authCopy('sign-up')).toMatchObject({
      title: 'Create your Cicero account',
      submit: 'Create my account',
      switchHref: '/signin',
    });
  });

  it('directs log-transport users to the on-page link', () => {
    expect(deliveryCopy('sign-up', 'logged', 'new@example.com')).toEqual({
      lead: 'Your account is ready.',
      hint: 'Email delivery is disabled on this demo. Use the link above to continue.',
    });
  });

  it('explains why a seeded demo identity gets its link on screen', () => {
    expect(deliveryCopy('sign-in', 'demo', 'organizer@example.com')).toEqual({
      lead: 'Your secure sign-in link is ready.',
      hint: 'This is a seeded demo account, at a reserved domain with no inbox behind it. Use the link above to continue.',
    });
  });

  it('only tells users to check email when a message was delivered', () => {
    expect(deliveryCopy('sign-in', 'email', 'person@example.com')).toEqual({
      lead: 'Check person@example.com for your sign-in link.',
      hint: null,
    });
  });
});
