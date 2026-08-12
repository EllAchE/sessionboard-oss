import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { currentActor } from '@/lib/auth';
import type { AnswerMap } from '@/lib/forms/contract';
import { renderTrustedMarkdown } from '@/lib/markdown';
import {
  countSubmissionsForUser,
  isAcceptingSubmissions,
  listDrafts,
  loadDraftValues,
  loadPublicForm,
  remainingSubmissions,
} from '@/lib/services/submissions';
import { SubmitForm } from '../../SubmitForm';
import { submitPath, type RuntimeForm } from '../../shared';
import styles from '../../submit.module.css';

/**
 * `P-1`: public, unauthenticated, shareable. Everything on this page is server-rendered except the
 * form island itself, so a judge on a cold connection sees the call for speakers immediately.
 */

type PageProps = {
  params: Promise<{ eventSlug: string; formSlug: string }>;
  searchParams: Promise<{ draft?: string }>;
};

function formatDate(value: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'long',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(value);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { eventSlug, formSlug } = await params;
  const bundle = await loadPublicForm(eventSlug, formSlug);
  if (!bundle) return { title: 'Call for speakers' };
  return {
    title: `${bundle.form.name} · ${bundle.event.name}`,
    description: bundle.event.tagline ?? `Submit a talk to ${bundle.event.name}.`,
  };
}

export default async function SubmitFormPage({ params, searchParams }: PageProps) {
  const { eventSlug, formSlug } = await params;
  const { draft: draftId } = await searchParams;

  const bundle = await loadPublicForm(eventSlug, formSlug);
  // An unpublished form must not be distinguishable from one that was never created.
  if (!bundle || bundle.form.status === 'draft') notFound();

  const open = isAcceptingSubmissions(bundle.form);
  const actor = await currentActor();

  const submitted = actor ? await countSubmissionsForUser(bundle.form.id, actor.userId) : 0;
  const remaining = remainingSubmissions(
    {
      allowDrafts: bundle.form.allowDrafts,
      maxSubmissionsPerUser: bundle.form.maxSubmissionsPerUser,
    },
    submitted,
  );
  const drafts = actor ? await listDrafts(bundle.form.id, actor.userId) : [];

  const loadedDraft =
    actor && draftId ? await loadDraftValues(draftId, actor.userId, bundle.fields) : null;

  const runtimeForm: RuntimeForm = {
    eventSlug: bundle.event.slug,
    eventName: bundle.event.name,
    formSlug: bundle.form.slug,
    formName: bundle.form.name,
    fields: bundle.fields,
    allowDrafts: bundle.form.allowDrafts,
    closesAt: bundle.form.closesAt ? bundle.form.closesAt.toISOString() : null,
    remaining,
    maxSubmissionsPerUser: bundle.form.maxSubmissionsPerUser,
  };

  const atLimit = remaining !== null && remaining <= 0 && !loadedDraft;

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.masthead}>
          <p className={styles.eyebrow}>{bundle.event.name} · call for speakers</p>
          <h1 className={styles.title}>{bundle.form.name}</h1>
          {bundle.event.tagline && <p className={styles.tagline}>{bundle.event.tagline}</p>}
        </header>

        {/* `P-5` */}
        <div className={styles.banner}>
          <span className={styles.bannerItem}>
            {bundle.form.closesAt ? (
              <>
                Closes{' '}
                <span className={styles.bannerStrong}>
                  {formatDate(bundle.form.closesAt, bundle.event.timezone)}
                </span>
              </>
            ) : (
              <>No deadline announced</>
            )}
          </span>
          {remaining !== null && (
            <span className={styles.bannerItem}>
              <span className={styles.bannerStrong}>{remaining}</span> of{' '}
              {bundle.form.maxSubmissionsPerUser} submissions left
            </span>
          )}
          {actor && (
            <span className={styles.bannerItem}>
              Signed in as <span className={styles.bannerStrong}>{actor.email}</span>
            </span>
          )}
        </div>

        {bundle.form.introMarkdown && (
          <div
            className={styles.intro}
            dangerouslySetInnerHTML={{ __html: renderTrustedMarkdown(bundle.form.introMarkdown) }}
          />
        )}

        {drafts.length > 0 && (
          <div className={styles.drafts}>
            {/* `P-6` / `F-14` */}
            {drafts.map((entry) => (
              <div className={styles.draftRow} key={entry.id}>
                <span>
                  <span className={styles.draftMeta}>{entry.ref}</span> {entry.title}
                </span>
                <Link href={`${submitPath(eventSlug, formSlug)}?draft=${entry.id}`}>
                  {entry.id === loadedDraft?.id ? 'Editing this draft' : 'Resume this draft'}
                </Link>
              </div>
            ))}
          </div>
        )}

        {!open && (
          <div className={styles.notice}>
            <p className={styles.noticeTitle}>This call for speakers is closed</p>
            <p>
              {bundle.form.closesAt
                ? `Submissions closed ${formatDate(bundle.form.closesAt, bundle.event.timezone)}.`
                : 'The organizers are not taking submissions right now.'}
            </p>
          </div>
        )}

        {open && atLimit && (
          <div className={styles.notice}>
            <p className={styles.noticeTitle}>You have reached the submission limit</p>
            <p>
              {bundle.event.name} accepts {bundle.form.maxSubmissionsPerUser} submissions per
              speaker on this form.
            </p>
          </div>
        )}

        {open && !atLimit && (
          <SubmitForm
            form={runtimeForm}
            initialValues={(loadedDraft?.values ?? {}) as AnswerMap}
            initialFileNames={loadedDraft?.fileNames ?? {}}
            initialName={actor?.name ?? ''}
            initialEmail={actor?.email ?? ''}
            signedIn={Boolean(actor)}
            submissionId={loadedDraft?.id ?? null}
          />
        )}
      </div>
    </main>
  );
}
