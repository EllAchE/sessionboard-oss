export {
  AirtableClient,
  airtableConfig,
  getAirtableClient,
  type AirtableConfig,
  type AirtableRecord,
  type FieldMap,
} from './client';
export {
  DEFAULT_TABLES,
  EXPECTED_FIELDS,
  configuredTables,
  fieldsFor,
  type AirtableEntityType,
  type AirtableTableMap,
  type MirrorRow,
  type SessionMirrorRow,
  type SpeakerMirrorRow,
  type SubmissionMirrorRow,
} from './mapping';
export {
  airtableEnabled,
  backfill,
  backfillStatus,
  listAirtableLog,
  mirrorEntity,
  syncEntities,
  testConnection,
  type AirtableLogEntry,
  type BackfillStatus,
  type MirrorEntity,
  type SyncProgress,
} from './mirror';
