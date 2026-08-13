import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/app/api/v1/_lib/auth', () => ({ requireSpeakerSession: vi.fn() }));
vi.mock('@/app/api/v1/_lib/queries', () => ({ requireEvent: vi.fn() }));
vi.mock('@/lib/services/forms', () => ({ assertParticipantLimits: vi.fn() }));
vi.mock('@/db/client', () => ({ getDb: vi.fn() }));

/**
 * Everything that touches the database is stubbed; everything that decides anything is not.
 * `validateParticipants` and `isAcceptingSubmissions` stay real, so the `F-7` assertions below are
 * measuring the rule itself rather than a mock of it.
 */
vi.mock('@/lib/services/submissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/services/submissions')>();
  return {
    ...actual,
    loadPublicForm: vi.fn(),
    ensureParticipant: vi.fn(),
    saveSubmission: vi.fn(),
    saveParticipants: vi.fn(),
    linkPrimarySpeaker: vi.fn(),
  };
});

import { requireSpeakerSession } from '@/app/api/v1/_lib/auth';
import { requireEvent } from '@/app/api/v1/_lib/queries';
import { getDb } from '@/db/client';
import { invalid } from '@/lib/errors';
import { assertParticipantLimits } from '@/lib/services/forms';
import type { ParticipantRoleKind } from '@/lib/forms/contract';
import {
  ensureParticipant,
  linkPrimarySpeaker,
  loadPublicForm,
  saveParticipants,
  saveSubmission,
  type ParticipantField,
  type PublicFormBundle,
} from '@/lib/services/submissions';
import { POST } from './route';

const mocked = (fn: unknown) => fn as ReturnType<typeof vi.fn>;

const EVENT = { id: 'event-1', slug: 'first-settlement' };

function participantField(
  participantKey: ParticipantField['participantKey'],
  position: number,
  required = true,
): ParticipantField {
  return {
    id: `field-${participantKey}`,
    key: participantKey,
    entity: 'participant',
    builtinKey: null,
    participantKey,
    type: participantKey === 'email' ? 'email' : 'short_text',
    label: participantKey,
    position,
    step: 0,
    required,
    options: null,
    showIf: null,
    minLength: null,
    maxLength: null,
    charLimitGroup: null,
    helpText: null,
    placeholder: null,
    optionLabels: null,
  };
}

function role(
  kind: ParticipantRoleKind,
  position: number,
  minCount: number,
  maxCount: number | null,
) {
  return { id: `role-${kind}`, kind, label: kind, position, minCount, maxCount };
}

function bundle(overrides: Partial<PublicFormBundle['form']> = {}): PublicFormBundle {
  return {
    event: {
      id: EVENT.id,
      slug: EVENT.slug,
      name: 'First Settlement',
      tagline: null,
      timezone: 'UTC',
    },
    form: {
      id: 'form-1',
      slug: 'keynotes',
      name: 'Keynotes (internal)',
      externalTitle: 'Keynotes',
      pageHeading: null,
      showWelcome: true,
      status: 'open',
      targetType: 'abstract',
      collectsParticipants: false,
      introMarkdown: null,
      opensAt: null,
      closesAt: null,
      allowDrafts: true,
      maxSubmissionsPerUser: null,
      maxParticipants: null,
      ...overrides,
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
        maxLength: null,
        charLimitGroup: null,
        helpText: null,
        placeholder: null,
        optionLabels: null,
      },
    ],
    participantFields: [
      participantField('firstName', 0),
      participantField('lastName', 1),
      participantField('email', 2),
    ],
    roles: [role('speaker', 0, 1, 1)],
    taxonomy: { formats: [], tracks: [], tags: [] },
  };
}

function post(body: Record<string, unknown>) {
  return POST(
    new Request('https://cicero.test/api/v1/events/first-settlement/forms/keynotes/submissions', {
      method: 'POST',
      headers: { authorization: 'Bearer speaker-token', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ slug: EVENT.slug, formId: 'keynotes' }) },
  );
}

const ada = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  role: 'speaker' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocked(requireSpeakerSession).mockResolvedValue({
    eventId: EVENT.id,
    roles: ['speaker'],
    actor: {
      userId: 'user-1',
      email: 'ada@example.com',
      name: 'Ada Lovelace',
      impersonatedByUserId: null,
    },
  });
  mocked(requireEvent).mockResolvedValue(EVENT);
  mocked(getDb).mockReturnValue({ query: { form: { findFirst: async () => undefined } } });
  mocked(ensureParticipant).mockResolvedValue('participant-1');
  mocked(saveParticipants).mockResolvedValue(['participant-1']);
  mocked(assertParticipantLimits).mockResolvedValue(undefined);
  mocked(saveSubmission).mockImplementation(async (input: { targetType?: string }) => ({
    id: 'submission-1',
    ref: 12,
    displayRef: 'ABS-12',
    status: input.targetType === 'session' ? 'accepted' : 'submitted',
    title: 'A talk',
  }));
});

/**
 * `F-4`. The bug this file exists for: the handler called `saveSubmission` without a `targetType`,
 * so a form collecting the programme itself produced a proposal waiting on a review round that
 * nobody was going to run — through the API only. The web flow had it right the whole time.
 */
describe('the form target reaches the service', () => {
  it('accepts a session-target submission and reports the decided status', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle({ targetType: 'session' }));

    const response = await post({ answers: { title: 'A talk' } });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ status: 'accepted', ref: 'ABS-12' });
    expect(mocked(saveSubmission).mock.calls[0][0]).toMatchObject({ targetType: 'session' });
  });

  it('leaves an abstract-target submission where it was', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle());

    const response = await post({ answers: { title: 'A talk' } });

    expect(await response.json()).toMatchObject({ status: 'submitted' });
    expect(mocked(saveSubmission).mock.calls[0][0]).toMatchObject({ targetType: 'abstract' });
  });

  it('keeps a draft a draft on a session-target form', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle({ targetType: 'session' }));
    mocked(saveSubmission).mockResolvedValue({
      id: 'submission-1',
      ref: 12,
      displayRef: 'ABS-12',
      status: 'draft',
      title: 'A talk',
    });

    const response = await post({ mode: 'draft', answers: { title: 'A talk' } });

    expect(await response.json()).toMatchObject({ status: 'draft' });
  });
});

/** `F-6`. The cast the form asks for, collected and written rather than silently dropped. */
describe('participant collection', () => {
  it('saves the whole cast and enforces the limits against what landed', async () => {
    mocked(loadPublicForm).mockResolvedValue({
      ...bundle({ collectsParticipants: true, maxParticipants: 3, targetType: 'session' }),
      roles: [role('speaker', 0, 1, 1), role('co_speaker', 1, 0, 2)],
    });
    mocked(saveParticipants).mockResolvedValue(['participant-1', 'participant-2']);

    const response = await post({
      answers: { title: 'A talk' },
      participants: [
        ada,
        {
          firstName: 'Charles',
          lastName: 'Babbage',
          email: 'charles@example.com',
          role: 'co_speaker',
        },
      ],
    });

    expect(response.status).toBe(201);
    expect(mocked(saveParticipants).mock.calls[0][0]).toMatchObject({
      submissionId: 'submission-1',
      people: [
        expect.objectContaining({ email: 'ada@example.com', role: 'speaker' }),
        expect.objectContaining({ email: 'charles@example.com', role: 'co_speaker' }),
      ],
    });
    expect(assertParticipantLimits).toHaveBeenCalledWith('form-1', ['speaker', 'co_speaker']);
    // The cast is the submission's speakers; the submitter is not linked a second time beside them.
    expect(linkPrimarySpeaker).not.toHaveBeenCalled();
  });

  it('names the participant row after the halves the cast supplied', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle({ collectsParticipants: true }));

    await post({
      answers: { title: 'A talk' },
      participants: [{ ...ada, firstName: 'Augusta Ada' }],
    });

    expect(ensureParticipant).toHaveBeenCalledWith(EVENT.id, 'user-1', 'Augusta Ada Lovelace');
  });

  it('refuses a cast whose first person is not the signed-in speaker', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle({ collectsParticipants: true }));

    const response = await post({
      answers: { title: 'A talk' },
      participants: [{ ...ada, email: 'someone-else@example.com' }],
    });

    expect(response.status).toBe(403);
    expect(saveSubmission).not.toHaveBeenCalled();
  });

  it('refuses a cast on a form that does not collect one', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle());

    const response = await post({ answers: { title: 'A talk' }, participants: [ada] });

    expect(response.status).toBe(422);
    expect(saveSubmission).not.toHaveBeenCalled();
  });

  it('falls back to the signed-in speaker alone when no cast is sent', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle());

    await post({ answers: { title: 'A talk' } });

    expect(linkPrimarySpeaker).toHaveBeenCalledWith('submission-1', 'participant-1');
    expect(saveParticipants).not.toHaveBeenCalled();
  });
});

/**
 * `F-7`. The counts an organizer configured are the same counts on both doors — and they are
 * checked before the write, so a request the form cannot accept does not leave a submission, or a
 * minted session, behind it.
 */
describe('role and count limits', () => {
  it('rejects a second speaker on a form that allows one', async () => {
    mocked(loadPublicForm).mockResolvedValue(
      bundle({ collectsParticipants: true, maxParticipants: 4 }),
    );

    const response = await post({
      answers: { title: 'A talk' },
      participants: [ada, { ...ada, email: 'charles@example.com', firstName: 'Charles' }],
    });

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      error: { code: 'invalid', details: { speaker: expect.stringContaining('one person') } },
    });
    expect(saveSubmission).not.toHaveBeenCalled();
  });

  it('rejects a cast over the overall cap', async () => {
    mocked(loadPublicForm).mockResolvedValue({
      ...bundle({ collectsParticipants: true, maxParticipants: 1 }),
      roles: [role('speaker', 0, 1, 1), role('panelist', 1, 0, null)],
    });

    const response = await post({
      answers: { title: 'A talk' },
      participants: [ada, { ...ada, email: 'charles@example.com', role: 'panelist' }],
    });

    expect(response.status).toBe(422);
    expect(saveSubmission).not.toHaveBeenCalled();
  });

  it('rejects a role the form does not offer', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle({ collectsParticipants: true }));

    const response = await post({
      answers: { title: 'A talk' },
      participants: [{ ...ada, role: 'moderator' }],
    });

    expect(response.status).toBe(422);
    expect(saveSubmission).not.toHaveBeenCalled();
  });

  it('rejects a person missing a locked identity field', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle({ collectsParticipants: true }));

    const response = await post({
      answers: { title: 'A talk' },
      participants: [{ ...ada, lastName: '   ' }],
    });

    expect(response.status).toBe(422);
    expect(saveSubmission).not.toHaveBeenCalled();
  });

  /**
   * The submission that sends no cast is still a submission with exactly one speaker on it, and a
   * form that asks for more than that has to say so rather than quietly accepting less.
   */
  it('measures a cast-less submit against the form minimums too', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle({ collectsParticipants: true }));

    await post({ answers: { title: 'A talk' } });

    expect(assertParticipantLimits).toHaveBeenCalledWith('form-1', ['speaker']);
  });

  it('does not write anything when those minimums fail', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle({ collectsParticipants: true }));
    mocked(assertParticipantLimits).mockRejectedValue(invalid('This form needs a moderator'));

    const response = await post({ answers: { title: 'A talk' } });

    expect(response.status).not.toBe(201);
    expect(saveSubmission).not.toHaveBeenCalled();
  });

  it('leaves a draft alone, since nothing is decided until it is sent', async () => {
    mocked(loadPublicForm).mockResolvedValue(bundle({ collectsParticipants: true }));
    mocked(saveSubmission).mockResolvedValue({
      id: 'submission-1',
      ref: 12,
      displayRef: 'ABS-12',
      status: 'draft',
      title: 'A talk',
    });

    const response = await post({ mode: 'draft', answers: {} });

    expect(response.status).toBe(201);
    expect(assertParticipantLimits).not.toHaveBeenCalled();
  });
});
