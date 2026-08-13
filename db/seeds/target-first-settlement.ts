export const FIRST_SETTLEMENT_SLUG = "first-settlement";
export const FIRST_SETTLEMENT_ORGANIZER = {
  email: "organizer@example.com",
  name: "Tullia Ciceronis",
} as const;

export type TargetSeedOptions = {
  apply: boolean;
  confirmation?: string;
};

export type TargetSeedPlan = {
  action: "create" | "replace";
  organizerAction: "create" | "reuse";
};

export function parseTargetSeedArgs(args: string[]): TargetSeedOptions {
  const options: TargetSeedOptions = { apply: false };

  for (const argument of args) {
    if (argument === "--apply") {
      options.apply = true;
      continue;
    }

    if (argument.startsWith("--confirm=")) {
      options.confirmation = argument.slice("--confirm=".length);
      continue;
    }

    throw new Error(`Unknown argument: ${argument}`);
  }

  return options;
}

export function planTargetedFirstSettlementSeed(input: {
  targetExists: boolean;
  organizerExists: boolean;
}): TargetSeedPlan {
  return {
    action: input.targetExists ? "replace" : "create",
    organizerAction: input.organizerExists ? "reuse" : "create",
  };
}

export async function executeTargetedFirstSettlementSeed(
  options: TargetSeedOptions,
  applySeed: () => Promise<void>,
): Promise<"dry-run" | "applied"> {
  if (!options.apply) return "dry-run";

  if (options.confirmation !== FIRST_SETTLEMENT_SLUG) {
    throw new Error(
      `Refusing to apply without --confirm=${FIRST_SETTLEMENT_SLUG}`,
    );
  }

  await applySeed();
  return "applied";
}

export function describeDatabaseTarget(connectionString: string): string {
  const target = new URL(connectionString);
  if (target.protocol !== "postgres:" && target.protocol !== "postgresql:") {
    throw new Error(
      "DATABASE_URL must use the postgres or postgresql protocol",
    );
  }

  const port = target.port ? `:${target.port}` : "";
  return `${target.protocol}//${target.hostname}${port}${target.pathname}`;
}
