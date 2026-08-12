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
          {ref && <p className={styles.refBadge}>{ref}</p>}
          <p>
            We emailed you a confirmation and a sign-in link. Your speaker account already exists —
            there is no password to set.
          </p>
          <p className={styles.help}>
            Next: add a bio and a headshot in the portal so the organizers have what they need if
            your talk is accepted.
          </p>

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
