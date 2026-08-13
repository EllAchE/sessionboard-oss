/**
 * The file taxonomy the browse screen filters on. Pure, so both the server page and the client
 * table read the same rules — `lib/services/files.ts` opens a database connection at import and a
 * client component cannot reach it.
 *
 * Content type first, extension second: speakers upload from clients that send
 * `application/octet-stream` for a perfectly ordinary `.pptx`.
 */

export type FileKind = 'slides' | 'document' | 'image' | 'video' | 'audio' | 'archive' | 'other';

export const FILE_KINDS: Array<{ id: FileKind; label: string }> = [
  { id: 'slides', label: 'Presentation scrolls' },
  { id: 'document', label: 'Written scrolls' },
  { id: 'image', label: 'Portraits and images' },
  { id: 'video', label: 'Moving pictures' },
  { id: 'audio', label: 'Recorded voices' },
  { id: 'archive', label: 'Bound archives' },
  { id: 'other', label: 'Other records' },
];

const KIND_LABEL = new Map(FILE_KINDS.map((entry) => [entry.id, entry.label]));

const BY_EXTENSION: Record<string, FileKind> = {
  ppt: 'slides',
  pptx: 'slides',
  key: 'slides',
  odp: 'slides',
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  odt: 'document',
  rtf: 'document',
  txt: 'document',
  md: 'document',
  csv: 'document',
  xls: 'document',
  xlsx: 'document',
  png: 'image',
  jpg: 'image',
  jpeg: 'image',
  gif: 'image',
  webp: 'image',
  svg: 'image',
  heic: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  mp3: 'audio',
  wav: 'audio',
  m4a: 'audio',
  zip: 'archive',
  gz: 'archive',
  tar: 'archive',
  rar: 'archive',
  '7z': 'archive',
};

const BY_CONTENT_TYPE: Array<{ match: string; kind: FileKind }> = [
  { match: 'presentation', kind: 'slides' },
  { match: 'application/vnd.apple.keynote', kind: 'slides' },
  { match: 'application/pdf', kind: 'document' },
  { match: 'wordprocessing', kind: 'document' },
  { match: 'spreadsheet', kind: 'document' },
  { match: 'msword', kind: 'document' },
  { match: 'text/', kind: 'document' },
  { match: 'image/', kind: 'image' },
  { match: 'video/', kind: 'video' },
  { match: 'audio/', kind: 'audio' },
  { match: 'zip', kind: 'archive' },
  { match: 'x-tar', kind: 'archive' },
  { match: 'gzip', kind: 'archive' },
];

export function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot === -1 ? '' : filename.slice(dot + 1).toLowerCase();
}

export function fileKind(input: { contentType: string; filename: string }): FileKind {
  const contentType = input.contentType.toLowerCase().split(';')[0].trim();
  const byExtension = BY_EXTENSION[extensionOf(input.filename)];
  if (byExtension) return byExtension;
  const byType = BY_CONTENT_TYPE.find((entry) => contentType.includes(entry.match));
  return byType?.kind ?? 'other';
}

export function fileKindLabel(kind: FileKind): string {
  return KIND_LABEL.get(kind) ?? 'Other';
}

export function isFileKind(value: string): value is FileKind {
  return KIND_LABEL.has(value as FileKind);
}
