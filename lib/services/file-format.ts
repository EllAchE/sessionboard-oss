/**
 * The parts of the file service a browser is allowed to have. `files.ts` opens a database
 * connection at import, so a client component importing these from there drags `pg` — and with it
 * `net` and `tls` — into the bundle and the build fails.
 */

export type AcceptedTypesSpec = { acceptedTypes: string[] };

export const BYTES_PER_MB = 1024 * 1024;

export function acceptAttribute(spec: AcceptedTypesSpec): string | undefined {
  const types = spec.acceptedTypes.filter((entry) => entry.trim().length > 0);
  if (types.length === 0) return undefined;
  return types.map((entry) => (entry.includes('/') || entry.startsWith('.') ? entry : `.${entry}`)).join(',');
}

export function describeAcceptedTypes(spec: AcceptedTypesSpec): string {
  const types = spec.acceptedTypes.filter((entry) => entry.trim().length > 0);
  return types.length === 0 ? 'Any file type' : types.join(', ');
}

/**
 * What an organizer can put on a `file_upload` task. A fixed list rather than a free-text box: the
 * matcher in `files.ts` is forgiving about the form a type is written in, but nothing was stopping
 * an organizer from typing a rule that matches nothing, and a constraint that silently accepts
 * everything is the bug this list exists to close.
 *
 * `value` is the stored `acceptedTypes` joined by `|`, so the empty string is "no constraint".
 */
export const ACCEPTED_TYPE_PRESETS: Array<{ label: string; types: string[] }> = [
  { label: 'Any file type', types: [] },
  { label: 'PDF only', types: ['application/pdf'] },
  { label: 'PDF or slides', types: ['application/pdf', 'application/vnd.apple.keynote', '.pptx', '.key'] },
  { label: 'Images only', types: ['image/*'] },
  { label: 'Video only', types: ['video/*'] },
  { label: 'Documents (PDF, Word, plain text)', types: ['application/pdf', '.doc', '.docx', 'text/plain'] },
];

/** Speaker-facing wording. `['application/pdf']` reads as "PDF only", not as a MIME type. */
const TYPE_WORDS: Record<string, string> = {
  'application/pdf': 'PDF',
  '.pdf': 'PDF',
  'application/vnd.apple.keynote': 'Keynote',
  '.key': 'Keynote',
  '.pptx': 'PowerPoint',
  '.ppt': 'PowerPoint',
  '.doc': 'Word',
  '.docx': 'Word',
  'text/plain': 'plain text',
  '.txt': 'plain text',
  'image/*': 'images',
  'video/*': 'video',
};

function typeWord(entry: string): string {
  const rule = entry.trim().toLowerCase();
  const known = TYPE_WORDS[rule];
  if (known) return known;
  if (rule.endsWith('/*')) return `${rule.slice(0, -2)} files`;
  if (rule.startsWith('.')) return rule.slice(1).toUpperCase();
  if (rule.includes('/')) return rule.split('/')[1].toUpperCase();
  return rule.toUpperCase();
}

/**
 * The hint shown next to the upload control, e.g. "PDF only" or "PDF or Keynote only". The portal
 * has to *say* what it will accept — an `accept` attribute alone is a filter a speaker discovers by
 * having their file greyed out, and it is trivially bypassed by drag-and-drop.
 */
export function acceptedTypesHint(spec: AcceptedTypesSpec): string {
  const words = [
    ...new Set(spec.acceptedTypes.filter((entry) => entry.trim().length > 0).map(typeWord)),
  ];
  if (words.length === 0) return 'Any file type';
  if (words.length === 1) return `${words[0]} only`;
  const last = words[words.length - 1];
  return `${words.slice(0, -1).join(', ')} or ${last} only`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < BYTES_PER_MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}
