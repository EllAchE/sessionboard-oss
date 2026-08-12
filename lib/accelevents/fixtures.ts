/**
 * `N-1b`. Recorded request and response shapes for every Accelevents call we make, transcribed
 * from the ReadMe reference pages listed in `docs/02-architecture.md` §7. Both the fake gateway
 * and the live client's tests read from here, so a change to the contract is a change in one file.
 *
 * These are fixtures, not mocks: the bodies are what the documentation says the API returns,
 * including the duplicate-email reject that shapes our dedupe.
 */

export const FIXTURE_EVENT_URL = 'ai-engineer-world-fair';

export const CREATE_SPEAKER_REQUEST = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  title: 'Analytical Engines in Production',
  company: 'Difference Engine Co',
  bio: 'Ada works on program synthesis.',
  pronouns: 'she/her',
  imageUrl: 'https://cdn.example.com/headshots/ada.jpg',
  linkedIn: 'https://www.linkedin.com/in/ada',
  twitter: 'https://twitter.com/ada',
  position: 0,
  moderator: false,
  allowAttendeeAccess: true,
} as const;

/** 200. The reference documents the create response as the new speaker id. */
export const CREATE_SPEAKER_RESPONSE = {
  speakerId: 12,
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  userId: 90210,
} as const;

/** 400 + `4068906`. A second push of the same email is rejected, not merged. */
export const DUPLICATE_SPEAKER_RESPONSE = {
  errorCode: 4068906,
  message: 'Speaker already exist with same email.',
} as const;

/** 401. What comes back when the key rode on the header Accelevents did not want. */
export const UNAUTHORIZED_RESPONSE = {
  errorCode: 401,
  message: 'You are not authorized to view the resource',
} as const;

export const NOT_EVENT_HOST_RESPONSE = {
  errorCode: 4030201,
  message: 'Not Event Host',
} as const;

export const EVENT_NOT_FOUND_RESPONSE = {
  errorCode: 4040200,
  message: 'Event Not Found',
} as const;

/** 200 for `GET /rest/host/event/{eventUrl}/speaker?expand=...`. */
export const LIST_SPEAKERS_RESPONSE = {
  recordsTotal: 2,
  recordsFiltered: 2,
  data: [
    {
      speakerId: 12,
      firstName: 'Ada',
      lastName: 'Lovelace',
      email: 'ada@example.com',
      title: 'Analytical Engines in Production',
      company: 'Difference Engine Co',
      bio: 'Ada works on program synthesis.',
      pronouns: 'she/her',
      imageUrl: 'https://cdn.example.com/headshots/ada.jpg',
      linkedIn: 'https://www.linkedin.com/in/ada',
      twitter: 'https://twitter.com/ada',
      instagram: '',
      position: 0,
      userId: 90210,
      deviceChecked: false,
      loggedInAtVEH: false,
      allowOverrideDetails: false,
    },
    {
      speakerId: 13,
      firstName: 'Grace',
      lastName: 'Hopper',
      email: 'grace@example.com',
      title: 'Compilers for the Rest of Us',
      company: 'UNIVAC',
      bio: 'Grace builds compilers.',
      pronouns: 'she/her',
      imageUrl: '',
      linkedIn: '',
      twitter: '',
      instagram: '',
      position: 1,
      userId: 90211,
      deviceChecked: false,
      loggedInAtVEH: false,
      allowOverrideDetails: false,
    },
  ],
  error: null,
} as const;

/**
 * The experimental order flow, step by step. `docs/adding-attendees` documents five calls and no
 * complimentary flag, so a comp ticket is a zero-priced ticket type.
 */
export const TICKETING_SETTINGS_RESPONSE = {
  ticketTypes: [
    {
      id: 4455,
      name: 'Free Admission',
      price: 0.0,
      remainingTickets: 200,
      avgTotalFee: 0.0,
    },
    {
      id: 4456,
      name: 'General Admission',
      price: 499.0,
      remainingTickets: 12,
      avgTotalFee: 24.95,
    },
  ],
} as const;

export const CALCULATE_FEE_RESPONSE = [
  {
    ticketQuantity: 1,
    ticketingTypeId: 4456,
    ticketPrice: '499',
    totalPayable: 523.95,
  },
] as const;

export const CREATE_ORDER_RESPONSE = { orderId: 122111 } as const;

export const FORM_ATTRIBUTES_RESPONSE = {
  buyerInformationFields: [
    { name: 'firstName', label: 'First Name', required: true },
    { name: 'lastName', label: 'Last Name', required: true },
    { name: 'emailAddress', label: 'Email', required: true },
  ],
  buyerQuestions: [],
  attendees: [{ ticketTypeId: 4455, attributes: [] }],
  orderData: { orderId: 122111 },
  totalPrice: 0,
  remainingSeconds: 600,
  onlyDonationTicket: false,
} as const;

export const PAYMENT_ORDER_RESPONSE = {
  eventTicketId: 778812,
  email: 'ada@example.com',
  attendeeId: 553311,
} as const;
