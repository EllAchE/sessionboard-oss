import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sessionCalendarDownload } = vi.hoisted(() => ({ sessionCalendarDownload: vi.fn() }));

vi.mock('@/lib/services/comms', () => ({ sessionCalendarDownload }));

import { GET } from './route';

const request = new Request('https://example.test/api/calendar/x');
const call = (sessionId: string) => GET(request, { params: Promise.resolve({ sessionId }) });

describe('calendar download resilience', () => {
  beforeEach(() => {
    sessionCalendarDownload.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('answers 404 for a segment that cannot be a session id, without touching the database', async () => {
    const response = await call('not-a-uuid');

    expect(response.status).toBe(404);
    // The point of the guard: a `uuid` column would reject this at the driver, and that throw would
    // leave the handler as a 500.
    expect(sessionCalendarDownload).not.toHaveBeenCalled();
  });

  it('answers 404 when a well-formed id has no confirmed time', async () => {
    sessionCalendarDownload.mockResolvedValue(null);

    expect((await call('3f2504e0-4f89-11d3-9a0c-0305e82c3301')).status).toBe(404);
  });

  it('degrades to a retryable 503 when the lookup fails', async () => {
    sessionCalendarDownload.mockRejectedValue(new Error('connection terminated'));

    const response = await call('3f2504e0-4f89-11d3-9a0c-0305e82c3301');

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('30');
  });

  it('serves the calendar body for a session that has one', async () => {
    sessionCalendarDownload.mockResolvedValue({ body: 'BEGIN:VCALENDAR', filename: 'talk.ics' });

    const response = await call('3f2504e0-4f89-11d3-9a0c-0305e82c3301');

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/calendar');
    expect(await response.text()).toBe('BEGIN:VCALENDAR');
  });
});
