import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { EMPTY_SPEAKER, SpeakerForm } from '../SpeakerForm';
import { manageSpeakersContext } from '../context';
import styles from '../speakers.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Summon an orator · Cicero' };

/**
 * `SPK-02`. Invited keynotes and sponsor speakers never touch the CFP, and an organizer who cannot
 * type one in keeps the real roster in a spreadsheet instead.
 */
export default async function NewSpeakerPage() {
  await manageSpeakersContext();

  return (
    <div className={styles.page}>
      <div>
        <Link className={styles.backLink} href="/admin/speakers">
          <ChevronLeft size={14} />
          Orators
        </Link>
        <div className={styles.pageHead}>
          <div>
            <p className={styles.eyebrow}>The census</p>
            <h1 className={styles.title}>Summon an orator</h1>
            <p className={styles.subtitle}>
              Their name enters this event&rsquo;s roll straight away. No courier is sent.
            </p>
          </div>
        </div>
      </div>

      <SpeakerForm initial={EMPTY_SPEAKER} />
    </div>
  );
}
