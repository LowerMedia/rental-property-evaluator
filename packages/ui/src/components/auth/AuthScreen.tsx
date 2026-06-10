/**
 * E11 — auth screens + gate (RPE-96)
 *
 * Hash-routed overlay hosting login / register / forgot / reset /
 * verify-email / account. Redirect rules live here:
 *   - signed-in users are bounced off signed-out-only screens
 *   - protected views render the login form for signed-out users
 *   - 'loading' renders an inert placeholder (no wrong-state flash)
 */

import { useEffect, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { useAuth } from '../../state/AuthContext';
import {
  parseAuthHash,
  navigateHash,
  PROTECTED_VIEWS,
  SIGNED_OUT_ONLY_VIEWS,
  type AuthRoute,
} from '../../state/authRoutes';
import { AuthField } from './AuthField';
import { OrgSwitcher } from './OrgSwitcher';

function useAuthRoute(): AuthRoute | null {
  const [route, setRoute] = useState<AuthRoute | null>(() =>
    typeof window === 'undefined' ? null : parseAuthHash(window.location.hash),
  );
  useEffect(() => {
    const onChange = () => setRoute(parseAuthHash(window.location.hash));
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-base/95 p-4 pt-16">
      <section
        aria-label={title}
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg"
      >
        <h2 className="mb-4 font-display text-lg text-hi">{title}</h2>
        {children}
      </section>
    </div>
  );
}

function SubmitButton({ children, busy }: { children: ReactNode; busy: boolean }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="mt-2 rounded bg-accent px-4 py-2 text-sm font-medium text-base disabled:opacity-60"
    >
      {busy ? 'Working…' : children}
    </button>
  );
}

function FormError({ error }: { error: string }) {
  if (error === '') return null;
  return (
    <p role="alert" className="text-xs text-fail">
      {error}
    </p>
  );
}

function FormNotice({ notice }: { notice: string }) {
  if (notice === '') return null;
  return (
    <p role="status" className="text-xs text-pass">
      {notice}
    </p>
  );
}

export function LoginForm() {
  const { client, refresh } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const result = await client.signIn(email, password);
    setBusy(false);
    if (result.ok) {
      await refresh();
      navigateHash(null);
    } else {
      setError(result.error);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
      <AuthField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
      <AuthField label="Password" type="password" value={password} onChange={setPassword} autoComplete="current-password" required />
      <FormError error={error} />
      <SubmitButton busy={busy}>Sign in</SubmitButton>
      <div className="mt-2 flex flex-col gap-1 text-xs text-mid">
        <a href="#/forgot-password" className="text-accent">Forgot your password?</a>
        <a href="#/register" className="text-accent">Create an account</a>
      </div>
    </form>
  );
}

export function RegisterForm() {
  const { client, refresh } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await client.signUp(name, email, password);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.message !== '') {
      setNotice(result.message); // verification mode: neutral RPE-90 message
    } else {
      await refresh(); // session mode: signed in immediately
      navigateHash(null);
    }
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
      <AuthField label="Name" type="text" value={name} onChange={setName} autoComplete="name" required />
      <AuthField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
      <AuthField label="Password" type="password" value={password} onChange={setPassword} autoComplete="new-password" required />
      <FormError error={error} />
      <FormNotice notice={notice} />
      <SubmitButton busy={busy}>Create account</SubmitButton>
      <a href="#/login" className="mt-2 text-xs text-accent">Already have an account? Sign in</a>
    </form>
  );
}

export function ForgotForm() {
  const { client } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const result = await client.requestPasswordReset(email);
    setBusy(false);
    if (result.ok) setNotice(result.message);
    else setError(result.error);
  };

  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
      <AuthField label="Email" type="email" value={email} onChange={setEmail} autoComplete="email" required />
      <FormError error={error} />
      <FormNotice notice={notice} />
      <SubmitButton busy={busy}>Send reset link</SubmitButton>
      <a href="#/login" className="mt-2 text-xs text-accent">Back to sign in</a>
    </form>
  );
}

export function ResetForm({ token }: { token: string }) {
  const { client } = useAuth();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) {
      setError('Password must be at least 10 characters.');
      return;
    }
    setBusy(true);
    setError('');
    const result = await client.resetPassword(password, token);
    setBusy(false);
    if (result.ok) setDone(true);
    else setError(result.error);
  };

  if (token === '') {
    return <FormError error="This reset link is missing its token — request a new one." />;
  }
  if (done) {
    return (
      <div className="flex flex-col gap-3">
        <FormNotice notice="Password updated. Sign in with your new password." />
        <a href="#/login" className="text-xs text-accent">Go to sign in</a>
      </div>
    );
  }
  return (
    <form onSubmit={(e) => void onSubmit(e)} className="flex flex-col gap-3">
      <AuthField label="New password" type="password" value={password} onChange={setPassword} autoComplete="new-password" required />
      <FormError error={error} />
      <SubmitButton busy={busy}>Set new password</SubmitButton>
    </form>
  );
}

function VerifyLanding({ params }: { params: URLSearchParams }) {
  const ok = params.get('status') === 'ok' || params.get('error') === null;
  return (
    <div className="flex flex-col gap-3">
      {ok ? (
        <FormNotice notice="Email verified — you can sign in now." />
      ) : (
        <FormError error="Verification failed — the link may have expired. Sign in to request a new one." />
      )}
      <a href="#/login" className="text-xs text-accent">Go to sign in</a>
    </div>
  );
}

function AccountView() {
  const { user, signOut } = useAuth();
  return (
    <div className="flex flex-col gap-3 text-sm text-hi">
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
        <dt className="text-lo">Name</dt>
        <dd>{user?.name}</dd>
        <dt className="text-lo">Email</dt>
        <dd>{user?.email}</dd>
        <dt className="text-lo">Verified</dt>
        <dd>{user?.emailVerified ? 'Yes' : 'No'}</dd>
      </dl>
      <OrgSwitcher />
      <button
        type="button"
        onClick={() => void signOut().then(() => navigateHash(null))}
        className="self-start rounded border border-border px-3 py-1.5 text-xs text-mid"
      >
        Sign out
      </button>
    </div>
  );
}

const TITLES: Record<string, string> = {
  login: 'Sign in',
  register: 'Create account',
  forgot: 'Reset your password',
  reset: 'Choose a new password',
  verify: 'Email verification',
  account: 'Your account',
};

/** Mount once inside AuthProvider — owns the hash gate + redirects. */
export function AuthScreen() {
  const { status } = useAuth();
  const route = useAuthRoute();

  // Redirect signed-in users off signed-out-only screens
  useEffect(() => {
    if (route !== null && status === 'signedIn' && SIGNED_OUT_ONLY_VIEWS.has(route.view)) {
      navigateHash(null);
    }
  }, [route, status]);

  if (route === null) return null;
  if (status === 'loading') {
    return (
      <Shell title={TITLES[route.view]!}>
        <p className="text-xs text-lo">Loading…</p>
      </Shell>
    );
  }
  if (status === 'signedIn' && SIGNED_OUT_ONLY_VIEWS.has(route.view)) return null; // redirecting

  // Protected views gate on a session — signed-out users get the login form
  if (PROTECTED_VIEWS.has(route.view) && status !== 'signedIn') {
    return (
      <Shell title="Sign in">
        <LoginForm />
      </Shell>
    );
  }

  return (
    <Shell title={TITLES[route.view]!}>
      {route.view === 'login' ? <LoginForm /> : null}
      {route.view === 'register' ? <RegisterForm /> : null}
      {route.view === 'forgot' ? <ForgotForm /> : null}
      {route.view === 'reset' ? <ResetForm token={route.params.get('token') ?? ''} /> : null}
      {route.view === 'verify' ? <VerifyLanding params={route.params} /> : null}
      {route.view === 'account' ? <AccountView /> : null}
    </Shell>
  );
}
