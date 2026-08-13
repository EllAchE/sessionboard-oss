export type AuthIntent = 'sign-in' | 'sign-up';

type DeliveryState = 'email' | 'logged' | 'failed';

const COPY = {
  'sign-in': {
    title: 'Enter Cicero',
    description:
      'We send a sealed link by courier. Magistrates, councillors, and orators all enter through the same gate—no password scroll to lose.',
    submit: 'Send my sealed link',
    switchPrompt: 'New to the Forum?',
    switchLabel: 'Join Cicero',
    switchHref: '/signup',
    linkLabel: 'Pass through the gate',
  },
  'sign-up': {
    title: 'Join the Cicero Forum',
    description:
      'Enter your email address. We will add your name to the rolls and send a sealed link—no password required.',
    submit: 'Add me to the rolls',
    switchPrompt: 'Already on the rolls?',
    switchLabel: 'Enter Cicero',
    switchHref: '/signin',
    linkLabel: 'Enter the Forum',
  },
} as const;

export function authCopy(intent: AuthIntent) {
  return COPY[intent];
}

export function deliveryCopy(intent: AuthIntent, delivery: DeliveryState, email: string) {
  if (delivery === 'email') {
    return {
      lead: `A sealed entry link is on its way to ${email}.`,
      hint: null,
    };
  }

  return {
    lead: intent === 'sign-up' ? 'Your name is on the rolls.' : 'Your sealed entry link is ready.',
    hint:
      delivery === 'failed'
        ? 'The courier could not reach that address in this demo. Use the link above to pass through the gate.'
        : 'Couriers are resting in this demo. Use the link above to pass through the gate.',
  };
}
