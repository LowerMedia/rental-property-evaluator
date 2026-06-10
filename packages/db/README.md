# @rpe/db — database foundation (RPE-88)

PostgreSQL via Drizzle ORM for staging/production, SQLite (better-sqlite3)
through a parity schema for hermetic local/test runs.

## Configuration

| Env | Meaning |
|---|---|
| `DATABASE_URL` | `postgres://user:pass@host:5432/db` (staging/prod — secret, wired by RPE-82, **never committed**) or a SQLite path: `file:./local.db`, `./local.sqlite`, `:memory:` |

```ts
import { createDb, seedDev } from '@rpe/db';

const db = createDb();            // reads DATABASE_URL
await db.applyMigrations();       // checked-in migrations for the live dialect
await seedDev(db);                // idempotent local-dev stamp
```

## Migrations

Checked-in under `migrations/pg` and `migrations/sqlite`; regenerate after
schema edits with:

```bash
pnpm --filter @rpe/db db:generate
```

`applyMigrations()` is what CI, tests, and deploy all call — drizzle's
journal makes re-application idempotent.

## Dialect caveats (the parity contract)

Drizzle requires dialect-specific table builders, so the schema is
authored twice — `src/schema.pg.ts` (production truth) and
`src/schema.sqlite.ts` (test twin). `tests/db.test.ts` locks the two to
identical table/column names; the known representational differences:

- timestamps: `timestamptz` (pg) vs integer epoch-millis (sqlite) — both
  surface as JS `Date` through Drizzle
- defaults: `now()` (pg) vs `unixepoch()*1000` (sqlite)

Auth/org tables land in RPE-89+ (better-auth-generated per ADR 0001 —
the generator CLI needs the auth instance, so generation happens there,
not in this foundation story).
