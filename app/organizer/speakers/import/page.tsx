import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { SPEAKER_IMPORT_FIELDS, speakerTemplateCsv } from '@/lib/services/participants';
import { ImportSpeakers } from './ImportSpeakers';
import { manageSpeakersContext } from '../context';
import styles from '../speakers.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Import speakers · Cicero' };

/**
 * `SPK-03`. The field catalog is passed down rather than imported by the client component, because
 * `lib/services/participants.ts` opens a database connection at import and cannot cross the bundle
 * boundary. One catalog, one place it is defined.
 */
export default async function ImportSpeakersPage() {
  await manageSpeakersContext();

  return (
    <div className={styles.page}>
      <div>
        <Link className={styles.backLink} href="/organizer/speakers">
          <ChevronLeft size={14} />
          Speakers
        </Link>
        <div className={styles.pageHead}>
          <div>
            <p className={styles.eyebrow}>Program</p>
            <h1 className={styles.title}>Import speakers</h1>
            <p className={styles.subtitle}>Upload, map, review, then import.</p>
          </div>
        </div>
      </div>

      <ImportSpeakers fields={SPEAKER_IMPORT_FIELDS} template={speakerTemplateCsv()} />
    </div>
  );
}
