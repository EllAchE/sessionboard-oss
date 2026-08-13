import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventContext } from '../../../lib/context';
import { forbidden, invalid } from '../../../lib/errors';

/**
 * The organizer's roster writes. Two things here are easy to break and cheap to pin: the read/write
 * split between the preview and the import, and the fact that `viewPortalAsAction` redirects from
 * *outside* its try block — a redirect throws, so moving it inside would turn every successful
 * impersonation into "The Forum hit a snag".
 */

class RedirectError extends Error {
  constructor(readonly to: string) {
    super(`redirect:${to}`);
  }
}

const speakersContext = vi.fn<() => Promise<EventContext>>();
const manageSpeakersContext = vi.fn<() => Promise<EventContext>>();
const revalidatePath = vi.fn();
const startImpersonation = vi.fn();
const getEvent = vi.fn();
const service = {
  planSpeakerImport: vi.fn(),
  importSpeakers: vi.fn(),
  setSpeakerWorkflowStatus: vi.fn(),
  createSpeaker: vi.fn(),
  updateSpeaker: vi.fn(),
  userIdForParticipant: vi.fn(),
};

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new RedirectError(to);
  },
}));
vi.mock('../../../lib/auth', () => ({
  startImpersonation: (...a: unknown[]) => startImpersonation(...a),
}));
vi.mock('../../../lib/services/events', () => ({ getEvent: (...a: unknown[]) => getEvent(...a) }));
vi.mock('../../../lib/services/participants', () => ({
  planSpeakerImport: (...a: unknown[]) => service.planSpeakerImport(...a),
  importSpeakers: (...a: unknown[]) => service.importSpeakers(...a),
  setSpeakerWorkflowStatus: (...a: unknown[]) => service.setSpeakerWorkflowStatus(...a),
  createSpeaker: (...a: unknown[]) => service.createSpeaker(...a),
  updateSpeaker: (...a: unknown[]) => service.updateSpeaker(...a),
  userIdForParticipant: (...a: unknown[]) => service.userIdForParticipant(...a),
}));
vi.mock('./context', () => ({
  speakersContext: () => speakersContext(),
  manageSpeakersContext: () => manageSpeakersContext(),
}));

const actions = await import('./actions');

const CTX: EventContext = {
  actor: {
    userId: 'user-organizer',
    email: 'organizer@forum.example',
    name: 'Organizer',
    impersonatedByUserId: null,
  },
  eventId: 'event-forum',
  roles: ['organizer'],
};

beforeEach(() => {
  // `reset`, not `clear`: clearing keeps implementations, so a rejection set in one test would
  // still be pending in the next one and quietly weaken it.
  vi.resetAllMocks();
  speakersContext.mockResolvedValue(CTX);
  manageSpeakersContext.mockResolvedValue(CTX);
  getEvent.mockResolvedValue({ slug: 'forum' });
  service.userIdForParticipant.mockResolvedValue('user-speaker');
  service.planSpeakerImport.mockResolvedValue({ rows: [] });
  service.importSpeakers.mockResolvedValue({ created: 2 });
  service.setSpeakerWorkflowStatus.mockResolvedValue('confirmed');
  service.createSpeaker.mockResolvedValue({ id: 'participant-new' });
});

describe('the read/write split', () => {
  it('lets a reviewer preview an import without granting them the import itself', async () => {
    await actions.previewSpeakerImportAction('name,email\n');

    expect(speakersContext).toHaveBeenCalled();
    expect(manageSpeakersContext).not.toHaveBeenCalled();
  });

  it('demands the organizer context before writing an import', async () => {
    await actions.importSpeakersAction('name,email\n', {} as never);

    expect(manageSpeakersContext).toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/admin/speakers');
  });

  it('previews without touching the roster', async () => {
    const result = await actions.previewSpeakerImportAction('name,email\n');

    expect(result).toEqual({ ok: true, data: { rows: [] } });
    expect(service.importSpeakers).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('runs the same plan the import will run, with the mapping it was given', async () => {
    const mapping = { name: 'Full name' } as never;
    await actions.previewSpeakerImportAction('name,email\n', mapping);

    expect(service.planSpeakerImport).toHaveBeenCalledWith(CTX, 'name,email\n', mapping);
  });
});

describe('viewPortalAsAction', () => {
  it('redirects into the portal instead of returning a result', async () => {
    // The redirect sits outside the try block on purpose: `redirect` throws, so catching it here
    // would report a successful impersonation as a failure.
    await expect(actions.viewPortalAsAction('participant-1')).rejects.toThrow('redirect:/portal/forum');
  });

  it('takes on the speaker identity before redirecting', async () => {
    await expect(actions.viewPortalAsAction('participant-1')).rejects.toBeInstanceOf(RedirectError);

    expect(service.userIdForParticipant).toHaveBeenCalledWith(CTX, 'participant-1');
    expect(startImpersonation).toHaveBeenCalledWith(CTX, 'user-speaker');
  });

  it('refuses without impersonating when the event has no slug to land on', async () => {
    getEvent.mockResolvedValue(null);

    expect(await actions.viewPortalAsAction('participant-1')).toEqual({
      ok: false,
      message: 'That event could not be found.',
    });
    expect(startImpersonation).not.toHaveBeenCalled();
  });

  it('reports a refusal rather than redirecting when impersonation is not allowed', async () => {
    startImpersonation.mockRejectedValue(forbidden('Only organizers may act as a speaker'));

    expect(await actions.viewPortalAsAction('participant-1')).toEqual({
      ok: false,
      message: 'Only organizers may act as a speaker',
      details: undefined,
    });
  });
});

describe('roster writes', () => {
  it('refreshes both the roster and the speaker being changed', async () => {
    await actions.setSpeakerStatusAction('participant-1', 'confirmed' as never);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/speakers');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/speakers/participant-1');
  });

  it('returns the status the service settled on, not the one that was asked for', async () => {
    service.setSpeakerWorkflowStatus.mockResolvedValue('waitlisted');

    expect(await actions.setSpeakerStatusAction('participant-1', 'confirmed' as never)).toEqual({
      ok: true,
      data: { status: 'waitlisted' },
    });
  });

  it('hands back the id of a newly inscribed speaker', async () => {
    expect(await actions.createSpeakerAction({} as never)).toEqual({
      ok: true,
      data: { id: 'participant-new' },
    });
  });
});

describe('error translation', () => {
  it('carries field-keyed details through so the form can mark the row', async () => {
    service.createSpeaker.mockRejectedValue(invalid('Check the highlighted fields', { email: 'Already on the rolls' }));

    expect(await actions.createSpeakerAction({} as never)).toEqual({
      ok: false,
      message: 'Check the highlighted fields',
      details: { email: 'Already on the rolls' },
    });
  });

  it('hides an unexpected failure behind a generic message', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    service.updateSpeaker.mockRejectedValue(new Error('connection terminated'));

    expect(await actions.updateSpeakerAction('participant-1', {} as never)).toEqual({
      ok: false,
      message: 'Something went wrong. Try again.',
    });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});
