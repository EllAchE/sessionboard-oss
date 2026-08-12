/**
 * What `parseSubmissionImport` accepts, written down where a browser can read it. The parser and
 * its alias table live in `lib/services/review.ts`, which opens a database connection at import, so
 * the screen cannot ask it directly; `contract.test.ts` runs every alias listed here through the
 * real parser instead, so this file cannot quietly drift into fiction.
 */

import type { ImportRow } from '../../../../lib/services/review';

/** What the preview shows before anything is written. `rows` is what an import would attempt. */
export type ImportPreview = {
  headers: string[];
  rows: ImportRow[];
  errors: Array<{ line: number; message: string }>;
};

export type ImportColumn = {
  /** The spelling the template emits. Every alias below parses identically. */
  header: string;
  aliases: string[];
  required: boolean;
  description: string;
  example: string;
};

export const IMPORT_COLUMNS: ImportColumn[] = [
  {
    header: 'Title',
    aliases: ['Session', 'Session title', 'Name'],
    required: true,
    description: 'A row with no title is reported and skipped.',
    example: 'Rewriting the Postgres planner in anger',
  },
  {
    header: 'Speaker email',
    aliases: ['Email', 'Speaker e-mail'],
    required: true,
    description:
      'Matched against existing accounts; an unknown address gets an account and a participant record, with no email sent.',
    example: 'ada@example.com',
  },
  {
    header: 'Speaker name',
    aliases: ['Speaker'],
    required: false,
    description: 'Only used when the address is new to this event.',
    example: 'Ada Lovelace',
  },
  {
    header: 'Description',
    aliases: ['Abstract', 'Summary'],
    required: false,
    description: 'Stored as markdown.',
    example: 'Why the join order changed and what it cost us.',
  },
  {
    header: 'Track',
    aliases: [],
    required: false,
    description: "Matched by name against this event's tracks. An unknown name imports as no track.",
    example: 'Databases',
  },
  {
    header: 'Format',
    aliases: ['Session format', 'Type'],
    required: false,
    description:
      "Matched by name against this event's session formats. An unknown name imports as no format.",
    example: 'Talk',
  },
  {
    header: 'Level',
    aliases: ['Audience'],
    required: false,
    description: 'Free text; nothing validates it against the form options.',
    example: 'Intermediate',
  },
  {
    header: 'Status',
    aliases: [],
    required: false,
    description: '`accepted` imports as accepted and skips review. Anything else imports as submitted.',
    example: 'submitted',
  },
];

/** Column order is irrelevant to the parser and header matching ignores case. */
export const IMPORT_RULES = [
  'Column order does not matter, and header matching ignores case.',
  'Unrecognised columns are ignored rather than rejected.',
  'Quoted cells, doubled quotes and newlines inside quotes all parse.',
  'Track and format are matched by name; a name this event does not have imports as unassigned.',
];

function csvCell(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function templateHeaderRow(): string {
  return IMPORT_COLUMNS.map((column) => csvCell(column.header)).join(',');
}

export function templateCsv(): string {
  const example = IMPORT_COLUMNS.map((column) => csvCell(column.example)).join(',');
  return `${templateHeaderRow()}\n${example}\n`;
}
