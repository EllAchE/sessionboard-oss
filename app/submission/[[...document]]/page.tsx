import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ExternalLink, FileText, Github } from 'lucide-react';
import { CiceroBrand } from '@/components/CiceroBrand';
import { findSubmissionDocument, SUBMISSION_DOCUMENTS } from '../documents';
import { renderSubmissionMarkdown } from '../render-markdown';
import { SUBMISSION_IMAGE_URLS } from '../submission-images';
import styles from '../submission.module.css';

type SubmissionPageProps = {
  params: Promise<{ document?: string[] }>;
};

export async function generateMetadata({ params }: SubmissionPageProps): Promise<Metadata> {
  const document = findSubmissionDocument((await params).document);
  if (!document) return {};

  return {
    title: `${document.tabLabel} — Cicero submission`,
    description: document.description,
  };
}

export default async function SubmissionPage({ params }: SubmissionPageProps) {
  const document = findSubmissionDocument((await params).document);
  if (!document) notFound();

  const html = renderSubmissionMarkdown(document.markdown, SUBMISSION_IMAGE_URLS);

  return (
    <main className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <Link className={styles.brandLink} href="/" aria-label="Cicero home">
            <CiceroBrand markSize={26} />
          </Link>
          <Link className={styles.backLink} href="/">
            <ArrowLeft size={15} aria-hidden="true" />
            Back to the product
          </Link>
        </div>
      </header>

      <section className={styles.hero} aria-labelledby="submission-label">
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow} id="submission-label">
            Competition submission · August 2026
          </p>
          <p className={styles.intro}>
            One canonical write-up, rendered for reading. Every page below is generated directly
            from its checked-in Markdown source.
          </p>
        </div>
        <a
          className={styles.sourceLink}
          href={document.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          <Github size={17} aria-hidden="true" />
          View Markdown
          <ExternalLink size={13} aria-hidden="true" />
        </a>
      </section>

      <nav className={styles.documentNav} aria-label="Submission documents">
        {SUBMISSION_DOCUMENTS.map((item) => {
          const active = item.slug === document.slug;
          return (
            <Link
              className={`${styles.documentLink} ${active ? styles.documentLinkActive : ''}`}
              href={item.route}
              key={item.slug}
              aria-current={active ? 'page' : undefined}
            >
              <FileText size={15} aria-hidden="true" />
              {item.tabLabel}
            </Link>
          );
        })}
      </nav>

      <div className={styles.documentShell}>
        <div className={styles.mirrorNote}>
          <span className={styles.statusDot} aria-hidden="true" />
          Rendered from <code>docs/06-submission-{document.slug}.md</code>
        </div>
        <article
          className={styles.article}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </main>
  );
}
