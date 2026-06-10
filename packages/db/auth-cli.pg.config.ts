/** CLI-only pg variant of auth-cli.config.ts (RPE-89). */
import Database from 'better-sqlite3';
import { betterAuth } from 'better-auth';
import { organization } from 'better-auth/plugins/organization';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { drizzle } from 'drizzle-orm/better-sqlite3';

export const auth = betterAuth({
  secret: 'cli-generation-only',
  database: drizzleAdapter(drizzle(new Database(':memory:')), { provider: 'pg' }),
  emailAndPassword: { enabled: true },
  plugins: [organization()],
});
