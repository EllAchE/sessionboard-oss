# Targeted First Settlement seed

Use the targeted command when `/first-settlement` must be planned or loaded without resetting the
other demo event or any organizer-created rehearsal data.

The command requires an explicit `DATABASE_URL`. It does not discover the deployed Cloudflare
Worker's Hyperdrive binding. The plan prints only the database protocol, host, port, and database
name; credentials and query parameters are omitted.

## Plan

```bash
bun run db:seed:first-settlement
```

The default is a read-only dry run. It reports the database context, exact `/first-settlement`
target, create-or-replace action, and whether the organizer identity will be reused or created.

## Apply

```bash
bun run db:seed:first-settlement --apply --confirm=first-settlement
```

The equivalent npm and container commands are:

```bash
npm run db:seed:first-settlement -- --apply --confirm=first-settlement
docker compose exec app npm run db:seed:first-settlement -- --apply --confirm=first-settlement
```

Both initial creation and replacement require `--apply` and the exact
`--confirm=first-settlement` value. On replacement, the command deletes only the existing event
whose slug is `first-settlement`, including its event-scoped database rows and stored profile art,
then recreates it. It reuses existing Roman fixture users and creates only missing ones.

The command does not delete `/demo`, events owned by the organizer or Roman fixture identities,
unrelated events, global users, or memberships outside `/first-settlement`. Run the dry-run command
immediately before every apply and verify the displayed database target.
