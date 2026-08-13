export type AuthIntent = 'sign-in' | 'sign-up';

/**
 * `email` — the message left the instance, and the link is only inside it.
 * `logged` — this instance delivers nothing to anybody, so the link comes back on the page.
 * `demo` — real mail is live, and this is a seeded demo identity with no inbox to send it to.
 */
export type DeliveryState = 'email' | 'logged' | 'demo';

const COPY = {
  'sign-in': {
    title: 'Sign in to Cicero',
    description:
      'We email you a link. Organizers, reviewers and speakers all sign in the same way, and none of them have a password to forget.',
    submit: 'Email me a link',
    switchPrompt: 'New to Cicero?',
    switchLabel: 'Create an account',
    switchHref: '/signup',
    linkLabel: 'Open your sign-in link',
  },
  'sign-up': {
    title: 'Create your Cicero account',
    description:
      'Enter your email address. We will create your account and give you a secure link to continue — no password needed.',
    submit: 'Create my account',
    switchPrompt: 'Already have an account?',
    switchLabel: 'Sign in',
    switchHref: '/signin',
    linkLabel: 'Continue to Cicero',
  },
} as const;

export function authCopy(intent: AuthIntent) {
  return COPY[intent];
}

export function deliveryCopy(intent: AuthIntent, delivery: DeliveryState, email: string) {
  if (delivery === 'email') {
    return {
      lead: `Check ${email} for your sign-in link.`,
      hint: null,
    };
  }

  return {
    lead: intent === 'sign-up' ? 'Your account is ready.' : 'Your secure sign-in link is ready.',
    hint:
      delivery === 'demo'
        ? 'This is a seeded demo account, at a reserved domain with no inbox behind it. Use the link above to continue.'
        : 'Email delivery is disabled on this demo. Use the link above to continue.',
  };
}
