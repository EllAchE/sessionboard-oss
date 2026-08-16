/**
 * A ZIP writer with one compression method: none. Slide decks, headshots and PDFs are already
 * compressed, so STORE gives up nothing an organizer would notice and buys an archive that can be
 * produced with no dependency and no `CompressionStream`, one buffered file at a time, on both
 * deploy targets. Pure by construction — no database, no storage — so a client component may import
 * from here and so may a test.
 *
 * ZIP64 is deliberately not implemented; `ZIP_MAX_BYTES` and `ZIP_MAX_ENTRIES` are checked instead,
 * because an archive that silently wraps a 32-bit offset is worse than a refusal.
 */

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const END_OF_CENTRAL_SIGNATURE = 0x06054b50;
const LOCAL_HEADER_BYTES = 30;
const CENTRAL_HEADER_BYTES = 46;
const END_OF_CENTRAL_BYTES = 22;
const VERSION = 20;
/** Bit 11. Marks the filename as UTF-8 rather than the ancient IBM code page. */
const UTF8_FLAG = 0x0800;
const METHOD_STORE = 0;

export const ZIP_MAX_BYTES = 0xffffffff;
export const ZIP_MAX_ENTRIES = 0xffff;

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

export type ZipEntry = { name: string; bytes: Uint8Array; modifiedAt?: Date };

/**
 * Directory separators survive; everything a zip reader could walk out of the extraction directory
 * with does not. Speaker-supplied filenames reach this function, so it is a boundary, not a tidy-up.
 */
export function sanitizeEntryName(name: string): string {
  const cleaned = name
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) =>
      segment
        .replace(/[\u0000-\u001f:*?"<>|]/g, '')
        .replace(/^\.+$/, '')
        .trim(),
    )
    .filter((segment) => segment.length > 0)
    .join('/');
  return cleaned.slice(0, 200) || 'file';
}

/** `slides.pdf`, `slides (2).pdf`. Two speakers naming their deck the same thing is the norm. */
export function uniqueEntryName(taken: Set<string>, desired: string): string {
  const name = sanitizeEntryName(desired);
  if (!taken.has(name)) {
    taken.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const slash = name.lastIndexOf('/');
  const hasExtension = dot > slash + 1;
  const stem = hasExtension ? name.slice(0, dot) : name;
  const extension = hasExtension ? name.slice(dot) : '';
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem} (${suffix})${extension}`;
    if (!taken.has(candidate)) {
      taken.add(candidate);
      return candidate;
    }
  }
}

/** MS-DOS packed date and time. The format has no room for anything before 1980. */
function dosStamp(at: Date): { time: number; date: number } {
  const year = Math.max(1980, at.getFullYear());
  return {
    time: ((at.getHours() << 11) | (at.getMinutes() << 5) | (at.getSeconds() >> 1)) & 0xffff,
    date: (((year - 1980) << 9) | ((at.getMonth() + 1) << 5) | at.getDate()) & 0xffff,
  };
}

type CentralRecord = {
  name: Uint8Array;
  crc: number;
  size: number;
  offset: number;
  time: number;
  date: number;
};

/**
 * Emits chunks in the order a reader expects them: every local header and its bytes, then the whole
 * central directory. Holding only the directory means peak memory is one file plus a few dozen bytes
 * per entry, which is what lets the route stream rather than assemble.
 */
export class ZipBuilder {
  private readonly central: CentralRecord[] = [];
  private offset = 0;

  add(entry: ZipEntry): Uint8Array[] {
    if (this.central.length >= ZIP_MAX_ENTRIES) {
      throw new Error(`A zip archive holds at most ${ZIP_MAX_ENTRIES} files`);
    }

    const name = new TextEncoder().encode(entry.name);
    const size = entry.bytes.byteLength;
    const stamp = dosStamp(entry.modifiedAt ?? new Date());
    const total = this.offset + LOCAL_HEADER_BYTES + name.byteLength + size;
    if (total > ZIP_MAX_BYTES) {
      throw new Error('That selection is too large for a single zip archive');
    }

    const header = new Uint8Array(LOCAL_HEADER_BYTES + name.byteLength);
    const view = new DataView(header.buffer);
    const crc = crc32(entry.bytes);
    view.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
    view.setUint16(4, VERSION, true);
    view.setUint16(6, UTF8_FLAG, true);
    view.setUint16(8, METHOD_STORE, true);
    view.setUint16(10, stamp.time, true);
    view.setUint16(12, stamp.date, true);
    view.setUint32(14, crc, true);
    view.setUint32(18, size, true);
    view.setUint32(22, size, true);
    view.setUint16(26, name.byteLength, true);
    view.setUint16(28, 0, true);
    header.set(name, LOCAL_HEADER_BYTES);

    this.central.push({ name, crc, size, offset: this.offset, time: stamp.time, date: stamp.date });
    this.offset = total;
    return [header, entry.bytes];
  }

  end(): Uint8Array[] {
    const chunks: Uint8Array[] = [];
    const start = this.offset;

    for (const record of this.central) {
      const entry = new Uint8Array(CENTRAL_HEADER_BYTES + record.name.byteLength);
      const view = new DataView(entry.buffer);
      view.setUint32(0, CENTRAL_HEADER_SIGNATURE, true);
      view.setUint16(4, VERSION, true);
      view.setUint16(6, VERSION, true);
      view.setUint16(8, UTF8_FLAG, true);
      view.setUint16(10, METHOD_STORE, true);
      view.setUint16(12, record.time, true);
      view.setUint16(14, record.date, true);
      view.setUint32(16, record.crc, true);
      view.setUint32(20, record.size, true);
      view.setUint32(24, record.size, true);
      view.setUint16(28, record.name.byteLength, true);
      view.setUint16(30, 0, true);
      view.setUint16(32, 0, true);
      view.setUint16(34, 0, true);
      view.setUint16(36, 0, true);
      view.setUint32(38, 0, true);
      view.setUint32(42, record.offset, true);
      entry.set(record.name, CENTRAL_HEADER_BYTES);
      chunks.push(entry);
      this.offset += entry.byteLength;
    }

    const end = new Uint8Array(END_OF_CENTRAL_BYTES);
    const view = new DataView(end.buffer);
    view.setUint32(0, END_OF_CENTRAL_SIGNATURE, true);
    view.setUint16(4, 0, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, this.central.length, true);
    view.setUint16(10, this.central.length, true);
    view.setUint32(12, this.offset - start, true);
    view.setUint32(16, start, true);
    view.setUint16(20, 0, true);
    chunks.push(end);
    this.offset += END_OF_CENTRAL_BYTES;
    return chunks;
  }
}

export function buildZip(entries: ZipEntry[]): Uint8Array {
  const builder = new ZipBuilder();
  const chunks = entries.flatMap((entry) => builder.add(entry));
  chunks.push(...builder.end());

  const total = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const output = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    output.set(chunk, at);
    at += chunk.byteLength;
  }
  return output;
}

/**
 * The archive as a response body. The source is pulled one entry at a time and each entry's bytes
 * are released as soon as its chunks are enqueued, so a hundred decks never sit in memory together.
 */
export function zipStream(source: AsyncIterable<ZipEntry>): ReadableStream<Uint8Array> {
  const builder = new ZipBuilder();
  const iterator = source[Symbol.asyncIterator]();

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        const chunks = next.done ? builder.end() : builder.add(next.value);
        for (const chunk of chunks) controller.enqueue(chunk);
        if (next.done) controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
    async cancel(reason) {
      await iterator.return?.(reason);
    },
  });
}
