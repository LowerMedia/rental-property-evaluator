/**
 * E10 — minimal public-API router (RPE-74)
 *
 * Method + exact-path → handler dispatch over Node's http server — the
 * deliberate minimalism of apps/api preserved, just no longer ad hoc.
 *
 * Conventions established here for the whole /v1 surface:
 *   - every request gets an X-Request-Id (client value echoed when sane,
 *     generated otherwise) and a structured completion log line
 *   - /v1-native errors use the standard envelope
 *     { error: { code, message, requestId } }
 *   - legacy unprefixed routes keep their flat shapes (the SPA depends
 *     on them); the dispatcher aliases them under /v1 unchanged
 */

import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

export type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void;

interface Route {
  method: string;
  path: string;
  handler: RouteHandler;
}

/** Echoable client request ids: short, printable, header-safe. */
const REQUEST_ID_PATTERN = /^[\w.-]{1,64}$/;

export function resolveRequestId(req: IncomingMessage): string {
  const raw = req.headers['x-request-id'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  if (typeof first === 'string' && REQUEST_ID_PATTERN.test(first)) return first;
  return randomUUID();
}

/** Standard /v1 error envelope. */
export function v1Error(
  code: string,
  message: string,
  requestId: string,
): { error: { code: string; message: string; requestId: string } } {
  return { error: { code, message, requestId } };
}

export class Router {
  private readonly routes: Route[] = [];

  /** Register an exact-path route. Trailing slashes are normalized away. */
  on(method: string, path: string, handler: RouteHandler): this {
    this.routes.push({ method: method.toUpperCase(), path: normalizePath(path), handler });
    return this;
  }

  /** Resolve a handler, or undefined when no route matches. */
  resolve(method: string | undefined, path: string): RouteHandler | undefined {
    const m = (method ?? 'GET').toUpperCase();
    const p = normalizePath(path);
    return this.routes.find((r) => r.path === p && r.method === m)?.handler
      // Method-agnostic fallback: handlers own their 405 responses, so a
      // path that exists under any method still dispatches
      ?? this.routes.find((r) => r.path === p)?.handler;
  }
}

export function normalizePath(path: string): string {
  const noTrailing = path.replace(/\/+$/, '');
  return noTrailing === '' ? '/' : noTrailing;
}

/** One structured line per completed request. */
export function logRequest(fields: {
  method: string;
  path: string;
  status: number;
  latencyMs: number;
  requestId: string;
}): void {
  console.log(JSON.stringify({ evt: 'request', ...fields }));
}
