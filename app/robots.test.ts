import { describe, expect, it } from 'vitest';
import robots from './robots';

const { allow, disallow } = (() => {
  const { rules } = robots();
  const rule = Array.isArray(rules) ? rules[0] : rules;
  return { allow: [rule.allow ?? []].flat(), disallow: [rule.disallow ?? []].flat() };
})();

/**
 * Robots patterns are prefixes, `*` stands in for any run of characters, and a trailing `$` ends
 * the match. Reimplemented here rather than asserting on the strings, because the whole risk in
 * this file is a pattern that reads right and matches wrong.
 */
function matches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const expression = body.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${expression}${anchored ? '$' : ''}`).test(path);
}

const blocked = (path: string) => disallow.some((pattern) => matches(pattern, path));

describe('robots.txt', () => {
  it('closes every signed-in, magic-linked and internal surface', () => {
    for (const path of [
      '/admin/agenda',
      '/auth/verify',
      '/crm/pipeline',
      '/dashboard',
      '/events/new',
      '/organizer',
      '/portal/demo/tasks',
      '/review/abc123',
      '/signin',
      '/signup',
      '/kitchen-sink',
      '/db-probe',
      '/api/mail',
    ]) {
      expect(blocked(path), path).toBe(true);
    }
  });

  it('closes the bare route as well as its subtree', () => {
    for (const path of ['/admin', '/portal', '/review', '/crm', '/signin', '/api']) {
      expect(blocked(path), path).toBe(true);
    }
  });

  it('does not swallow an event whose slug merely starts like a route name', () => {
    // Nothing reserves a slug against a route name, and published events live at the root.
    for (const path of ['/review-2026', '/dashboard-summit', '/adminsummit', '/events-2026']) {
      expect(blocked(path), path).toBe(false);
    }
  });

  it('leaves the public programme and the open call for speakers crawlable', () => {
    expect(allow).toContain('/');
    for (const path of [
      '/',
      '/demo',
      '/demo/agenda',
      '/demo/sessions',
      '/demo/speakers/marcus-tullius',
      '/demo/gallery',
      '/submit/demo/speak',
    ]) {
      expect(blocked(path), path).toBe(false);
    }
  });

  it('closes the mid-flow steps of a submission, which are dead ends in a search result', () => {
    expect(blocked('/submit/demo/speak/upload')).toBe(true);
    expect(blocked('/submit/demo/speak/done')).toBe(true);
  });

  it('does not disallow /embed, which relies on its own noindex to stay out of the index', () => {
    expect(blocked('/embed/demo/agenda')).toBe(false);
  });

  it('reopens the OpenAPI description inside the closed /api tree', () => {
    expect(blocked('/api/v1/events/demo/agenda')).toBe(true);
    // Only useful if the exception is the more specific of the two matching rules.
    const exception = allow.find((rule) => rule.startsWith('/api/'));
    expect(exception).toBe('/api/v1/openapi.json');
    expect((exception ?? '').length).toBeGreaterThan('/api/'.length);
  });
});
