import { describe, expect, it } from 'vitest';
import type { SessionPayload, SpeakerPayload, SponsorPayload } from './schemas';
import { sessionMatchesSearch, speakerMatchesSearch, sponsorMatchesSearch } from './queries';

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

const sponsor: SponsorPayload = {
  id: 'sponsor-1',
  kind: 'exhibitor',
  status: 'published',
  name: 'Analytical Engines Ltd',
  tier: 'Principal',
  websiteUrl: 'https://example.test',
  description: 'Mechanical computation for public institutions.',
  boothLocation: 'Hall B, stand 14',
  logoUrl: 'https://cicero.test/demo/sponsors/logo/logo-1',
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

  it('searches published sponsor fields and combines kind and tier filters', () => {
    expect(sponsorMatchesSearch(sponsor, { q: 'mechanical', kind: 'exhibitor' })).toBe(true);
    expect(sponsorMatchesSearch(sponsor, { q: 'stand 14', tier: 'principal' })).toBe(true);
    expect(sponsorMatchesSearch(sponsor, { kind: 'sponsor' })).toBe(false);
    expect(sponsorMatchesSearch(sponsor, { tier: 'supporting' })).toBe(false);
  });
});
