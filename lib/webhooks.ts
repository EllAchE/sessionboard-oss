import { and, desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import {
  webhookDelivery,
  webhookEndpoint,
  scheduledSession,
  type WebhookEventType,
} from '@/db/schema';
import { conflict, invalid, notFound } from '@/lib/errors';
import { randomToken } from '@/lib/ids';

export const WEBHOOK_EVENT_TYPES = [
  'submission.received',
  'submission.decision_made',
  'session.scheduled',
] as const satisfies readonly WebhookEventType[];

const DELIVERY_TIMEOUT_MS = 5_000;

function logDispatchError(message: string): void {
  // Unit tests intentionally replace partial database surfaces; production delivery failures log.
  if (process.env.NODE_ENV !== 'test') console.error(message);
}

export type WebhookEndpointSummary = {
  id: string;
  name: string;
  url: string;
  secretPrefix: string;
  eventTypes: WebhookEventType[];
  enabled: boolean;
  createdAt: Date;
};

export type WebhookDeliverySummary = {
  id: string;
  endpointId: string;
  eventType: WebhookEventType;
  status: 'queued' | 'delivered' | 'failed';
  attempts: number;
  responseStatus: number | null;
  error: string | null;
  deliveredAt: Date | null;
  createdAt: Date;
};

function webhookUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw invalid('Enter a valid webhook URL', { url: 'Enter a full http or https URL' });
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw invalid('Enter a valid webhook URL', {
      url: 'Use http or https without credentials in the URL',
    });
  }
  parsed.hash = '';
  return parsed.toString();
}

function normalizedEventTypes(values: WebhookEventType[]): WebhookEventType[] {
  const allowed = new Set<WebhookEventType>(WEBHOOK_EVENT_TYPES);
  const eventTypes = [...new Set(values)].filter((value) => allowed.has(value));
  if (eventTypes.length === 0 || eventTypes.length !== new Set(values).size) {
    throw invalid('Choose at least one valid webhook event');
  }
  return eventTypes;
}

export async function createWebhookEndpoint(
  eventId: string,
  input: { name: string; url: string; eventTypes: WebhookEventType[] },
): Promise<WebhookEndpointSummary & { signingSecret: string }> {
  const name = input.name.trim();
  if (!name) throw invalid('Give this webhook a name', { name: 'Name is required' });
  if (name.length > 80) throw invalid('Webhook names are limited to 80 characters');

  const url = webhookUrl(input.url);
  const eventTypes = normalizedEventTypes(input.eventTypes);
  const db = getDb();
  const existing = await db.query.webhookEndpoint.findFirst({
    where: and(eq(webhookEndpoint.eventId, eventId), eq(webhookEndpoint.url, url)),
  });
  if (existing) throw conflict('A webhook already uses that URL for this event');

  const signingSecret = `whsec_${randomToken()}`;
  const [created] = await db
    .insert(webhookEndpoint)
    .values({
      eventId,
      name,
      url,
      eventTypes,
      signingSecret,
      secretPrefix: signingSecret.slice(0, 14),
    })
    .returning();

  return { ...created, signingSecret };
}

export async function disableWebhookEndpoint(eventId: string, endpointId: string): Promise<void> {
  const [changed] = await getDb()
    .update(webhookEndpoint)
    .set({ enabled: false, updatedAt: new Date() })
    .where(and(eq(webhookEndpoint.eventId, eventId), eq(webhookEndpoint.id, endpointId)))
    .returning({ id: webhookEndpoint.id });
  if (!changed) throw notFound('That webhook');
}

export async function listWebhookEndpoints(eventId: string): Promise<WebhookEndpointSummary[]> {
  const rows = await getDb().query.webhookEndpoint.findMany({
    where: eq(webhookEndpoint.eventId, eventId),
    orderBy: [desc(webhookEndpoint.createdAt)],
  });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    url: row.url,
    secretPrefix: row.secretPrefix,
    eventTypes: row.eventTypes,
    enabled: row.enabled,
    createdAt: row.createdAt,
  }));
}

export async function listWebhookDeliveries(
  eventId: string,
  limit = 50,
): Promise<WebhookDeliverySummary[]> {
  return getDb().query.webhookDelivery.findMany({
    where: eq(webhookDelivery.eventId, eventId),
    orderBy: [desc(webhookDelivery.createdAt)],
    limit: Math.min(Math.max(limit, 1), 100),
    columns: { payload: false, eventId: false },
  });
}

async function signature(secret: string, body: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signed = new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(body)));
  return `v1=${Array.from(signed, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function deliver(
  endpoint: typeof webhookEndpoint.$inferSelect,
  eventType: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  const deliveryId = crypto.randomUUID();
  const createdAt = new Date();
  const payload = {
    id: deliveryId,
    type: eventType,
    createdAt: createdAt.toISOString(),
    eventId: endpoint.eventId,
    data,
  };
  const [delivery] = await db
    .insert(webhookDelivery)
    .values({
      id: deliveryId,
      eventId: endpoint.eventId,
      endpointId: endpoint.id,
      eventType,
      payload,
    })
    .returning({ id: webhookDelivery.id });

  const body = JSON.stringify(payload);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Cicero-Webhooks/1.0',
        'x-cicero-delivery': delivery.id,
        'x-cicero-event': eventType,
        'x-cicero-signature': await signature(endpoint.signingSecret, body),
      },
      body,
      signal: controller.signal,
    });
    await response.body?.cancel().catch(() => undefined);
    const delivered = response.ok;
    await db
      .update(webhookDelivery)
      .set({
        status: delivered ? 'delivered' : 'failed',
        attempts: 1,
        responseStatus: response.status,
        error: delivered ? null : `Endpoint returned HTTP ${response.status}`,
        deliveredAt: delivered ? new Date() : null,
      })
      .where(eq(webhookDelivery.id, delivery.id));
  } catch (error) {
    await db
      .update(webhookDelivery)
      .set({
        status: 'failed',
        attempts: 1,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      })
      .where(eq(webhookDelivery.id, delivery.id));
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Lifecycle writes are authoritative even when an integrator is down. Delivery is therefore
 * best-effort after the database mutation, with every failure retained for the admin log.
 */
export async function emitWebhook(
  eventId: string,
  eventType: WebhookEventType,
  data: Record<string, unknown>,
): Promise<void> {
  try {
    const endpoints = await getDb().query.webhookEndpoint.findMany({
      where: and(eq(webhookEndpoint.eventId, eventId), eq(webhookEndpoint.enabled, true)),
    });
    const subscribed = endpoints.filter((endpoint) => endpoint.eventTypes.includes(eventType));
    await Promise.all(subscribed.map((endpoint) => deliver(endpoint, eventType, data)));
  } catch (error) {
    logDispatchError(`webhook dispatch failed for ${eventType}: ${String(error)}`);
  }
}

/** Reads the committed row so webhook times match database defaults and atomic agenda mutations. */
export async function emitSessionScheduled(eventId: string, sessionId: string): Promise<void> {
  try {
    const session = await getDb().query.scheduledSession.findFirst({
      where: and(eq(scheduledSession.eventId, eventId), eq(scheduledSession.id, sessionId)),
    });
    if (!session?.startsAt) return;
    await emitWebhook(eventId, 'session.scheduled', {
      sessionId: session.id,
      submissionId: session.submissionId,
      ref: session.ref,
      title: session.title,
      status: session.status,
      roomId: session.roomId,
      trackId: session.trackId,
      startsAt: session.startsAt.toISOString(),
      endsAt: session.endsAt?.toISOString() ?? null,
    });
  } catch (error) {
    logDispatchError(`webhook dispatch failed for session ${sessionId}: ${String(error)}`);
  }
}
