export type AuthIntent = 'sign-in' | 'sign-up';

/**
 * `email` — the message left the instance, and the link is only inside it.
 * `logged` — this instance delivers nothing to anybody, so the link comes back on the page.
 * `demo` — real mail is live, and this is a seeded demo identity with no inbox to send it to.
 */
export type DeliveryState = 'email' | 'logged' | 'demo';

/**
 * `note` is the one line that keeps sign-up honest about who it is for. Everybody else in the
 * product arrives already provisioned: `inviteReviewer` and the speaker paths in `crm.ts`,
 * `portal.ts` and the public submit action all create the account themselves and mail a link
 * pointed at the surface that person actually uses. So an invitation is an account, and a speaker
 * who dutifully signs up first is doing work nobody asked for. Saying that here is cheaper than the
 * support thread it otherwise becomes.
 */
const COPY = {
  'sign-in': {
    title: 'Sign in to Cicero',
    description: 'We’ll email you a sign-in link.',
    submit: 'Email me a link',
    switchPrompt: 'New to Cicero?',
    switchLabel: 'Create an account',
    switchHref: '/signup',
    linkLabel: 'Open your sign-in link',
    note: null,
  },
  'sign-up': {
    title: 'Start an event on Cicero',
    description: 'Enter your email and we’ll send a sign-in link.',
    submit: 'Create my account',
    switchPrompt: 'Already have an account?',
    switchLabel: 'Sign in',
    switchHref: '/signin',
    linkLabel: 'Continue to Cicero',
    note: 'Invited to speak or review? Your invite link is your account, so you can skip this and open the link your organizer sent you.',
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
    hint: null,
  };
}
