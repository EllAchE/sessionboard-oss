import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildCancellation, buildInvite, type CalendarEvent } from '../ics';
import { resendTransport } from './resend';
import { smtpTransport } from './smtp';
import { calendarMimeMethod, type OutgoingMail } from './transport';

const { sendMail, createTransport } = vi.hoisted(() => {
  const sendMail = vi.fn(async () => ({ messageId: 'smtp-1' }));
  return { sendMail, createTransport: vi.fn(() => ({ sendMail })) };
});

vi.mock('nodemailer', () => ({ createTransport }));

/**
 * `C-3`'s failure mode is not a message that bounces — it is a message that arrives and is not a
 * usable meeting request. Outlook needs the VCALENDAR as a MIME alternative, and believes that
 * part's method over the body. So these assert both the transport route and the method handed to the
 * MIME composer.
 */

const EVENT: CalendarEvent = {
  uid: 'sess-7@cicero.events',
  sequence: 3,
  summary: 'Rhetoric for engineers',
  startsAt: new Date('2026-09-14T17:00:00Z'),
  endsAt: new Date('2026-09-14T17:45:00Z'),
  organizer: { email: 'programme@cicero.events', name: 'Cicero Programme Team' },
  attendees: [{ email: 'marcus@example.com', name: 'Marcus Tullius' }],
  stamp: new Date('2026-08-11T09:00:00Z'),
};

const BASE: Omit<OutgoingMail, 'ics'> = {
  to: 'marcus@example.com',
  from: 'Cicero <programme@cicero.events>',
  subject: 'Your session',
  html: '<p>hi</p>',
  text: 'hi',
};

function stubFetch() {
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ id: 'resend-1' }),
  })) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock as unknown as ReturnType<typeof vi.fn>;
}

function resendBody(fetchMock: ReturnType<typeof vi.fn>): Record<string, never> {
  const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
  return JSON.parse(init.body);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('resend calendar delivery', () => {
  it('uses Resend SMTP so an invitation is a calendar MIME alternative', async () => {
    const fetchMock = stubFetch();
    await resendTransport('key').send({
      ...BASE,
      ics: { body: buildInvite(EVENT), method: 'REQUEST' },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.resend.com',
        port: 465,
        secure: true,
        auth: { user: 'resend', pass: 'key' },
      }),
    );
    const [message] = sendMail.mock.calls[0] as unknown as [{ icalEvent: { method: string } }];
    expect(message.icalEvent.method).toBe('REQUEST');
  });

  it('uses the cancellation method on the Resend SMTP calendar part', async () => {
    const fetchMock = stubFetch();
    await resendTransport('key').send({
      ...BASE,
      ics: { body: buildCancellation(EVENT), method: 'CANCEL' },
    });

    expect(fetchMock).not.toHaveBeenCalled();
    const [message] = sendMail.mock.calls[0] as unknown as [
      { icalEvent: { method: string; content: string; filename: string } },
    ];
    expect(message.icalEvent).toMatchObject({ method: 'CANCEL', filename: 'cancel.ics' });
    expect(message.icalEvent.content).toContain('METHOD:CANCEL');
  });

  it('keeps ordinary mail on Resend HTTP with no attachment', async () => {
    const fetchMock = stubFetch();
    await resendTransport('key').send(BASE);
    expect(resendBody(fetchMock)).not.toHaveProperty('attachments');
  });
});

describe('smtp attachments', () => {
  it('passes the calendar method through to nodemailer', async () => {
    await smtpTransport({ url: 'smtp://localhost:1025' }, false).send({
      ...BASE,
      ics: { body: buildCancellation(EVENT), method: 'CANCEL' },
    });

    const [message] = sendMail.mock.calls[0] as unknown as [
      { icalEvent: { method: string; content: string } },
    ];
    expect(message.icalEvent.method).toBe('CANCEL');
    expect(message.icalEvent.content).toContain('METHOD:CANCEL');
  });

  it('sends an invitation as REQUEST', async () => {
    await smtpTransport({ url: 'smtp://localhost:1025' }, false).send({
      ...BASE,
      ics: { body: buildInvite(EVENT), method: 'REQUEST' },
    });

    const [message] = sendMail.mock.calls[0] as unknown as [{ icalEvent: { method: string } }];
    expect(message.icalEvent.method).toBe('REQUEST');
  });
});

describe('smtp connection settings', () => {
  it('prefers a connection URL when one is set', async () => {
    await smtpTransport({ url: 'smtps://u:p@mail.example.com:465', host: 'ignored' }, false).send(
      BASE,
    );
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'smtps://u:p@mail.example.com:465' }),
    );
  });

  /** `T-6`: the discrete variables `.env.example` documents have to actually reach nodemailer. */
  it('builds a connection from the discrete host fields', async () => {
    await smtpTransport(
      { host: 'mail.example.com', port: 587, secure: false, user: 'u', password: 'p@ss:word' },
      false,
    ).send(BASE);

    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'mail.example.com',
        port: 587,
        secure: false,
        auth: { user: 'u', pass: 'p@ss:word' },
      }),
    );
  });

  it('defaults the port from whether implicit TLS was asked for', async () => {
    await smtpTransport({ host: 'mail.example.com', secure: true }, false).send(BASE);
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465 }));

    await smtpTransport({ host: 'mail.example.com' }, false).send(BASE);
    expect(createTransport).toHaveBeenLastCalledWith(expect.objectContaining({ port: 587 }));
  });

  it('sends unauthenticated when no user is configured', async () => {
    await smtpTransport({ host: 'localhost', port: 1025 }, true).send(BASE);
    const [options] = createTransport.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(options).not.toHaveProperty('auth');
    expect(options.tls).toEqual({ rejectUnauthorized: false });
  });
});

describe('method reconciliation', () => {
  it('takes the body at its word when the two disagree, and says so', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    // Exactly the bug this change removes: a cancellation about to go out as an invitation.
    expect(calendarMimeMethod({ body: buildCancellation(EVENT), method: 'REQUEST' })).toBe('CANCEL');
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it('keeps the declared method when the body carries none', () => {
    expect(calendarMimeMethod({ body: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', method: 'PUBLISH' })).toBe(
      'PUBLISH',
    );
  });
});
