import { describe, expect, it } from 'vitest';
import type { SessionPayload, SpeakerPayload } from './schemas';
import { sessionMatchesSearch, speakerMatchesSearch } from './queries';

const session: SessionPayload = {
  id: 'session-1',
  ref: 'SESS-1',
  title: 'Security at the analytical engine',
  description: 'A practical threat model',
  status: 'published',
  startsAt: '2026-09-01T14:00:00.000Z',
  endsAt: '2026-09-01T15:00:00.000Z',
  room: 'Forum',
  track: 'Engineering',
  format: 'Talk',
  ceuCredits: null,
  speakers: [
    {
      id: 'speaker-1',
      name: 'Ada Lovelace',
      jobTitle: 'Programmer',
      company: 'Analytical Engines Ltd',
      isPrimary: true,
    },
  ],
};

const speaker: SpeakerPayload = {
  id: 'speaker-1',
  name: 'Ada Lovelace',
  pronouns: 'she/her',
  jobTitle: 'Programmer',
  company: 'Analytical Engines Ltd',
  bio: 'Writes careful notes about computation.',
  headshotUrl: null,
  links: [{ label: 'Research', url: 'https://example.test/notes' }],
  sessions: [{ id: session.id, title: session.title }],
};

describe('public event search matching', () => {
  it('searches session content and speaker identity while combining speaker filters', () => {
    expect(sessionMatchesSearch(session, { q: 'threat', speaker: 'Ada' })).toBe(true);
    expect(sessionMatchesSearch(session, { q: 'analytical', speaker: 'speaker-1' })).toBe(true);
    expect(sessionMatchesSearch(session, { q: 'security', speaker: 'Grace' })).toBe(false);
  });

  it('searches speaker profiles and linked sessions without exposing private fields', () => {
    expect(speakerMatchesSearch(speaker, { q: 'careful notes' })).toBe(true);
    expect(speakerMatchesSearch(speaker, { q: 'security', company: 'Engines' })).toBe(true);
    expect(speakerMatchesSearch(speaker, { session: 'session-1' })).toBe(true);
    expect(speakerMatchesSearch(speaker, { company: 'Different Co' })).toBe(false);
  });
});
