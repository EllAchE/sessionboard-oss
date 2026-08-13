import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/api/v1/_lib/auth', () => ({ requireSpeakerSession: vi.fn() }));
vi.mock('@/lib/services/tasks', () => ({ ensureAssignments: vi.fn() }));
vi.mock('@/lib/services/content', () => ({ recordRevision: vi.fn() }));
vi.mock('@/lib/services/portal', () => ({
  ensureParticipant: vi.fn(),
  getProfileName: vi.fn(),
  updateProfile: vi.fn(),
}));
vi.mock('@/db/client', () => ({ getDb: vi.fn() }));

import { requireSpeakerSession } from '@/app/api/v1/_lib/auth';
import { speakerProfileSchema } from '@/app/api/v1/_lib/schemas';
import { getDb } from '@/db/client';
import { ensureParticipant, getProfileName, updateProfile } from '@/lib/services/portal';
import { GET, PATCH } from './route';

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/**
 * `S-2` added salutation, honorific and gender to `participant`, and `F-6` split the account name
 * into halves. Neither reached `/api/v1`, so the shipped contract described a narrower speaker than
 * the one the app stores. These tests pin both directions: what the payload returns, and what the
 * PATCH body is allowed to carry through to `updateProfile`.
 */

const PARTICIPANT = {
  id: 'participant-1',
  eventId: 'event-1',
  userId: 'user-1',
  displayName: 'Ada L.',
  salutation: 'Ada',
  honorific: 'Dr',
  pronouns: 'she/her',
  gender: 'Woman',
  jobTitle: 'Analyst',
  company: 'Analytical Society',
  bioMarkdown: 'A short bio.',
  headshotFileId: null,
  links: [{ label: 'Site', url: 'https://example.com' }],
  timezone: 'Europe/London',
  workflowStatus: 'invited',
  dietaryNotes: null,
  accessibilityNotes: null,
};

const ACCOUNT = {
  id: 'user-1',
  email: 'ada@example.com',
  name: 'Ada Lovelace',
  firstName: 'Ada',
  lastName: 'Lovelace',
  phone: '+15550001111',
  notifyEmail: true,
  notifySms: false,
};

function request(init?: RequestInit) {
  return new Request('https://cicero.test/api/v1/events/first-settlement/me/profile', init);
}

const params = { params: Promise.resolve({ slug: 'first-settlement' }) };

function patch(body: Record<string, unknown>) {
  return PATCH(
    request({
      method: 'PATCH',
      headers: { authorization: 'Bearer speaker-token', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    params,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireSpeakerSession).mockResolvedValue({
    eventId: 'event-1',
    eventSlug: 'first-settlement',
    actor: { userId: 'user-1', email: 'ada@example.com' },
  });
  mocked(ensureParticipant).mockResolvedValue(PARTICIPANT);
  mocked(updateProfile).mockResolvedValue(PARTICIPANT);
  mocked(getProfileName).mockResolvedValue({ firstName: 'Ada', lastName: 'Lovelace' });
  mocked(getDb).mockReturnValue({
    query: { user: { findFirst: vi.fn().mockResolvedValue(ACCOUNT) } },
  });
});

describe('GET /events/{slug}/me/profile', () => {
  it('returns the three fields `S-2` added and the name halves `F-6` split out', async () => {
    const response = await GET(request(), params);
    const body = (await response.json()) as { data: unknown };

    expect(response.status).toBe(200);
    expect(body.data).toMatchObject({
      salutation: 'Ada',
      honorific: 'Dr',
      gender: 'Woman',
      firstName: 'Ada',
      lastName: 'Lovelace',
      // The join, not an independent value — read-only, and not in the update body.
      name: 'Ada Lovelace',
      // The event-scoped override is a different thing again, and still writable.
      displayName: 'Ada L.',
    });
  });

  it('matches the schema the OpenAPI document is generated from', async () => {
    const response = await GET(request(), params);
    const body = (await response.json()) as { data: unknown };
    expect(speakerProfileSchema.safeParse(body.data)).toMatchObject({ success: true });
  });

  it('says null for a name half a legacy account never had, rather than an empty string', async () => {
    mocked(getProfileName).mockResolvedValue({ firstName: 'Sulpicia', lastName: '' });
    const response = await GET(request(), params);
    const body = (await response.json()) as { data: { lastName: unknown } };
    expect(body.data.lastName).toBeNull();
  });
});

describe('PATCH /events/{slug}/me/profile', () => {
  it('carries the new fields through to the service', async () => {
    const response = await patch({
      salutation: 'Ada',
      honorific: 'Prof',
      gender: 'Non-binary',
      firstName: 'Augusta Ada',
      lastName: 'King',
    });

    expect(response.status).toBe(200);
    expect(mocked(updateProfile).mock.calls[0][2]).toMatchObject({
      salutation: 'Ada',
      honorific: 'Prof',
      gender: 'Non-binary',
      firstName: 'Augusta Ada',
      lastName: 'King',
    });
  });

  /**
   * The reason the additions are safe for a caller that predates them. `updateProfile` writes only
   * the keys it is handed, so an omitted field has to arrive as `undefined` — echoing the current
   * value back would rewrite `user.name` from the halves on every unrelated PATCH.
   */
  it('leaves an omitted field alone instead of echoing the current one back', async () => {
    await patch({ jobTitle: 'Analyst' });

    const input = mocked(updateProfile).mock.calls[0][2] as Record<string, unknown>;
    expect(input.salutation).toBeUndefined();
    expect(input.honorific).toBeUndefined();
    expect(input.gender).toBeUndefined();
    expect(input.firstName).toBeUndefined();
    expect(input.lastName).toBeUndefined();
  });

  /**
   * `profileSchema` defaults `links` to `[]` and refuses `notifySms` without a phone, so these two
   * still have to be re-sent. A caller flipping one switch must not lose their links.
   */
  it('still re-sends the fields that omission would otherwise clear', async () => {
    await patch({ notifySms: true });

    expect(mocked(updateProfile).mock.calls[0][2]).toMatchObject({
      links: PARTICIPANT.links,
      phone: '+15550001111',
      notifySms: true,
    });
  });

  it('clears a field on an empty string, the way the portal form does', async () => {
    await patch({ honorific: '', lastName: '' });

    expect(mocked(updateProfile).mock.calls[0][2]).toMatchObject({
      honorific: '',
      lastName: '',
    });
  });

  it('bounds each new field before the service sees it', async () => {
    for (const body of [
      { salutation: 'x'.repeat(41) },
      { honorific: 'x'.repeat(41) },
      { gender: 'x'.repeat(61) },
      { firstName: 'x'.repeat(201) },
    ]) {
      const response = await patch(body);
      expect(response.status).toBe(422);
      expect(updateProfile).not.toHaveBeenCalled();
    }
  });

  it('refuses to take the derived join as an editable field', async () => {
    const response = await patch({ name: 'Ada Lovelace' });
    expect(response.status).toBe(422);
    expect(updateProfile).not.toHaveBeenCalled();
  });
});
