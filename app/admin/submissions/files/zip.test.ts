import { describe, expect, it } from 'vitest';
import {
  buildZip,
  crc32,
  sanitizeEntryName,
  uniqueEntryName,
  zipStream,
  type ZipEntry,
} from './zip';

const bytes = (text: string) => new TextEncoder().encode(text);

function readUint32(archive: Uint8Array, at: number): number {
  return new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint32(at, true);
}

function readUint16(archive: Uint8Array, at: number): number {
  return new DataView(archive.buffer, archive.byteOffset, archive.byteLength).getUint16(at, true);
}

/** Walks the end-of-central-directory record back to the entries it points at. */
function readArchive(archive: Uint8Array) {
  const end = archive.byteLength - 22;
  expect(readUint32(archive, end)).toBe(0x06054b50);

  const count = readUint16(archive, end + 10);
  const directorySize = readUint32(archive, end + 12);
  const directoryOffset = readUint32(archive, end + 16);
  expect(directoryOffset + directorySize).toBe(end);

  const entries: Array<{ name: string; crc: number; size: number; contents: string }> = [];
  let at = directoryOffset;
  for (let index = 0; index < count; index += 1) {
    expect(readUint32(archive, at)).toBe(0x02014b50);
    const crc = readUint32(archive, at + 16);
    const size = readUint32(archive, at + 24);
    const nameLength = readUint16(archive, at + 28);
    const localOffset = readUint32(archive, at + 42);
    const name = new TextDecoder().decode(archive.subarray(at + 46, at + 46 + nameLength));

    expect(readUint32(archive, localOffset)).toBe(0x04034b50);
    expect(readUint16(archive, localOffset + 8)).toBe(0);
    expect(readUint32(archive, localOffset + 14)).toBe(crc);
    const localNameLength = readUint16(archive, localOffset + 26);
    const dataAt = localOffset + 30 + localNameLength + readUint16(archive, localOffset + 28);

    entries.push({
      name,
      crc,
      size,
      contents: new TextDecoder().decode(archive.subarray(dataAt, dataAt + size)),
    });
    at += 46 + nameLength + readUint16(archive, at + 30) + readUint16(archive, at + 32);
  }
  return { count, entries };
}

describe('crc32', () => {
  it('matches the published check value for "123456789"', () => {
    expect(crc32(bytes('123456789'))).toBe(0xcbf43926);
  });

  it('is zero for no bytes', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
  });
});

describe('sanitizeEntryName', () => {
  it('keeps a folder path', () => {
    expect(sanitizeEntryName('ABS-4/slides.pdf')).toBe('ABS-4/slides.pdf');
  });

  it('drops traversal segments rather than the whole name', () => {
    expect(sanitizeEntryName('../../etc/passwd')).toBe('etc/passwd');
  });

  it('normalises backslashes and strips characters a zip reader chokes on', () => {
    expect(sanitizeEntryName('deck\\v1:final?.pdf')).toBe('deck/v1final.pdf');
  });

  it('falls back rather than producing an empty entry', () => {
    expect(sanitizeEntryName('///')).toBe('file');
  });
});

describe('uniqueEntryName', () => {
  it('suffixes before the extension', () => {
    const taken = new Set<string>();
    expect(uniqueEntryName(taken, 'slides.pdf')).toBe('slides.pdf');
    expect(uniqueEntryName(taken, 'slides.pdf')).toBe('slides (2).pdf');
    expect(uniqueEntryName(taken, 'slides.pdf')).toBe('slides (3).pdf');
  });

  it('leaves a dotless name alone', () => {
    const taken = new Set<string>();
    expect(uniqueEntryName(taken, 'notes')).toBe('notes');
    expect(uniqueEntryName(taken, 'notes')).toBe('notes (2)');
  });
});

describe('buildZip', () => {
  const entries: ZipEntry[] = [
    { name: 'ABS-1/deck.txt', bytes: bytes('hello'), modifiedAt: new Date('2026-03-04T05:06:07Z') },
    { name: 'ABS-2/notes.txt', bytes: bytes('a longer body of text'), modifiedAt: new Date('2026-03-04T05:06:07Z') },
  ];

  it('round-trips every entry through its own central directory record', () => {
    const archive = readArchive(buildZip(entries));
    expect(archive.count).toBe(2);
    expect(archive.entries.map((entry) => entry.name)).toEqual(['ABS-1/deck.txt', 'ABS-2/notes.txt']);
    expect(archive.entries.map((entry) => entry.contents)).toEqual(['hello', 'a longer body of text']);
    expect(archive.entries[0].crc).toBe(crc32(bytes('hello')));
    expect(archive.entries[1].size).toBe(bytes('a longer body of text').byteLength);
  });

  it('writes a readable empty archive', () => {
    const archive = buildZip([]);
    expect(archive.byteLength).toBe(22);
    expect(readArchive(archive).count).toBe(0);
  });

  it('keeps non-ASCII names intact under the UTF-8 flag', () => {
    const archive = readArchive(buildZip([{ name: 'Ünïcode ✓.txt', bytes: bytes('ok') }]));
    expect(archive.entries[0].name).toBe('Ünïcode ✓.txt');
  });
});

describe('zipStream', () => {
  it('produces the same bytes as the buffered builder', async () => {
    const entries: ZipEntry[] = [
      { name: 'one.txt', bytes: bytes('first'), modifiedAt: new Date('2026-01-02T03:04:05Z') },
      { name: 'two.txt', bytes: bytes('second'), modifiedAt: new Date('2026-01-02T03:04:05Z') },
    ];

    async function* source() {
      for (const entry of entries) yield entry;
    }

    const chunks: Uint8Array[] = [];
    const reader = zipStream(source()).getReader();
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
    }

    const streamed = new Uint8Array(chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0));
    let at = 0;
    for (const chunk of chunks) {
      streamed.set(chunk, at);
      at += chunk.byteLength;
    }

    expect(Array.from(streamed)).toEqual(Array.from(buildZip(entries)));
  });
});
