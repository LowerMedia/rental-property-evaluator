/**
 * E11 — hash-based auth routes (RPE-96)
 *
 * The evaluator is a single-view tool; auth screens ride on the URL
 * hash (#/login, #/register, …) so no router dependency is added and
 * the WP block / share-URL behavior is untouched. Email links land on
 * hash routes too — better-auth appends ?token=… AFTER the hash, so the
 * query is parsed from inside the fragment.
 */

export type AuthView = 'login' | 'register' | 'forgot' | 'reset' | 'verify' | 'account';

export interface AuthRoute {
  view: AuthView;
  params: URLSearchParams;
}

const VIEW_BY_PATH: Record<string, AuthView> = {
  '/login': 'login',
  '/register': 'register',
  '/forgot-password': 'forgot',
  '/reset-password': 'reset',
  '/verify-email': 'verify',
  '/account': 'account',
};

/** Views that require a session. */
export const PROTECTED_VIEWS: ReadonlySet<AuthView> = new Set(['account']);

/** Views a signed-in user is redirected away from. */
export const SIGNED_OUT_ONLY_VIEWS: ReadonlySet<AuthView> = new Set(['login', 'register', 'forgot']);

export function parseAuthHash(hash: string): AuthRoute | null {
  if (!hash.startsWith('#/')) return null;
  const fragment = hash.slice(1); // '/login' or '/reset-password?token=x'
  const queryIndex = fragment.indexOf('?');
  const path = queryIndex === -1 ? fragment : fragment.slice(0, queryIndex);
  const view = VIEW_BY_PATH[path];
  if (view === undefined) return null;
  return {
    view,
    params: new URLSearchParams(queryIndex === -1 ? '' : fragment.slice(queryIndex + 1)),
  };
}

export function navigateHash(path: string | null): void {
  if (path === null) {
    // clear without scroll-jumping or history spam
    history.replaceState(null, '', window.location.pathname + window.location.search);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  window.location.hash = path;
}
