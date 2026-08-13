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
  timezone: string;
  startsOn: string | null;
  endsOn: string | null;
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
      label: 'Programme themes',
      singular: 'programme theme',
      lede: 'The standards beneath which petitions are filed and the fasti are coloured.',
      orderable: true,
      reassignable: true,
      usageNoun: 'petitions and orations',
      columns: [
        { key: 'name', label: 'Name', kind: 'text', width: '26%', placeholder: 'Platform' },
        { key: 'color', label: 'Colour', kind: 'color', width: '18%' },
        {
          key: 'description',
          label: 'Description',
          kind: 'text',
          width: '38%',
          placeholder: 'What belongs beneath this standard',
        },
      ],
    },
    {
      kind: 'room',
      label: 'Chambers',
      singular: 'chamber',
      lede: 'The chambers that form the columns of the fasti. Capacity appears when an oration is placed.',
      orderable: true,
      reassignable: true,
      usageNoun: 'scheduled orations',
      columns: [
        { key: 'name', label: 'Name', kind: 'text', width: '34%', placeholder: 'Grand Curia' },
        { key: 'capacity', label: 'Capacity', kind: 'number', width: '16%', placeholder: '120' },
        { key: 'floor', label: 'Floor', kind: 'text', width: '22%', placeholder: 'Level 2' },
      ],
    },
    {
      kind: 'format',
      label: 'Formats',
      singular: 'oration format',
      lede: 'Forms of address and their customary length. The fasti size each new oration from these decrees.',
      orderable: true,
      reassignable: true,
      usageNoun: 'petitions and orations',
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
      label: 'Petition marks',
      singular: 'mark',
      lede: 'Free marks the council uses to filter petitions. Each name is unique within the assembly.',
      orderable: false,
      reassignable: true,
      usageNoun: 'marked petitions',
      columns: [
        { key: 'name', label: 'Name', kind: 'text', width: '46%', placeholder: 'needs-mentor' },
        { key: 'color', label: 'Colour', kind: 'color', width: '26%' },
      ],
    },
    {
      kind: 'persona',
      label: 'Citizen personas',
      singular: 'citizen persona',
      lede: 'The citizens each petition hopes to address.',
      orderable: true,
      reassignable: true,
      usageNoun: 'petitions',
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
      label: 'Scribe’s field library',
      singular: 'library inscription',
      lede: 'Reusable prompts for any scroll. Revising one here does not rewrite scrolls already bearing it.',
      orderable: false,
      reassignable: false,
      usageNoun: 'inscribed prompts',
      columns: [
        { key: 'key', label: 'Key', kind: 'text', width: '16%', mono: true, placeholder: 'company' },
        { key: 'label', label: 'Prompt', kind: 'text', width: '22%', placeholder: 'Your house' },
        {
          key: 'type',
          label: 'Style',
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
