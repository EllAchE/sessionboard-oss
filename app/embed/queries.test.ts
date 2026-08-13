import { describe, expect, it } from 'vitest';
import { publicSpeakerFromConfirmedParticipant } from './queries';

describe('public participant profiles', () => {
  it('creates a gallery speaker directly from a database participant without requiring a session', () => {
    const speaker = publicSpeakerFromConfirmedParticipant('first-settlement', {
      id: '12345678-1234-1234-1234-123456789abc',
      accountName: 'Account fallback',
      displayName: 'Aemilia Fausta',
      pronouns: 'she/her',
      jobTitle: 'Civic historian',
      company: 'Collegium Historiae',
      bioMarkdown: 'Studies **public memory**.',
      headshotFileId: '87654321-4321-4321-4321-cba987654321',
      links: [
        { label: 'Dossier', url: 'https://example.com/aemilia' },
        { label: 'Unsafe', url: 'javascript:alert(1)' },
      ],
    });

    expect(speaker).toMatchObject({
      id: '12345678-1234-1234-1234-123456789abc',
      name: 'Aemilia Fausta',
      pronouns: 'she/her',
      jobTitle: 'Civic historian',
      company: 'Collegium Historiae',
      headshotUrl:
        '/embed/first-settlement/headshot/87654321-4321-4321-4321-cba987654321',
      sessionIds: [],
      links: [{ label: 'Dossier', url: 'https://example.com/aemilia' }],
    });
    expect(speaker.bioHtml).toContain('<strong>public memory</strong>');
  });
});
