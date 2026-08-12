import { buildDownload } from '@/lib/ics';
import type { PublicEvent, PublicSession } from './model';

/**
 * `EMB-11`. An attendee's picks leave as one file, so the calendar client files them in a single
 * import rather than asking eight times. The VEVENT bodies come from `lib/ics` unchanged — folding,
 * escaping and the UTC stamps are the part that is easy to get subtly wrong, and it is already
 * written once there.
 */

const ORGANIZER_EMAIL = 'noreply@cicero.events';

function veventOf(calendar: string): string {
  const start = calendar.indexOf('BEGIN:VEVENT');
  const end = calendar.indexOf('END:VEVENT');
  if (start === -1 || end === -1) return '';
  return calendar.slice(start, end + 'END:VEVENT'.length);
}

export function calendarEventFor(session: PublicSession, event: PublicEvent) {
  const startsAt = new Date(session.startsAt as string);
  const endsAt = session.endsAt
    ? new Date(session.endsAt)
    : new Date(startsAt.getTime() + 60 * 60 * 1000);
  return {
    uid: `${session.id}@cicero.events`,
    sequence: 0,
    summary: session.title,
    startsAt,
    endsAt,
    description: session.descriptionText || null,
    location: [session.room, event.venueName].filter(Boolean).join(', ') || null,
    url: event.websiteUrl,
    organizer: { email: ORGANIZER_EMAIL, name: event.name },
  };
}

export function buildSessionCalendar(session: PublicSession, event: PublicEvent): string {
  return buildDownload(calendarEventFor(session, event));
}

export function buildScheduleCalendar(sessions: PublicSession[], event: PublicEvent): string {
  const dated = sessions.filter((session) => session.startsAt);
  if (dated.length === 0) return '';

  const calendars = dated.map((session) => buildSessionCalendar(session, event));
  const [first, ...rest] = calendars;
  const extra = rest.map(veventOf).filter(Boolean);
  if (extra.length === 0) return first;

  return first.replace('END:VCALENDAR', `${extra.join('\r\n')}\r\nEND:VCALENDAR`);
}

export function calendarFilename(event: PublicEvent): string {
  const stem =
    event.slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'schedule';
  return `${stem}-my-schedule.ics`;
}
