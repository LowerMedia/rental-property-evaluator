/**
 * E11 — cookie-session context glue (RPE-89)
 *
 * The requireAuth middleware for /v1 routes that serve signed-in humans
 * (org stories RPE-93/94 consume this; machine callers keep using
 * RPE-75 API keys). better-auth owns cookie parsing/validation — this
 * is the thin bridge into our request context + error envelope.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import type { RpeAuth } from '@rpe/db';
import { v1Error } from '../router.js';

type JsonFn = (res: ServerResponse, status: number, body: unknown) => void;

export interface SessionContext {
  user: { id: string; email: string; name: string; emailVerified: boolean };
  session: { id: string; expiresAt: Date };
}

/** Resolve the better-auth session from a request's cookies, or null. */
export async function getSessionContext(
  auth: RpeAuth,
  req: IncomingMessage,
): Promise<SessionContext | null> {
  const result = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (result === null) return null;
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      name: result.user.name,
      emailVerified: result.user.emailVerified,
    },
    session: { id: result.session.id, expiresAt: result.session.expiresAt },
  };
}

/**
 * Gate a handler on a valid session: resolves the context or writes the
 * standard 401 envelope and returns null (caller just returns).
 */
export async function requireSession(
  auth: RpeAuth,
  req: IncomingMessage,
  res: ServerResponse,
  json: JsonFn,
  requestId: string,
): Promise<SessionContext | null> {
  const context = await getSessionContext(auth, req);
  if (context === null) {
    json(res, 401, v1Error('unauthorized', 'A signed-in session is required.', requestId));
    return null;
  }
  return context;
}
