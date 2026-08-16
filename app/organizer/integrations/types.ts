export type ActionResult<T = null> =
  { ok: true; data: T } | { ok: false; message: string; details?: Record<string, string> };

export type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scope: 'read' | 'write';
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

export type WebhookPanel = {
  endpoints: Array<{
    id: string;
    name: string;
    url: string;
    secretPrefix: string;
    eventTypes: string[];
    enabled: boolean;
    createdAt: string;
  }>;
  deliveries: Array<{
    id: string;
    endpointId: string;
    eventType: string;
    status: 'queued' | 'delivered' | 'failed';
    attempts: number;
    responseStatus: number | null;
    error: string | null;
    createdAt: string;
  }>;
};

export type SyncLogRow = {
  id: string;
  label: string;
  status: 'pending' | 'synced' | 'failed';
  detail: string | null;
  error: string | null;
  at: string;
};

export type AccelEventsPanel = {
  mode: 'live' | 'fake' | 'disabled';
  eventUrl: string | null;
  authHeader: string;
  speakers: {
    participantId: string;
    name: string;
    email: string;
    sessionTitles: string[];
    lastStatus: 'pending' | 'synced' | 'failed' | null;
    lastError: string | null;
  }[];
  log: SyncLogRow[];
};

export type AirtablePanel = {
  enabled: boolean;
  baseId: string | null;
  tables: {
    entity: string;
    table: string;
    fields: string[];
    total: number;
    synced: number;
    failed: number;
  }[];
  log: SyncLogRow[];
};

export type SmsPanel = {
  /** `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `SMS_FROM` all set. */
  configured: boolean;
  transport: 'twilio' | 'log';
  from: string | null;
};

export type TestResult = { ok: boolean; message: string; extra: string | null };
