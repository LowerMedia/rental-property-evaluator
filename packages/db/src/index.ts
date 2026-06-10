export { createDb, resolveDialect, type Dialect, type RpeDb } from './client.js';
export { appMeta as appMetaPg, pgSchema } from './schema.pg.js';
export { appMeta as appMetaSqlite, sqliteSchema } from './schema.sqlite.js';
export { seedDev } from './seed.js';
