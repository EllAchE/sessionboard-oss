import Link from 'next/link';
import Image from 'next/image';
import { notFound } from 'next/navigation';
import { ROMAN_SPEAKER_HEADSHOT_CAPACITY } from '@/lib/roman-speaker-headshots';
import styles from './roman-headshots.module.css';

const PAGE_SIZE = 60;

export default async function RomanHeadshotsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  if (process.env.NODE_ENV !== 'development') notFound();

  const requestedPage = Number((await searchParams).page ?? 1);
  const pageCount = Math.ceil(ROMAN_SPEAKER_HEADSHOT_CAPACITY / PAGE_SIZE);
  const page = Number.isSafeInteger(requestedPage)
    ? Math.min(pageCount, Math.max(1, requestedPage))
    : 1;
  const start = (page - 1) * PAGE_SIZE;
  const slots = Array.from({ length: PAGE_SIZE }, (_, index) => start + index).filter(
    (slot) => slot < ROMAN_SPEAKER_HEADSHOT_CAPACITY,
  );

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>Cicero visual system · development only</p>
        <h1>600 speaker headshots, no repeats</h1>
        <p>
          Deterministic fictional senators and classical orators. Alternating square and circular
          masks expose crop-safety problems while the full set exercises every guaranteed design
          slot.
        </p>
      </header>

      <nav className={styles.pagination} aria-label="Headshot pages">
        {Array.from({ length: pageCount }, (_, index) => index + 1).map((number) => (
          <Link
            key={number}
            href={`/roman-headshots?page=${number}`}
            aria-current={number === page ? 'page' : undefined}
          >
            {number}
          </Link>
        ))}
      </nav>

      <section className={styles.grid} aria-label={`Headshots ${start + 1}–${start + slots.length}`}>
        {slots.map((slot) => (
          <figure key={slot} className={styles.card}>
            <Image
              className={slot % 2 === 0 ? styles.square : styles.circle}
              src={`/roman-headshots/${slot}`}
              alt={`Generated fictional classical speaker ${slot + 1}`}
              width={256}
              height={256}
              unoptimized
            />
            <figcaption>Speaker {String(slot + 1).padStart(3, '0')}</figcaption>
          </figure>
        ))}
      </section>
    </main>
  );
}
