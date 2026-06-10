/**
 * CLI-only better-auth config (RPE-89) — exists so `@better-auth/cli
 * generate` can emit the Drizzle auth schema. The runtime factory is
 * src/auth.ts; keep feature flags in lockstep.
 */
import Database from 'better-sqlite3';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins/organization';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export const auth = betterAuth({
  secret: 'cli-generation-only',
  database: drizzleAdapter(drizzle(new Database(':memory:')), { provider: 'sqlite' }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});
