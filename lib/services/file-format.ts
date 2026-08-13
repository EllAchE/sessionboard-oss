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
  return types.length === 0 ? 'Any kind of record' : types.join(', ');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < BYTES_PER_MB) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / BYTES_PER_MB).toFixed(1)} MB`;
}
