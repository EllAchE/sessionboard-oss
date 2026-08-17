import { describe, expect, it, vi } from 'vitest';

/**
 * Separate from `demo-availability.test.ts` because this one has to mock the database away, and the
 * pure membership assertions next door are better off without a mock in scope.
 */

vi.mock('@/db/client', () => ({
  getDb: () => {
    throw new Error('connection terminated unexpectedly');
  },
}));

// `cache` memoises per request; there is no request here, and identity is the behaviour under test.
vi.mock('react', async (importOriginal) => ({
  ...(await importOriginal<typeof import('react')>()),
  cache: <T,>(fn: T) => fn,
}));

import { demoEntryPointsAreAvailable } from './demo-availability';

describe('demo entry-point availability when the database is unreachable', () => {
  it('hides the links instead of throwing', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    // The global footer calls this on every page, including `/` and the 404. A throw here would
    // turn a database outage into a 500 on pages that need no database at all.
    await expect(demoEntryPointsAreAvailable()).resolves.toBe(false);
    expect(error).toHaveBeenCalled();
  });
});
