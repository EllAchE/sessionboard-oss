/**
 * Pure storage-status values shared with the client-side admin files view. At 250 MiB blobs are
 * already half of common free Postgres quotas and copied into every full backup; 500 MiB is the
 * practical handoff to R2/S3, not a database engine hard limit.
 */
export const POSTGRES_FILE_WARNING_BYTES = 250 * 1024 * 1024;
export const POSTGRES_FILE_PRACTICAL_CEILING_BYTES = 500 * 1024 * 1024;

export type StorageUsage = {
  backend: 'r2' | 's3' | 'postgres';
  usedBytes: number | null;
  warningBytes: number | null;
  practicalCeilingBytes: number | null;
};

export function postgresStoragePressure(usedBytes: number): 'normal' | 'warning' | 'over' {
  if (usedBytes >= POSTGRES_FILE_PRACTICAL_CEILING_BYTES) return 'over';
  if (usedBytes >= POSTGRES_FILE_WARNING_BYTES) return 'warning';
  return 'normal';
}
