import { getEvent } from '@/lib/services/events';
import { listRecordingManager } from '@/lib/services/recordings';
import { RecordingsBoard } from './RecordingsBoard';
import { recordingsContext } from './context';
import styles from './recordings.module.css';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Recordings · Cicero' };

export default async function RecordingsPage() {
  const ctx = await recordingsContext();
  const [model, event] = await Promise.all([
    listRecordingManager(ctx),
    getEvent(ctx.eventId),
  ]);

  return (
    <div className={styles.page}>
      <header>
        <p className={styles.eyebrow}>Program</p>
        <h1 className={styles.title}>Session recordings</h1>
        <p className={styles.subtitle}>
          Attach post-conference video now, then deliberately publish it after the session ends.
          Draft recordings are never exposed on public pages or embeds. Uploads are bounded clips;
          associate a full-length recording from an HTTPS streaming host.
        </p>
      </header>
      <RecordingsBoard
        eventSlug={event.slug}
        eventTimeZone={event.timezone}
        rows={model.rows.map((row) => ({
          ...row,
          session: {
            ...row.session,
            startsAt: row.session.startsAt?.toISOString() ?? null,
            endsAt: row.session.endsAt?.toISOString() ?? null,
          },
          recording: row.recording
            ? {
                id: row.recording.id,
                source: row.recording.source,
                externalUrl: row.recording.externalUrl,
                publishedAt: row.recording.publishedAt?.toISOString() ?? null,
              }
            : null,
        }))}
        choices={model.fileChoices.map(({ id, filename, contentType, sizeBytes }) => ({
          id,
          filename,
          contentType,
          sizeBytes,
        }))}
      />
    </div>
  );
}
