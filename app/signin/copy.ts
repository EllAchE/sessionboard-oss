export type AuthIntent = 'sign-in' | 'sign-up';

type DeliveryState = 'email' | 'logged' | 'failed';

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
      delivery === 'failed'
        ? 'The mail provider could not deliver to that address on this demo. Use the link above to continue.'
        : 'Email delivery is disabled on this demo. Use the link above to continue.',
  };
}
