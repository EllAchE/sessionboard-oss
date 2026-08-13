import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventContext } from '@/lib/context';
import { invalid, notFound } from '@/lib/errors';
import type { FormFieldSpec } from '@/lib/forms/contract';

/**
 * Every write a speaker can make. The services own the ownership checks, so what is pinned here is
 * what this file alone decides: that the session comes from the form's own `eventSlug` rather than
 * anything else the client sent, how a posted form becomes typed answers, and that a thrown error
 * becomes a rendered `FormState` instead of an unhandled rejection.
 */

const requireEventContext = vi.fn<(eventId: string) => Promise<EventContext>>();
const getEventBySlug = vi.fn();
const ensureParticipant = vi.fn();
const revalidatePath = vi.fn();

const service = {
  updateProfile: vi.fn(),
  setHeadshot: vi.fn(),
  listMySubmissions: vi.fn(),
  updateMySubmission: vi.fn(),
  withdrawSubmission: vi.fn(),
  shareSubmissionAccess: vi.fn(),
  revokeSubmissionAccess: vi.fn(),
  submissionFields: vi.fn(),
  deleteFile: vi.fn(),
  addFileComment: vi.fn(),
  recordRevision: vi.fn(),
  listPortalTasks: vi.fn(),
  saveTaskForm: vi.fn(),
  completeSimpleTask: vi.fn(),
  reopenTask: vi.fn(),
  removeTaskFile: vi.fn(),
  myDeliverable: vi.fn(),
};

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('@/lib/auth', () => ({ requireEventContext: (id: string) => requireEventContext(id) }));
vi.mock('@/lib/services/content', () => ({
  recordRevision: (...a: unknown[]) => service.recordRevision(...a),
}));
vi.mock('@/lib/services/files', () => ({
  deleteFile: (...a: unknown[]) => service.deleteFile(...a),
  addFileComment: (...a: unknown[]) => service.addFileComment(...a),
}));
vi.mock('@/lib/services/portal', () => ({
  getEventBySlug: (slug: string) => getEventBySlug(slug),
  ensureParticipant: (...a: unknown[]) => ensureParticipant(...a),
  listMySubmissions: (...a: unknown[]) => service.listMySubmissions(...a),
  revokeSubmissionAccess: (...a: unknown[]) => service.revokeSubmissionAccess(...a),
  setHeadshot: (...a: unknown[]) => service.setHeadshot(...a),
  shareSubmissionAccess: (...a: unknown[]) => service.shareSubmissionAccess(...a),
  submissionFields: (...a: unknown[]) => service.submissionFields(...a),
  updateMySubmission: (...a: unknown[]) => service.updateMySubmission(...a),
  updateProfile: (...a: unknown[]) => service.updateProfile(...a),
  withdrawSubmission: (...a: unknown[]) => service.withdrawSubmission(...a),
}));
vi.mock('@/lib/services/tasks', () => ({
  completeSimpleTask: (...a: unknown[]) => service.completeSimpleTask(...a),
  listPortalTasks: (...a: unknown[]) => service.listPortalTasks(...a),
  removeTaskFile: (...a: unknown[]) => service.removeTaskFile(...a),
  reopenTask: (...a: unknown[]) => service.reopenTask(...a),
  saveTaskForm: (...a: unknown[]) => service.saveTaskForm(...a),
}));
vi.mock('./deliverable', () => ({ myDeliverable: (...a: unknown[]) => service.myDeliverable(...a) }));

const actions = await import('./actions');

const CTX: EventContext = {
  actor: {
    userId: 'user-vitruvius',
    email: 'vitruvius@forum.example',
    name: 'Vitruvius',
    impersonatedByUserId: null,
  },
  eventId: 'event-forum',
  roles: ['speaker'],
};

const ME = { id: 'participant-1', headshotFileId: 'file-portrait' };

const field = (over: Partial<FormFieldSpec> & { key: string; type: FormFieldSpec['type'] }): FormFieldSpec => ({
  id: `field-${over.key}`,
  builtinKey: null,
  label: over.key,
  position: 0,
  step: 1,
  required: false,
  options: null,
  showIf: null,
  minLength: null,
  maxLength: null,
  charLimitGroup: null,
  ...over,
});

const form = (entries: Record<string, string | string[]>) => {
  const data = new FormData();
  data.set('eventSlug', 'forum');
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) value.forEach((entry) => data.append(key, entry));
    else data.set(key, value);
  }
  return data;
};

beforeEach(() => {
  vi.clearAllMocks();
  getEventBySlug.mockResolvedValue({ id: 'event-forum', slug: 'forum' });
  requireEventContext.mockResolvedValue(CTX);
  ensureParticipant.mockResolvedValue(ME);
  service.listMySubmissions.mockResolvedValue([{ id: 'submission-1' }]);
  service.submissionFields.mockResolvedValue([]);
  service.listPortalTasks.mockResolvedValue([]);
  service.shareSubmissionAccess.mockResolvedValue({ email: 'brutus@forum.example' });
  service.myDeliverable.mockResolvedValue({ current: { id: 'file-current' } });
});

describe('session resolution', () => {
  it('resolves the event from the form rather than trusting an event id on the wire', async () => {
    const data = form({ displayName: 'Vitruvius' });
    data.set('eventId', 'event-somebody-elses');

    await actions.saveProfileAction({ status: 'idle' }, data);

    expect(getEventBySlug).toHaveBeenCalledWith('forum');
    expect(requireEventContext).toHaveBeenCalledWith('event-forum');
  });

  it('refuses an unknown event slug before authenticating', async () => {
    getEventBySlug.mockResolvedValue(null);

    const result = await actions.saveProfileAction({ status: 'idle' }, form({}));

    expect(result).toEqual({
      status: 'error',
      message: 'That event could not be found',
      details: undefined,
    });
    expect(requireEventContext).not.toHaveBeenCalled();
  });

  it('refreshes the speaker portal for the event that was posted', async () => {
    await actions.completeTaskAction({ status: 'idle' }, form({ assignmentId: 'assignment-1' }));

    expect(revalidatePath).toHaveBeenCalledWith('/portal/forum', 'layout');
  });
});

describe('error translation', () => {
  it('carries a field-keyed service refusal through to the form', async () => {
    service.updateProfile.mockRejectedValue(invalid('Check the highlighted fields', { phone: 'Not a number' }));

    expect(await actions.saveProfileAction({ status: 'idle' }, form({}))).toEqual({
      status: 'error',
      message: 'Check the highlighted fields',
      details: { phone: 'Not a number' },
    });
  });

  it('hides an unexpected failure and leaves the portal unrefreshed', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    service.withdrawSubmission.mockRejectedValue(new Error('connection terminated'));

    expect(
      await actions.withdrawSubmissionAction({ status: 'idle' }, form({ submissionId: 'submission-1' })),
    ).toEqual({ status: 'error', message: 'Something went wrong. Try again.' });
    expect(revalidatePath).not.toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('saveProfileAction', () => {
  it('pairs link labels with their urls and drops the empty rows', async () => {
    await actions.saveProfileAction(
      { status: 'idle' },
      form({
        displayName: 'Vitruvius',
        linkLabel: ['Personal', '', '  '],
        linkUrl: ['https://vitruvius.example', 'https://unlabelled.example', '   '],
      }),
    );

    // An unlabelled url keeps the url as its own label; a row with neither is not a link at all.
    expect(service.updateProfile.mock.calls[0][2].links).toEqual([
      { label: 'Personal', url: 'https://vitruvius.example' },
      { label: 'https://unlabelled.example', url: 'https://unlabelled.example' },
    ]);
  });

  it('reads the notification toggles as checkboxes rather than strings', async () => {
    await actions.saveProfileAction({ status: 'idle' }, form({ notifyEmail: 'on' }));

    const profile = service.updateProfile.mock.calls[0][2];
    expect(profile.notifyEmail).toBe(true);
    expect(profile.notifySms).toBe(false);
  });
});

describe('removeHeadshotAction', () => {
  it('clears the reference before deleting the file it pointed at', async () => {
    const order: string[] = [];
    service.setHeadshot.mockImplementation(async () => void order.push('setHeadshot'));
    service.deleteFile.mockImplementation(async () => void order.push('deleteFile'));

    await actions.removeHeadshotAction({ status: 'idle' }, form({}));

    expect(order).toEqual(['setHeadshot', 'deleteFile']);
    expect(service.deleteFile).toHaveBeenCalledWith(CTX, 'file-portrait');
  });

  it('does not try to delete a portrait the speaker never had', async () => {
    ensureParticipant.mockResolvedValue({ ...ME, headshotFileId: null });

    await actions.removeHeadshotAction({ status: 'idle' }, form({}));

    expect(service.setHeadshot).toHaveBeenCalledWith(CTX, ME.id, null);
    expect(service.deleteFile).not.toHaveBeenCalled();
  });
});

describe('saveTaskFormAction', () => {
  const FIELDS = [
    field({ key: 'headline', type: 'short_text' }),
    field({ key: 'agree', type: 'checkbox' }),
    field({ key: 'topics', type: 'multi_select' }),
    field({ key: 'seats', type: 'number' }),
    field({ key: 'divider', type: 'section_break' }),
  ];

  beforeEach(() => {
    service.listPortalTasks.mockResolvedValue([
      { assignmentId: 'assignment-1', form: { fields: FIELDS } },
    ]);
  });

  it('recovers answer types from the field spec rather than guessing', async () => {
    await actions.saveTaskFormAction(
      { status: 'idle' },
      form({
        assignmentId: 'assignment-1',
        'answer:headline': 'On aqueducts',
        'answer:topics': ['water', 'stone'],
        'answer:seats': '40',
      }),
    );

    expect(service.saveTaskForm.mock.calls[0][3]).toEqual({
      headline: 'On aqueducts',
      // The point of reading from the spec: an unticked box stores false instead of vanishing.
      agree: false,
      topics: ['water', 'stone'],
      seats: 40,
      // `divider` is absent — a section break is not an answer.
    });
  });

  it('stores a blank number as null rather than NaN or zero', async () => {
    await actions.saveTaskFormAction(
      { status: 'idle' },
      form({ assignmentId: 'assignment-1', 'answer:seats': '   ' }),
    );

    expect(service.saveTaskForm.mock.calls[0][3].seats).toBeNull();
  });

  it('distinguishes setting a response aside from lodging it', async () => {
    const saved = await actions.saveTaskFormAction(
      { status: 'idle' },
      form({ assignmentId: 'assignment-1', intent: 'save' }),
    );
    expect(service.saveTaskForm.mock.calls[0][4]).toBe(false);
    expect(saved.message).toBe('Progress saved');

    const lodged = await actions.saveTaskFormAction(
      { status: 'idle' },
      form({ assignmentId: 'assignment-1', intent: 'submit' }),
    );
    expect(service.saveTaskForm.mock.calls[1][4]).toBe(true);
    expect(lodged.message).toContain('Submitted');
  });

  it('refuses an assignment that is not on the speaker own task list', async () => {
    const result = await actions.saveTaskFormAction(
      { status: 'idle' },
      form({ assignmentId: 'assignment-somebody-elses' }),
    );

    expect(result.status).toBe('error');
    expect(result.message).toBe('That form could not be found');
    expect(service.saveTaskForm).not.toHaveBeenCalled();
  });
});

describe('saveSubmissionAction', () => {
  it('refuses a submission the speaker does not own before writing anything', async () => {
    const result = await actions.saveSubmissionAction(
      { status: 'idle' },
      form({ submissionId: 'submission-somebody-elses', title: 'Borrowed' }),
    );

    expect(result.message).toBe('That session could not be found');
    expect(service.recordRevision).not.toHaveBeenCalled();
    expect(service.updateMySubmission).not.toHaveBeenCalled();
  });

  it('leaves answers untouched when the submission carries no form', async () => {
    await actions.saveSubmissionAction(
      { status: 'idle' },
      form({ submissionId: 'submission-1', title: 'On aqueducts' }),
    );

    expect(service.submissionFields).not.toHaveBeenCalled();
    expect(service.updateMySubmission.mock.calls[0][3].answers).toBeUndefined();
  });

  it('records a revision before overwriting the oration', async () => {
    const order: string[] = [];
    service.recordRevision.mockImplementation(async () => void order.push('recordRevision'));
    service.updateMySubmission.mockImplementation(async () => void order.push('update'));

    await actions.saveSubmissionAction(
      { status: 'idle' },
      form({ submissionId: 'submission-1', title: 'On aqueducts' }),
    );

    expect(order).toEqual(['recordRevision', 'update']);
  });
});

describe('shareAccessAction', () => {
  it('lets the service default the role when none was chosen', async () => {
    await actions.shareAccessAction(
      { status: 'idle' },
      form({ submissionId: 'submission-1', email: 'brutus@forum.example', name: 'Brutus' }),
    );

    expect(service.shareSubmissionAccess.mock.calls[0][3].kind).toBeUndefined();
  });

  it('passes a chosen role through and names the invitee in the confirmation', async () => {
    const result = await actions.shareAccessAction(
      { status: 'idle' },
      form({ submissionId: 'submission-1', email: 'brutus@forum.example', kind: 'moderator' }),
    );

    expect(service.shareSubmissionAccess.mock.calls[0][3].kind).toBe('moderator');
    expect(result.message).toContain('brutus@forum.example');
  });
});

describe('deliverable comments', () => {
  it('proves ownership through the speaker own task list before commenting', async () => {
    service.myDeliverable.mockRejectedValue(notFound('That record'));

    const result = await actions.postDeliverableCommentAction(
      { status: 'idle' },
      form({ fileId: 'file-somebody-elses', body: 'Looks good' }),
    );

    expect(result.status).toBe('error');
    expect(service.addFileComment).not.toHaveBeenCalled();
  });

  it('comments on the resolved current version rather than the posted file id', async () => {
    await actions.postDeliverableCommentAction(
      { status: 'idle' },
      form({ fileId: 'file-original', body: 'Revised as asked' }),
    );

    expect(service.addFileComment).toHaveBeenCalledWith(CTX, 'file-current', 'Revised as asked');
  });
});
