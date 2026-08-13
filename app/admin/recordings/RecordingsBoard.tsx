'use client';

import { useRef, useState, useTransition } from 'react';
import { ExternalLink, Film, Trash2, Upload } from 'lucide-react';
import { Badge, Button, Card, Input, Select, useToast } from '@/components/ui';
import { formatBytes } from '@/lib/services/file-format';
import {
  attachExternalRecordingAction,
  attachStoredRecordingAction,
  removeRecordingAction,
  setRecordingPublishedAction,
  type RecordingActionResult,
} from './actions';
import styles from './recordings.module.css';

export type RecordingWire = {
  session: {
    id: string;
    ref: number;
    title: string;
    startsAt: string | null;
    endsAt: string | null;
    status: 'draft' | 'published' | 'cancelled';
  };
  recording: {
    id: string;
    source: 'upload' | 'external';
    externalUrl: string | null;
    publishedAt: string | null;
  } | null;
  file: { id: string; filename: string; contentType: string; sizeBytes: number } | null;
  publicationIssue: string | null;
};

export type RecordingFileWire = {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
};

function SessionRecordingRow({
  row,
  choices,
  eventSlug,
  onChanged,
}: {
  row: RecordingWire;
  choices: RecordingFileWire[];
  eventSlug: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState(row.recording?.externalUrl ?? '');
  const [fileId, setFileId] = useState('');
  const uploadRef = useRef<HTMLInputElement>(null);

  const settle = (result: RecordingActionResult, message: string) => {
    if (!result.ok) {
      toast({ title: result.message, tone: 'danger' });
      return;
    }
    toast({ title: message, tone: 'success' });
    onChanged();
  };

  const attachUrl = () => {
    startTransition(async () =>
      settle(await attachExternalRecordingAction(row.session.id, url), 'Recording attached as draft'),
    );
  };

  const attachExisting = () => {
    if (!fileId) return;
    startTransition(async () =>
      settle(
        await attachStoredRecordingAction(row.session.id, fileId),
        'Stored recording attached as draft',
      ),
    );
  };

  const upload = async (picked: File) => {
    const body = new FormData();
    body.set('sessionId', row.session.id);
    body.set('recording', picked);
    try {
      const response = await fetch('/admin/recordings/upload', { method: 'POST', body });
      const result = (await response.json()) as { ok: boolean; message?: string };
      if (!response.ok || !result.ok) throw new Error(result.message ?? 'Upload failed');
      toast({ title: 'Recording uploaded as draft', tone: 'success' });
      onChanged();
    } catch (error) {
      toast({
        title: error instanceof Error ? error.message : 'That upload did not go through',
        tone: 'danger',
      });
    } finally {
      if (uploadRef.current) uploadRef.current.value = '';
    }
  };

  const published = Boolean(row.recording?.publishedAt);
  const publiclyVisible = published && !row.publicationIssue;
  const date = row.session.endsAt ?? row.session.startsAt;

  return (
    <Card className={styles.row}>
      <div className={styles.rowHead}>
        <div>
          <div className={styles.titleLine}>
            <span className={styles.ref}>SESS-{String(row.session.ref).padStart(4, '0')}</span>
            <h2 className={styles.sessionTitle}>{row.session.title}</h2>
            <Badge tone={publiclyVisible ? 'success' : row.recording ? 'warning' : 'neutral'}>
              {publiclyVisible
                ? 'Recording public'
                : published
                  ? 'Recording hidden'
                  : row.recording
                    ? 'Recording draft'
                    : 'No recording'}
            </Badge>
          </div>
          <p className={styles.meta}>
            {date ? new Date(date).toLocaleString() : 'Session time not set'} · agenda{' '}
            {row.session.status}
          </p>
          {row.recording ? (
            <p className={styles.source}>
              {row.recording.source === 'external' ? (
                <>
                  External HTTPS link:{' '}
                  <a href={row.recording.externalUrl ?? '#'} target="_blank" rel="noreferrer">
                    {row.recording.externalUrl}
                  </a>
                </>
              ) : row.file ? (
                <>
                  Stored file: {row.file.filename} · {formatBytes(row.file.sizeBytes)}
                </>
              ) : (
                'The stored file is no longer available'
              )}
            </p>
          ) : null}
          {row.recording && row.publicationIssue ? (
            <p className={styles.gate}>
              {published ? 'Public playback is hidden: ' : ''}{row.publicationIssue}.
            </p>
          ) : null}
        </div>
        {row.recording ? (
          <div className={styles.rowActions}>
            <Button
              size="sm"
              variant={published ? 'secondary' : 'primary'}
              disabled={pending || (!published && Boolean(row.publicationIssue))}
              onClick={() =>
                startTransition(async () =>
                  settle(
                    await setRecordingPublishedAction(row.recording!.id, !published, eventSlug),
                    published ? 'Recording unpublished' : 'Recording published',
                  ),
                )
              }
            >
              {published ? 'Unpublish' : 'Publish recording'}
            </Button>
            <Button
              size="sm"
              variant="danger"
              iconLeft={<Trash2 size={14} />}
              disabled={pending}
              onClick={() => {
                if (!window.confirm('Remove this recording association? Stored files are kept.')) return;
                startTransition(async () =>
                  settle(
                    await removeRecordingAction(row.recording!.id, eventSlug),
                    'Recording removed',
                  ),
                );
              }}
            >
              Remove
            </Button>
          </div>
        ) : null}
      </div>

      <div className={styles.attachGrid}>
        <div className={styles.attachPanel}>
          <label className={styles.label} htmlFor={`upload-${row.session.id}`}>
            Upload a short recording
          </label>
          <p className={styles.hint}>MP4, WebM, MOV, or M4V; 25 MB maximum.</p>
          <input
            ref={uploadRef}
            id={`upload-${row.session.id}`}
            type="file"
            accept="video/*,.mp4,.webm,.mov,.m4v"
            className={styles.fileInput}
            disabled={pending}
            onChange={(event) => {
              const picked = event.target.files?.[0];
              if (picked) void upload(picked);
            }}
          />
          <Button
            size="sm"
            iconLeft={<Upload size={14} />}
            disabled={pending}
            onClick={() => uploadRef.current?.click()}
          >
            Choose video
          </Button>
        </div>

        <div className={styles.attachPanel}>
          <label className={styles.label} htmlFor={`stored-${row.session.id}`}>
            Associate an existing event file
          </label>
          <div className={styles.inline}>
            <Select
              id={`stored-${row.session.id}`}
              value={fileId}
              disabled={pending || choices.length === 0}
              onChange={(event) => setFileId(event.target.value)}
            >
              <option value="">{choices.length ? 'Choose a video…' : 'No video files yet'}</option>
              {choices.map((choice) => (
                <option key={choice.id} value={choice.id}>
                  {choice.filename} ({formatBytes(choice.sizeBytes)})
                </option>
              ))}
            </Select>
            <Button size="sm" disabled={pending || !fileId} onClick={attachExisting}>
              Attach
            </Button>
          </div>
        </div>

        <div className={styles.attachPanel}>
          <label className={styles.label} htmlFor={`url-${row.session.id}`}>
            Associate a hosted recording
          </label>
          <p className={styles.hint}>For full-length video on a streaming host; HTTPS only.</p>
          <div className={styles.inline}>
            <Input
              id={`url-${row.session.id}`}
              type="url"
              placeholder="https://video.example/watch/…"
              value={url}
              disabled={pending}
              onChange={(event) => setUrl(event.target.value)}
            />
            <Button
              size="sm"
              iconLeft={<ExternalLink size={14} />}
              disabled={pending || !url.trim()}
              onClick={attachUrl}
            >
              Attach
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

export function RecordingsBoard({
  rows,
  choices,
  eventSlug,
  onRefresh,
}: {
  rows: RecordingWire[];
  choices: RecordingFileWire[];
  eventSlug: string;
  onRefresh?: () => void;
}) {
  const refresh = onRefresh ?? (() => window.location.reload());
  if (rows.length === 0) {
    return (
      <Card className={styles.empty}>
        <Film size={22} aria-hidden />
        Add sessions to the agenda before attaching recordings.
      </Card>
    );
  }
  return (
    <div className={styles.list}>
      {rows.map((row) => (
        <SessionRecordingRow
          key={row.session.id}
          row={row}
          choices={choices}
          eventSlug={eventSlug}
          onChanged={refresh}
        />
      ))}
    </div>
  );
}
