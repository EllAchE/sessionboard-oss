import { eq } from "drizzle-orm";
import { getDb } from "./client";
import { event, user } from "./schema";
import { seedFirstSettlement } from "./seeds/first-settlement";
import {
  describeDatabaseTarget,
  executeTargetedFirstSettlementSeed,
  FIRST_SETTLEMENT_ORGANIZER,
  FIRST_SETTLEMENT_SLUG,
  parseTargetSeedArgs,
  planTargetedFirstSettlementSeed,
} from "./seeds/target-first-settlement";

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is required; this command does not use a deployed Worker Hyperdrive binding",
    );
  }

  const options = parseTargetSeedArgs(process.argv.slice(2));
  const db = getDb();
  const [existingEvent] = await db
    .select({ id: event.id, name: event.name, ownerUserId: event.ownerUserId })
    .from(event)
    .where(eq(event.slug, FIRST_SETTLEMENT_SLUG));
  const [existingOrganizer] = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .where(eq(user.email, FIRST_SETTLEMENT_ORGANIZER.email));
  const plan = planTargetedFirstSettlementSeed({
    targetExists: Boolean(existingEvent),
    organizerExists: Boolean(existingOrganizer),
  });

  console.log(`Database: ${describeDatabaseTarget(connectionString)}`);
  console.log(`Target: /${FIRST_SETTLEMENT_SLUG}`);
  console.log(`Plan: ${plan.action} event; ${plan.organizerAction} organizer`);
  if (existingEvent) {
    console.log(
      `Existing target: ${existingEvent.name} (${existingEvent.id}), owner ${existingEvent.ownerUserId}`,
    );
  }
  if (existingOrganizer) {
    console.log(
      `Organizer: ${existingOrganizer.name} (${existingOrganizer.id}) will be reused`,
    );
  }
  console.log(
    "Preserved: /demo, other events, existing Roman users, unrelated users, and memberships outside the target",
  );

  const result = await executeTargetedFirstSettlementSeed(options, async () => {
    let organizerUserId = existingOrganizer?.id;
    if (!organizerUserId) {
      const [organizer] = await db
        .insert(user)
        .values(FIRST_SETTLEMENT_ORGANIZER)
        .returning({ id: user.id });
      organizerUserId = organizer.id;
    }

    await seedFirstSettlement(db, organizerUserId, new Date());
  });

  if (result === "dry-run") {
    console.log(
      `Dry run only. Apply with --apply --confirm=${FIRST_SETTLEMENT_SLUG}`,
    );
  } else {
    console.log(`Applied targeted seed for /${FIRST_SETTLEMENT_SLUG}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Targeted First Settlement seed failed: ${message}`);
  process.exitCode = 1;
});
