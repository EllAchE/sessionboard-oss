import { env } from '../env';
import { AppError, invalid, notFound, rateLimited, unauthorized, unavailable } from '../errors';

/**
 * `Z-2`. A one-way mirror over plain `fetch` — no SDK, because the official client does not run on
 * workerd and this is four endpoints.
 *
 * Airtable's published limit is 5 requests per second per base, and exceeding it returns a 429 with
 * a 30-second lockout. That penalty is why the limiter here is a hard serialized gate rather than a
 * retry loop: one burst costs more than every request it saved.
 */

const API_BASE = 'https://api.airtable.com/v0';
const MIN_INTERVAL_MS = 220; // 5 rps, with headroom for clock jitter.
const MAX_BATCH = 10; // Airtable's own cap on records per create/update call.
const DEFAULT_TIMEOUT_MS = 20_000;

export type AirtableConfig = {
  apiKey: string;
  baseId: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

export type AirtableRecord = {
  id: string;
  fields: Record<string, unknown>;
};

export type FieldMap = Record<string, unknown>;

export class AirtableClient {
  private readonly apiKey: string;
  readonly baseId: string;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;
  /** Serializes every request through one promise chain; concurrent callers queue behind it. */
  private gate: Promise<void> = Promise.resolve();
  private lastRequestAt = 0;

  constructor(config: AirtableConfig) {
    this.apiKey = config.apiKey;
    this.baseId = config.baseId;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.doFetch = config.fetchImpl ?? fetch;
  }

  async listTables(): Promise<{ id: string; name: string }[]> {
    const body = await this.request<{
      tables?: { id: string; name: string }[];
    }>('GET', `/meta/bases/${encodeURIComponent(this.baseId)}/tables`);
    return (body.tables ?? []).map((table) => ({
      id: table.id,
      name: table.name,
    }));
  }

  async createRecords(table: string, records: FieldMap[]): Promise<AirtableRecord[]> {
    const created: AirtableRecord[] = [];
    for (const chunk of batches(records, MAX_BATCH)) {
      const body = await this.request<{ records: AirtableRecord[] }>(
        'POST',
        `/${encodeURIComponent(this.baseId)}/${encodeURIComponent(table)}`,
        { records: chunk.map((fields) => ({ fields })), typecast: true },
      );
      created.push(...body.records);
    }
    return created;
  }

  async updateRecords(
    table: string,
    records: { id: string; fields: FieldMap }[],
  ): Promise<AirtableRecord[]> {
    const updated: AirtableRecord[] = [];
    for (const chunk of batches(records, MAX_BATCH)) {
      const body = await this.request<{ records: AirtableRecord[] }>(
        'PATCH',
        `/${encodeURIComponent(this.baseId)}/${encodeURIComponent(table)}`,
        { records: chunk, typecast: true },
      );
      updated.push(...body.records);
    }
    return updated;
  }

  async listRecords(
    table: string,
    options: { pageSize?: number; view?: string } = {},
  ): Promise<AirtableRecord[]> {
    const query = new URLSearchParams();
    if (options.pageSize) query.set('pageSize', String(options.pageSize));
    if (options.view) query.set('view', options.view);
    const suffix = query.toString() ? `?${query.toString()}` : '';

    const body = await this.request<{ records: AirtableRecord[] }>(
      'GET',
      `/${encodeURIComponent(this.baseId)}/${encodeURIComponent(table)}${suffix}`,
    );
    return body.records;
  }

  /**
   * The limiter. Every call takes its turn on `gate`, and the turn does not start until
   * `MIN_INTERVAL_MS` has passed since the previous one began.
   */
  private async throttle(): Promise<void> {
    const mine = this.gate.then(async () => {
      const wait = this.lastRequestAt + MIN_INTERVAL_MS - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      this.lastRequestAt = Date.now();
    });
    this.gate = mine.catch(() => undefined);
    return mine;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    await this.throttle();

    const url = `${API_BASE}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let response: Response;
    try {
      response = await this.doFetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          accept: 'application/json',
          ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw unavailable('Airtable did not respond in time');
      }
      throw unavailable(
        `Could not reach Airtable: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }

    const text = await response.text();
    const parsed = text === '' ? null : safeJson(text);

    if (!response.ok) throw toAppError(response.status, parsed, text);
    return parsed as T;
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toAppError(status: number, parsed: unknown, raw: string): AppError {
  const message =
    readAirtableMessage(parsed) ?? raw.slice(0, 200) ?? 'Airtable rejected the request';

  switch (status) {
    case 401:
      return unauthorized('Airtable rejected the API key');
    case 403:
      return unauthorized('That Airtable key cannot write to this base');
    case 404:
      return notFound('That Airtable base or table');
    case 422:
    case 400:
      return invalid(`Airtable rejected the record: ${message}`);
    case 429:
      // Airtable locks the base out for 30 seconds after a burst, so this is not worth retrying
      // inside the request; the resumable backfill picks it up on the next run instead.
      return rateLimited('Airtable is rate limiting this base. Wait 30 seconds and resume');
    default:
      return unavailable(`Airtable error ${status}: ${message}`);
  }
}

function readAirtableMessage(parsed: unknown): string | undefined {
  if (typeof parsed !== 'object' || parsed === null) return undefined;
  const error = (parsed as { error?: unknown }).error;
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null) {
    const message = (error as { message?: unknown }).message;
    const type = (error as { type?: unknown }).type;
    if (typeof message === 'string') return message;
    if (typeof type === 'string') return type;
  }
  return undefined;
}

function batches<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export function airtableConfig(): AirtableConfig | null {
  const apiKey = env('AIRTABLE_API_KEY');
  const baseId = env('AIRTABLE_BASE_ID');
  if (!apiKey || !baseId) return null;
  return { apiKey, baseId };
}

export function getAirtableClient(): AirtableClient | null {
  const config = airtableConfig();
  return config ? new AirtableClient(config) : null;
}
