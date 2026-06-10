import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/schema.pg.ts', './src/schema.auth.pg.ts'],
  out: './migrations/pg',
});
