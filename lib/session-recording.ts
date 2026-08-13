import type { FileRequestSpec, UploadCandidate } from './services/files';

/**
 * Stored uploads are intentionally clips, not an invitation to proxy multi-gigabyte masters
 * through a Worker. Larger recordings belong on a streaming host and are associated by HTTPS URL.
 */
export const SESSION_RECORDING_UPLOAD: FileRequestSpec = {
  id: 'session-recording',
  label: 'Session recording',
  helpText: 'MP4, WebM, MOV, or M4V video up to 25 MB',
  acceptedTypes: ['video/*', '.mp4', '.webm', '.mov', '.m4v'],
  maxSizeMb: 25,
  allowMultiple: false,
};

export function normalizeExternalRecordingUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error('Enter the recording URL');
  if (trimmed.length > 2_048) throw new Error('The recording URL is too long');

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('Enter a complete HTTPS recording URL');
  }

  if (parsed.protocol !== 'https:' || !parsed.hostname) {
    throw new Error('Recording links must use HTTPS');
  }
  if (parsed.username || parsed.password) {
    throw new Error('Recording links cannot contain credentials');
  }
  return parsed.toString();
}

export function isRecordingCandidate(candidate: UploadCandidate): boolean {
  const contentType = candidate.contentType.toLowerCase().split(';')[0].trim();
  const filename = candidate.filename.toLowerCase();
  return (
    contentType.startsWith('video/') ||
    ['.mp4', '.webm', '.mov', '.m4v'].some((extension) => filename.endsWith(extension))
  );
}

export type RecordingPublicationWindow = {
  sessionStatus: 'draft' | 'published' | 'cancelled';
  sessionEndsAt: Date | null;
  eventEndsAt: Date;
};

/**
 * A session-specific end wins. Falling back to the event end lets old imported programmes attach
 * recordings even when their individual session times were never captured.
 */
export function recordingPublicationIssue(
  input: RecordingPublicationWindow,
  now = new Date(),
): string | null {
  if (input.sessionStatus !== 'published') {
    return 'Publish the session on the agenda before publishing its recording';
  }
  const effectiveEnd = input.sessionEndsAt ?? input.eventEndsAt;
  if (effectiveEnd.getTime() > now.getTime()) {
    return 'A recording can be published only after the session has ended';
  }
  return null;
}

export function publicRecordingPath(
  eventSlug: string,
  recording: {
    id: string;
    source: 'upload' | 'external';
    externalUrl: string | null;
    publishedAt: Date | null;
  } | null,
): string | null {
  if (!recording?.publishedAt) return null;
  if (recording.source === 'external') {
    try {
      return normalizeExternalRecordingUrl(recording.externalUrl ?? '');
    } catch {
      // A bad historical/manual database write must not become a public javascript: or HTTP link.
      return null;
    }
  }
  return `/${eventSlug}/recordings/${recording.id}`;
}
