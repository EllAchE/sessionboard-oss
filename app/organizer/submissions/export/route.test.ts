import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forbidden } from '../../../../lib/errors';

/**
 * `ABS-13`. The headers are the contract between the export and the browser: without
 * `content-disposition` the CSV renders as text in a tab instead of landing in the downloads
 * folder, and the filename inside it is what the organizer is told to look for. None of that was
 * asserted anywhere before this file.
 */

const state = vi.hoisted(() => ({
  build: null as unknown as (ctx: unknown, roundId: string) => Promise<unknown>,
  context: null as unknown as () => Promise<unknown>,
}));

vi.mock('../../../../lib/services/review', () => ({
  buildReviewResultsExport: (ctx: unknown, roundId: string) => state.build(ctx, roundId),
}));

vi.mock('../context', () => ({
  decideContext: () => state.context(),
}));

const { GET } = await import('./route');

const ctx = { actor: { userId: 'organizer-1' }, eventId: 'event-1', roles: ['organizer'] };

beforeEach(() => {
  state.context = async () => ctx;
  state.build = async () => ({
    csv: 'Submission ref,Title\nABS-1,Scaling CI\n',
    filename: 'cicero-forum-initial-review-reviews-2026-08-17.csv',
  });
});

describe('GET /organizer/submissions/export', () => {
  it('sends the CSV as a named attachment the browser will download', async () => {
    const response = await GET(
      new Request('https://cicero.test/organizer/submissions/export?round=round-1'),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(response.headers.get('content-disposition')).toBe(
      'attachment; filename="cicero-forum-initial-review-reviews-2026-08-17.csv"',
    );
    // A results export is a snapshot of a moving round; a cached copy would be a stale decision record.
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('Submission ref,Title\nABS-1,Scaling CI\n');
  });

  it('passes the requested round through to the export', async () => {
    const build = vi.fn(async () => ({ csv: '', filename: 'x.csv' }));
    state.build = build;

    await GET(new Request('https://cicero.test/organizer/submissions/export?round=round-9'));

    expect(build).toHaveBeenCalledWith(ctx, 'round-9');
  });

  it('refuses without a round instead of guessing one', async () => {
    const response = await GET(new Request('https://cicero.test/organizer/submissions/export'));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ message: 'Choose a review round to export' });
  });

  /**
   * The client turns this body into the visible failure state, so the message has to survive the
   * trip. A bare status would put the organizer back to a click with no explanation.
   */
  it('reports a refusal as JSON the export control can read back', async () => {
    state.context = async () => {
      throw forbidden('This action needs the submission:decide permission');
    };

    const response = await GET(
      new Request('https://cicero.test/organizer/submissions/export?round=round-1'),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({
      code: 'forbidden',
      message: 'This action needs the submission:decide permission',
    });
  });
});
