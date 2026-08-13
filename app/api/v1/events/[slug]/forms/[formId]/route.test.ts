import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/api/v1/_lib/queries', () => ({ requireEvent: vi.fn() }));
vi.mock('@/db/client', () => ({ getDb: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ enforcePublicApiRateLimit: vi.fn() }));
vi.mock('@/lib/services/submissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/submissions')>();
  return { ...actual, loadPublicForm: vi.fn() };
});

import { requireEvent } from '@/app/api/v1/_lib/queries';
import { publicFormSchema } from '@/app/api/v1/_lib/schemas';
import { getDb } from '@/db/client';
import { loadPublicForm, type PublicFormBundle } from '@/lib/services/submissions';
import { GET } from './route';

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

/**
 * `0008` gave a form a target, a participant block and a welcome screen. None of it reached this
 * payload, so an agent reading the published contract could not tell a form that mints sessions from
 * one that collects proposals, could not know a cast was expected, and could not see a single
 * question it would be asked about those people.
 */
const BUNDLE: PublicFormBundle = {
  event: {
    id: 'event-1',
    slug: 'first-settlement',
    name: 'First Settlement',
    tagline: null,
    timezone: 'UTC',
  },
  form: {
    id: 'form-1',
    slug: 'panels',
    name: 'Panels CFP v3 (do not send)',
    externalTitle: 'Propose a panel',
    pageHeading: 'Welcome',
    showWelcome: false,
    status: 'open',
    targetType: 'session',
    collectsParticipants: true,
    introMarkdown: 'Tell us about your panel.',
    opensAt: new Date('2026-01-01T00:00:00.000Z'),
    closesAt: new Date('2026-12-01T00:00:00.000Z'),
    allowDrafts: true,
    maxSubmissionsPerUser: 2,
    maxParticipants: 4,
  },
  fields: [
    {
      id: 'field-title',
      key: 'title',
      builtinKey: 'title',
      type: 'short_text',
      label: 'Title',
      position: 0,
      step: 0,
      required: true,
      options: null,
      showIf: null,
      minLength: null,
      maxLength: 255,
      charLimitGroup: null,
      helpText: 'Keep it short.',
      placeholder: 'A memorable title',
      optionLabels: null,
    },
  ],
  participantFields: [
    {
      id: 'field-firstName',
      key: 'firstName',
      entity: 'participant',
      builtinKey: null,
      participantKey: 'firstName',
      type: 'short_text',
      label: 'First name',
      position: 0,
      step: 0,
      required: true,
      options: null,
      showIf: null,
      minLength: null,
      maxLength: 120,
      charLimitGroup: null,
      helpText: null,
      placeholder: null,
      optionLabels: null,
    },
  ],
  roles: [
    { id: 'role-moderator', kind: 'moderator', label: 'Chair', position: 0, minCount: 1, maxCount: 1 },
    { id: 'role-panelist', kind: 'panelist', label: 'Panellist', position: 1, minCount: 2, maxCount: null },
  ],
  taxonomy: { formats: [], tracks: [], tags: [] },
};

async function read() {
  const response = await GET(new Request('https://cicero.test/api/v1/events/x/forms/panels'), {
    params: Promise.resolve({ slug: 'first-settlement', formId: 'panels' }),
  });
  const body = (await response.json()) as { data: unknown };
  return { response, data: body.data };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireEvent).mockResolvedValue({ id: 'event-1', slug: 'first-settlement' });
  mocked(getDb).mockReturnValue({ query: { form: { findFirst: async () => undefined } } });
  mocked(loadPublicForm).mockResolvedValue(BUNDLE);
});

describe('the published form contract', () => {
  it('matches the schema the OpenAPI document is generated from', async () => {
    const { data } = await read();
    expect(publicFormSchema.parse(data)).toBeTruthy();
  });

  it('carries the target, the participant configuration and the welcome screen', async () => {
    const { data } = await read();
    expect(data).toMatchObject({
      targetType: 'session',
      collectsParticipants: true,
      maxParticipants: 4,
      pageHeading: 'Welcome',
      showWelcome: false,
    });
  });

  it('publishes the participant questions with the entity that tells them apart', async () => {
    const { data } = await read();
    const payload = data as {
      fields: Array<Record<string, unknown>>;
      participantFields: Array<Record<string, unknown>>;
    };

    expect(payload.fields[0]).toMatchObject({
      entity: 'abstract',
      builtinKey: 'title',
      participantKey: null,
    });
    expect(payload.participantFields[0]).toMatchObject({
      entity: 'participant',
      builtinKey: null,
      participantKey: 'firstName',
    });
  });

  it('publishes the roles and counts a submitter has to satisfy', async () => {
    const { data } = await read();
    expect((data as { roles: unknown[] }).roles).toEqual([
      { id: 'role-moderator', kind: 'moderator', label: 'Chair', position: 0, minCount: 1, maxCount: 1 },
      { id: 'role-panelist', kind: 'panelist', label: 'Panellist', position: 1, minCount: 2, maxCount: null },
    ]);
  });

  /** `F-9`. The internal name is the organizer's own label and this is a public read. */
  it('publishes the external title rather than the internal name', async () => {
    const { data } = await read();
    expect(data).toMatchObject({ name: 'Propose a panel', externalTitle: 'Propose a panel' });
    expect(JSON.stringify(data)).not.toContain('do not send');
  });

  it('falls back to the internal name until an organizer sets an external one', async () => {
    mocked(loadPublicForm).mockResolvedValue({
      ...BUNDLE,
      form: { ...BUNDLE.form, name: 'Panels', externalTitle: 'Panels' },
    });

    const { data } = await read();
    expect(data).toMatchObject({ name: 'Panels', externalTitle: 'Panels' });
  });
});
