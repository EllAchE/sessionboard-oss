import { describe, expect, it } from 'vitest';
import { onboardingStorageKey } from './model';

describe('onboardingStorageKey', () => {
  it('keeps each role independent within a browser session', () => {
    expect(onboardingStorageKey('organizer')).not.toBe(onboardingStorageKey('speaker'));
    expect(onboardingStorageKey('speaker')).not.toBe(onboardingStorageKey('attendee'));
  });

  it('is versioned so a future tour can opt into showing again', () => {
    expect(onboardingStorageKey('organizer')).toBe('cicero:onboarding:v1:organizer');
  });
});
