#!/usr/bin/env node
/**
 * E10 — API key issuance CLI (RPE-75)
 *
 * Mints/revokes/lists hashed API key records in a JSON file usable as
 * RPE_API_KEYS_FILE (or paste the array into RPE_API_KEYS). The full
 * secret is printed exactly once at mint time and is unrecoverable
 * afterwards — only its sha256 lands in the file.
 *
 *   node scripts/manage-keys.mjs mint   --label acme-staging [--file keys.json]
 *   node scripts/manage-keys.mjs revoke --id key_3f2a1b9c    [--file keys.json]
 *   node scripts/manage-keys.mjs list                        [--file keys.json]
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const command = args[0];

function flag(name, fallback) {
  const i = args.indexOf(`--${name}`);
  return i !== -1 && args[i + 1] !== undefined ? args[i + 1] : fallback;
}

const file = flag('file', 'keys.json');

function load() {
  if (!existsSync(file)) return [];
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${file} must contain a JSON array`);
  return parsed;
}

function save(records) {
  writeFileSync(file, `${JSON.stringify(records, null, 2)}\n`);
}

if (command === 'mint') {
  const label = flag('label');
  if (!label) {
    console.error('mint requires --label <consumer>');
    process.exit(1);
  }
  const secret = `rpe_live_${randomBytes(24).toString('hex')}`;
  const record = {
    id: `key_${randomBytes(4).toString('hex')}`,
    label,
    hash: createHash('sha256').update(secret).digest('hex'),
    createdAt: new Date().toISOString(),
    revokedAt: null,
    lastUsedAt: null,
  };
  const records = load();
  records.push(record);
  save(records);
  console.log(`Minted ${record.id} (${label}) → ${file}`);
  console.log('');
  console.log('  ONE-TIME SECRET (store it now — it cannot be recovered):');
  console.log(`  ${secret}`);
} else if (command === 'revoke') {
  const id = flag('id');
  if (!id) {
    console.error('revoke requires --id <key id>');
    process.exit(1);
  }
  const records = load();
  const record = records.find((r) => r.id === id);
  if (!record) {
    console.error(`No key with id ${id} in ${file}`);
    process.exit(1);
  }
  if (record.revokedAt !== null) {
    console.log(`${id} was already revoked at ${record.revokedAt}`);
    process.exit(0);
  }
  record.revokedAt = new Date().toISOString();
  save(records);
  console.log(`Revoked ${id} (${record.label}). Restart the API (env/file stores load at startup).`);
} else if (command === 'list') {
  for (const r of load()) {
    console.log(`${r.id}  ${r.revokedAt === null ? 'active ' : 'REVOKED'}  ${r.label}  created ${r.createdAt}`);
  }
} else {
  console.error('Usage: manage-keys.mjs <mint|revoke|list> [--label X] [--id key_x] [--file keys.json]');
  process.exit(1);
}
