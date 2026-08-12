export { AccelEventsClient, liveClientConfig, type LiveClientConfig } from './client';
export { FakeAccelEventsGateway, type FakeOptions } from './fake';
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
