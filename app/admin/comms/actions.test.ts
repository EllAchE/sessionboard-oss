import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EventContext, MembershipRole } from '@/lib/context';

/**
 * The comms actions carry their event in the form body, which the browser is free to rewrite, so
 * the capability check is the only thing turning that id back into an assertion. `requireCapability`
 * is left real here for the same reason it is in the task tests: mocking the gate would make the
 * test of the gate meaningless.
 */

const requireEventContext = vi.fn<(eventId: string) => Promise<EventContext>>();
const currentEventId = vi.fn<() => Promise<string>>();
const revalidatePath = vi.fn();
const service = {
  saveTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  ensureDefaultTemplates: vi.fn(),
  previewCampaign: vi.fn(),
  sendCampaign: vi.fn(),
  runScheduledJobs: vi.fn(),
};

vi.mock('next/cache', () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));
vi.mock('@/lib/auth', () => ({ requireEventContext: (id: string) => requireEventContext(id) }));
vi.mock('@/lib/services/events', () => ({ currentEventId: () => currentEventId() }));
vi.mock('@/lib/services/comms', () => ({
  saveTemplate: (...a: unknown[]) => service.saveTemplate(...a),
  deleteTemplate: (...a: unknown[]) => service.deleteTemplate(...a),
  ensureDefaultTemplates: (...a: unknown[]) => service.ensureDefaultTemplates(...a),
  previewCampaign: (...a: unknown[]) => service.previewCampaign(...a),
  sendCampaign: (...a: unknown[]) => service.sendCampaign(...a),
  runScheduledJobs: (...a: unknown[]) => service.runScheduledJobs(...a),
}));

const actions = await import('./actions');

const ctxWith = (eventId: string, ...roles: MembershipRole[]): EventContext => ({
  actor: {
    userId: 'user-organizer',
    email: 'organizer@forum.example',
    name: 'Organizer',
    impersonatedByUserId: null,
  },
  eventId,
  roles,
});

const form = (entries: Record<string, string | string[]> = {}) => {
  const data = new FormData();
  data.set('eventId', 'event-forum');
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) value.forEach((entry) => data.append(key, entry));
    else data.set(key, value);
  }
  return data;
};

const sentTemplate = () => service.saveTemplate.mock.calls[0][0];
const sentCampaign = () => service.sendCampaign.mock.calls[0][0];
const previewed = () => service.previewCampaign.mock.calls[0][0];

beforeEach(() => {
  vi.resetAllMocks();
  requireEventContext.mockImplementation(async (eventId) => ctxWith(eventId, 'organizer'));
  currentEventId.mockResolvedValue('event-forum');
  service.saveTemplate.mockResolvedValue({ key: 'submission.confirmation' });
  service.previewCampaign.mockResolvedValue({ recipients: 3 });
  service.sendCampaign.mockResolvedValue({ sent: 3, failed: 0 });
  service.runScheduledJobs.mockResolvedValue({ taskRemindersSent: 2, deadlineRemindersSent: 1 });
});

describe('the capability gate', () => {
  it('resolves the event the form named', async () => {
    await actions.saveTemplateAction(form({ key: 'submission.confirmation' }));

    expect(requireEventContext).toHaveBeenCalledWith('event-forum');
    expect(sentTemplate().eventId).toBe('event-forum');
  });

  it('refuses a reviewer, who may read the event but not send mail on its behalf', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    requireEventContext.mockImplementation(async (eventId) => ctxWith(eventId, 'reviewer'));

    const result = await actions.sendCampaignAction(form());
    logged.mockRestore();

    expect(result).toEqual({ ok: false, error: 'This action needs the event:manage permission' });
    expect(service.sendCampaign).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('refuses an event the organizer has no membership in', async () => {
    // The id arrives from the form body, so a rewritten one must fail on the membership lookup.
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    requireEventContext.mockRejectedValue(new Error('no membership for that event'));

    expect(await actions.sendCampaignAction(form())).toEqual({
      ok: false,
      error: 'no membership for that event',
    });
    logged.mockRestore();
    expect(service.sendCampaign).not.toHaveBeenCalled();
  });

  it('takes the reminder run from the current event rather than the form', async () => {
    await actions.runRemindersAction();

    expect(currentEventId).toHaveBeenCalled();
    expect(service.runScheduledJobs).toHaveBeenCalledWith({ eventId: 'event-forum' });
  });
});

describe('template form reading', () => {
  it('treats a checkbox that was posted off as disabled and anything else as enabled', async () => {
    await actions.saveTemplateAction(form({ enabled: 'off' }));
    expect(sentTemplate().enabled).toBe(false);

    vi.resetAllMocks();
    requireEventContext.mockImplementation(async (eventId) => ctxWith(eventId, 'organizer'));
    service.saveTemplate.mockResolvedValue({ key: 'k' });
    await actions.saveTemplateAction(form({ enabled: 'on' }));
    expect(sentTemplate().enabled).toBe(true);
  });

  it('defaults an absent enabled field to enabled, which the panel must post explicitly to change', async () => {
    // Asymmetric with attachIcs on purpose: `enabled` is opt-out, `attachIcs` is opt-in. Pinned
    // because the two read the same FormData in opposite directions.
    await actions.saveTemplateAction(form());

    expect(sentTemplate().enabled).toBe(true);
    expect(sentTemplate().attachIcs).toBe(false);
  });

  it('stores an empty sms body as null rather than an empty string', async () => {
    await actions.saveTemplateAction(form({ smsBody: '' }));

    expect(sentTemplate().smsBody).toBeNull();
  });

  it('reads missing text fields as empty strings rather than the string "null"', async () => {
    await actions.saveTemplateAction(form());

    expect(sentTemplate().subject).toBe('');
    expect(sentTemplate().bodyMarkdown).toBe('');
    expect(sentTemplate().name).toBe('');
  });

  it('refreshes the template list after a save and after a delete', async () => {
    await actions.saveTemplateAction(form());
    expect(revalidatePath).toHaveBeenCalledWith('/admin/comms/templates');

    await actions.deleteTemplateAction(form({ templateId: 'template-1' }));
    expect(service.deleteTemplate).toHaveBeenCalledWith('event-forum', 'template-1');
  });

  it('restores the defaults for the event the form named', async () => {
    await actions.restoreDefaultTemplatesAction(form());

    expect(service.ensureDefaultTemplates).toHaveBeenCalledWith('event-forum');
  });
});

describe('audience reading', () => {
  it('defaults to accepted speakers when the form names no audience', async () => {
    await actions.previewAction(form());

    expect(previewed().audience.kind).toBe('accepted_speakers');
  });

  it('reads the chosen audience with its filters and collects every participant id', async () => {
    await actions.previewAction(
      form({
        audienceKind: 'task_incomplete',
        trackId: 'track-1',
        taskId: 'task-1',
        participantIds: ['participant-1', '', 'participant-2'],
      }),
    );

    expect(previewed().audience).toEqual({
      kind: 'task_incomplete',
      trackId: 'track-1',
      formatId: null,
      taskId: 'task-1',
      // The blank entry is dropped rather than sent as an empty id.
      participantIds: ['participant-1', 'participant-2'],
    });
  });
});

describe('channel selection', () => {
  it('accepts only email or sms and falls back to auto for anything else', async () => {
    for (const [posted, expected] of [
      ['email', 'email'],
      ['sms', 'sms'],
      ['carrier-pigeon', 'auto'],
      ['', 'auto'],
    ] as const) {
      vi.resetAllMocks();
      requireEventContext.mockImplementation(async (eventId) => ctxWith(eventId, 'organizer'));
      service.previewCampaign.mockResolvedValue({ recipients: 0 });

      await actions.previewAction(form({ channel: posted }));

      expect(previewed().channel).toBe(expected);
    }
  });
});

describe('sending', () => {
  it('refreshes both the mail and sms logs, since either may have gained rows', async () => {
    await actions.sendCampaignAction(form());

    expect(revalidatePath).toHaveBeenCalledWith('/admin/mail');
    expect(revalidatePath).toHaveBeenCalledWith('/admin/sms');
  });

  it('returns the outcome of a partly failed send rather than throwing it away', async () => {
    // The documented reason these return results instead of throwing: a half-failed send still has
    // a number worth showing.
    service.sendCampaign.mockResolvedValue({ sent: 8, failed: 2 });

    expect(await actions.sendCampaignAction(form())).toEqual({
      ok: true,
      data: { sent: 8, failed: 2 },
    });
  });

  it('passes the template key through as null when the campaign is free-typed', async () => {
    await actions.sendCampaignAction(form({ subject: 'A word from the Forum' }));

    expect(sentCampaign().templateKey).toBeNull();
    expect(sentCampaign().subject).toBe('A word from the Forum');
  });

  it('reports a send failure without losing what the organizer typed', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    service.sendCampaign.mockRejectedValue(new Error('smtp refused the connection'));

    expect(await actions.sendCampaignAction(form())).toEqual({
      ok: false,
      error: 'smtp refused the connection',
    });
    expect(logged).toHaveBeenCalled();
    logged.mockRestore();
  });
});

describe('reminders', () => {
  it('reports both reminder counts and refreshes the mail log', async () => {
    expect(await actions.runRemindersAction()).toEqual({
      ok: true,
      data: { taskRemindersSent: 2, deadlineRemindersSent: 1 },
    });
    expect(revalidatePath).toHaveBeenCalledWith('/admin/mail');
  });
});
