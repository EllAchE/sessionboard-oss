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

function specificity(pattern: string): number {
  return pattern.replace(/\*|\$$/g, '').length;
}

/** Longest matching rule wins; Allow wins a tie, as major crawlers implement robots.txt. */
function blocked(path: string): boolean {
  return [
    ...allow.map((pattern) => ({ pattern, blocked: false })),
    ...disallow.map((pattern) => ({ pattern, blocked: true })),
  ]
    .filter((rule) => matches(rule.pattern, path))
    .sort(
      (left, right) =>
        specificity(right.pattern) - specificity(left.pattern) ||
        Number(left.blocked) - Number(right.blocked),
    )[0]?.blocked ?? false;
}

describe('robots.txt', () => {
  it('closes every private root without swallowing similarly named event slugs', () => {
    for (const root of [
      '/admin',
      '/organizer',
      '/auth',
      '/crm',
      '/dashboard',
      '/events',
      '/portal',
      '/review',
      '/signin',
      '/signup',
    ]) {
      expect(blocked(root), root).toBe(true);
      expect(blocked(`${root}/example`), `${root}/example`).toBe(true);
      expect(blocked(`${root}-summit`), `${root}-summit`).toBe(false);
    }
  });

  it('closes every internal development route', () => {
    for (const root of [
      '/db-probe',
      '/kitchen-sink',
      '/logo-lab',
      '/roman-assets',
      '/roman-headshots',
    ]) {
      expect(blocked(root), root).toBe(true);
      expect(blocked(`${root}/example`), `${root}/example`).toBe(true);
      expect(blocked(`${root}-summit`), `${root}-summit`).toBe(false);
    }
  });

  it('leaves the public programme and the open call for speakers crawlable', () => {
    for (const path of [
      '/',
      '/demo',
      '/demo/agenda',
      '/demo/sessions',
      '/demo/speakers/marcus-tullius',
      '/demo/gallery',
      '/submit/demo/speak',
      '/unsubscribe/demo',
    ]) {
      expect(blocked(path), path).toBe(false);
    }
  });

  it('leaves both the site-wide and the per-event llms.txt fetchable', () => {
    expect(blocked('/llms.txt')).toBe(false);
    expect(blocked('/demo/llms.txt')).toBe(false);
    /** A slug that collides with a private route stays closed, its llms.txt included. */
    expect(blocked('/review/llms.txt')).toBe(true);
  });

  it('closes the mid-flow steps of a submission, which are dead ends in a search result', () => {
    expect(blocked('/submit/demo/speak/upload')).toBe(true);
    expect(blocked('/submit/demo/speak/done')).toBe(true);
  });

  it('does not disallow /embed, which relies on its own noindex to stay out of the index', () => {
    expect(blocked('/embed/demo/agenda')).toBe(false);
  });

  it('reopens generated documentation inside the closed API tree', () => {
    expect(blocked('/api')).toBe(true);
    expect(blocked('/api/v1/events/demo/agenda')).toBe(true);
    expect(blocked('/api/v1/events/demo/mcp')).toBe(true);
    expect(blocked('/api/v1/openapi.json')).toBe(false);
    expect(blocked('/api/v1/mcp-tools.json')).toBe(false);
    expect(allow).toEqual(['/api/v1/openapi.json', '/api/v1/mcp-tools.json']);
  });

  it('does not advertise a sitemap until one exists', () => {
    expect(robots()).not.toHaveProperty('sitemap');
  });
});
