# syntax=docker/dockerfile:1
# RPE-98 — production image for apps/api (DO App Platform service).
#
# Build context = repo root (the app spec sets source_dir: / and
# dockerfile_path: apps/api/Dockerfile). Local verification:
#   docker build -f apps/api/Dockerfile -t rpe-api .

# ── build: full workspace install + Vite SSR bundle ─────────────────────────
FROM node:20-bookworm-slim AS build

# Toolchain fallback for native deps (better-sqlite3, @node-rs/argon2)
# in case a prebuilt binary is unavailable for this platform.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable

WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rpe/api build

# Pruned production node_modules. The Vite bundle inlines all workspace
# packages and externalises only the native/driver deps (argon2,
# better-sqlite3, pg, better-auth, drizzle-orm) — see apps/api/vite.config.ts.
RUN pnpm --filter @rpe/api deploy --legacy --prod /prod/api

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /prod/api/node_modules ./node_modules
COPY --from=build /repo/apps/api/dist ./dist
# The server reads its own package.json at boot for version reporting.
COPY --from=build /repo/apps/api/package.json ./package.json
# Drizzle migrations ship with the image; the api applies the dialect's
# folder at first DB connect (packages/db/src/client.ts).
COPY --from=build /repo/packages/db/migrations ./migrations
ENV RPE_MIGRATIONS_DIR=/app/migrations

ARG GIT_SHA=unknown
ENV GIT_SHA=$GIT_SHA

ENV HOST=0.0.0.0 PORT=3001
EXPOSE 3001
USER node
CMD ["node", "dist/index.js"]
