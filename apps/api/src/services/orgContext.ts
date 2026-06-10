/**
 * E11 — org-context middleware + RBAC (RPE-94)
 *
 * The TS analog of Laravel's SetCurrentOrganization middleware: resolve
 * the current org per request, verify membership, enforce role
 * requirements, and hand back an OrgScope so data access is org-filtered
 * by construction. Centralized here so every future org-owned endpoint
 * (E10 stored deals included) inherits isolation instead of
 * reimplementing it.
 *
 * Org selection: X-Org-Id header first, the session's
 * activeOrganizationId as fallback. Non-membership and nonexistent orgs
 * return the SAME 403 — existence never leaks.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { findMembership, roleAtLeast, OrgScope, type OrgRole, type RpeAuth, type RpeDb } from '@rpe/db';
import { v1Error } from '../router.js';
import { getSessionContext, type SessionContext } from './session.js';

type JsonFn = (res: ServerResponse, status: number, body: unknown) => void;

export interface OrgContext {
  session: SessionContext;
  organizationId: string;
  role: OrgRole;
  scope: OrgScope;
}

function headerOrgId(req: IncomingMessage): string | null {
  const raw = req.headers['x-org-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (value === undefined) return null;
  const trimmed = value.trim();
  return /^[\w-]{1,64}$/.test(trimmed) ? trimmed : null;
}

/**
 * Resolve the request's org context, or null with the proper envelope
 * written (401 no session; 403 no org selected / not a member / role too
 * low — the same body whether or not the org exists).
 */
export async function requireOrg(
  auth: RpeAuth,
  db: RpeDb,
  req: IncomingMessage,
  res: ServerResponse,
  json: JsonFn,
  requestId: string,
  options: { minRole?: OrgRole; session?: SessionContext } = {},
): Promise<OrgContext | null> {
  const session = options.session ?? (await getSessionContext(auth, req));
  if (session === null) {
    json(res, 401, v1Error('unauthorized', 'A signed-in session is required.', requestId));
    return null;
  }

  const organizationId = headerOrgId(req);
  if (organizationId === null) {
    json(res, 403, v1Error('forbidden', 'No organization selected.', requestId));
    return null;
  }

  const membership = await findMembership(db, session.user.id, organizationId);
  if (membership === null) {
    // identical for "org doesn't exist" and "not a member" — no leak
    json(res, 403, v1Error('forbidden', 'You are not a member of this organization.', requestId));
    return null;
  }

  if (options.minRole !== undefined && !roleAtLeast(membership.role, options.minRole)) {
    json(res, 403, v1Error('forbidden', `This action requires the ${options.minRole} role.`, requestId));
    return null;
  }

  return {
    session,
    organizationId,
    role: membership.role,
    scope: new OrgScope(organizationId),
  };
}
