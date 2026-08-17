import { describe, expect, it } from 'vitest';
import { describeEventDeadlines } from './event-deadlines';

const NOW = new Date('2026-09-10T12:00:00Z');

function source(patch: Partial<Parameters<typeof describeEventDeadlines>[0]> = {}) {
  return {
    timezone: 'America/Los_Angeles',
    speakerDeadlineAt: null,
    agendaDeadlineAt: null,
    ...patch,
  };
}

describe('describeEventDeadlines', () => {
  it('says nothing about an event that tracks neither milestone', () => {
    expect(describeEventDeadlines(source(), NOW)).toEqual([]);
  });

  it('returns only the milestones that were set, in edition order', () => {
    const both = describeEventDeadlines(
      source({
        agendaDeadlineAt: new Date('2026-09-26T00:00:00Z'),
        speakerDeadlineAt: new Date('2026-09-12T00:00:00Z'),
      }),
      NOW,
    );
    expect(both.map((entry) => entry.key)).toEqual(['speakerDeadlineAt', 'agendaDeadlineAt']);

    const one = describeEventDeadlines(
      source({ agendaDeadlineAt: new Date('2026-09-26T00:00:00Z') }),
      NOW,
    );
    expect(one.map((entry) => entry.key)).toEqual(['agendaDeadlineAt']);
  });

  it('formats the date in the event timezone rather than the reader one', () => {
    const [entry] = describeEventDeadlines(
      source({ timezone: 'Europe/Rome', speakerDeadlineAt: new Date('2026-09-12T23:30:00Z') }),
      NOW,
    );
    // 23:30Z is already the 13th in Rome and still the 12th in Los Angeles.
    expect(entry.when).toContain('Sep 13');

    const [pacific] = describeEventDeadlines(
      source({ speakerDeadlineAt: new Date('2026-09-12T23:30:00Z') }),
      NOW,
    );
    expect(pacific.when).toContain('Sep 12');
  });

  it('phrases the distance in whole days either side of now', () => {
    const cases: [string, string][] = [
      ['2026-09-10T18:00:00Z', 'today'],
      ['2026-09-11T12:00:00Z', 'tomorrow'],
      ['2026-09-09T12:00:00Z', 'yesterday'],
      ['2026-09-07T12:00:00Z', '3 days ago'],
      ['2026-09-13T12:00:00Z', 'in 3 days'],
      ['2026-11-05T12:00:00Z', 'in 8 weeks'],
    ];
    for (const [at, expected] of cases) {
      const [entry] = describeEventDeadlines(source({ speakerDeadlineAt: new Date(at) }), NOW);
      expect(entry.relative).toBe(expected);
    }
  });

  it('marks a milestone that has gone by without treating it as a failure', () => {
    const [past] = describeEventDeadlines(
      source({ speakerDeadlineAt: new Date('2026-09-01T00:00:00Z') }),
      NOW,
    );
    expect(past.passed).toBe(true);

    const [ahead] = describeEventDeadlines(
      source({ speakerDeadlineAt: new Date('2026-09-30T00:00:00Z') }),
      NOW,
    );
    expect(ahead.passed).toBe(false);
  });
});
