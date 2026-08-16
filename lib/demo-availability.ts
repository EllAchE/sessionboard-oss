import { and, eq, inArray } from 'drizzle-orm';
import { cache } from 'react';
import { getDb } from '@/db/client';
import { event, membership, user } from '@/db/schema';
import { DEMO_ENTRY_IDENTITIES, DEMO_EVENT_SLUG } from './demo-entry-links';

type DemoMembership = {
  email: string;
  role: (typeof DEMO_ENTRY_IDENTITIES)[number]['role'];
};

/**
 * An event at `/demo` is not enough to advertise the role entry points: a self-hoster can create
 * that slug without loading the fixture. Require the organizer, reviewer, and speaker memberships
 * that `db/seed.ts` creates so every advertised path is usable together.
 */
export function hasDemoEntryMemberships(rows: readonly DemoMembership[]): boolean {
  return DEMO_ENTRY_IDENTITIES.every((identity) =>
    rows.some((row) => row.email === identity.email && row.role === identity.role),
  );
}

/** Request-scoped so the home page and global footer share one small availability query. */
export const demoEntryPointsAreAvailable = cache(async (): Promise<boolean> => {
  const rows = await getDb()
    .select({ email: user.email, role: membership.role })
    .from(event)
    .innerJoin(membership, eq(membership.eventId, event.id))
    .innerJoin(user, eq(user.id, membership.userId))
    .where(
      and(
        eq(event.slug, DEMO_EVENT_SLUG),
        inArray(
          user.email,
          DEMO_ENTRY_IDENTITIES.map((identity) => identity.email),
        ),
      ),
    );

  return hasDemoEntryMemberships(rows);
});
