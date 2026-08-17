import { describe, expect, it } from 'vitest';
import {
  isSentFilter,
  mergeSent,
  parseSentKey,
  sentKey,
  statusTone,
  type SentMessage,
} from './messages';

function row(key: string, at: string): SentMessage {
  const [channel, id] = key.split(':');
  return {
    key,
    channel: channel as 'email' | 'sms',
    id,
    to: 'ada@example.com',
    preview: 'subject',
    createdAt: new Date(at),
    status: 'sent',
    templateKey: null,
    hasCalendar: false,
  };
}

describe('parseSentKey', () => {
  it('round-trips a key it made', () => {
    expect(parseSentKey(sentKey('sms', 'abc-123'))).toEqual({ channel: 'sms', id: 'abc-123' });
  });

  it('splits at the first colon so an id containing one survives', () => {
    expect(parseSentKey('email:a:b')).toEqual({ channel: 'email', id: 'a:b' });
  });

  /**
   * The channel decides which table the id is read from and which redaction policy runs, so an
   * unrecognized one has to be refused rather than defaulted — a default would pick a policy on the
   * reader's behalf.
   */
  it('refuses anything that does not name a known channel', () => {
    expect(parseSentKey('post:abc')).toBeNull();
    expect(parseSentKey('abc')).toBeNull();
    expect(parseSentKey(':abc')).toBeNull();
    expect(parseSentKey('email:')).toBeNull();
    expect(parseSentKey('')).toBeNull();
    expect(parseSentKey(null)).toBeNull();
    expect(parseSentKey(undefined)).toBeNull();
  });
});

describe('isSentFilter', () => {
  it('accepts the three the screen offers and nothing else', () => {
    expect(isSentFilter('all')).toBe(true);
    expect(isSentFilter('email')).toBe(true);
    expect(isSentFilter('sms')).toBe(true);
    expect(isSentFilter('post')).toBe(false);
    expect(isSentFilter(null)).toBe(false);
  });
});

describe('statusTone', () => {
  it('reads both channels’ vocabularies', () => {
    expect(statusTone('sent')).toBe('success');
    expect(statusTone('delivered')).toBe('success');
    expect(statusTone('undelivered')).toBe('danger');
    expect(statusTone('failed')).toBe('danger');
    expect(statusTone('queued')).toBe('neutral');
  });

  /** A status this build has not heard of is still a row worth showing, just without a claim. */
  it('falls back to neutral rather than throwing', () => {
    expect(statusTone('bounced')).toBe('neutral');
  });
});

describe('mergeSent', () => {
  it('interleaves the channels newest first', () => {
    const merged = mergeSent(
      [
        [row('email:a', '2026-03-01T10:00:00Z'), row('email:b', '2026-03-01T08:00:00Z')],
        [row('sms:c', '2026-03-01T09:00:00Z'), row('sms:d', '2026-03-01T07:00:00Z')],
      ],
      10,
    );
    expect(merged.map((m) => m.key)).toEqual(['email:a', 'sms:c', 'email:b', 'sms:d']);
  });

  it('breaks ties on key so the order does not flap between renders', () => {
    const merged = mergeSent(
      [[row('sms:b', '2026-03-01T10:00:00Z')], [row('email:a', '2026-03-01T10:00:00Z')]],
      10,
    );
    expect(merged.map((m) => m.key)).toEqual(['email:a', 'sms:b']);
  });

  it('trims to the limit after merging, not before', () => {
    const merged = mergeSent(
      [
        [row('email:a', '2026-03-01T10:00:00Z'), row('email:b', '2026-03-01T09:00:00Z')],
        [row('sms:c', '2026-03-01T11:00:00Z')],
      ],
      2,
    );
    expect(merged.map((m) => m.key)).toEqual(['sms:c', 'email:a']);
  });

  it('handles a channel with nothing in it', () => {
    expect(mergeSent([[], []], 10)).toEqual([]);
    expect(mergeSent([[row('email:a', '2026-03-01T10:00:00Z')], []], 10)).toHaveLength(1);
  });
});
