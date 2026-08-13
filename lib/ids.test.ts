import { describe, expect, it } from 'vitest';
import { hashToken, timingSafeEqual } from './ids';

describe('timingSafeEqual', () => {
  it('accepts only an exact match', () => {
    expect(timingSafeEqual('correct-horse', 'correct-horse')).toBe(true);
    expect(timingSafeEqual('correct-horse', 'correct-horsf')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
  });

  it('compares the whole string rather than stopping at the first difference', () => {
    // Both wrong in one position, first and last. Neither may be treated as "closer".
    expect(timingSafeEqual('abcdef', 'zbcdef')).toBe(false);
    expect(timingSafeEqual('abcdef', 'abcdez')).toBe(false);
  });

  it('returns false for a length mismatch instead of throwing', () => {
    expect(timingSafeEqual('short', 'considerably-longer')).toBe(false);
    expect(timingSafeEqual('prefix-of-the-secret', 'prefix-of-the-secret-and-more')).toBe(false);
    expect(timingSafeEqual('secret', '')).toBe(false);
  });

  it('is length-blind once both sides are hashed, which is how callers should use it', async () => {
    const [a, b] = await Promise.all([hashToken('x'), hashToken('a much longer secret')]);
    expect(a).toHaveLength(64);
    expect(b).toHaveLength(64);
    expect(timingSafeEqual(a, b)).toBe(false);
    expect(timingSafeEqual(a, await hashToken('x'))).toBe(true);
  });
});
