/**
 * E11 — header account control (RPE-96): "Sign in" link when signed
 * out, the user's name linking to the protected #/account view when
 * signed in. Quiet while the session is still resolving.
 */

import { useAuth } from '../../state/AuthContext';

export function AccountMenu() {
  const { status, user } = useAuth();

  if (status === 'loading') return null;
  if (status === 'signedOut') {
    return (
      <a
        href="#/login"
        className="rounded border border-border px-2.5 py-1 text-xs text-mid hover:text-hi"
      >
        Sign in
      </a>
    );
  }
  return (
    <a
      href="#/account"
      className="rounded border border-border px-2.5 py-1 text-xs text-accent"
      aria-label={`Account: ${user?.name ?? ''}`}
    >
      {user?.name ?? 'Account'}
    </a>
  );
}
