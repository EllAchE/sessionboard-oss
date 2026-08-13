import { beforeEach, describe, expect, it, vi } from 'vitest';
import { invalid } from '@/lib/errors';
import type { SubmitPayload } from './shared';

/**
 * `P-3`, the cold path: one call takes an anonymous visitor to an account, a participant, a
 * submission, a speaker role and a live session. It is the highest-consequence action in the
 * product and had no test, so what is pinned here is its ordering, its branch between a cold and a
 * signed-in submitter, and the confirmation mail `F-12`/`F-16` promise.
 */

const order: string[] = [];
const track = <T>(name: string, value: T) => async (): Promise<T> => {
  order.push(name);
  return value;
};

const currentActor = vi.fn();
const requestMagicLink = vi.fn();
const grantRole = vi.fn();
const ensureParticipant = vi.fn();
const saveSubmission = vi.fn();
const linkPrimarySpeaker = vi.fn();
const loadPublicForm = vi.fn();
const isAcceptingSubmissions = vi.fn();
const sendMail = vi.fn();
const cookieSet = vi.fn();
const insertValues = vi.fn();
const findForm = vi.fn();
const findUser = vi.fn();

vi.mock('next/headers', () => ({ cookies: async () => ({ set: cookieSet }) }));
vi.mock('@/lib/env', () => ({ appUrl: () => 'https://cicero.example' }));
vi.mock('@/lib/ids', () => ({
  randomToken: () => 'plaintext-token',
  // Opaque on purpose: a fake that embedded the token would let the "never stores the plaintext"
  // assertion below pass on the fake rather than on the action.
  hashToken: async () => 'opaque-digest',
}));
vi.mock('@/lib/mail', () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }));
vi.mock('@/lib/auth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth')>();
  return {
    normalizeEmail: actual.normalizeEmail,
    currentActor: () => currentActor(),
    requestMagicLink: (...a: unknown[]) => requestMagicLink(...a),
    grantRole: (...a: unknown[]) => grantRole(...a),
  };
});
vi.mock('@/lib/services/submissions', () => ({
  loadPublicForm: (...a: unknown[]) => loadPublicForm(...a),
  isAcceptingSubmissions: (...a: unknown[]) => isAcceptingSubmissions(...a),
  ensureParticipant: (...a: unknown[]) => ensureParticipant(...a),
  saveSubmission: (...a: unknown[]) => saveSubmission(...a),
  linkPrimarySpeaker: (...a: unknown[]) => linkPrimarySpeaker(...a),
}));
vi.mock('@/db/client', () => ({
  getDb: () => ({
    query: { form: { findFirst: findForm }, user: { findFirst: findUser } },
    insert: () => ({ values: insertValues }),
  }),
}));

const { submitPublicForm } = await import('./actions');

const BUNDLE = {
  event: { id: 'event-forum', slug: 'forum', name: 'The Forum' },
  form: { id: 'form-cfp', allowDrafts: true, maxSubmissionsPerUser: null },
  fields: [],
};

const payload = (over: Partial<SubmitPayload> = {}): SubmitPayload => ({
  eventSlug: 'forum',
  formSlug: 'speak',
  mode: 'submit',
  values: {},
  submitterName: '  Vitruvius  ',
  submitterEmail: 'Vitruvius@Forum.example',
  // `F-6`/`F-7`: empty because this fixture's form has the participant block switched off.
  participants: [],
  submissionId: null,
  ...over,
});

const bodyOf = (call: number) => sendMail.mock.calls[call][0] as { subject: string; html: string; text: string; to: string };

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;
  loadPublicForm.mockResolvedValue(BUNDLE);
  isAcceptingSubmissions.mockReturnValue(true);
  currentActor.mockResolvedValue(null);
  requestMagicLink.mockResolvedValue({ email: 'vitruvius@forum.example' });
  findUser.mockResolvedValue({ id: 'user-new' });
  findForm.mockResolvedValue(undefined);
  ensureParticipant.mockResolvedValue('participant-1');
  saveSubmission.mockImplementation(track('saveSubmission', { id: 'submission-1', displayRef: 'ABS-1', title: 'On aqueducts' }));
  insertValues.mockImplementation(track('openSession', undefined));
  linkPrimarySpeaker.mockImplementation(track('linkPrimarySpeaker', undefined));
  sendMail.mockImplementation(track('sendMail', undefined));
});

describe('gatekeeping', () => {
  it('refuses a form that is not in the Forum', async () => {
    loadPublicForm.mockResolvedValue(null);

    expect(await submitPublicForm(payload())).toEqual({
      ok: false,
      message: 'That call for speakers could not be found',
      errors: {},
    });
    expect(saveSubmission).not.toHaveBeenCalled();
  });

  it('refuses a closed call before touching the account', async () => {
    isAcceptingSubmissions.mockReturnValue(false);

    const result = await submitPublicForm(payload());

    expect(result).toMatchObject({ ok: false, message: 'This call for speakers is not accepting submissions right now' });
    expect(requestMagicLink).not.toHaveBeenCalled();
  });

  it('reports a field-keyed refusal against the field that caused it', async () => {
    saveSubmission.mockRejectedValue(invalid('Check the highlighted answers', { title: 'Required' }));

    expect(await submitPublicForm(payload())).toEqual({
      ok: false,
      message: 'Check the highlighted answers',
      errors: { title: 'Required' },
    });
  });

  it('generalises an unexpected failure rather than leaking it to the visitor', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    saveSubmission.mockRejectedValue(new Error('connection terminated unexpectedly'));

    const result = await submitPublicForm(payload());

    expect(result.ok).toBe(false);
    expect((result as { message: string }).message).not.toContain('connection terminated');
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('the cold path', () => {
  it('takes an anonymous visitor to an account, a role, a participant and a session', async () => {
    await submitPublicForm(payload());

    expect(requestMagicLink).toHaveBeenCalledWith({
      email: 'Vitruvius@Forum.example',
      name: 'Vitruvius',
      eventId: 'event-forum',
      redirectTo: '/portal/forum',
    });
    expect(grantRole).toHaveBeenCalledWith('user-new', 'event-forum', 'speaker');
    expect(ensureParticipant).toHaveBeenCalledWith('event-forum', 'user-new', 'Vitruvius');
    expect(cookieSet).toHaveBeenCalledWith('cicero_session', 'plaintext-token', expect.objectContaining({ httpOnly: true, sameSite: 'lax', path: '/' }));
  });

  it('opens the session only after the submission is safely saved', async () => {
    // The documented invariant: a failure opening the session must not cost someone their talk.
    await submitPublicForm(payload());

    expect(order.indexOf('openSession')).toBeGreaterThan(order.indexOf('saveSubmission'));
    expect(order.indexOf('openSession')).toBeGreaterThan(order.indexOf('linkPrimarySpeaker'));
  });

  it('stores only a hash of the session token, never the token itself', async () => {
    await submitPublicForm(payload());

    const row = insertValues.mock.calls[0][0];
    expect(row.tokenHash).toBe('opaque-digest');
    expect(JSON.stringify(row)).not.toContain('plaintext-token');
    // The plaintext still has to reach the visitor's cookie, or the session it opened is unusable.
    expect(cookieSet.mock.calls[0][1]).toBe('plaintext-token');
  });

  it('marks the cookie secure only when the deployment is https', async () => {
    await submitPublicForm(payload());

    expect(cookieSet.mock.calls[0][2].secure).toBe(true);
  });

  it('refuses politely when the account could not be entered in the rolls', async () => {
    findUser.mockResolvedValue(undefined);

    expect(await submitPublicForm(payload())).toEqual({
      ok: false,
      message: 'We could not create your account',
      errors: { submitterEmail: 'Try again' },
    });
  });
});

describe('the signed-in path', () => {
  it('never asks a signed-in submitter for a magic link or a new session', async () => {
    currentActor.mockResolvedValue({ userId: 'user-known', email: 'known@forum.example' });

    await submitPublicForm(payload());

    expect(requestMagicLink).not.toHaveBeenCalled();
    expect(insertValues).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
    expect(grantRole).toHaveBeenCalledWith('user-known', 'event-forum', 'speaker');
  });

  it('confirms to the address on the account rather than the one typed into the form', async () => {
    currentActor.mockResolvedValue({ userId: 'user-known', email: 'known@forum.example' });

    await submitPublicForm(payload());

    expect(bodyOf(0).to).toBe('known@forum.example');
  });
});

describe('drafts', () => {
  it('returns the reference without sending any mail', async () => {
    expect(await submitPublicForm(payload({ mode: 'draft' }))).toEqual({
      ok: true,
      mode: 'draft',
      submissionId: 'submission-1',
      displayRef: 'ABS-1',
    });
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('still opens a session, so a returning drafter is not locked out', async () => {
    await submitPublicForm(payload({ mode: 'draft' }));

    expect(cookieSet).toHaveBeenCalled();
  });
});

describe('confirmation mail', () => {
  it('falls back to a working default when the organizer wrote no copy', async () => {
    await submitPublicForm(payload());

    const mail = bodyOf(0);
    expect(mail.subject).toBe('ABS-1: we have your submission');
    expect(mail.text).toContain('On aqueducts');
    expect(mail.text).toContain('ABS-1');
    expect(mail.html).toContain('https://cicero.example/portal/forum');
  });

  it('prefers the organizer copy and fills its merge tokens', async () => {
    findForm.mockResolvedValue({
      confirmationSubject: 'Thank you {{name}} — {{ref}}',
      confirmationBodyMarkdown: 'Your talk {{title}} reached {{event}}. [Portal]({{portal_url}})',
      notifyEmails: [],
    });

    await submitPublicForm(payload());

    const mail = bodyOf(0);
    expect(mail.subject).toBe('Thank you Vitruvius — ABS-1');
    expect(mail.text).toContain('On aqueducts');
    expect(mail.text).toContain('The Forum');
    expect(mail.html).toContain('https://cicero.example/portal/forum');
  });

  it('leaves an unknown merge token alone instead of blanking it', async () => {
    findForm.mockResolvedValue({ confirmationSubject: 'Hello {{nickname}}', notifyEmails: [] });

    await submitPublicForm(payload());

    expect(bodyOf(0).subject).toBe('Hello {{nickname}}');
  });

  it('escapes a submitter-controlled title so it cannot inject markup', async () => {
    saveSubmission.mockResolvedValue({
      id: 'submission-1',
      displayRef: 'ABS-1',
      title: '[Click here](https://evil.example)',
    });

    await submitPublicForm(payload());

    expect(bodyOf(0).html).not.toContain('href="https://evil.example"');
  });

  it('notifies every organizer address the form names', async () => {
    findForm.mockResolvedValue({ notifyEmails: ['chair@forum.example', 'clerk@forum.example'] });

    await submitPublicForm(payload());

    expect(sendMail).toHaveBeenCalledTimes(3);
    expect(bodyOf(1).to).toBe('chair@forum.example');
    expect(bodyOf(2).to).toBe('clerk@forum.example');
    expect(bodyOf(1).subject).toBe('New submission ABS-1: On aqueducts');
  });
});

describe('the done redirect', () => {
  it('carries the reference and id through as encoded query parameters', async () => {
    saveSubmission.mockResolvedValue({ id: 'submission id/1', displayRef: 'ABS 1&2', title: 'On aqueducts' });

    const result = await submitPublicForm(payload());

    expect(result).toEqual({
      ok: true,
      mode: 'submit',
      redirectTo: '/submit/forum/speak/done?ref=ABS+1%262&id=submission+id%2F1',
    });
  });
});
