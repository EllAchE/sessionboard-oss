import { describe, expect, it } from 'vitest';
import { deadlinePatch, eventWriteSchemas, pickDefaultEvent } from './events';

const TODAY = new Date('2026-08-12T00:00:00Z');

/**
 * `E-1`, `E-2`. There was no validation on this path at all before — the create form enforced
 * nothing and the settings action carried one date comparison that a blank value skipped — so these
 * cover the rules themselves rather than the database call that follows them.
 */

const WINDOW = { startsAt: '2026-10-12T09:00', endsAt: '2026-10-13T17:00' };

function created(patch: Record<string, unknown> = {}) {
  return eventWriteSchemas.create.safeParse({ name: 'Cascadia', ...WINDOW, ...patch });
}

function issueOn(result: ReturnType<typeof created>, field: string): boolean {
  return !result.success && result.error.issues.some((issue) => issue.path[0] === field);
}

describe('the event write schema', () => {
  it('accepts the minimum an event needs', () => {
    const result = created();
    expect(result.success).toBe(true);
    expect(result.success && result.data.timezone).toBe('America/Los_Angeles');
  });

  it('requires a name that is more than whitespace', () => {
    expect(issueOn(created({ name: '   ' }), 'name')).toBe(true);
    expect(created({ name: 'x'.repeat(201) }).success).toBe(false);
  });

  it('requires a start and an end, with a time of day on each', () => {
    expect(issueOn(created({ startsAt: undefined }), 'startsAt')).toBe(true);
    expect(issueOn(created({ endsAt: undefined }), 'endsAt')).toBe(true);
    expect(issueOn(created({ startsAt: '' }), 'startsAt')).toBe(true);
    expect(issueOn(created({ startsAt: '2026-10-12' }), 'startsAt')).toBe(true);
  });

  it('holds the timezone to a real IANA zone', () => {
    expect(created({ timezone: 'Europe/Rome' }).success).toBe(true);
    expect(issueOn(created({ timezone: 'Pacific Time' }), 'timezone')).toBe(true);
    expect(issueOn(created({ timezone: '' }), 'timezone')).toBe(true);
  });

  it('completes a website address and refuses one that is not a web address', () => {
    const bare = created({ websiteUrl: 'example.com' });
    expect(bare.success && bare.data.websiteUrl).toBe('https://example.com');

    const full = created({ websiteUrl: 'http://example.com/cfp' });
    expect(full.success && full.data.websiteUrl).toBe('http://example.com/cfp');

    expect(issueOn(created({ websiteUrl: 'javascript:alert(1)' }), 'websiteUrl')).toBe(true);
    expect(issueOn(created({ websiteUrl: 'mailto:hi@example.com' }), 'websiteUrl')).toBe(true);
  });

  it('trims optional metadata and stores a blank as null', () => {
    const result = created({
      tagline: '  Two days  ',
      eventType: '',
      venueName: '  Pier 27 ',
      theme: '   ',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.tagline).toBe('Two days');
    expect(result.data.venueName).toBe('Pier 27');
    expect(result.data.eventType).toBeNull();
    expect(result.data.theme).toBeNull();
  });

  it('refuses a branding reference that is not a file id', () => {
    expect(created({ logoFileId: 'not-a-uuid' }).success).toBe(false);
    expect(created({ logoFileId: null }).success).toBe(true);
    expect(created({ bannerFileId: '3f1c9f4e-2f6a-4b7c-9c1d-8a2b6e5d4c3b' }).success).toBe(true);
  });

  it('lets an update send one field without the others', () => {
    const result = eventWriteSchemas.update.safeParse({ venueName: 'Curia Julia' });
    expect(result.success).toBe(true);
    expect(result.success && result.data.name).toBeUndefined();
    expect(result.success && result.data.startsAt).toBeUndefined();
  });

  it('applies the same rules to an update as to a create', () => {
    expect(eventWriteSchemas.update.safeParse({ timezone: 'Pacific Time' }).success).toBe(false);
    expect(eventWriteSchemas.update.safeParse({ name: '  ' }).success).toBe(false);
    expect(eventWriteSchemas.update.safeParse({ startsAt: '2026-10-12' }).success).toBe(false);
  });
});

/**
 * `AR-44`. The milestones are informative, so almost the only thing that can go wrong with them is
 * getting written in the wrong timezone or being impossible to take back off once set.
 */
describe('the event deadlines', () => {
  it('reads a blank deadline as clearing it rather than as an error', () => {
    for (const blank of ['', '   ', null]) {
      const result = created({ speakerDeadlineAt: blank });
      expect(result.success).toBe(true);
      expect(result.success && result.data.speakerDeadlineAt).toBeNull();
    }
  });

  it('holds a deadline to a date and a time of day', () => {
    expect(issueOn(created({ agendaDeadlineAt: '2026-10-01' }), 'agendaDeadlineAt')).toBe(true);
    expect(created({ agendaDeadlineAt: '2026-10-01T17:00' }).success).toBe(true);
  });

  it('leaves both out of an update that did not mention them', () => {
    const result = eventWriteSchemas.update.safeParse({ venueName: 'Curia Julia' });
    expect(result.success && result.data.speakerDeadlineAt).toBeUndefined();
    expect(result.success && result.data.agendaDeadlineAt).toBeUndefined();
  });

  const STARTS_AT = new Date('2026-10-12T16:00:00Z'); // 09:00 in Los Angeles

  it('reads the wall clock in the event timezone, not the machine one', () => {
    const patch = deadlinePatch(
      { speakerDeadlineAt: '2026-09-12T17:00' },
      'America/Los_Angeles',
      STARTS_AT,
    );
    expect((patch.speakerDeadlineAt as Date).toISOString()).toBe('2026-09-13T00:00:00.000Z');

    const rome = deadlinePatch({ speakerDeadlineAt: '2026-09-12T17:00' }, 'Europe/Rome', STARTS_AT);
    expect((rome.speakerDeadlineAt as Date).toISOString()).toBe('2026-09-12T15:00:00.000Z');
  });

  it('writes only the milestones the caller actually sent', () => {
    const patch = deadlinePatch({ agendaDeadlineAt: null }, 'America/Los_Angeles', STARTS_AT);
    expect(patch).toEqual({ agendaDeadlineAt: null });
    expect(deadlinePatch({}, 'America/Los_Angeles', STARTS_AT)).toEqual({});
  });

  it('refuses a milestone that falls after the doors open', () => {
    expect(() =>
      deadlinePatch({ agendaDeadlineAt: '2026-10-13T09:00' }, 'America/Los_Angeles', STARTS_AT),
    ).toThrow(/after the event starts/);

    // The moment the event starts is still a legitimate deadline; only past it is a slip.
    expect(() =>
      deadlinePatch({ agendaDeadlineAt: '2026-10-12T09:00' }, 'America/Los_Angeles', STARTS_AT),
    ).not.toThrow();
  });

  it('does not order the two against each other', () => {
    expect(() =>
      deadlinePatch(
        { speakerDeadlineAt: '2026-10-01T17:00', agendaDeadlineAt: '2026-09-01T17:00' },
        'America/Los_Angeles',
        STARTS_AT,
      ),
    ).not.toThrow();
  });
});

describe('pickDefaultEvent', () => {
  it('opens on the soonest event that has not started yet', () => {
    const events = [
      { slug: 'far', startsOn: '2027-05-12' },
      { slug: 'soon', startsOn: '2026-09-23' },
      { slug: 'done', startsOn: '2026-01-04' },
    ];
    expect(pickDefaultEvent(events, TODAY)?.slug).toBe('soon');
  });

  it('counts an event starting today as upcoming', () => {
    const events = [
      { slug: 'later', startsOn: '2026-09-23' },
      { slug: 'today', startsOn: '2026-08-12' },
    ];
    expect(pickDefaultEvent(events, TODAY)?.slug).toBe('today');
  });

  it('falls back to the most recent past event when everything is over', () => {
    const events = [
      { slug: 'old', startsOn: '2024-03-01' },
      { slug: 'recent', startsOn: '2026-06-30' },
    ];
    expect(pickDefaultEvent(events, TODAY)?.slug).toBe('recent');
  });

  it('prefers a dated event over an undated one', () => {
    const events = [{ slug: 'undated', startsOn: null }, { slug: 'dated', startsOn: '2026-09-23' }];
    expect(pickDefaultEvent(events, TODAY)?.slug).toBe('dated');
  });

  it('keeps the caller ordering when nothing has dates', () => {
    const events = [{ slug: 'newest', startsOn: null }, { slug: 'older', startsOn: null }];
    expect(pickDefaultEvent(events, TODAY)?.slug).toBe('newest');
  });

  it('has nothing to open for someone with no events', () => {
    expect(pickDefaultEvent([], TODAY)).toBeUndefined();
  });
});
