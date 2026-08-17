import nodemailer from 'nodemailer';
import { describe, expect, it } from 'vitest';
import { buildInvite, type CalendarEvent } from '../ics';
import { nodemailerMessage } from './smtp';

const EVENT: CalendarEvent = {
  uid: 'outlook-regression@cicero.events',
  sequence: 0,
  summary: 'Outlook compatibility rehearsal',
  startsAt: new Date('2026-09-14T17:00:00Z'),
  endsAt: new Date('2026-09-14T17:45:00Z'),
  organizer: { email: 'programme@cicero.events', name: 'Cicero Programme Team' },
  attendees: [{ email: 'speaker@outlook.com', name: 'Ada Speaker' }],
  stamp: new Date('2026-08-16T12:00:00Z'),
};

describe('calendar message MIME', () => {
  it('puts the meeting request inside multipart/alternative and keeps an attachment fallback', async () => {
    const transport = nodemailer.createTransport({
      streamTransport: true,
      buffer: true,
      newline: 'unix',
    });
    const result = (await transport.sendMail(
      nodemailerMessage({
        to: 'speaker@outlook.com',
        from: 'Cicero <programme@cicero.events>',
        subject: 'Your session',
        html: '<p>Your session has been scheduled.</p>',
        text: 'Your session has been scheduled.',
        ics: { body: buildInvite(EVENT), method: 'REQUEST' },
      }),
    )) as unknown as { message: Buffer };
    const raw = result.message.toString('utf8');

    const alternative = /Content-Type: multipart\/alternative;\r?\n boundary="([^"]+)"/.exec(raw);
    expect(alternative).not.toBeNull();
    const alternativeClose = raw.indexOf(`--${alternative?.[1]}--`);
    const calendarPart = raw.indexOf('Content-Type: text/calendar; charset=utf-8; method=REQUEST');
    const attachmentPart = raw.indexOf('Content-Type: application/ics; name=invite.ics');

    expect(calendarPart).toBeGreaterThan(0);
    expect(alternativeClose).toBeGreaterThan(calendarPart);
    expect(attachmentPart).toBeGreaterThan(alternativeClose);
    expect(raw).toContain('METHOD:REQUEST');
  });
});
