# Self-host target (T-3). The Cloudflare target does not use this file at all.
#
# Bun installs and builds because bun.lock is the lockfile; Node 22 runs the server because
# `next start` is the supported production entrypoint and drags in no Bun-specific behaviour.

FROM oven/bun:1.3-slim AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM oven/bun:1.3-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN bun run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/db ./db

RUN useradd --system --uid 1001 cicero && chown -R cicero:cicero /app
USER cicero
EXPOSE 3000

# Workers cannot migrate at boot, so the Cloudflare target runs `db:migrate` as a predeploy
# step. A container can, which is why `docker compose up` needs no second command.
CMD ["sh", "-c", "node_modules/.bin/tsx db/migrate.ts && node_modules/.bin/next start"]
