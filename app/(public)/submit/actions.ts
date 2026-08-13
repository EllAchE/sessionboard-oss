'use server';

import { eq } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { getDb } from '@/db/client';
import { form as formTable, sessionCookie, user as userTable } from '@/db/schema';
import { currentActor, grantRole, normalizeEmail, requestMagicLink } from '@/lib/auth';
import { appUrl } from '@/lib/env';
import { invalid, isAppError, toPublicError } from '@/lib/errors';
import type { AnswerMap } from '@/lib/forms/contract';
import { hashToken, randomToken } from '@/lib/ids';
import { sendMail } from '@/lib/mail';
import { escapeMarkdownText, renderTrustedMarkdown, markdownToText } from '@/lib/markdown';
import { parseSpeakerName } from '@/lib/speaker-name';
import {
  ensureParticipant,
  isAcceptingSubmissions,
  linkPrimarySpeaker,
  loadPublicForm,
  saveSubmission,
} from '@/lib/services/submissions';
import { donePath, portalPath, type SubmitPayload, type SubmitResult } from './shared';

const SESSION_COOKIE = 'cicero_session';
const SESSION_TTL_DAYS = 30;

/**
 * The cold path's one unavoidable duplication. `lib/auth.ts` keeps `openSession` private and
 * `requestMagicLink` never hands back the plaintext token, so a submitter who has just created an
 * account could otherwise only reach the portal by finding an email — which is exactly the dead end
 * `P-3` and `F-11` exist to prevent. The magic link is still sent, for the visit after this one.
 * See `tasks/W1b-notes.md`.
 */
async function openSessionFor(userId: string): Promise<void> {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  await getDb().insert(sessionCookie).values({
    tokenHash: await hashToken(token),
    userId,
    impersonatedByUserId: null,
    expiresAt,
  });

  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: appUrl().startsWith('https://'),
    path: '/',
    expires: expiresAt,
  });
}

function fill(template: string, tokens: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => tokens[key] ?? match);
}

async function sendSubmissionEmails(input: {
  eventId: string;
  eventName: string;
  eventSlug: string;
  formId: string;
  toEmail: string;
  toName: string | null;
  displayRef: string;
  title: string;
}): Promise<void> {
  const db = getDb();
  const formRow = await db.query.form.findFirst({ where: eq(formTable.id, input.formId) });
  const portalUrl = `${appUrl()}${portalPath(input.eventSlug)}`;

  const tokens = {
    ref: input.displayRef,
    title: input.title,
    event: input.eventName,
    name: input.toName ?? '',
    portal_url: portalUrl,
  };
  const markdownTokens = Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [
      key,
      key === 'portal_url' ? value : escapeMarkdownText(value),
    ]),
  );

  // `F-12`. Organizer copy when they wrote some, a working default when they did not — a submitter
  // who gets no acknowledgement assumes the form ate their talk.
  const subject = fill(
    formRow?.confirmationSubject || `${input.displayRef}: we have your submission`,
    tokens,
  );
  const bodyMarkdown = fill(
    formRow?.confirmationBodyMarkdown ||
      [
        `Thanks${input.toName ? ' {{name}}' : ''} — **{{title}}** is in.`,
        '',
        'Your reference is **{{ref}}**.',
        '',
        '[Open your speaker portal]({{portal_url}}) to add a bio, a headshot and anything else the organizers ask for.',
      ].join('\n'),
    markdownTokens,
  );

  await sendMail({
    to: input.toEmail,
    subject,
    html: renderTrustedMarkdown(bodyMarkdown),
    text: markdownToText(bodyMarkdown),
    eventId: input.eventId,
    templateKey: 'submission.confirmation',
  });

  // `F-16`
  for (const address of formRow?.notifyEmails ?? []) {
    const notificationMarkdown = `**${escapeMarkdownText(input.title)}** (${escapeMarkdownText(input.displayRef)}) was submitted to ${escapeMarkdownText(input.eventName)} by ${escapeMarkdownText(input.toEmail)}.`;
    await sendMail({
      to: address,
      subject: `New submission ${input.displayRef}: ${input.title}`,
      html: renderTrustedMarkdown(notificationMarkdown),
      text: `${input.title} (${input.displayRef}) was submitted to ${input.eventName} by ${input.toEmail}.`,
      eventId: input.eventId,
      templateKey: 'submission.notify',
    });
  }
}

/**
 * `P-3`, the critical path. One call takes an anonymous visitor to an account, a participant row, a
 * submission, a speaker membership and a live session — no password anywhere, and no step that
 * depends on an email arriving.
 */
export async function submitPublicForm(payload: SubmitPayload): Promise<SubmitResult> {
  try {
    const bundle = await loadPublicForm(payload.eventSlug, payload.formSlug);
    if (!bundle) throw invalid('That call for speakers could not be found');
    if (!isAcceptingSubmissions(bundle.form)) {
      throw invalid('This call for speakers is not accepting submissions right now');
    }

    const actor = await currentActor();
    let name: string | null;
    try {
      name = parseSpeakerName(payload.submitterName);
    } catch (error) {
      throw invalid('Some of your details need attention', {
        submitterName: error instanceof Error ? error.message : 'That name is not valid',
      });
    }
    let userId = actor?.userId;
    let email = actor?.email ?? '';
    let openedSession = false;

    if (!userId) {
      const requested = await requestMagicLink({
        email: payload.submitterEmail,
        name: name || null,
        eventId: bundle.event.id,
        redirectTo: portalPath(bundle.event.slug),
      });
      email = requested.email;
      const account = await getDb().query.user.findFirst({
        where: eq(userTable.email, normalizeEmail(requested.email)),
      });
      if (!account) throw invalid('We could not create your account', { submitterEmail: 'Try again' });
      userId = account.id;
      openedSession = true;
    }

    await grantRole(userId, bundle.event.id, 'speaker');
    const participantId = await ensureParticipant(bundle.event.id, userId, name);

    const saved = await saveSubmission({
      eventId: bundle.event.id,
      formId: bundle.form.id,
      userId,
      fields: bundle.fields,
      values: payload.values as AnswerMap,
      limits: {
        allowDrafts: bundle.form.allowDrafts,
        maxSubmissionsPerUser: bundle.form.maxSubmissionsPerUser,
      },
      mode: payload.mode,
      submissionId: payload.submissionId,
    });

    await linkPrimarySpeaker(saved.id, participantId);

    // Last, so a failure here cannot cost someone their submission.
    if (openedSession) await openSessionFor(userId);

    if (payload.mode === 'draft') {
      return { ok: true, mode: 'draft', submissionId: saved.id, displayRef: saved.displayRef };
    }

    await sendSubmissionEmails({
      eventId: bundle.event.id,
      eventName: bundle.event.name,
      eventSlug: bundle.event.slug,
      formId: bundle.form.id,
      toEmail: email,
      toName: name || null,
      displayRef: saved.displayRef,
      title: saved.title,
    });

    const done = new URLSearchParams({ ref: saved.displayRef, id: saved.id });
    return {
      ok: true,
      mode: 'submit',
      redirectTo: `${donePath(payload.eventSlug, payload.formSlug)}?${done.toString()}`,
    };
  } catch (error) {
    if (!isAppError(error)) console.error(error instanceof Error ? error.message : String(error));
    const publicError = toPublicError(error);
    return { ok: false, message: publicError.message, errors: publicError.details ?? {} };
  }
}
