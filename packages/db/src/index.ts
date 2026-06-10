export { createDb, resolveDialect, type Dialect, type RpeDb } from './client.js';
export { appMeta as appMetaPg, pgSchema } from './schema.pg.js';
export { appMeta as appMetaSqlite, sqliteSchema } from './schema.sqlite.js';
export { seedDev } from './seed.js';
export { createAuth, type CreateAuthOptions, type RpeAuth } from './auth.js';
export { LoginThrottle, type ThrottleDecision, type ThrottlePolicy } from './loginThrottle.js';
export { findMembership, listMemberships, roleAtLeast, OrgScope, TenantIsolationError, type Membership, type OrgRole } from './orgs.js';
export { createDeal, getDeal, listDeals, updateDeal, deleteDeal, type DealRecord, type DealPage } from './deals.js';
export { insertApiKey, listApiKeys, markKeyRevoked, touchKeyLastUsed, importApiKeyRecords, type ApiKeyRow } from './apiKeys.js';
