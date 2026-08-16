import { can } from '@/lib/context';
import { eventBrandingUrl } from '@/lib/event-branding';
import { utcToLocalInput } from '@/lib/event-dates';
import { portalLogoOrganizerUrl } from '@/lib/portal-appearance';
import { currentEventContext, getEvent } from '@/lib/services/events';
import {
  FIELD_TYPE_VALUES,
  getNotificationPrefs,
  getPortalAppearance,
  loadSettings,
} from '@/lib/services/settings';
import { SettingsScreen } from './SettingsScreen';
import type { EntityKind, EntityRow } from './types';

/**
 * The server shell. Everything the six panels need arrives in one payload, because they are edited
 * side by side and a per-tab fetch would let the tracks tab disagree with the delete dialog about
 * how many submissions are filed under a track.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings · Cicero' };

function text(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  return String(value);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const [ctx, resolved] = await Promise.all([currentEventContext(), searchParams]);
  const [snapshot, event, portal, notifications] = await Promise.all([
    loadSettings(ctx),
    getEvent(ctx.eventId),
    getPortalAppearance(ctx.eventId),
    getNotificationPrefs(ctx.actor.userId, ctx.eventId),
  ]);

  const rows: Record<EntityKind, EntityRow[]> = {
    track: snapshot.tracks.map((row) => ({
      id: row.id,
      usage: snapshot.usage.tracks[row.id] ?? 0,
      values: { name: row.name, color: text(row.color), description: text(row.description) },
    })),
    room: snapshot.rooms.map((row) => ({
      id: row.id,
      usage: snapshot.usage.rooms[row.id] ?? 0,
      values: { name: row.name, capacity: text(row.capacity), floor: text(row.floor) },
    })),
    format: snapshot.formats.map((row) => ({
      id: row.id,
      usage: snapshot.usage.formats[row.id] ?? 0,
      values: {
        name: row.name,
        durationMinutes: text(row.durationMinutes),
        description: text(row.description),
      },
    })),
    tag: snapshot.tags.map((row) => ({
      id: row.id,
      usage: snapshot.usage.tags[row.id] ?? 0,
      values: { name: row.name, color: text(row.color) },
    })),
    persona: snapshot.personas.map((row) => ({
      id: row.id,
      usage: snapshot.usage.personas[row.id] ?? 0,
      values: { name: row.name, description: text(row.description) },
    })),
    field: snapshot.fieldEntries.map((row) => ({
      id: row.id,
      usage: snapshot.usage.fieldEntries[row.id] ?? 0,
      values: {
        key: row.key,
        label: row.label,
        type: row.type,
        helpText: text(row.helpText),
        options: (row.options ?? []).join(', '),
      },
    })),
  };

  return (
    <SettingsScreen
      event={{
        id: event.id,
        name: event.name,
        slug: event.slug,
        tagline: event.tagline,
        descriptionMarkdown: event.descriptionMarkdown,
        eventType: event.eventType,
        theme: event.theme,
        timezone: event.timezone,
        startsAt: utcToLocalInput(event.startsAt, event.timezone),
        endsAt: utcToLocalInput(event.endsAt, event.timezone),
        speakerDeadlineAt: event.speakerDeadlineAt
          ? utcToLocalInput(event.speakerDeadlineAt, event.timezone)
          : '',
        agendaDeadlineAt: event.agendaDeadlineAt
          ? utcToLocalInput(event.agendaDeadlineAt, event.timezone)
          : '',
        websiteUrl: event.websiteUrl,
        venueName: event.venueName,
        venueAddress: event.venueAddress,
        logoUrl: eventBrandingUrl(event.slug, event.logoFileId),
        bannerUrl: eventBrandingUrl(event.slug, event.bannerFileId),
      }}
      portal={{
        logoUrl: portalLogoOrganizerUrl(portal.logoFileId),
        accentColor: portal.accentColor,
        welcomeMarkdown: portal.welcomeMarkdown,
        supportEmail: portal.supportEmail,
      }}
      notifications={notifications}
      rows={rows}
      fieldTypes={[...FIELD_TYPE_VALUES]}
      initialTab={resolved.tab ?? 'event'}
      canManage={can(ctx, 'event:manage')}
    />
  );
}
