import { describe, expect, it } from 'vitest';

import {
  CPU_LIMIT_MARKER,
  classify,
  parseArgs,
  parseBsdCpuTime,
  percentile,
  summarise,
  sumProcessTreeCpuMs,
} from './benchmark-stats';

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

describe('parseBsdCpuTime', () => {
  it('reads mm:ss.ss, the common case for a short-lived dev server', () => {
    expect(parseBsdCpuTime('0:00.03')).toBeCloseTo(30, 5);
    expect(parseBsdCpuTime('1:02.50')).toBeCloseTo(62_500, 5);
  });

  it('does not roll large minutes over into an hours field', () => {
    // macOS `ps` prints `144:19.27` for a long-lived process, never `2:24:19.27`.
    expect(parseBsdCpuTime('144:19.27')).toBeCloseTo(8_659_270, 5);
  });

  it('reads an hh:mm:ss.ss field when one is present', () => {
    expect(parseBsdCpuTime('1:02:03.40')).toBeCloseTo((3_600 + 120 + 3.4) * 1000, 5);
  });

  it('reads a dd-hh:mm:ss days prefix', () => {
    expect(parseBsdCpuTime('2-01:00:00.00')).toBeCloseTo((2 * 86_400 + 3_600) * 1000, 5);
  });

  it('rejects anything that is not this shape', () => {
    expect(parseBsdCpuTime('')).toBeNull();
    expect(parseBsdCpuTime('not-a-time')).toBeNull();
    expect(parseBsdCpuTime('1:aa.50')).toBeNull();
  });
});

describe('sumProcessTreeCpuMs', () => {
  it('sums a root and every descendant, ignoring unrelated processes', () => {
    const table = new Map([
      [1, { ppid: 0, cpuMs: 100 }],
      [2, { ppid: 1, cpuMs: 50 }],
      [3, { ppid: 2, cpuMs: 25 }],
      [99, { ppid: 0, cpuMs: 1_000 }], // an unrelated process on the same host
    ]);
    expect(sumProcessTreeCpuMs([1], table)).toBe(175);
  });

  it('sums multiple independent roots without double-counting a shared child', () => {
    const table = new Map([
      [1, { ppid: 0, cpuMs: 10 }],
      [2, { ppid: 0, cpuMs: 20 }],
      [3, { ppid: 1, cpuMs: 5 }],
    ]);
    expect(sumProcessTreeCpuMs([1, 2], table)).toBe(35);
  });

  it('returns null when a named root has already exited', () => {
    const table = new Map([[1, { ppid: 0, cpuMs: 10 }]]);
    expect(sumProcessTreeCpuMs([1, 404], table)).toBeNull();
  });

  it('returns null for an empty root list', () => {
    expect(sumProcessTreeCpuMs([], new Map())).toBeNull();
  });
});
