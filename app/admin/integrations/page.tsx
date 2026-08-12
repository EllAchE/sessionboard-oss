import { listApiKeys } from '../../api/v1/_lib/auth';
import * as accelevents from '@/lib/accelevents';
import * as airtable from '@/lib/airtable';
import { env } from '@/lib/env';
import { integrationContext } from './context';
import { IntegrationsScreen } from './IntegrationsScreen';
import type { AccelEventsPanel, AirtablePanel, ApiKeyRow, SyncLogRow } from './types';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Integrations · Cicero' };

const ENTITY_LABEL: Record<airtable.AirtableEntityType, string> = {
  speaker: 'Speakers',
  submission: 'Submissions',
  session: 'Agenda',
};

export default async function IntegrationsPage() {
  const ctx = await integrationContext();

  const [keys, mode, speakers, accelLog, airtableStatus, airtableLog] = await Promise.all([
    listApiKeys(ctx.eventId),
    Promise.resolve(accelevents.accelEventsMode()),
    accelevents.listAcceptedSpeakers(ctx.eventId),
    accelevents.listSyncLog(ctx.eventId),
    airtable.backfillStatus(ctx.eventId),
    airtable.listAirtableLog(ctx.eventId),
  ]);

  const nameByParticipant = new Map(speakers.map((row) => [row.participantId, row.displayName]));

  const accelPanel: AccelEventsPanel = {
    mode,
    eventUrl: env('ACCELEVENTS_EVENT_URL') ?? null,
    authHeader: env('ACCELEVENTS_AUTH_HEADER') ?? 'Authorization',
    speakers: speakers.map((row) => ({
      participantId: row.participantId,
      name: row.displayName,
      email: row.email,
      sessionTitles: row.sessionTitles,
      lastStatus: row.lastSync?.status ?? null,
      lastError: row.lastSync?.error ?? null,
    })),
    log: accelLog.map((row): SyncLogRow => ({
      id: row.id,
      label: (row.participantId && nameByParticipant.get(row.participantId)) || 'Speaker',
      status: row.status,
      detail: row.remoteId ? `Accelevents id ${row.remoteId}` : null,
      error: row.error,
      at: (row.syncedAt ?? row.createdAt).toISOString(),
    })),
  };

  const airtablePanel: AirtablePanel = {
    enabled: airtableStatus.enabled,
    baseId: airtableStatus.baseId,
    tables: (['speaker', 'submission', 'session'] as airtable.AirtableEntityType[]).map((type) => ({
      entity: type,
      table: airtableStatus.tables[type],
      fields: airtable.EXPECTED_FIELDS[type],
      total: airtableStatus.counts[type].total,
      synced: airtableStatus.counts[type].synced,
      failed: airtableStatus.counts[type].failed,
    })),
    log: airtableLog.map((row): SyncLogRow => ({
      id: row.id,
      label: ENTITY_LABEL[row.entityType as airtable.AirtableEntityType] ?? row.entityType,
      status: row.status,
      detail: row.remoteRecordId ? `Airtable record ${row.remoteRecordId}` : null,
      error: row.error,
      at: (row.syncedAt ?? row.createdAt).toISOString(),
    })),
  };

  const keyRows: ApiKeyRow[] = keys.map((key) => ({
    id: key.id,
    name: key.name,
    prefix: key.prefix,
    lastUsedAt: key.lastUsedAt ? key.lastUsedAt.toISOString() : null,
    revokedAt: key.revokedAt ? key.revokedAt.toISOString() : null,
    createdAt: key.createdAt.toISOString(),
  }));

  return <IntegrationsScreen keys={keyRows} accelevents={accelPanel} airtable={airtablePanel} />;
}
