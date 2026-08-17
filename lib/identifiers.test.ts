import { describe, expect, it } from 'vitest';
import { isQueryableSlug, isUuid } from './identifiers';

/** Spelled with char codes so the bytes under test survive a copy-paste through a review tool. */
const NUL = String.fromCharCode(0);
const BELL = String.fromCharCode(7);
const NEWLINE = String.fromCharCode(10);
const DELETE = String.fromCharCode(127);

describe('isUuid', () => {
  it('accepts a canonical uuid in either case', () => {
    expect(isUuid('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).toBe(true);
    expect(isUuid('3F2504E0-4F89-11D3-9A0C-0305E82C3301')).toBe(true);
  });

  it.each([
    ['a bare word', 'not-a-uuid'],
    ['an empty segment', ''],
    ['a truncated uuid', '3f2504e0-4f89-11d3-9a0c'],
    ['trailing content', '3f2504e0-4f89-11d3-9a0c-0305e82c3301x'],
    ['a leading newline', `${NEWLINE}3f2504e0-4f89-11d3-9a0c-0305e82c3301`],
    ['sql-shaped input', "1' OR '1'='1"],
  ])('rejects %s', (_label, value) => {
    expect(isUuid(value)).toBe(false);
  });
});

describe('isQueryableSlug', () => {
  it('accepts the slugs the product actually uses', () => {
    expect(isQueryableSlug('demo')).toBe(true);
    expect(isQueryableSlug('first-settlement-2026')).toBe(true);
  });

  it('rejects a null byte, which Postgres refuses inside a text comparison', () => {
    expect(isQueryableSlug(NUL)).toBe(false);
    expect(isQueryableSlug(`demo${NUL}`)).toBe(false);
  });

  it('rejects other control characters', () => {
    expect(isQueryableSlug(`demo${BELL}`)).toBe(false);
    expect(isQueryableSlug(`demo${NEWLINE}`)).toBe(false);
    expect(isQueryableSlug(`demo${DELETE}`)).toBe(false);
  });

  it('bounds the segment length', () => {
    expect(isQueryableSlug('')).toBe(false);
    expect(isQueryableSlug('x'.repeat(256))).toBe(true);
    expect(isQueryableSlug('x'.repeat(257))).toBe(false);
  });
});
