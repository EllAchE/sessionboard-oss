/**
 * The wire between the settings page and its panels. Pure by construction — nothing here imports
 * `@/db/client`, directly or otherwise, so the `'use client'` panels can value-import it.
 *
 * All six taxonomies are edited by the same table, so a row travels as a string map and the column
 * spec says how to render it. The service's zod schemas are what actually validate a write; this
 * layer only decides what the organizer is shown.
 */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; message: string; details?: Record<string, string> };

export type EntityKind = 'track' | 'room' | 'format' | 'tag' | 'persona' | 'field';

export type ColumnKind = 'text' | 'number' | 'color' | 'select' | 'list';

export type Choice = { value: string; label: string };

export type ColumnSpec = {
  key: string;
  label: string;
  kind: ColumnKind;
  /** Any CSS width, on the DataTable `<col>`. Percentages only — `1fr` is not valid there. */
  width?: string;
  placeholder?: string;
  mono?: boolean;
  choices?: Choice[];
  /** The list column is only meaningful for the choice field types. */
  enabledWhen?: { key: string; values: string[] };
};

export type EntityRow = {
  id: string;
  values: Record<string, string>;
  /** Rows elsewhere that point at this one. Drives the delete dialog. */
  usage: number;
};

export type EntitySpec = {
  kind: EntityKind;
  /** Tab label. */
  label: string;
  singular: string;
  lede: string;
  columns: ColumnSpec[];
  /** Whether `position` is meaningful, and therefore whether the move controls appear. */
  orderable: boolean;
  /**
   * Whether dependents can be moved onto a sibling before the delete. False for the field library,
   * where a form field's link back to the library is the only thing lost and re-pointing it at a
   * different question would silently change what the form asks.
   */
  reassignable: boolean;
  /** Completes "used by 4 …" in the delete dialog. */
  usageNoun: string;
};

export type EventWire = {
  id: string;
  name: string;
  slug: string;
  tagline: string | null;
  descriptionMarkdown: string | null;
  eventType: string | null;
  theme: string | null;
  timezone: string;
  /**
   * Wall clock in `timezone`, `YYYY-MM-DDTHH:mm` — what a `datetime-local` input reads and writes.
   * The panel never handles the instant, so it cannot accidentally render one in the browser's zone.
   */
  startsAt: string;
  endsAt: string;
  websiteUrl: string | null;
  venueName: string | null;
  venueAddress: string | null;
  /** `E-3`. Branding already uploaded, as the URL that serves it. */
  logoUrl: string | null;
  bannerUrl: string | null;
};

/**
 * `S-11`. The speaker portal's dressing — a different table and a different audience from the
 * `logoUrl`/`bannerUrl` above, which are `E-3` and brand the public event pages.
 *
 * Every field is nullable because the `portal_theme` row may not exist at all: it is created the
 * first time this panel is saved, and an event nobody has dressed reads back as all nulls rather
 * than as an error.
 */
export type PortalAppearanceWire = {
  /** The URL that serves the uploaded logo back to an organizer, or null when there is none. */
  logoUrl: string | null;
  accentColor: string | null;
  welcomeMarkdown: string | null;
  supportEmail: string | null;
};

export type NotificationsWire = {
  phone: string | null;
  notifyEmail: boolean;
  notifySms: boolean;
};

export function humanizeFieldType(value: string): string {
  const spaced = value.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The types that render a list of choices, and so make the options column meaningful. */
export const CHOICE_FIELD_TYPES = ['select', 'multi_select', 'radio'];

export function buildSpecs(fieldTypes: readonly string[]): EntitySpec[] {
  return [
    {
      kind: 'track',
      label: 'Tracks',
      singular: 'track',
      lede: 'The programme strands a submission is filed under and the agenda is coloured by.',
      orderable: true,
      reassignable: true,
      usageNoun: 'submissions and sessions',
      columns: [
        { key: 'name', label: 'Name', kind: 'text', width: '26%', placeholder: 'Platform' },
        { key: 'color', label: 'Colour', kind: 'color', width: '18%' },
        {
          key: 'description',
          label: 'Description',
          kind: 'text',
          width: '38%',
          placeholder: 'What belongs in this track',
        },
      ],
    },
    {
      kind: 'room',
      label: 'Rooms',
      singular: 'room',
      lede: 'The columns of the agenda grid. Capacity is shown when a session is placed.',
      orderable: true,
      reassignable: true,
      usageNoun: 'scheduled sessions',
      columns: [
        { key: 'name', label: 'Name', kind: 'text', width: '34%', placeholder: 'Auditorium' },
        { key: 'capacity', label: 'Capacity', kind: 'number', width: '16%', placeholder: '120' },
        { key: 'floor', label: 'Floor', kind: 'text', width: '22%', placeholder: 'Level 2' },
      ],
    },
    {
      kind: 'format',
      label: 'Formats',
      singular: 'session format',
      lede: 'Talk shapes and their default length. The agenda sizes a new block from this.',
      orderable: true,
      reassignable: true,
      usageNoun: 'submissions and sessions',
      columns: [
        { key: 'name', label: 'Name', kind: 'text', width: '26%', placeholder: 'Keynote' },
        {
          key: 'durationMinutes',
          label: 'Minutes',
          kind: 'number',
          width: '14%',
          placeholder: '45',
        },
        {
          key: 'description',
          label: 'Description',
          kind: 'text',
          width: '38%',
          placeholder: 'How this format runs',
        },
      ],
    },
    {
      kind: 'tag',
      label: 'Tags',
      singular: 'tag',
      lede: 'Free labels the review queue filters on. Names are unique within the event.',
      orderable: false,
      reassignable: true,
      usageNoun: 'tagged submissions',
      columns: [
        { key: 'name', label: 'Name', kind: 'text', width: '46%', placeholder: 'needs-mentor' },
        { key: 'color', label: 'Colour', kind: 'color', width: '26%' },
      ],
    },
    {
      kind: 'persona',
      label: 'Personas',
      singular: 'persona',
      lede: 'The audience a submission is pitched at.',
      orderable: true,
      reassignable: true,
      usageNoun: 'submissions',
      columns: [
        {
          key: 'name',
          label: 'Name',
          kind: 'text',
          width: '30%',
          placeholder: 'Practising clinician',
        },
        {
          key: 'description',
          label: 'Description',
          kind: 'text',
          width: '48%',
          placeholder: 'Who this covers',
        },
      ],
    },
    {
      kind: 'field',
      label: 'Field library',
      singular: 'library field',
      lede: 'Reusable questions to drop into any form. Editing one here does not rewrite the forms already using it.',
      orderable: false,
      reassignable: false,
      usageNoun: 'form fields',
      columns: [
        { key: 'key', label: 'Key', kind: 'text', width: '16%', mono: true, placeholder: 'company' },
        { key: 'label', label: 'Label', kind: 'text', width: '22%', placeholder: 'Your company' },
        {
          key: 'type',
          label: 'Type',
          kind: 'select',
          width: '16%',
          choices: fieldTypes.map((value) => ({ value, label: humanizeFieldType(value) })),
        },
        { key: 'helpText', label: 'Help text', kind: 'text', width: '20%', placeholder: 'Optional' },
        {
          key: 'options',
          label: 'Choices',
          kind: 'list',
          width: '18%',
          placeholder: 'One, two, three',
          enabledWhen: { key: 'type', values: CHOICE_FIELD_TYPES },
        },
      ],
    },
  ];
}
