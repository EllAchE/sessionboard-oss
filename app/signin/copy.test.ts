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
