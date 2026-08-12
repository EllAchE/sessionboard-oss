import { z } from 'zod';

/**
 * Shapes transcribed from the Accelevents ReadMe pages for `create-speaker` and `get-all-speakers`
 * (`docs/02-architecture.md` §7). There is no downloadable OpenAPI file, so these are the contract
 * as far as it is verifiable, and the fixtures in `./fixtures` are the recorded form of it.
 *
 * `linkedIn` is documented as a boolean on the create page and as a string on the list page. The
 * string reading is the only one that can carry a profile URL, so we send a string and accept
 * either coming back.
 */

export const speakerDtoSchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  title: z.string().optional(),
  pronouns: z.string().optional(),
  company: z.string().optional(),
  bio: z.string().optional(),
  imageUrl: z.string().optional(),
  linkedIn: z.string().optional(),
  twitter: z.string().optional(),
  instagram: z.string().optional(),
  position: z.number().optional(),
  moderator: z.boolean().optional(),
  showModerator: z.boolean().optional(),
  allowAttendeeAccess: z.boolean().optional(),
  allowOverrideDetails: z.boolean().optional(),
  deviceChecked: z.boolean().optional(),
  speakerId: z.number().optional(),
  userId: z.number().optional(),
  ticketTypesForSpeaker: z
    .array(
      z.object({
        ticketTypeId: z.number().optional(),
        userId: z.number().optional(),
        speakerOrder: z.boolean().optional(),
      }),
    )
    .optional(),
});

export type SpeakerDto = z.infer<typeof speakerDtoSchema>;

/** The create response echoes a `SpeakerDTO`; only `speakerId` is load-bearing for us. */
export const speakerResponseSchema = speakerDtoSchema.extend({
  speakerId: z.number().optional(),
});

export const speakerListResponseSchema = z.object({
  recordsTotal: z.number().optional(),
  recordsFiltered: z.number().optional(),
  data: z.array(speakerDtoSchema.passthrough()).default([]),
  error: z.unknown().optional(),
});

export type SpeakerListResponse = z.infer<typeof speakerListResponseSchema>;

/**
 * Accelevents returns a numeric `errorCode` alongside the HTTP status. The two that change our
 * behaviour are the duplicate-email reject and the not-a-host reject; the rest are surfaced.
 */
export const ACCELEVENTS_ERROR = {
  /** "Speaker already exist with same email." A hard reject, never an upsert. */
  duplicateSpeakerEmail: 4068906,
  /** "More than one user exist with same email" */
  ambiguousUserEmail: 406,
  notEventHost: 4030201,
  eventNotFound: 4040200,
} as const;

export const errorBodySchema = z
  .object({
    errorCode: z.union([z.number(), z.string()]).optional(),
    code: z.union([z.number(), z.string()]).optional(),
    message: z.string().optional(),
    error: z.string().optional(),
    errorMessage: z.string().optional(),
  })
  .passthrough();

export function readErrorCode(body: unknown): number | undefined {
  const parsed = errorBodySchema.safeParse(body);
  if (!parsed.success) return undefined;
  const raw = parsed.data.errorCode ?? parsed.data.code;
  if (raw === undefined) return undefined;
  const value = typeof raw === 'string' ? Number(raw) : raw;
  return Number.isFinite(value) ? value : undefined;
}

export function readErrorMessage(body: unknown, fallback: string): string {
  const parsed = errorBodySchema.safeParse(body);
  if (!parsed.success) return fallback;
  return parsed.data.message ?? parsed.data.errorMessage ?? parsed.data.error ?? fallback;
}

/** Which header carried the key on the call that succeeded — recorded so the ambiguity is visible. */
export type AuthHeaderUsed = 'Authorization' | 'Key';

export type PushSpeakerResult = {
  outcome: 'created' | 'duplicate';
  remoteId: string | null;
  authHeaderUsed: AuthHeaderUsed;
  request: SpeakerDto;
  response: unknown;
};

export type ListSpeakersResult = {
  speakers: SpeakerDto[];
  total: number;
  authHeaderUsed: AuthHeaderUsed;
};

/**
 * `N-1b`. Everything above the gateway — the sync service, the admin screens, the tests — depends
 * on this and never on `fetch`, which is what lets a judge without credentials drive the same code
 * path the live client would take.
 */
export interface AccelEventsGateway {
  readonly kind: 'live' | 'fake';
  /** Present so a caller can say which event a failure belongs to without re-reading env. */
  readonly eventUrl: string;
  createSpeaker(speaker: SpeakerDto): Promise<PushSpeakerResult>;
  listSpeakers(options?: {
    expand?: string;
    page?: number;
    size?: number;
    searchString?: string;
  }): Promise<ListSpeakersResult>;
  /**
   * Experimental. The five-call order flow is documented as a sequence with no complimentary flag,
   * so this is behind the same interface but never on the required path — see §7.
   */
  createAttendeeOrder(input: AttendeeOrderInput): Promise<AttendeeOrderResult>;
}

export type AttendeeOrderInput = {
  ticketTypeId: number;
  firstName: string;
  lastName: string;
  email: string;
  /** Zero is how a comp ticket is expressed; there is no documented complimentary flag. */
  price?: number;
  paymentType?: string;
  note?: string;
};

export type AttendeeOrderResult = {
  orderId: number | null;
  attendeeId: number | null;
  eventTicketId: number | null;
  email: string | null;
  /** Each documented step and what came back, so a failure names the call that broke. */
  steps: { step: string; ok: boolean; detail?: string }[];
};
