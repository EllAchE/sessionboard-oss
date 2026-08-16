import { describe, expect, it } from 'vitest';
import { profileGapSummary } from './format';

describe('profileGapSummary', () => {
  it('uses complete, singular, and plural profile copy', () => {
    expect(profileGapSummary(0)).toBe('Your profile is complete');
    expect(profileGapSummary(1)).toBe('1 thing left');
    expect(profileGapSummary(2)).toBe('2 things left');
  });
});
