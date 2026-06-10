/**
 * E11 — auth client (RPE-96)
 *
 * Thin fetch wrapper over the /v1/auth surface (better-auth, RPE-89+).
 * Paths are RELATIVE by default: cookie sessions require same-origin
 * requests (the public API's CORS policy is deliberately credential-less
 * — RPE-81), so dev uses the Vite proxy and production serves SPA + API
 * from one origin. CSRF is better-auth's Origin check — the browser
 * sends Origin automatically on these mutations.
 */

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  emailVerified: boolean;
}

export interface AuthOrg {
  id: string;
  name: string;
  slug: string;
}

export interface AuthResult {
  ok: boolean;
  /** Friendly, displayable error ('' when ok). */
  error: string;
}

const ORG_STORAGE_KEY = 'rpe_org_id';

function friendly(status: number, message: string | undefined): string {
  if (status === 429) return message ?? 'Too many attempts. Please wait and try again.';
  if (status === 403) return message ?? 'This action is not allowed right now.';
  if (status === 401) return 'Invalid email or password.';
  return message ?? 'Something went wrong. Please try again.';
}

export class AuthClient {
  constructor(private readonly base: string = '') {}

  private async post(path: string, body: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
    const res = await fetch(`${this.base}/v1/auth${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let data: Record<string, unknown> = {};
    try {
      data = (await res.json()) as Record<string, unknown>;
    } catch {
      // empty body is fine (e.g. 404 from a disabled auth server)
    }
    return { status: res.status, data };
  }

  async getSession(): Promise<AuthUser | null> {
    try {
      const res = await fetch(`${this.base}/v1/auth/get-session`, { credentials: 'include' });
      if (!res.ok) return null;
      const body = (await res.json()) as { user?: AuthUser } | null;
      return body?.user ?? null;
    } catch {
      return null;
    }
  }

  async signIn(email: string, password: string): Promise<AuthResult> {
    const { status, data } = await this.post('/sign-in/email', { email, password });
    if (status === 200) return { ok: true, error: '' };
    if (status === 403) {
      return { ok: false, error: 'Please verify your email before signing in — check your inbox.' };
    }
    return { ok: false, error: friendly(status, data['message'] as string | undefined) };
  }

  /** Returns the neutral RPE-90 message when verification mode is on. */
  async signUp(name: string, email: string, password: string): Promise<AuthResult & { message: string }> {
    const { status, data } = await this.post('/sign-up/email', {
      name,
      email,
      password,
      callbackURL: `${typeof window !== 'undefined' ? window.location.origin : ''}/#/verify-email?status=ok`,
    });
    if (status === 200) {
      return { ok: true, error: '', message: (data['message'] as string | undefined) ?? '' };
    }
    return { ok: false, message: '', error: friendly(status, data['message'] as string | undefined) };
  }

  async signOut(): Promise<void> {
    await this.post('/sign-out', {});
  }

  async requestPasswordReset(email: string): Promise<AuthResult & { message: string }> {
    const redirectTo = `${typeof window !== 'undefined' ? window.location.origin : ''}/#/reset-password`;
    const { status, data } = await this.post('/request-password-reset', { email, redirectTo });
    if (status === 200) {
      return { ok: true, error: '', message: (data['message'] as string | undefined) ?? 'Check your email for the reset link.' };
    }
    return { ok: false, message: '', error: friendly(status, data['message'] as string | undefined) };
  }

  async resetPassword(newPassword: string, token: string): Promise<AuthResult> {
    const { status, data } = await this.post('/reset-password', { newPassword, token });
    if (status === 200) return { ok: true, error: '' };
    return { ok: false, error: friendly(status, data['message'] as string | undefined) };
  }

  async listOrganizations(): Promise<AuthOrg[]> {
    try {
      const res = await fetch(`${this.base}/v1/auth/organization/list`, { credentials: 'include' });
      if (!res.ok) return [];
      const body = (await res.json()) as AuthOrg[] | null;
      return Array.isArray(body) ? body : [];
    } catch {
      return [];
    }
  }
}

/** Current-org persistence — consumed as the X-Org-Id convention (RPE-94). */
export function getStoredOrgId(): string | null {
  try {
    return localStorage.getItem(ORG_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function storeOrgId(orgId: string | null): void {
  try {
    if (orgId === null) localStorage.removeItem(ORG_STORAGE_KEY);
    else localStorage.setItem(ORG_STORAGE_KEY, orgId);
  } catch {
    // storage unavailable (private mode) — selection just won't persist
  }
}
