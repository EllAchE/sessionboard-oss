export type OnboardingPersona = 'organizer' | 'speaker' | 'attendee';

/**
 * Version the key with the tour content. A future material rewrite can deliberately show once
 * again by incrementing this value without turning a per-tab preference into durable account data.
 */
const ONBOARDING_VERSION = 1;

export function onboardingStorageKey(persona: OnboardingPersona): string {
  return `cicero:onboarding:v${ONBOARDING_VERSION}:${persona}`;
}
