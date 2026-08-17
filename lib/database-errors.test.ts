import { describe, expect, it } from 'vitest';
import { isDatabaseUnavailableError } from './database-errors';

/** Shaped like what drizzle rethrows: its own message, the driver error on `cause`. */
function wrapped(cause: unknown): Error {
  return Object.assign(new Error('Failed query: select 1'), { cause });
}

describe('isDatabaseUnavailableError', () => {
  it('recognises a refused or unreachable socket through the cause chain', () => {
    expect(isDatabaseUnavailableError(wrapped(Object.assign(new Error('connect'), { code: 'ECONNREFUSED' })))).toBe(true);
    expect(isDatabaseUnavailableError(wrapped(Object.assign(new Error('connect'), { code: 'ETIMEDOUT' })))).toBe(true);
  });

  it('recognises the pool messages that carry no code at all', () => {
    expect(isDatabaseUnavailableError(wrapped(new Error('Connection terminated due to connection timeout')))).toBe(true);
    expect(isDatabaseUnavailableError(wrapped(new Error('timeout exceeded when trying to connect')))).toBe(true);
  });

  it('recognises the server shedding work', () => {
    // 57014 is what `statement_timeout` raises; 53300 is the connection limit.
    expect(isDatabaseUnavailableError(Object.assign(new Error('canceling statement'), { code: '57014' }))).toBe(true);
    expect(isDatabaseUnavailableError(Object.assign(new Error('sorry, too many clients'), { code: '53300' }))).toBe(true);
  });

  it('does not claim a genuine query defect is an outage', () => {
    // 42703 is undefined_column — a bug, and it must keep reporting as one.
    expect(isDatabaseUnavailableError(Object.assign(new Error('column does not exist'), { code: '42703' }))).toBe(false);
    expect(isDatabaseUnavailableError(new Error('Cannot read properties of undefined'))).toBe(false);
    expect(isDatabaseUnavailableError(undefined)).toBe(false);
    expect(isDatabaseUnavailableError('a string')).toBe(false);
  });

  it('terminates on a self-referential cause chain', () => {
    const looping: { cause?: unknown; message: string } = { message: 'boom' };
    looping.cause = looping;

    expect(isDatabaseUnavailableError(looping)).toBe(false);
  });
});
