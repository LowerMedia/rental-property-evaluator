/**
 * E11 — session-aware shell state (RPE-96)
 *
 * AuthProvider resolves the cookie session once on mount and exposes
 * {status, user, orgs, currentOrgId} plus the actions the screens need.
 * status 'loading' keeps gates indeterminate until the first
 * /get-session resolves — no flash of the wrong state.
 */

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { AuthClient, getStoredOrgId, storeOrgId, type AuthOrg, type AuthUser } from './authClient';

export type AuthStatus = 'loading' | 'signedOut' | 'signedIn';

export interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  orgs: AuthOrg[];
  currentOrgId: string | null;
  client: AuthClient;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  switchOrg: (orgId: string) => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children, client }: { children: ReactNode; client?: AuthClient }) {
  const authClient = useMemo(() => client ?? new AuthClient(), [client]);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [orgs, setOrgs] = useState<AuthOrg[]>([]);
  const [currentOrgId, setCurrentOrgId] = useState<string | null>(getStoredOrgId());

  const refresh = useCallback(async () => {
    const sessionUser = await authClient.getSession();
    if (sessionUser === null) {
      setStatus('signedOut');
      setUser(null);
      setOrgs([]);
      return;
    }
    setUser(sessionUser);
    setStatus('signedIn');
    const memberOrgs = await authClient.listOrganizations();
    setOrgs(memberOrgs);
    // keep the stored selection only while it's still a membership
    setCurrentOrgId((stored) => {
      const valid = stored !== null && memberOrgs.some((o) => o.id === stored);
      const next = valid ? stored : (memberOrgs[0]?.id ?? null);
      storeOrgId(next);
      return next;
    });
  }, [authClient]);

  const signOut = useCallback(async () => {
    await authClient.signOut();
    storeOrgId(null);
    setCurrentOrgId(null);
    setUser(null);
    setOrgs([]);
    setStatus('signedOut');
  }, [authClient]);

  const switchOrg = useCallback((orgId: string) => {
    storeOrgId(orgId);
    setCurrentOrgId(orgId);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ status, user, orgs, currentOrgId, client: authClient, refresh, signOut, switchOrg }),
    [status, user, orgs, currentOrgId, authClient, refresh, signOut, switchOrg],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
