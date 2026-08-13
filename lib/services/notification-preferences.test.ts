import { describe, expect, it } from 'vitest';
import type { notificationPreference } from '../../db/schema';
import {
  isQuietTime,
  phoneChallengeUsable,
  phoneVerificationIsCurrent,
  resolveDeliveryRules,
  unsubscribePreferenceScope,
  unsubscribeTokenUsable,
} from './notification-preferences';

type Rule = typeof notificationPreference.$inferSelect;

function rule(patch: Partial<Rule>): Rule {
  return {
    id: crypto.randomUUID(),
    userId: 'user-1',
    eventId: null,
    scopeKey: 'global',
    templateKey: '*',
    notifyEmail: null,
    notifySms: null,
    timezone: null,
    quietStartMinute: null,
    quietEndMinute: null,
    smsHourlyLimit: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...patch,
  };
}

describe('recipient preference precedence', () => {
  it('applies global, event and category rules in order without changing global defaults', () => {
    const resolved = resolveDeliveryRules({
      baseEmail: true,
      baseSms: true,
      phoneVerified: true,
      participantTimezone: 'Europe/London',
      eventId: 'event-1',
      templateKey: 'task.reminder',
      rules: [
        rule({ timezone: 'America/New_York', smsHourlyLimit: 8 }),
        rule({ eventId: 'event-1', scopeKey: 'event-1', notifySms: false }),
        rule({ eventId: 'event-1', scopeKey: 'event-1', templateKey: 'task', notifyEmail: false }),
      ],
    });

    expect(resolved).toMatchObject({
      notifyEmail: false,
      notifySms: false,
      timezone: 'America/New_York',
      smsHourlyLimit: 8,
    });
  });

  it('fails closed for SMS when the destination has not completed its OTP', () => {
    expect(
      resolveDeliveryRules({
        baseEmail: true,
        baseSms: true,
        phoneVerified: false,
        eventId: 'event-1',
        templateKey: 'session.invite',
        rules: [rule({ eventId: 'event-1', scopeKey: 'event-1', notifySms: true })],
      }).notifySms,
    ).toBe(false);
  });
});

describe('quiet hours', () => {
  const delivery = {
    notifyEmail: true,
    notifySms: true,
    timezone: 'America/New_York',
    quietStartMinute: 22 * 60,
    quietEndMinute: 8 * 60,
    smsHourlyLimit: 6,
  };

  it('handles a window crossing midnight in the recipient timezone', () => {
    expect(isQuietTime(delivery, new Date('2026-08-14T03:00:00Z'))).toBe(true); // 23:00 EDT
    expect(isQuietTime(delivery, new Date('2026-08-14T16:00:00Z'))).toBe(false); // noon EDT
  });

  it('suppresses rather than guesses when a stored timezone is invalid', () => {
    expect(isQuietTime({ ...delivery, timezone: 'not/a-zone' }, new Date())).toBe(true);
  });

  it('suppresses when a damaged stored rule carries only half of the window', () => {
    expect(isQuietTime({ ...delivery, quietEndMinute: null }, new Date())).toBe(true);
  });
});

describe('unsubscribe token boundaries', () => {
  const now = new Date('2026-08-13T12:00:00Z');

  it('rejects used and expired tokens', () => {
    expect(unsubscribeTokenUsable({ usedAt: null, expiresAt: new Date('2026-08-13T12:00:01Z') }, now)).toBe(true);
    expect(unsubscribeTokenUsable({ usedAt: now, expiresAt: new Date('2026-08-14T12:00:00Z') }, now)).toBe(false);
    expect(unsubscribeTokenUsable({ usedAt: null, expiresAt: now }, now)).toBe(false);
  });

  it('derives the write scope only from the token record and narrows it to one event and type', () => {
    expect(
      unsubscribePreferenceScope({
        userId: 'user-9',
        eventId: 'event-2',
        templateKey: 'task.reminder',
      }),
    ).toEqual({
      userId: 'user-9',
      eventId: 'event-2',
      templateKey: 'task',
      notifyEmail: false,
    });
  });
});

describe('phone challenge boundaries', () => {
  const now = new Date('2026-08-13T12:00:00Z');

  it('allows only an unused, unexpired challenge below the attempt ceiling', () => {
    expect(phoneChallengeUsable({ verifiedAt: null, expiresAt: new Date('2026-08-13T12:01:00Z'), attempts: 4 }, now)).toBe(true);
    expect(phoneChallengeUsable({ verifiedAt: now, expiresAt: new Date('2026-08-13T12:01:00Z'), attempts: 0 }, now)).toBe(false);
    expect(phoneChallengeUsable({ verifiedAt: null, expiresAt: now, attempts: 0 }, now)).toBe(false);
    expect(phoneChallengeUsable({ verifiedAt: null, expiresAt: new Date('2026-08-13T12:01:00Z'), attempts: 5 }, now)).toBe(false);
  });

  it('invalidates a log-mode verification when Twilio is later enabled', () => {
    const account = {
      phone: '+15551234567',
      phoneVerifiedAt: now,
      phoneVerificationTransport: 'log',
    };
    expect(phoneVerificationIsCurrent(account, 'log')).toBe(true);
    expect(phoneVerificationIsCurrent(account, 'twilio')).toBe(false);
  });
});
