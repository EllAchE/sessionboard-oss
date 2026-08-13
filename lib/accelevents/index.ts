export { AccelEventsClient, liveClientConfig, type LiveClientConfig } from './client';
export { FakeAccelEventsGateway, type FakeOptions } from './fake';
export { FakeAccelEventsProgramGateway } from './fake-program';
export { PersistentFakeAccelEventsProgramGateway } from './persistent-fake-program';
export {
  dedupeByEmail,
  flattenMarkdown,
  splitName,
  toSpeakerDto,
  type SpeakerSource,
} from './mapping';
export {
  accelEventsMode,
  getGateway,
  listAcceptedSpeakers,
  listSyncLog,
  pushAcceptedSpeakers,
  testConnection,
  type AccelEventsMode,
  type PushOutcome,
  type PushSummary,
  type SpeakerCandidate,
  type SyncLogEntry,
} from './sync';
export {
  planProgramSync,
  reconcileProgram,
  reconcilePublishedProgram,
  type ProgramSyncOptions,
} from './program';
export {
  PROGRAM_RESOURCE_TYPES,
  type AccelEventsProgramGateway,
  type ProgramRecord,
  type ProgramResourceType,
  type ProgramSyncAction,
  type ProgramSyncMode,
  type ProgramSyncResult,
  type ProgramSyncStatus,
  type ProgramSyncSummary,
  type RemoteProgramRecord,
} from './program-types';
export {
  ACCELEVENTS_ERROR,
  speakerDtoSchema,
  type AccelEventsGateway,
  type AttendeeOrderInput,
  type AttendeeOrderResult,
  type AuthHeaderUsed,
  type ListSpeakersResult,
  type PushSpeakerResult,
  type SpeakerDto,
} from './types';
