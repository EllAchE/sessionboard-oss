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
    header: 'Oration title',
    aliases: ['Title', 'Session', 'Session title', 'Name'],
    required: true,
    description: 'A petition with no oration title is reported and set aside.',
    example: 'The Republic after Caesar',
  },
  {
    header: 'Orator email',
    aliases: ['Email', 'Speaker email', 'Speaker e-mail'],
    required: true,
    description:
      'Matched against the rolls; an unknown address receives an account and orator record without sending a dispatch.',
    example: 'marcus@example.com',
  },
  {
    header: 'Orator name',
    aliases: ['Speaker', 'Speaker name'],
    required: false,
    description: 'Used only when the address is new to this assembly.',
    example: 'Marcus Tullius',
  },
  {
    header: 'Argument',
    aliases: ['Description', 'Abstract', 'Summary'],
    required: false,
    description: 'Inscribed as markdown.',
    example: 'A defense of republican virtue before the gathered citizens.',
  },
  {
    header: 'Theme',
    aliases: ['Track'],
    required: false,
    description:
      "Matched by name against this assembly's themes. An unknown standard remains unassigned.",
    example: 'Civic life',
  },
  {
    header: 'Oration format',
    aliases: ['Format', 'Session format', 'Type'],
    required: false,
    description:
      "Matched by name against this assembly's oration formats. An unknown name remains unassigned.",
    example: 'Address',
  },
  {
    header: 'Audience rank',
    aliases: ['Level', 'Audience'],
    required: false,
    description: 'A free inscription; it is not judged against the scroll’s choices.',
    example: 'All citizens',
  },
  {
    header: 'Standing',
    aliases: ['Status'],
    required: false,
    description: '`accepted` is proclaimed without a council. Any other value enters deliberation.',
    example: 'submitted',
  },
];

/** Column order is irrelevant to the parser and header matching ignores case. */
export const IMPORT_RULES = [
  'Column order does not matter, and header matching ignores case.',
  'Unrecognised columns are passed over rather than rejected.',
  'Quoted cells, doubled quotes and newlines inside quotes all parse.',
  'Theme and format are matched by name; a name absent from the assembly remains unassigned.',
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
