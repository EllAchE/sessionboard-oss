import { conflict, unauthorized } from '../errors';
import {
  CREATE_SPEAKER_RESPONSE,
  DUPLICATE_SPEAKER_RESPONSE,
  FIXTURE_EVENT_URL,
  LIST_SPEAKERS_RESPONSE,
  PAYMENT_ORDER_RESPONSE,
  CREATE_ORDER_RESPONSE,
  TICKETING_SETTINGS_RESPONSE,
} from './fixtures';
import type {
  AccelEventsGateway,
  AttendeeOrderInput,
  AttendeeOrderResult,
  AuthHeaderUsed,
  ListSpeakersResult,
  PushSpeakerResult,
  SpeakerDto,
} from './types';

/**
 * `N-1b`. The fake is the demo path and the test path, so it enforces the one rule that makes the
 * live client non-trivial: a duplicate email is rejected with `4068906` rather than upserted. A
 * fake that quietly accepted the second push would let a bug ship that only a real key could find.
 */

export type FakeOptions = {
  eventUrl?: string;
  /** Seeded emails count as already present, so a demo can show the dedupe without a first push. */
  existingEmails?: string[];
  authHeaderUsed?: AuthHeaderUsed;
  /** Forces every call to fail the way an unset or wrong key does. */
  unauthorized?: boolean;
};

export class FakeAccelEventsGateway implements AccelEventsGateway {
  readonly kind = 'fake' as const;
  readonly eventUrl: string;

  private nextSpeakerId = CREATE_SPEAKER_RESPONSE.speakerId + 1;
  private readonly byEmail = new Map<string, SpeakerDto & { speakerId: number }>();
  private readonly authHeaderUsed: AuthHeaderUsed;
  private readonly failUnauthorized: boolean;

  constructor(options: FakeOptions = {}) {
    this.eventUrl = options.eventUrl ?? FIXTURE_EVENT_URL;
    this.authHeaderUsed = options.authHeaderUsed ?? 'Authorization';
    this.failUnauthorized = options.unauthorized ?? false;

    for (const speaker of LIST_SPEAKERS_RESPONSE.data) {
      if ((options.existingEmails ?? []).includes(speaker.email)) {
        this.byEmail.set(normalizeEmail(speaker.email), { ...speaker });
      }
    }
    for (const email of options.existingEmails ?? []) {
      const key = normalizeEmail(email);
      if (!this.byEmail.has(key)) {
        this.byEmail.set(key, {
          speakerId: this.nextSpeakerId++,
          firstName: '',
          lastName: '',
          email,
        });
      }
    }
  }

  async createSpeaker(speaker: SpeakerDto): Promise<PushSpeakerResult> {
    this.assertAuthorized();
    const key = normalizeEmail(speaker.email);

    if (this.byEmail.has(key)) {
      return {
        outcome: 'duplicate',
        remoteId: String(this.byEmail.get(key)!.speakerId),
        authHeaderUsed: this.authHeaderUsed,
        request: speaker,
        response: DUPLICATE_SPEAKER_RESPONSE,
      };
    }

    const speakerId = this.nextSpeakerId++;
    const stored = { ...speaker, speakerId };
    this.byEmail.set(key, stored);

    return {
      outcome: 'created',
      remoteId: String(speakerId),
      authHeaderUsed: this.authHeaderUsed,
      request: speaker,
      response: stored,
    };
  }

  async listSpeakers(): Promise<ListSpeakersResult> {
    this.assertAuthorized();
    const speakers = [...this.byEmail.values()];
    return {
      speakers,
      total: speakers.length,
      authHeaderUsed: this.authHeaderUsed,
    };
  }

  async createAttendeeOrder(input: AttendeeOrderInput): Promise<AttendeeOrderResult> {
    this.assertAuthorized();
    const ticket = TICKETING_SETTINGS_RESPONSE.ticketTypes.find((t) => t.id === input.ticketTypeId);
    if (!ticket) throw conflict(`Ticket type ${input.ticketTypeId} is not on sale for this event`);
    if (ticket.remainingTickets <= 0) throw conflict(`${ticket.name} is sold out`);

    return {
      orderId: CREATE_ORDER_RESPONSE.orderId,
      attendeeId: PAYMENT_ORDER_RESPONSE.attendeeId,
      eventTicketId: PAYMENT_ORDER_RESPONSE.eventTicketId,
      email: input.email,
      steps: [
        { step: 'availability', ok: true, detail: ticket.name },
        {
          step: 'calculateFee',
          ok: true,
          detail: ticket.price === 0 ? 'skipped, zero price' : 'ok',
        },
        {
          step: 'order',
          ok: true,
          detail: String(CREATE_ORDER_RESPONSE.orderId),
        },
        { step: 'formattributes', ok: true },
        {
          step: 'payment',
          ok: true,
          detail: String(PAYMENT_ORDER_RESPONSE.attendeeId),
        },
      ],
    };
  }

  private assertAuthorized(): void {
    if (this.failUnauthorized) {
      throw unauthorized(
        'Accelevents rejected the API key on both the Authorization and Key headers',
      );
    }
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
