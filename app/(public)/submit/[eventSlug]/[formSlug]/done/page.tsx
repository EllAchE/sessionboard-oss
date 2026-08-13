import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Button } from '@/components/ui';
import { loadPublicForm } from '@/lib/services/submissions';
import { PortalRedirect } from '../../../PortalRedirect';
import { portalPath } from '../../../shared';
import styles from '../../../submit.module.css';

export const metadata: Metadata = { title: 'Oration received' };

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
          <h1 className={styles.title}>Your oration is before the council.</h1>
        </header>

        <div className={styles.done}>
          {ref && <p className={styles.refBadge}>{ref}</p>}
          <p>
            A confirmation dispatch and sealed entry link are on their way. Your place among the
            orators is already recorded—there is no password to set.
          </p>
          <p className={styles.help}>
            Next, add your biography and portrait in the orator portal so the organizers are ready
            if the council accepts your petition.
          </p>

          <Link href={portal}>
            <Button variant="primary" size="lg">
              Enter your orator portal
            </Button>
          </Link>

          <PortalRedirect to={portal} />

          <p className={styles.help}>
            Another argument to make?{' '}
            <Link href={`/submit/${eventSlug}/${formSlug}`}>Unroll the scroll again</Link>.
          </p>
        </div>
      </div>
    </main>
  );
}
