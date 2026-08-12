import { describe, expect, it } from 'vitest';
import { pickDefaultEvent } from './events';

const TODAY = new Date('2026-08-12T00:00:00Z');

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
