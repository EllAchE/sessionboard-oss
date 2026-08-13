import { describe, expect, it } from 'vitest';
import { authCopy, deliveryCopy } from './copy';

describe('authentication copy', () => {
  it('presents account creation as a distinct flow', () => {
    expect(authCopy('sign-up')).toMatchObject({
      title: 'Join the Cicero Forum',
      submit: 'Add me to the rolls',
      switchHref: '/signin',
    });
  });

  it('directs log-transport users to the on-page link', () => {
    expect(deliveryCopy('sign-up', 'logged', 'new@example.com')).toEqual({
      lead: 'Your name is on the rolls.',
      hint: 'Couriers are resting in this demo. Use the link above to pass through the gate.',
    });
  });

  it('only tells users to check email when a message was delivered', () => {
    expect(deliveryCopy('sign-in', 'email', 'person@example.com')).toEqual({
      lead: 'A sealed entry link is on its way to person@example.com.',
      hint: null,
    });
  });
});
