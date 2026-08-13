export const PROGRAM_RESOURCE_TYPES = ['event', 'session', 'speaker'] as const;

export type ProgramResourceType = (typeof PROGRAM_RESOURCE_TYPES)[number];

export type ProgramRecord = {
  resourceType: ProgramResourceType;
  sourceId: string;
  data: Record<string, unknown>;
};

export type RemoteProgramRecord = ProgramRecord & {
  remoteId: string;
};

export interface AccelEventsProgramGateway {
  readonly kind: 'fake';
  readonly eventUrl: string;
  listRecords(): Promise<RemoteProgramRecord[]>;
  createRecord(record: ProgramRecord): Promise<RemoteProgramRecord>;
  updateRecord(remoteId: string, record: ProgramRecord): Promise<RemoteProgramRecord>;
  deleteRecord(remoteId: string): Promise<void>;
}

export type ProgramSyncMode = 'preview' | 'apply';
export type ProgramSyncAction = 'create' | 'update' | 'delete' | 'noop';
export type ProgramSyncStatus = 'planned' | 'applied' | 'blocked' | 'unchanged';

export type ProgramSyncResult = {
  resourceType: ProgramResourceType;
  sourceId: string;
  remoteId: string | null;
  action: ProgramSyncAction;
  status: ProgramSyncStatus;
  message: string | null;
};

export type ProgramSyncSummary = {
  mode: ProgramSyncMode;
  adapter: 'fake';
  eventUrl: string;
  allowDeletes: boolean;
  fixtureReset: boolean;
  counts: Record<ProgramSyncAction, number> & { blockedDeletes: number };
  results: ProgramSyncResult[];
};
