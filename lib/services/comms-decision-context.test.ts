import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  sentMail: [] as Array<{ to: string; subject: string; text: string }>,
}));

vi.mock('../../db/client', () => ({ getDb: () => createDb() }));
vi.mock('../mail', () => ({
  sendMail: async (input: (typeof state.sentMail)[number]) => {
    state.sentMail.push(input);
    return { id: `mail-${state.sentMail.length}`, sent: true };
  },
}));
vi.mock('../sms', () => ({
  activeSmsTransportName: () => 'log',
  sendSms: async () => ({ id: 'sms-1', sent: true }),
}));
vi.mock('./notification-preferences', () => ({
  maySendSmsNow: async () => false,
  phoneVerificationIsCurrent: () => false,
  resolveRecipientDelivery: async () => ({ notifyEmail: true, notifySms: false }),
}));

import {
  emailTemplate,
  event as eventTable,
  participant,
  participantRole,
  portalTheme,
  room,
  scheduledSession,
  sessionFormat,
  submission,
  taskAssignment,
  track,
} from '../../db/schema';
import { sendDecisionNotice } from './comms';

const EVENT = {
  id: 'event-one',
  name: 'DevFlow Conf 2027',
  slug: 'devflow',
  timezone: 'UTC',
  venueName: null,
  websiteUrl: null,
  startsOn: '2027-09-27',
  endsOn: '2027-09-28',
};

const TARGET = {
  id: 'submission-ai',
  eventId: EVENT.id,
  ref: 16,
  title: 'Your AI Pair Programmer Is Lying to You',
  status: 'declined',
  decisionNote: 'The programme is full.',
};

const SUBMISSIONS = [
  {
    participantId: 'participant-one',
    id: 'submission-ci',
    ref: 15,
    title: 'Taming 40-Minute CI',
    status: 'accepted',
    trackId: null,
    formatId: null,
    decisionNote: null,
    isPrimary: true,
  },
  {
    participantId: 'participant-one',
    ...TARGET,
    trackId: null,
    formatId: null,
    isPrimary: true,
  },
];

function rowsFor(source: unknown, joined: boolean): unknown[] {
  if (source === eventTable) return [EVENT];
  if (source === portalTheme || source === emailTemplate) return [];
  if (source === submission) return [TARGET];
  if (source === participantRole) {
    return joined ? SUBMISSIONS : [{ participantId: 'participant-one' }];
  }
  if (source === participant) {
    return [
      {
        participantId: 'participant-one',
        userId: 'user-one',
        email: 'priya@example.test',
        phone: null,
        notifyEmail: true,
        notifySms: false,
        phoneVerifiedAt: null,
        phoneVerificationTransport: null,
        userName: 'Priya Nair',
        userFirstName: 'Priya',
        displayName: 'Priya Nair',
        company: null,
        jobTitle: null,
        pronouns: null,
        timezone: 'UTC',
      },
    ];
  }
  if (
    source === scheduledSession ||
    source === taskAssignment ||
    source === track ||
    source === room ||
    source === sessionFormat
  ) {
    return [];
  }
  return [];
}

function query() {
  let source: unknown;
  let joined = false;
  const q: Record<string, unknown> = {
    from: (next: unknown) => {
      source = next;
      return q;
    },
    innerJoin: () => {
      joined = true;
      return q;
    },
    where: () => q,
    orderBy: () => q,
    limit: () => q,
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rowsFor(source, joined)).then(resolve, reject),
  };
  return q;
}

function createDb() {
  return { select: () => query() };
}

describe('decision notice submission context', () => {
  beforeEach(() => {
    state.sentMail = [];
  });

  it('renders the submission being declined when the speaker has another accepted talk', async () => {
    const outcome = await sendDecisionNotice(TARGET.id);

    expect(outcome).toMatchObject({ recipients: 1, sent: 1, failed: 0 });
    expect(state.sentMail).toHaveLength(1);
    expect(state.sentMail[0].text).toContain(TARGET.title);
    expect(state.sentMail[0].text).toContain(TARGET.decisionNote);
    expect(state.sentMail[0].text).not.toContain('Taming 40-Minute CI');
  });
});
