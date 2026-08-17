import { randomUUID } from 'node:crypto';
import React, { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { eq, inArray } from 'drizzle-orm';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { getDb } from '@/db/client';
import {
  event,
  form,
  participant,
  participantRole,
  scheduledSession,
  shareLink,
  sponsor,
  submission,
  user,
} from '@/db/schema';
import { EmbedBody } from '@/app/embed/EmbedBody';
import { parseEmbedOptions } from '@/app/embed/model';
import type { EventContext } from '@/lib/context';
import { hashToken } from '@/lib/ids';
import { loadSharePreviewBundle } from './share-preview';
import {
  issueShareLink,
  listShareLinks,
  resolveShareLink,
  revokeShareLink,
} from './share-links';

/**
 * `AD-9` against a real Postgres.
 *
 * A share link is a deliberate bypass of the publication predicates, so the properties that make it
 * safe — it dies on time, it dies on revoke, it reads one event, and it carries no personal data —
 * are exactly the ones a mocked database would assert against a stub that always says yes. They are
 * tested here against real rows and real SQL instead.
 *
 * Requires DATABASE_URL and a migrated database: `bun run test:integration`.
 */

// The widgets are compiled with the automatic runtime but rendered here through `createElement`;
// the existing widget tests do the same, and without this the SSR transform has no `React` binding.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

/** Strings seeded onto the fixture that must never reach a share-link reader. */
const PRIVATE_STRINGS = {
  email: `ada-${randomUUID()}@analytical.test`,
  phone: '+15550100777',
  dietary: 'Coeliac, no wheat in the green room',
  accessibility: 'Step-free access to the stage required',
  gender: 'Woman',
  salutation: 'Dearest Ada',
  honorific: 'The Right Honourable',
} as const;

type Fixture = {
  eventId: string;
  otherEventId: string;
  userIds: string[];
  ctx: EventContext;
  otherCtx: EventContext;
};

const fixtures: Fixture[] = [];

async function seed(): Promise<Fixture> {
  const db = getDb();

  const [organizer, ada, confirmedSpeaker] = await db
    .insert(user)
    .values([
      { email: `cato-${randomUUID()}@forum.test`, name: 'Cato the Elder' },
      { email: PRIVATE_STRINGS.email, name: 'Ada Lovelace', phone: PRIVATE_STRINGS.phone },
      { email: `hypatia-${randomUUID()}@forum.test`, name: 'Hypatia of Alexandria' },
    ])
    .returning();

  const makeEvent = (name: string) => ({
    slug: `${name.toLowerCase().replace(/\W+/g, '-')}-${randomUUID()}`,
    name,
    timezone: 'UTC',
    startsAt: new Date('2027-05-10T09:00:00.000Z'),
    endsAt: new Date('2027-05-12T17:00:00.000Z'),
    startsOn: '2027-05-10',
    endsOn: '2027-05-12',
    ownerUserId: organizer.id,
  });

  const [mine, other] = await db
    .insert(event)
    .values([makeEvent('The Forum'), makeEvent('The Circus')])
    .returning();

  const [myForm, otherForm] = await db
    .insert(form)
    .values([
      { eventId: mine.id, kind: 'cfp' as const, name: 'Call for orators', slug: 'speak' },
      { eventId: other.id, kind: 'cfp' as const, name: 'Call for charioteers', slug: 'race' },
    ])
    .returning();

  // One abstract still in review (the draft agenda's whole point) and one already approved.
  const [unapproved, approved] = await db
    .insert(submission)
    .values([
      {
        eventId: mine.id,
        formId: myForm.id,
        ref: 1,
        submitterUserId: ada.id,
        title: 'On the analytical engine',
        descriptionMarkdown: 'A machine that weaves algebraic patterns.',
        status: 'submitted' as const,
        contentStatus: 'in_review' as const,
      },
      {
        eventId: mine.id,
        formId: myForm.id,
        ref: 2,
        submitterUserId: confirmedSpeaker.id,
        title: 'On conic sections',
        status: 'submitted' as const,
        contentStatus: 'approved' as const,
      },
    ])
    .returning();

  const [otherSubmission] = await db
    .insert(submission)
    .values({
      eventId: other.id,
      formId: otherForm.id,
      ref: 1,
      submitterUserId: organizer.id,
      title: 'On the chariot',
      status: 'submitted' as const,
      contentStatus: 'approved' as const,
    })
    .returning();

  /**
   * Ada is `invited`, not `confirmed`, and her abstract is unapproved — so every publication
   * predicate excludes her, which is what makes her the right person to look for in the output.
   */
  const [adaParticipant, hypatiaParticipant] = await db
    .insert(participant)
    .values([
      {
        eventId: mine.id,
        userId: ada.id,
        displayName: 'Ada Lovelace',
        company: 'The Analytical Society',
        workflowStatus: 'invited' as const,
        gender: PRIVATE_STRINGS.gender,
        salutation: PRIVATE_STRINGS.salutation,
        honorific: PRIVATE_STRINGS.honorific,
        dietaryNotes: PRIVATE_STRINGS.dietary,
        accessibilityNotes: PRIVATE_STRINGS.accessibility,
      },
      {
        eventId: mine.id,
        userId: confirmedSpeaker.id,
        displayName: 'Hypatia of Alexandria',
        workflowStatus: 'confirmed' as const,
      },
    ])
    .returning();

  await db.insert(participantRole).values([
    { submissionId: unapproved.id, participantId: adaParticipant.id },
    { submissionId: approved.id, participantId: hypatiaParticipant.id },
  ]);

  // Placed on the clock so the agenda grid has something to lay out rather than an undated pile.
  const at = (hour: number) => new Date(`2027-05-10T${String(hour).padStart(2, '0')}:00:00.000Z`);

  await db.insert(scheduledSession).values([
    {
      eventId: mine.id,
      submissionId: unapproved.id,
      ref: 1,
      title: 'Draft keynote on the analytical engine',
      status: 'draft' as const,
      descriptionMarkdown: 'A machine that weaves algebraic patterns.',
      startsAt: at(9),
      endsAt: at(10),
      icsUid: `draft-${randomUUID()}@cicero.events`,
    },
    {
      eventId: mine.id,
      submissionId: approved.id,
      ref: 2,
      title: 'Published talk on conic sections',
      status: 'published' as const,
      startsAt: at(10),
      endsAt: at(11),
      icsUid: `published-${randomUUID()}@cicero.events`,
    },
    {
      eventId: mine.id,
      ref: 3,
      title: 'Abandoned session nobody should see',
      status: 'cancelled' as const,
      startsAt: at(11),
      endsAt: at(12),
      icsUid: `cancelled-${randomUUID()}@cicero.events`,
    },
    {
      eventId: other.id,
      submissionId: otherSubmission.id,
      ref: 1,
      title: 'A session belonging to the other event',
      status: 'published' as const,
      startsAt: at(9),
      endsAt: at(10),
      icsUid: `other-${randomUUID()}@cicero.events`,
    },
  ]);

  await db.insert(sponsor).values([
    { eventId: mine.id, name: 'Unannounced Sponsor', status: 'draft' as const },
    { eventId: mine.id, name: 'Announced Sponsor', status: 'published' as const },
    { eventId: other.id, name: 'The Other Event Sponsor', status: 'published' as const },
  ]);

  const actor = {
    userId: organizer.id,
    email: organizer.email,
    name: organizer.name,
    impersonatedByUserId: null,
  };

  const fixture: Fixture = {
    eventId: mine.id,
    otherEventId: other.id,
    userIds: [organizer.id, ada.id, confirmedSpeaker.id],
    ctx: { actor, eventId: mine.id, roles: ['organizer'] },
    otherCtx: { actor, eventId: other.id, roles: ['organizer'] },
  };
  fixtures.push(fixture);
  return fixture;
}

beforeAll(() => {
  if (!process.env.DATABASE_URL) {
    throw new Error(
      'DATABASE_URL is not set. Start Postgres and run `bun run db:migrate` first — see README.',
    );
  }
});

afterEach(async () => {
  const db = getDb();
  while (fixtures.length > 0) {
    const fixture = fixtures.pop()!;
    await db.delete(event).where(inArray(event.id, [fixture.eventId, fixture.otherEventId]));
    await db.delete(user).where(inArray(user.id, fixture.userIds));
  }
});

describe('resolving a share link', () => {
  it('accepts a freshly minted token and reports the view it was minted for', async () => {
    const fixture = await seed();
    const issued = await issueShareLink(fixture.ctx, { label: 'Ada — keynote', view: 'agenda' });

    const grant = await resolveShareLink(issued.token);

    expect(grant).not.toBeNull();
    expect(grant!.eventId).toBe(fixture.eventId);
    expect(grant!.view).toBe('agenda');
  });

  it('never persists the plaintext token', async () => {
    const fixture = await seed();
    const issued = await issueShareLink(fixture.ctx, { label: 'Venue', view: 'sessions' });

    const [row] = await getDb().select().from(shareLink).where(eq(shareLink.id, issued.id));

    expect(row.tokenHash).toBe(await hashToken(issued.token));
    expect(JSON.stringify(row)).not.toContain(issued.token);
    // The stored prefix is the non-secret handle, and is useless without the rest of the token.
    expect(issued.token.startsWith(row.prefix)).toBe(true);
    expect(await resolveShareLink(row.prefix)).toBeNull();
  });

  it.each([
    ['a token that was never issued', 'not-a-real-token-at-all-0123456789'],
    ['an empty string', ''],
    ['a prefix-length fragment', 'abcdefgh'],
    ['punctuation', '../../organizer/dashboard'],
  ])('refuses %s', async (_label, token) => {
    await seed();
    expect(await resolveShareLink(token)).toBeNull();
  });

  it('refuses a token whose only difference is the last character', async () => {
    const fixture = await seed();
    const issued = await issueShareLink(fixture.ctx, { label: 'Sponsor', view: 'sponsors' });
    const tampered = `${issued.token.slice(0, -1)}${issued.token.endsWith('A') ? 'B' : 'A'}`;

    expect(await resolveShareLink(tampered)).toBeNull();
  });
});

describe('expiry', () => {
  it('refuses a link whose expiry has passed', async () => {
    const fixture = await seed();
    const issued = await issueShareLink(fixture.ctx, { label: 'Lapsed', view: 'agenda' });

    expect(await resolveShareLink(issued.token)).not.toBeNull();

    await getDb()
      .update(shareLink)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(shareLink.id, issued.id));

    expect(await resolveShareLink(issued.token)).toBeNull();
  });

  it('refuses an expiry outside the permitted window rather than clamping it', async () => {
    const fixture = await seed();

    await expect(
      issueShareLink(fixture.ctx, { label: 'Forever', view: 'agenda', expiresInDays: 3650 }),
    ).rejects.toThrow();
    await expect(
      issueShareLink(fixture.ctx, { label: 'Already dead', view: 'agenda', expiresInDays: 0 }),
    ).rejects.toThrow();
  });
});

describe('revocation', () => {
  it('kills a live link immediately', async () => {
    const fixture = await seed();
    const issued = await issueShareLink(fixture.ctx, { label: 'Leaked', view: 'agenda' });

    expect(await resolveShareLink(issued.token)).not.toBeNull();

    await revokeShareLink(fixture.eventId, issued.id);

    expect(await resolveShareLink(issued.token)).toBeNull();
  });

  /** The `api_key` precedent: revoking is a timestamp, so the row and its history survive. */
  it('keeps the row and its history rather than deleting it', async () => {
    const fixture = await seed();
    const issued = await issueShareLink(fixture.ctx, { label: 'Leaked', view: 'agenda' });

    await revokeShareLink(fixture.eventId, issued.id);
    const listed = await listShareLinks(fixture.eventId);

    const row = listed.find((entry) => entry.id === issued.id);
    expect(row).toBeDefined();
    expect(row!.revokedAt).toBeInstanceOf(Date);
    expect(row!.label).toBe('Leaked');
  });

  it('refuses to revoke another event’s link', async () => {
    const fixture = await seed();
    const issued = await issueShareLink(fixture.ctx, { label: 'Mine', view: 'agenda' });

    await expect(revokeShareLink(fixture.otherEventId, issued.id)).rejects.toThrow();
    expect(await resolveShareLink(issued.token)).not.toBeNull();
  });
});

describe('scope: a token reads one event and no other', () => {
  it('resolves to its own event even when another event exists', async () => {
    const fixture = await seed();
    const mine = await issueShareLink(fixture.ctx, { label: 'Forum', view: 'agenda' });
    const theirs = await issueShareLink(fixture.otherCtx, { label: 'Circus', view: 'agenda' });

    expect((await resolveShareLink(mine.token))!.eventId).toBe(fixture.eventId);
    expect((await resolveShareLink(theirs.token))!.eventId).toBe(fixture.otherEventId);
  });

  it('serves none of the other event’s programme', async () => {
    const fixture = await seed();

    const bundle = (await loadSharePreviewBundle(fixture.eventId))!;
    const serialized = JSON.stringify(bundle);

    expect(bundle.event.id).toBe(fixture.eventId);
    expect(serialized).not.toContain('A session belonging to the other event');
    expect(serialized).not.toContain('The Other Event Sponsor');
    expect(serialized).not.toContain('The Circus');
  });

  it('only ever lists its own event’s links to an organizer', async () => {
    const fixture = await seed();
    await issueShareLink(fixture.ctx, { label: 'Forum link', view: 'agenda' });
    await issueShareLink(fixture.otherCtx, { label: 'Circus link', view: 'agenda' });

    const listed = await listShareLinks(fixture.eventId);

    expect(listed.map((row) => row.label)).toEqual(['Forum link']);
  });
});

describe('the publication bypass, and its limits', () => {
  /**
   * The draft session is linked to a submission still `in_review`, which is the exact pair the
   * public predicate rejects twice over. Both halves of the widening are asserted here so a later
   * narrowing of either one fails loudly rather than quietly emptying the preview.
   */
  it('shows the draft session and its unapproved abstract, which is the point', async () => {
    const fixture = await seed();

    const bundle = (await loadSharePreviewBundle(fixture.eventId))!;
    const draft = bundle.sessions.find((row) => row.title.startsWith('Draft keynote'));

    expect(bundle.sessions.map((row) => row.title)).toContain('Published talk on conic sections');
    expect(draft, 'the draft session should be previewable').toBeDefined();
    expect(draft!.descriptionText).toContain('A machine that weaves algebraic patterns');
  });

  it('names the unconfirmed speaker on the draft session', async () => {
    const fixture = await seed();

    const bundle = (await loadSharePreviewBundle(fixture.eventId))!;
    const draft = bundle.sessions.find((row) => row.title.startsWith('Draft keynote'))!;

    expect(draft.speakers.map((row) => row.name)).toEqual(['Ada Lovelace']);
  });

  it('still hides a cancelled session', async () => {
    const fixture = await seed();

    const bundle = (await loadSharePreviewBundle(fixture.eventId))!;

    expect(JSON.stringify(bundle)).not.toContain('Abandoned session nobody should see');
  });

  it('shows unpublished sponsors but withholds their logo route, which would 404', async () => {
    const fixture = await seed();

    const bundle = (await loadSharePreviewBundle(fixture.eventId))!;
    const draftSponsor = bundle.sponsors!.find((row) => row.name === 'Unannounced Sponsor')!;

    expect(draftSponsor).toBeDefined();
    expect(draftSponsor.logoUrl).toBeNull();
  });
});

describe('personal data never crosses the boundary', () => {
  it('keeps contact and accommodation data out of the bundle', async () => {
    const fixture = await seed();

    const serialized = JSON.stringify(await loadSharePreviewBundle(fixture.eventId));

    for (const [field, value] of Object.entries(PRIVATE_STRINGS)) {
      expect(serialized, `${field} must not reach a share-link reader`).not.toContain(value);
    }
    // The pipeline state itself is not a fact about the programme, so it is not in the shape either.
    expect(serialized).not.toContain('workflowStatus');
    expect(serialized).not.toContain('invited');
  });

  /**
   * The assertion that matters most: not "the query omitted it" but "it is not on the page". The
   * bundle is rendered through the same component the anonymous embeds use, exactly as `/s/[token]`
   * renders it, and the resulting HTML is searched for every private string on the fixture.
   */
  it.each([
    ['agenda', 'Draft keynote on the analytical engine'],
    ['itinerary', 'Draft keynote on the analytical engine'],
    ['sessions', 'Draft keynote on the analytical engine'],
    ['speakers', 'Ada Lovelace'],
    ['gallery', 'Ada Lovelace'],
    ['sponsors', 'Unannounced Sponsor'],
  ] as const)('keeps it off the rendered %s view', async (view, marker) => {
    const fixture = await seed();
    const bundle = (await loadSharePreviewBundle(fixture.eventId))!;

    const html = renderToStaticMarkup(
      createElement(EmbedBody, { view, bundle, options: parseEmbedOptions({}), showHeader: true }),
    );

    // The unpublished material really is on the page, so a pass cannot come from rendering nothing.
    expect(html, `the ${view} view should show the draft`).toContain(marker);
    for (const [field, value] of Object.entries(PRIVATE_STRINGS)) {
      expect(html, `${field} must not be rendered`).not.toContain(value);
    }
  });
});

describe('view accounting', () => {
  it('starts at never-opened so an organizer can tell', async () => {
    const fixture = await seed();
    await issueShareLink(fixture.ctx, { label: 'Fresh', view: 'agenda' });

    const [row] = await listShareLinks(fixture.eventId);

    expect(row.viewCount).toBe(0);
    expect(row.lastViewedAt).toBeNull();
  });
});
