/**
 * RPE-83 — DB-backed API key management (run with: npx tsx scripts/manage-keys-db.ts)
 *
 *   mint <orgId> <label>      mint a key for an org (secret printed ONCE)
 *   list                      list all keys (no hashes)
 *   revoke <keyId>            revoke a key
 *   import <orgId> <file>     import RPE-75 env/file JSON records under an org
 *
 * Requires DATABASE_URL. The RPE-75 model is unchanged: sha256 at rest,
 * secret shown exactly once at mint.
 */

import { readFileSync } from 'node:fs';
import { createDb, listApiKeys, markKeyRevoked } from '@rpe/db';
import { parseKeyRecords } from '../src/services/apiKeys.js';
import { DbApiKeyStore } from '../src/services/dbApiKeys.js';

const [, , command, ...args] = process.argv;

const db = createDb();
await db.applyMigrations();
const store = await DbApiKeyStore.load(db);

try {
  switch (command) {
    case 'mint': {
      const [orgId, label] = args;
      if (orgId === undefined || label === undefined) throw new Error('usage: mint <orgId> <label>');
      const { record, secret } = await store.mint(orgId, label);
      console.log(`minted ${record.id} (${label}) for org ${orgId}`);
      console.log(`SECRET (shown once): ${secret}`);
      break;
    }
    case 'list': {
      for (const row of await listApiKeys(db)) {
        console.log(
          `${row.id}  org=${row.organizationId}  label=${row.label}  created=${row.createdAt.toISOString()}` +
            `${row.revokedAt !== null ? `  REVOKED ${row.revokedAt.toISOString()}` : ''}` +
            `${row.lastUsedAt !== null ? `  lastUsed=${row.lastUsedAt.toISOString()}` : ''}`,
        );
      }
      break;
    }
    case 'revoke': {
      const [keyId] = args;
      if (keyId === undefined) throw new Error('usage: revoke <keyId>');
      const ok = await markKeyRevoked(db, keyId, new Date());
      console.log(ok ? `revoked ${keyId}` : `no such key: ${keyId}`);
      break;
    }
    case 'import': {
      const [orgId, file] = args;
      if (orgId === undefined || file === undefined) throw new Error('usage: import <orgId> <file>');
      const records = parseKeyRecords(readFileSync(file, 'utf8'), file);
      const result = await store.importEnvRecords(orgId, records);
      console.log(`imported ${result.imported}, skipped ${result.skipped} (already present)`);
      break;
    }
    default:
      console.log('usage: manage-keys-db.ts <mint|list|revoke|import> …');
      process.exitCode = 1;
  }
} finally {
  await store.flush();
  await db.close();
}
