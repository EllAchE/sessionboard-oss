/**
 * RFC 4180 with the concessions a real spreadsheet export needs: a UTF-8 BOM from Excel, CRLF or LF
 * line endings in the same file, and a stray quote inside an unquoted cell taken literally rather
 * than treated as a syntax error. An import that rejects a file an organizer can open in Numbers is
 * worse than one that reads it the way Numbers does.
 */

const BOM = '\uFEFF';

/** Every physical row, unfiltered and untrimmed. Blank lines survive; `parseCsvTable` drops them. */
export function parseCsvRows(text: string, delimiter = ','): string[][] {
  const source = text.startsWith(BOM) ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  let open = false;

  const endCell = () => {
    row.push(cell);
    cell = '';
    open = true;
  };
  const endRow = () => {
    row.push(cell);
    rows.push(row);
    row = [];
    cell = '';
    open = false;
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];

    if (quoted) {
      if (char !== '"') {
        cell += char;
      } else if (source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"' && cell === '') {
      quoted = true;
      open = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === '\n') {
      endRow();
    } else if (char === '\r') {
      if (source[index + 1] === '\n') index += 1;
      endRow();
    } else {
      cell += char;
      open = true;
    }
  }

  if (open || cell !== '' || row.length > 0) endRow();
  return rows;
}

export type CsvTable = {
  headers: string[];
  /** Every row padded or truncated to the header count, so a column index is always safe. */
  rows: string[][];
};

export function parseCsvTable(text: string): CsvTable {
  const rows = parseCsvRows(text).filter((row) => row.some((cell) => cell.trim() !== ''));
  if (rows.length === 0) return { headers: [], rows: [] };

  const headers = rows[0].map((header) => header.trim());
  return {
    headers,
    rows: rows.slice(1).map((row) => headers.map((_, column) => (row[column] ?? '').trim())),
  };
}

export function csvCell(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\n')}\n`;
}

/** Header matching ignores case, spacing and punctuation, so `Job Title` and `job_title` agree. */
export function normalizeHeader(header: string): string {
  return header
    .replace(BOM, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
