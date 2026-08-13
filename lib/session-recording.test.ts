import { describe, expect, it } from 'vitest';
import {
  SESSION_RECORDING_UPLOAD,
  isRecordingCandidate,
  normalizeExternalRecordingUrl,
  publicRecordingPath,
  recordingPublicationIssue,
} from './session-recording';
import { validateUpload } from './services/files';

describe('session recording policy', () => {
  it('keeps a draft recording off every public surface', () => {
    expect(
      publicRecordingPath('assembly', {
        id: 'recording-1',
        source: 'upload',
        externalUrl: null,
        publishedAt: null,
      }),
    ).toBeNull();
  });

  it('distinguishes published stored and external sources', () => {
    const publishedAt = new Date('2026-08-13T12:00:00Z');
    expect(
      publicRecordingPath('assembly', {
        id: 'recording-1',
        source: 'upload',
        externalUrl: null,
        publishedAt,
      }),
    ).toBe('/assembly/recordings/recording-1');
    expect(
      publicRecordingPath('assembly', {
        id: 'recording-2',
        source: 'external',
        externalUrl: 'https://video.example/watch/2',
        publishedAt,
      }),
    ).toBe('https://video.example/watch/2');
    expect(
      publicRecordingPath('assembly', {
        id: 'recording-3',
        source: 'external',
        externalUrl: 'javascript:alert(1)',
        publishedAt,
      }),
    ).toBeNull();
  });

  it('accepts only credential-free HTTPS associations', () => {
    expect(normalizeExternalRecordingUrl(' https://video.example/watch/2 ')).toBe(
      'https://video.example/watch/2',
    );
    expect(() => normalizeExternalRecordingUrl('http://video.example/watch/2')).toThrow('HTTPS');
    expect(() => normalizeExternalRecordingUrl('https://name:secret@video.example/2')).toThrow(
      'credentials',
    );
    expect(() => normalizeExternalRecordingUrl('not a URL')).toThrow('complete HTTPS');
  });

  it('waits for the session end and requires a public agenda row', () => {
    const now = new Date('2026-08-13T12:00:00Z');
    expect(
      recordingPublicationIssue(
        {
          sessionStatus: 'draft',
          sessionEndsAt: new Date('2026-08-13T11:00:00Z'),
          eventEndsAt: new Date('2026-08-13T11:00:00Z'),
        },
        now,
      ),
    ).toMatch(/agenda/);
    expect(
      recordingPublicationIssue(
        {
          sessionStatus: 'published',
          sessionEndsAt: new Date('2026-08-13T13:00:00Z'),
          eventEndsAt: new Date('2026-08-13T14:00:00Z'),
        },
        now,
      ),
    ).toMatch(/ended/);
  });

  it('allows a historical import to use the past event end when its session has no time', () => {
    expect(
      recordingPublicationIssue(
        {
          sessionStatus: 'published',
          sessionEndsAt: null,
          eventEndsAt: new Date('2020-06-01T18:00:00Z'),
        },
        new Date('2026-08-13T12:00:00Z'),
      ),
    ).toBeNull();
  });

  it('bounds stored clips and rejects non-video event files', () => {
    const video = { filename: 'talk.mp4', contentType: 'video/mp4', sizeBytes: 10 * 1024 * 1024 };
    expect(isRecordingCandidate(video)).toBe(true);
    expect(() => validateUpload(SESSION_RECORDING_UPLOAD, video)).not.toThrow();
    expect(() =>
      validateUpload(SESSION_RECORDING_UPLOAD, { ...video, sizeBytes: 26 * 1024 * 1024 }),
    ).toThrow(/25 MB/);
    expect(isRecordingCandidate({ filename: 'slides.pdf', contentType: 'application/pdf', sizeBytes: 1 })).toBe(false);
  });
});
