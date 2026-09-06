import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('@/db/client', () => ({
  getDb: () => ({
    update: () => ({
      set: (value: Record<string, unknown>) => {
        state.updates.push(value);
        return { where: async () => undefined };
      },
    }),
  }),
}));

vi.mock('./comms', () => ({
  previewParticipantEmail: vi.fn(),
  sendParticipantEmail: vi.fn(),
}));

vi.mock('./dashboard', () => ({
  listTaskCompletion: vi.fn(),
}));

import type { EventContext } from '@/lib/context';
import { previewParticipantEmail, sendParticipantEmail } from './comms';
import { listTaskCompletion, type OutstandingTaskRow } from './dashboard';
import {
  composeTaskNudge,
  draftTaskNudge,
  sendTaskNudge,
  TASK_NUDGE_TEMPLATE_KEY,
} from './task-nudge';

const mockedPreview = previewParticipantEmail as unknown as ReturnType<typeof vi.fn>;
const mockedSend = sendParticipantEmail as unknown as ReturnType<typeof vi.fn>;
const mockedList = listTaskCompletion as unknown as ReturnType<typeof vi.fn>;

const EVENT_ID = '11111111-1111-4111-8111-111111111111';
const PARTICIPANT_ID = '22222222-2222-4222-8222-222222222222';
const ASSIGNMENT_ID = '33333333-3333-4333-8333-333333333333';

const CTX: EventContext = {
  actor: {
    userId: '44444444-4444-4444-8444-444444444444',
    email: 'gene@example.test',
    name: 'Gene Kim',
    impersonatedByUserId: null,
  },
  eventId: EVENT_ID,
  roles: ['organizer'],
};

function row(overrides: Partial<OutstandingTaskRow> = {}): OutstandingTaskRow {
  return {
    id: ASSIGNMENT_ID,
    participantId: PARTICIPANT_ID,
    participantName: 'Ada Lovelace',
    participantEmail: 'ada@example.test',
    company: 'Analytical Engines',
    accepted: true,
    sessionTitles: [],
    taskId: '55555555-5555-4555-8555-555555555555',
    taskName: 'Slides',
    taskKind: 'file_upload',
    required: true,
    status: 'not_started',
    dueAt: null,
    daysOverdue: null,
    daysUntilDue: null,
    urgency: 'open',
    lastRemindedAt: null,
    awaitingAction: false,
    ...overrides,
  };
}

const PREVIEW = {
  recipient: {
    participantId: PARTICIPANT_ID,
    userId: '66666666-6666-4666-8666-666666666666',
    email: 'ada@example.test',
    name: 'Ada Lovelace',
    notifyEmail: true,
  },
  message: {
    subject: 'Reminder: Slides for Hope Conf',
    html: '<p>rendered</p>',
    text: 'Hi Ada,\n\nWe are still waiting on your Slides.',
    missing: [],
  },
  unknown: [],
  dynamicFields: ['portal.link'],
};

beforeEach(() => {
  vi.clearAllMocks();
  state.updates.length = 0;
  mockedList.mockResolvedValue([row()]);
  mockedPreview.mockResolvedValue(PREVIEW);
  mockedSend.mockResolvedValue({
    recipient: { participantId: PARTICIPANT_ID, email: 'ada@example.test', name: 'Ada Lovelace' },
    message: { subject: 'Reminder: Slides for Hope Conf', text: 'Hi Ada,' },
    logId: '77777777-7777-4777-8777-777777777777',
    sent: false,
  });
});

describe('composeTaskNudge', () => {
  it('leads with the overdue fact and says how late it is', () => {
    const draft = composeTaskNudge(
      { taskName: 'Slides', dueAt: '2026-08-01T00:00:00.000Z', daysOverdue: 3, daysUntilDue: null, sessionTitles: [] },
      'Gene Kim',
    );
    expect(draft.subject).toBe('Still need: Slides for {{event.name}}');
    expect(draft.bodyMarkdown).toContain('It was due on 1 August 2026, 3 days ago.');
  });

  it('says "due today" rather than "0 days ago"', () => {
    const draft = composeTaskNudge(
      { taskName: 'Slides', dueAt: '2026-08-15T00:00:00.000Z', daysOverdue: 0, daysUntilDue: null, sessionTitles: [] },
      'Gene Kim',
    );
    expect(draft.bodyMarkdown).toContain('is due today');
  });

  it('is a reminder rather than a demand when the deadline is still ahead', () => {
    const draft = composeTaskNudge(
      { taskName: 'Bio', dueAt: '2026-08-16T00:00:00.000Z', daysOverdue: null, daysUntilDue: 1, sessionTitles: [] },
      'Gene Kim',
    );
    expect(draft.subject).toBe('Reminder: Bio for {{event.name}}');
    expect(draft.bodyMarkdown).toContain('is due tomorrow');
  });

  it('names the sessions the task is outstanding on', () => {
    const draft = composeTaskNudge(
      {
        taskName: 'Slides',
        dueAt: null,
        daysOverdue: null,
        daysUntilDue: null,
        sessionTitles: ['Continuous Delivery', 'The Phoenix Project'],
      },
      'Gene Kim',
    );
    expect(draft.bodyMarkdown).toContain('- Continuous Delivery');
    expect(draft.bodyMarkdown).toContain('- The Phoenix Project');
  });

  it('escapes markdown punctuation in names it splices into the body', () => {
    const draft = composeTaskNudge(
      { taskName: 'Slides *final*', dueAt: null, daysOverdue: null, daysUntilDue: null, sessionTitles: [] },
      'A_B',
    );
    expect(draft.bodyMarkdown).toContain('**Slides \\*final\\***');
    expect(draft.bodyMarkdown).toContain('A\\_B');
    // The subject is plain text and must stay legible rather than carry escape characters.
    expect(draft.subject).toContain('Slides *final*');
  });

  it('signs off as the organizer and asks for the portal link, not an attachment', () => {
    const draft = composeTaskNudge(
      { taskName: 'Slides', dueAt: null, daysOverdue: null, daysUntilDue: null, sessionTitles: [] },
      'Gene Kim',
    );
    expect(draft.bodyMarkdown).toContain('{{portal.link}}');
    expect(draft.bodyMarkdown.trimEnd().endsWith('Gene Kim')).toBe(true);
  });

  it('leaves the portal link bare so the plain-text part still carries a URL', () => {
    const draft = composeTaskNudge(
      { taskName: 'Slides', dueAt: null, daysOverdue: null, daysUntilDue: null, sessionTitles: [] },
      'Gene Kim',
    );
    // `markdownToText` reduces `[label](url)` to `label`. A labelled link would leave the text
    // part — and therefore the review pane, the clipboard copy and the mailto — without the URL.
    expect(draft.bodyMarkdown).not.toMatch(/\]\(\{\{portal\.link\}\}\)/);
    expect(draft.bodyMarkdown).toMatch(/^\{\{portal\.link\}\}$/m);
  });
});

describe('draftTaskNudge', () => {
  it('renders the composed draft against the real recipient', async () => {
    const draft = await draftTaskNudge(CTX, { assignmentId: ASSIGNMENT_ID });

    expect(mockedPreview).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      participantId: PARTICIPANT_ID,
      subject: 'Reminder: Slides for {{event.name}}',
      bodyMarkdown: expect.stringContaining('{{portal.link}}'),
    });
    expect(draft.recipient).toEqual({ name: 'Ada Lovelace', email: 'ada@example.test' });
    expect(draft.rendered.text).toBe(PREVIEW.message.text);
    expect(draft.dynamicFields).toEqual(['portal.link']);
  });

  it('re-renders an organizer edit instead of the composed copy', async () => {
    await draftTaskNudge(CTX, {
      assignmentId: ASSIGNMENT_ID,
      subject: '  Slides?  ',
      bodyMarkdown: '  Ada — can you send them today?  ',
    });

    expect(mockedPreview).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      participantId: PARTICIPANT_ID,
      subject: 'Slides?',
      bodyMarkdown: 'Ada — can you send them today?',
    });
  });

  it('refuses an assignment that is not on this event', async () => {
    mockedList.mockResolvedValue([]);
    await expect(draftTaskNudge(CTX, { assignmentId: ASSIGNMENT_ID })).rejects.toThrow(
      /Task assignment/,
    );
    expect(mockedPreview).not.toHaveBeenCalled();
  });

  it.each(['completed', 'waived'] as const)('refuses to chase a %s task', async (status) => {
    mockedList.mockResolvedValue([row({ status, urgency: 'done' })]);
    await expect(draftTaskNudge(CTX, { assignmentId: ASSIGNMENT_ID })).rejects.toThrow(
      /already settled/,
    );
  });

  it('refuses an emptied subject or body', async () => {
    await expect(
      draftTaskNudge(CTX, { assignmentId: ASSIGNMENT_ID, subject: '   ' }),
    ).rejects.toThrow(/subject/);
    await expect(
      draftTaskNudge(CTX, { assignmentId: ASSIGNMENT_ID, bodyMarkdown: '   ' }),
    ).rejects.toThrow(/message/);
  });

  it('needs comms:send — a reviewer cannot draft on the event\'s behalf', async () => {
    await expect(
      draftTaskNudge({ ...CTX, roles: ['reviewer'] }, { assignmentId: ASSIGNMENT_ID }),
    ).rejects.toThrow(/comms:send/);
    expect(mockedList).not.toHaveBeenCalled();
  });
});

describe('sendTaskNudge', () => {
  const reviewed = {
    assignmentId: ASSIGNMENT_ID,
    subject: 'Reminder: Slides for {{event.name}}',
    bodyMarkdown: 'Hi {{speaker.firstName|there}},',
    reviewedRecipientEmail: 'ada@example.test',
    reviewedSubject: PREVIEW.message.subject,
    reviewedBodyText: PREVIEW.message.text,
  };

  it('hands the reviewed rendering to the mail boundary as the expectation', async () => {
    const result = await sendTaskNudge(CTX, reviewed);

    expect(mockedSend).toHaveBeenCalledWith({
      eventId: EVENT_ID,
      participantId: PARTICIPANT_ID,
      subject: reviewed.subject,
      bodyMarkdown: reviewed.bodyMarkdown,
      templateKey: TASK_NUDGE_TEMPLATE_KEY,
      expectedRecipientEmail: 'ada@example.test',
      expectedPreviewSubject: PREVIEW.message.subject,
      expectedPreviewBodyText: PREVIEW.message.text,
    });
    // `log` transport: recorded, not handed to a provider. The organizer is told which it was.
    expect(result.delivered).toBe(false);
    expect(result.logId).toBe('77777777-7777-4777-8777-777777777777');
  });

  it('stamps lastRemindedAt so the cron reminder does not chase the same person again', async () => {
    await sendTaskNudge(CTX, reviewed);
    expect(state.updates).toHaveLength(1);
    expect(state.updates[0].lastRemindedAt).toBeInstanceOf(Date);
  });

  it.each([
    ['reviewedRecipientEmail'],
    ['reviewedSubject'],
    ['reviewedBodyText'],
  ] as const)('refuses to send when %s was never rendered for review', async (field) => {
    await expect(sendTaskNudge(CTX, { ...reviewed, [field]: '' })).rejects.toThrow(/Preview/);
    expect(mockedSend).not.toHaveBeenCalled();
    expect(state.updates).toHaveLength(0);
  });

  it('refuses to send an empty message', async () => {
    await expect(sendTaskNudge(CTX, { ...reviewed, bodyMarkdown: '  ' })).rejects.toThrow(
      /subject and a message/,
    );
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('refuses to send against a task that was settled after the draft opened', async () => {
    mockedList.mockResolvedValue([row({ status: 'completed', urgency: 'done' })]);
    await expect(sendTaskNudge(CTX, reviewed)).rejects.toThrow(/already settled/);
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it('does not stamp the reminder when the send itself fails', async () => {
    mockedSend.mockRejectedValue(new Error('transport exploded'));
    await expect(sendTaskNudge(CTX, reviewed)).rejects.toThrow(/transport exploded/);
    expect(state.updates).toHaveLength(0);
  });

  it('needs comms:send', async () => {
    await expect(sendTaskNudge({ ...CTX, roles: ['reviewer'] }, reviewed)).rejects.toThrow(
      /comms:send/,
    );
  });
});
