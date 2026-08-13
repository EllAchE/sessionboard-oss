import { describe, expect, it, vi } from "vitest";
import { prepareFirstSettlementSeed } from "./first-settlement";
import {
  describeDatabaseTarget,
  executeTargetedFirstSettlementSeed,
  parseTargetSeedArgs,
  planTargetedFirstSettlementSeed,
} from "./target-first-settlement";

describe("targeted First Settlement seed command", () => {
  it("does not call the write path during a dry run", async () => {
    const applySeed = vi.fn(async () => undefined);

    await expect(
      executeTargetedFirstSettlementSeed(parseTargetSeedArgs([]), applySeed),
    ).resolves.toBe("dry-run");
    expect(applySeed).not.toHaveBeenCalled();
  });

  it("refuses apply without the exact target confirmation", async () => {
    const applySeed = vi.fn(async () => undefined);

    await expect(
      executeTargetedFirstSettlementSeed(
        parseTargetSeedArgs(["--apply"]),
        applySeed,
      ),
    ).rejects.toThrow("Refusing to apply without --confirm=first-settlement");
    await expect(
      executeTargetedFirstSettlementSeed(
        parseTargetSeedArgs(["--apply", "--confirm=demo"]),
        applySeed,
      ),
    ).rejects.toThrow("Refusing to apply without --confirm=first-settlement");
    expect(applySeed).not.toHaveBeenCalled();
  });

  it("plans creation without silently applying it", () => {
    expect(
      planTargetedFirstSettlementSeed({
        targetExists: false,
        organizerExists: false,
      }),
    ).toEqual({ action: "create", organizerAction: "create" });
  });

  it("allows an explicitly confirmed apply to be repeated", async () => {
    const applySeed = vi.fn(async () => undefined);
    const options = parseTargetSeedArgs([
      "--apply",
      "--confirm=first-settlement",
    ]);

    await expect(
      executeTargetedFirstSettlementSeed(options, applySeed),
    ).resolves.toBe("applied");
    await expect(
      executeTargetedFirstSettlementSeed(options, applySeed),
    ).resolves.toBe("applied");
    expect(applySeed).toHaveBeenCalledTimes(2);
  });

  it("prints database context without credentials or query parameters", () => {
    expect(
      describeDatabaseTarget(
        "postgresql://seed-user:secret@db.example.test:5433/cicero?sslmode=require",
      ),
    ).toBe("postgresql://db.example.test:5433/cicero");
  });

  it("rejects unknown arguments", () => {
    expect(() => parseTargetSeedArgs(["--force"])).toThrow(
      "Unknown argument: --force",
    );
  });
});

describe("First Settlement replacement boundary", () => {
  it("deletes only the target event and preserves all users across replacements", async () => {
    const users = [
      {
        id: "roman-owner",
        email: "octavian@first-settlement.example",
        name: "Gaius Octavius",
      },
      { id: "organizer", email: "organizer@example.com", name: "Robin" },
      { id: "customer", email: "customer@example.com", name: "Customer" },
    ];
    const events = [
      { id: "target-old", slug: "first-settlement", ownerId: "organizer" },
      { id: "demo", slug: "demo", ownerId: "organizer" },
      {
        id: "roman-rehearsal",
        slug: "roman-rehearsal",
        ownerId: "roman-owner",
      },
      { id: "customer-event", slug: "customer-event", ownerId: "customer" },
    ];
    let nextUserId = 1;
    const store = {
      findTargetEvent: async () =>
        events.find((candidate) => candidate.slug === "first-settlement"),
      deleteTargetEvent: async (eventId: string) => {
        const index = events.findIndex((candidate) => candidate.id === eventId);
        if (index >= 0) events.splice(index, 1);
      },
      findSenatePeople: async (emails: readonly string[]) =>
        users.filter((candidate) => emails.includes(candidate.email)),
      createSenatePeople: async (
        people: readonly { email: string; name: string }[],
      ) => {
        const created = people.map((person) => ({
          ...person,
          id: `new-roman-${nextUserId++}`,
        }));
        users.push(...created);
        return created;
      },
    };

    const firstUsers = await prepareFirstSettlementSeed(store);
    expect(firstUsers.get("octavian@first-settlement.example")?.id).toBe(
      "roman-owner",
    );
    expect(events.map((candidate) => candidate.slug).sort()).toEqual([
      "customer-event",
      "demo",
      "roman-rehearsal",
    ]);
    expect(users).toHaveLength(16);

    events.push({
      id: "target-replacement",
      slug: "first-settlement",
      ownerId: "organizer",
    });
    const secondUsers = await prepareFirstSettlementSeed(store);

    expect(secondUsers.get("octavian@first-settlement.example")?.id).toBe(
      "roman-owner",
    );
    expect(events.map((candidate) => candidate.slug).sort()).toEqual([
      "customer-event",
      "demo",
      "roman-rehearsal",
    ]);
    expect(users).toHaveLength(16);
    expect(users.map((candidate) => candidate.id)).toContain("organizer");
    expect(users.map((candidate) => candidate.id)).toContain("customer");
  });
});
