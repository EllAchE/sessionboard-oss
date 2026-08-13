import { describe, expect, it } from 'vitest';
import { csvCell, normalizeHeader, parseCsvRows, parseCsvTable, toCsv } from './csv';

describe('parseCsvRows', () => {
  it('reads a plain grid', () => {
    expect(parseCsvRows('a,b\nc,d')).toEqual([
      ['a', 'b'],
      ['c', 'd'],
    ]);
  });

  it('keeps empty cells, including trailing ones', () => {
    expect(parseCsvRows('a,,\n,b,')).toEqual([
      ['a', '', ''],
      ['', 'b', ''],
    ]);
  });

  it('does not invent a row for a trailing newline', () => {
    expect(parseCsvRows('a,b\n')).toEqual([['a', 'b']]);
    expect(parseCsvRows('a,b\r\n')).toEqual([['a', 'b']]);
  });

  it('handles CRLF, LF and a lone CR in the same file', () => {
    expect(parseCsvRows('a\r\nb\nc\rd')).toEqual([['a'], ['b'], ['c'], ['d']]);
  });

  it('strips a UTF-8 BOM from the first cell only', () => {
    expect(parseCsvRows('\uFEFFEmail,Name\nada@example.com,Ada')).toEqual([
      ['Email', 'Name'],
      ['ada@example.com', 'Ada'],
    ]);
  });

  it('keeps commas inside quotes', () => {
    expect(parseCsvRows('"Lovelace, Ada",Analyst')).toEqual([['Lovelace, Ada', 'Analyst']]);
  });

  it('keeps newlines inside quotes', () => {
    expect(parseCsvRows('name,bio\nAda,"Line one\nLine two"\nAlan,Short')).toEqual([
      ['name', 'bio'],
      ['Ada', 'Line one\nLine two'],
      ['Alan', 'Short'],
    ]);
  });

  it('normalises CRLF inside a quoted cell to what the file contained', () => {
    expect(parseCsvRows('a,"one\r\ntwo"')).toEqual([['a', 'one\r\ntwo']]);
  });

  it('unescapes doubled quotes', () => {
    expect(parseCsvRows('"She said ""hello""",b')).toEqual([['She said "hello"', 'b']]);
  });

  it('reads a cell that is nothing but an escaped quote', () => {
    expect(parseCsvRows('"""",x')).toEqual([['"', 'x']]);
  });

  it('reads an empty quoted cell', () => {
    expect(parseCsvRows('"",b')).toEqual([['', 'b']]);
  });

  it('treats a quote inside an unquoted cell as a literal character', () => {
    expect(parseCsvRows('12" monitor,b')).toEqual([['12" monitor', 'b']]);
  });

  it('returns nothing for an empty file', () => {
    expect(parseCsvRows('')).toEqual([]);
  });

  it('keeps a blank line as a row of one empty cell', () => {
    expect(parseCsvRows('a\n\nb')).toEqual([['a'], [''], ['b']]);
  });

  it('accepts an alternative delimiter', () => {
    expect(parseCsvRows('a;b\n"c;d";e', ';')).toEqual([
      ['a', 'b'],
      ['c;d', 'e'],
    ]);
  });
});

describe('parseCsvTable', () => {
  it('splits the header row off and trims every cell', () => {
    expect(parseCsvTable(' Name , Email \n Ada , ada@example.com ')).toEqual({
      headers: ['Name', 'Email'],
      rows: [['Ada', 'ada@example.com']],
    });
  });

  it('pads short rows and truncates long ones to the header count', () => {
    expect(parseCsvTable('a,b,c\n1\n1,2,3,4')).toEqual({
      headers: ['a', 'b', 'c'],
      rows: [
        ['1', '', ''],
        ['1', '2', '3'],
      ],
    });
  });

  it('drops rows that are entirely blank', () => {
    expect(parseCsvTable('a,b\n\n1,2\n , \n3,4').rows).toEqual([
      ['1', '2'],
      ['3', '4'],
    ]);
  });

  it('returns empty headers for an empty file', () => {
    expect(parseCsvTable('   ')).toEqual({ headers: [], rows: [] });
  });
});

describe('csv writing', () => {
  it('quotes only what needs quoting', () => {
    expect(csvCell('plain')).toBe('plain');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('two\nlines')).toBe('"two\nlines"');
    expect(csvCell(null)).toBe('');
    expect(csvCell(7)).toBe('7');
  });

  it.each(['=2+2', '+cmd', '-1+2', '@SUM(A1:A2)', '\t=2+2', '\r=2+2'])(
    'keeps formula-shaped text inert: %j',
    (value) => {
      expect(parseCsvRows(toCsv([[value]]))).toEqual([[`'${value}`]]);
    },
  );

  it('keeps numeric values numeric', () => {
    expect(csvCell(-42)).toBe('-42');
  });

  it('round-trips through the parser', () => {
    const grid = [
      ['Name', 'Bio'],
      ['Lovelace, Ada', 'Line one\nLine two with "quotes"'],
    ];
    expect(parseCsvRows(toCsv(grid))).toEqual(grid);
  });
});

describe('normalizeHeader', () => {
  it('collapses case, punctuation and spacing', () => {
    expect(normalizeHeader('Job Title')).toBe('job title');
    expect(normalizeHeader('job_title')).toBe('job title');
    expect(normalizeHeader('  E-mail  ')).toBe('e mail');
    expect(normalizeHeader('\uFEFFEmail')).toBe('email');
  });
});
