import { describe, expect, it } from 'vitest';

import { CPU_LIMIT_MARKER, classify, parseArgs, percentile, summarise } from './benchmark-stats';

describe('classify', () => {
  it('keeps the Workers CPU-cap failure out of the general error bucket', () => {
    expect(classify(503, 'Service Unavailable')).toBe('cpu-limit');
    expect(classify(500, `Worker exceeded CPU. ${CPU_LIMIT_MARKER}`)).toBe('cpu-limit');
  });

  it('does not read the 1102 marker out of a successful body', () => {
    // A page that happens to document the failure mode must not be counted as the failure mode.
    expect(classify(200, `we document ${CPU_LIMIT_MARKER} in the README`)).toBeNull();
  });

  it('separates ordinary server and client failures', () => {
    expect(classify(500, 'boom')).toBe('server-error');
    expect(classify(404, 'not found')).toBe('client-error');
    expect(classify(200, 'ok')).toBeNull();
    expect(classify(302, '')).toBeNull();
  });
});

describe('percentile', () => {
  const sorted = Array.from({ length: 100 }, (_, index) => index + 1);

  it('uses nearest-rank on a sorted sample', () => {
    expect(percentile(sorted, 0.5)).toBe(50);
    expect(percentile(sorted, 0.95)).toBe(95);
    expect(percentile(sorted, 0.99)).toBe(99);
  });

  it('never indexes past the end', () => {
    expect(percentile(sorted, 1)).toBe(100);
    expect(percentile([7], 0.99)).toBe(7);
  });

  it('reports NaN rather than a number it does not have', () => {
    expect(percentile([], 0.5)).toBeNaN();
  });
});

describe('summarise', () => {
  it('sorts before measuring, so input order cannot change the answer', () => {
    const summary = summarise([9, 1, 5, 3, 7]);
    expect(summary.min).toBe(1);
    expect(summary.max).toBe(9);
    expect(summary.p50).toBe(5);
    expect(summary.mean).toBe(5);
  });

  it('handles an empty sample without throwing', () => {
    const summary = summarise([]);
    expect(summary.min).toBeNaN();
    expect(summary.p99).toBeNaN();
  });
});

describe('parseArgs', () => {
  it('reads flags, values, and values containing an equals sign', () => {
    const parsed = parseArgs(['--requests=200', '--json', '--target=http://h/?a=b']);
    expect(parsed.get('requests')).toBe('200');
    expect(parsed.get('json')).toBe('true');
    expect(parsed.get('target')).toBe('http://h/?a=b');
  });

  it('ignores positional arguments', () => {
    expect(parseArgs(['bench', '--concurrency=4']).has('bench')).toBe(false);
  });
});
