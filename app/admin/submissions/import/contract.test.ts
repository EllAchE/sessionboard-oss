import { describe, expect, it } from 'vitest';
import { parseSubmissionImport } from '../../../../lib/services/review';
import { IMPORT_COLUMNS, templateCsv, templateHeaderRow } from './contract';

/**
 * The screen documents a contract it cannot import. These tests are what keep the two honest: every
 * header and alias this page advertises is fed to the real parser and has to land where the page
 * says it lands.
 */

const FIELD_FOR_HEADER: Record<string, string> = {
  Title: 'title',
  'Speaker email': 'speakerEmail',
  'Speaker name': 'speakerName',
  Description: 'description',
  Track: 'track',
  Format: 'format',
  Level: 'level',
  Status: 'status',
};

describe('the documented template', () => {
  it('parses with no errors and yields exactly one row', () => {
    const parsed = parseSubmissionImport(templateCsv());
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
  });

  it('carries every documented example into its documented field', () => {
    const [row] = parseSubmissionImport(templateCsv()).rows as unknown as Array<
      Record<string, unknown>
    >;
    for (const column of IMPORT_COLUMNS) {
      const field = FIELD_FOR_HEADER[column.header];
      const expected =
        field === 'speakerEmail' ? column.example.toLowerCase() : column.example;
      expect(row[field], `${column.header} -> ${field}`).toBe(expected);
    }
  });

  it('emits the header row the parser reads', () => {
    expect(templateCsv().startsWith(`${templateHeaderRow()}\n`)).toBe(true);
  });
});

describe('every documented alias', () => {
  const required = IMPORT_COLUMNS.filter((column) => column.required);

  for (const column of IMPORT_COLUMNS) {
    for (const alias of [column.header, ...column.aliases]) {
      it(`accepts "${alias}" as ${column.header}`, () => {
        const headers = required
          .filter((entry) => entry.header !== column.header)
          .map((entry) => entry.header);
        const values = required
          .filter((entry) => entry.header !== column.header)
          .map((entry) => entry.example);

        const csv = `${[alias, ...headers].join(',')}\n${[column.example, ...values].join(',')}\n`;
        const parsed = parseSubmissionImport(csv);

        expect(parsed.errors).toEqual([]);
        expect(parsed.rows).toHaveLength(1);
        const field = FIELD_FOR_HEADER[column.header];
        const expected =
          field === 'speakerEmail' ? column.example.toLowerCase() : column.example;
        expect((parsed.rows[0] as unknown as Record<string, unknown>)[field]).toBe(expected);
      });
    }
  }
});

describe('the rules the page states', () => {
  it('ignores header case and column order', () => {
    const parsed = parseSubmissionImport('SPEAKER EMAIL,title\nada@example.com,Planner internals\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].title).toBe('Planner internals');
    expect(parsed.rows[0].speakerEmail).toBe('ada@example.com');
  });

  it('ignores a column it does not recognise', () => {
    const parsed = parseSubmissionImport('Title,Speaker email,Twitter\nX,ada@example.com,@ada\n');
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
  });

  it('treats anything but "accepted" as submitted', () => {
    const parsed = parseSubmissionImport(
      'Title,Speaker email,Status\nA,ada@example.com,ACCEPTED\nB,ada@example.com,whatever\n',
    );
    expect(parsed.rows.map((row) => row.status)).toEqual(['accepted', 'submitted']);
  });

  it('reports a missing required column once, against the header line', () => {
    const parsed = parseSubmissionImport('Title,Track\nA,Databases\n');
    expect(parsed.rows).toEqual([]);
    expect(parsed.errors).toEqual([{ line: 1, message: 'No Speaker email column found' }]);
  });
});
