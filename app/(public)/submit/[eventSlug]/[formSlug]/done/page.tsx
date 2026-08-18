import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui';
import { loadPublicForm } from '@/lib/services/submissions';
import { PortalRedirect } from '../../../PortalRedirect';
import { portalPath } from '../../../shared';
import styles from '../../../submit.module.css';

export const metadata: Metadata = { title: 'Submission received' };

type PageProps = {
  params: Promise<{ eventSlug: string; formSlug: string }>;
  searchParams: Promise<{ ref?: string }>;
};

export default async function SubmissionDonePage({ params, searchParams }: PageProps) {
  const { eventSlug, formSlug } = await params;
  const { ref } = await searchParams;

  const bundle = await loadPublicForm(eventSlug, formSlug);
  if (!bundle) notFound();

  const portal = portalPath(eventSlug);

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.masthead}>
          <p className={styles.eyebrow}>{bundle.event.name}</p>
          <h1 className={styles.title}>Your talk is in.</h1>
        </header>

        <div className={styles.done}>
          {/*
            Labelled, because the reference on its own was read as decoration rather than as the
            receipt it is. It is the thing a speaker quotes back at an organizer, so it says what
            it is and what to do with it.
          */}
          {ref && <p className={styles.refBadge}>We received {ref}</p>}
          <p>We emailed your confirmation and sign-in link.</p>
          <p className={styles.help}>
            Quote that reference if you write to the organizers. Your portal lists it too.
          </p>
          <p className={styles.help}>Next: add your bio and headshot in the portal.</p>

          <Link href={portal}>
            <Button variant="primary" size="lg">
              Go to your speaker portal
            </Button>
          </Link>

          <PortalRedirect to={portal} />

          <p className={styles.help}>
            Want to propose another talk? <Link href={`/submit/${eventSlug}/${formSlug}`}>Open the form again</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
