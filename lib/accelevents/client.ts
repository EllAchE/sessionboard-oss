import { env } from '../env';
import {
  AppError,
  conflict,
  invalid,
  notFound,
  rateLimited,
  unauthorized,
  unavailable,
} from '../errors';
import {
  ACCELEVENTS_ERROR,
  readErrorCode,
  readErrorMessage,
  speakerListResponseSchema,
  type AccelEventsGateway,
  type AttendeeOrderInput,
  type AttendeeOrderResult,
  type AuthHeaderUsed,
  type ListSpeakersResult,
  type PushSpeakerResult,
  type SpeakerDto,
} from './types';

/**
 * `N-1a`. Plain `fetch` because this has to run on workerd, and no SDK exists for this API anyway.
 *
 * The header the key rides on is genuinely unresolved: the ReadMe security scheme names `Key`,
 * every endpoint page *also* lists an `Authorization` header, and the guide says to paste the key
 * on an "AUTHENTICATION" header, which is a UI label. No `Bearer` prefix is mentioned anywhere.
 * So the header is configuration with a default, and a 401 on the configured header is retried once
 * on the other one — the only way to settle from runtime what the documentation will not settle.
 * Whichever header worked is returned to the caller and recorded in the sync row.
 */

const DEFAULT_BASE_URL = 'https://api.accelevents.com';
const DEFAULT_TIMEOUT_MS = 15_000;
/** The list endpoint documents `expand` as required and never says what it expands. */
const DEFAULT_EXPAND = 'sessionDTO';

export type LiveClientConfig = {
  apiKey: string;
  eventUrl: string;
  baseUrl?: string;
  authHeader?: AuthHeaderUsed;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

type RawResponse = { status: number; body: unknown };

export class AccelEventsClient implements AccelEventsGateway {
  readonly kind = 'live' as const;
  readonly eventUrl: string;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly primaryHeader: AuthHeaderUsed;
  private readonly timeoutMs: number;
  private readonly doFetch: typeof fetch;

  constructor(config: LiveClientConfig) {
    this.apiKey = config.apiKey;
    this.eventUrl = config.eventUrl;
    this.baseUrl = (config.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.primaryHeader = config.authHeader ?? 'Authorization';
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.doFetch = config.fetchImpl ?? fetch;
  }

  async createSpeaker(speaker: SpeakerDto): Promise<PushSpeakerResult> {
    const { response, authHeaderUsed } = await this.request('POST', this.speakerPath(), {
      body: speaker,
    });

    if (response.status >= 200 && response.status < 300) {
      return {
        outcome: 'created',
        remoteId: readSpeakerId(response.body),
        authHeaderUsed,
        request: speaker,
        response: response.body,
      };
    }

    // The duplicate is a documented, expected outcome rather than a failure: the whole point of
    // `N-1` is that an organizer stops re-typing people, and someone already in Accelevents is the
    // steady state. It is reported, not thrown, so a bulk push does not abort on person three.
    if (readErrorCode(response.body) === ACCELEVENTS_ERROR.duplicateSpeakerEmail) {
      return {
        outcome: 'duplicate',
        remoteId: null,
        authHeaderUsed,
        request: speaker,
        response: response.body,
      };
    }

    throw this.toAppError(response, `Accelevents rejected ${speaker.email}`);
  }

  async listSpeakers(
    options: {
      expand?: string;
      page?: number;
      size?: number;
      searchString?: string;
    } = {},
  ): Promise<ListSpeakersResult> {
    const query = new URLSearchParams({
      expand: options.expand ?? DEFAULT_EXPAND,
    });
    if (options.page !== undefined) query.set('page', String(options.page));
    if (options.size !== undefined) query.set('size', String(options.size));
    if (options.searchString) query.set('searchString', options.searchString);

    const { response, authHeaderUsed } = await this.request(
      'GET',
      `${this.speakerPath()}?${query.toString()}`,
    );

    if (response.status < 200 || response.status >= 300) {
      throw this.toAppError(response, 'Accelevents could not list the orators');
    }

    const parsed = speakerListResponseSchema.safeParse(response.body);
    if (!parsed.success) {
      throw unavailable('Accelevents returned an orator roll we could not read');
    }

    return {
      speakers: parsed.data.data,
      total: parsed.data.recordsTotal ?? parsed.data.data.length,
      authHeaderUsed,
    };
  }

  /**
   * Experimental, and marked so at every layer. Attendee creation is five calls with no documented
   * complimentary flag, so a comp ticket is a zero-priced ticket type and a `CASH` payment type.
   * Nothing on the required path calls this.
   */
  async createAttendeeOrder(input: AttendeeOrderInput): Promise<AttendeeOrderResult> {
    const steps: AttendeeOrderResult['steps'] = [];
    const base = `/rest/events/${encodeURIComponent(this.eventUrl)}`;

    const settings = await this.request('GET', `${base}/staff/ticketing/settings`);
    steps.push({ step: 'availability', ok: ok(settings.response) });
    if (!ok(settings.response))
      throw this.toAppError(settings.response, 'Ticket availability lookup failed');

    const price = input.price ?? 0;
    if (price > 0) {
      const fee = await this.request('POST', `${base}/calculateFee`, {
        body: [
          {
            ticketQuantity: 1,
            ticketingTypeId: input.ticketTypeId,
            ticketPrice: String(price),
          },
        ],
      });
      steps.push({ step: 'calculateFee', ok: ok(fee.response) });
      if (!ok(fee.response)) throw this.toAppError(fee.response, 'Fee calculation failed');
    } else {
      steps.push({
        step: 'calculateFee',
        ok: true,
        detail: 'skipped, zero price',
      });
    }

    const order = await this.request('POST', `${base}/staff/ticketing/order`, {
      body: {
        clientDate: new Date().toISOString(),
        paymentType: input.paymentType ?? 'CASH',
        note: input.note ?? 'Created by Cicero',
        ticketings: [
          {
            numberOfTicket: 1,
            ticketTypeId: input.ticketTypeId,
            price,
            seatNumbers: [],
            seatNumbersDisplay: '',
            tableNumber: null,
          },
        ],
      },
    });
    steps.push({ step: 'order', ok: ok(order.response) });
    if (!ok(order.response)) throw this.toAppError(order.response, 'Order creation failed');

    const orderId = readNumber(order.response.body, 'orderId');
    if (orderId === null)
      throw unavailable('Accelevents created an order without returning its id');

    const attributes = await this.request(
      'GET',
      `${base}/staff/ticketing/order/${orderId}/formattributes`,
    );
    steps.push({ step: 'formattributes', ok: ok(attributes.response) });
    if (!ok(attributes.response))
      throw this.toAppError(attributes.response, 'Registration field lookup failed');

    const purchaserAttributes = [
      { name: 'First Name', value: input.firstName },
      { name: 'Last Name', value: input.lastName },
      { name: 'Email', value: input.email },
    ];

    const payment = await this.request(
      'POST',
      `${base}/staff/tickets/payment/order/${orderId}?uptodate=true&waitListIds=`,
      {
        body: {
          clientDate: new Date().toISOString(),
          hasholderattributes: true,
          purchaser: { attributes: purchaserAttributes },
          addOnAttributes: [],
          paymenttype: input.paymentType ?? 'CASH',
          holder: [
            {
              ticketTypeId: input.ticketTypeId,
              attributes: purchaserAttributes,
            },
          ],
        },
      },
    );
    steps.push({ step: 'payment', ok: ok(payment.response) });
    if (!ok(payment.response)) throw this.toAppError(payment.response, 'Order payment failed');

    return {
      orderId,
      attendeeId: readNumber(payment.response.body, 'attendeeId'),
      eventTicketId: readNumber(payment.response.body, 'eventTicketId'),
      email: readString(payment.response.body, 'email') ?? input.email,
      steps,
    };
  }

  private speakerPath(): string {
    return `/rest/host/event/${encodeURIComponent(this.eventUrl)}/speaker`;
  }

  private async request(
    method: string,
    path: string,
    options: { body?: unknown } = {},
  ): Promise<{ response: RawResponse; authHeaderUsed: AuthHeaderUsed }> {
    const first = await this.send(method, path, this.primaryHeader, options.body);
    if (first.status !== 401) return { response: first, authHeaderUsed: this.primaryHeader };

    const fallback: AuthHeaderUsed =
      this.primaryHeader === 'Authorization' ? 'Key' : 'Authorization';
    const second = await this.send(method, path, fallback, options.body);
    return second.status === 401
      ? { response: second, authHeaderUsed: this.primaryHeader }
      : { response: second, authHeaderUsed: fallback };
  }

  private async send(
    method: string,
    path: string,
    header: AuthHeaderUsed,
    body: unknown,
  ): Promise<RawResponse> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      [header]: this.apiKey,
    };
    if (body !== undefined) headers['content-type'] = 'application/json';

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.doFetch(`${this.baseUrl}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: controller.signal,
      });
      return { status: res.status, body: await readBody(res) };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw unavailable('Accelevents did not respond in time');
      }
      throw unavailable(
        `Could not reach Accelevents: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  private toAppError(response: RawResponse, fallback: string): AppError {
    const code = readErrorCode(response.body);
    const message = readErrorMessage(response.body, fallback);

    if (code === ACCELEVENTS_ERROR.duplicateSpeakerEmail) return conflict(message);
    if (code === ACCELEVENTS_ERROR.ambiguousUserEmail) return conflict(message);
    if (code === ACCELEVENTS_ERROR.notEventHost) {
      return unauthorized('This API key is not a host on that Accelevents event');
    }
    if (code === ACCELEVENTS_ERROR.eventNotFound) return notFound('That Accelevents event');

    switch (response.status) {
      case 400:
        return invalid(message);
      case 401:
        return unauthorized(
          'Accelevents rejected the API key on both the Authorization and Key headers',
        );
      case 403:
        return unauthorized(message);
      case 404:
        return notFound('That Accelevents resource');
      case 429:
        return rateLimited('Accelevents is rate limiting us');
      default:
        return unavailable(`${message} (HTTP ${response.status})`);
    }
  }
}

function ok(response: RawResponse): boolean {
  return response.status >= 200 && response.status < 300;
}

async function readBody(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text === '') return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

/**
 * The create endpoint documents a bare integer id as its 200 body, while the object form appears in
 * the list response. Both are accepted rather than guessed at.
 */
function readSpeakerId(body: unknown): string | null {
  if (typeof body === 'number') return String(body);
  if (typeof body === 'string' && /^\d+$/.test(body.trim())) return body.trim();
  const value = readNumber(body, 'speakerId') ?? readNumber(body, 'id');
  return value === null ? null : String(value);
}

function readNumber(body: unknown, key: string): number | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function readString(body: unknown, key: string): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const value = (body as Record<string, unknown>)[key];
  return typeof value === 'string' ? value : null;
}

/** Configuration for the live client, or `null` when the integration is not set up. */
export function liveClientConfig(): LiveClientConfig | null {
  const apiKey = env('ACCELEVENTS_API_KEY');
  const eventUrl = env('ACCELEVENTS_EVENT_URL');
  if (!apiKey || !eventUrl) return null;

  const configured = env('ACCELEVENTS_AUTH_HEADER');
  return {
    apiKey,
    eventUrl,
    baseUrl: env('ACCELEVENTS_BASE_URL') ?? DEFAULT_BASE_URL,
    authHeader: configured === 'Key' ? 'Key' : 'Authorization',
  };
}
