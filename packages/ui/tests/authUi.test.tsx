/**
 * RPE-96: auth UI — forms (a11y, validation, submit wiring), hash-route
 * gate semantics, account menu + org switcher states. fetch is mocked;
 * flow truth lives in the API suites (RPE-89–97).
 *
 * @vitest-environment jsdom
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { AuthProvider } from '../src/state/AuthContext';
import { AuthClient } from '../src/state/authClient';
import { parseAuthHash } from '../src/state/authRoutes';
import { AuthScreen, LoginForm, RegisterForm } from '../src/components/auth/AuthScreen';
import { AccountMenu } from '../src/components/auth/AccountMenu';
import { OrgSwitcher } from '../src/components/auth/OrgSwitcher';

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(routes: Record<string, { status: number; body: unknown }>): FetchMock {
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const hit = Object.entries(routes).find(([path]) => url.includes(path));
    const { status, body } = hit?.[1] ?? { status: 404, body: {} };
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  });
  vi.stubGlobal('fetch', mock);
  return mock;
}

const SIGNED_OUT = { '/get-session': { status: 200, body: null } };
const USER = { id: 'u1', email: 'a@x.com', name: 'Alice', emailVerified: true };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  window.location.hash = '';
});

function renderWithAuth(ui: React.ReactElement, routes: Record<string, { status: number; body: unknown }>) {
  const fetchMock = mockFetch(routes);
  const result = render(<AuthProvider client={new AuthClient()}>{ui}</AuthProvider>);
  return { fetchMock, ...result };
}

describe('parseAuthHash', () => {
  it('maps known hash paths and parses fragment queries (email links)', () => {
    expect(parseAuthHash('#/login')?.view).toBe('login');
    expect(parseAuthHash('#/reset-password?token=t1')?.params.get('token')).toBe('t1');
    expect(parseAuthHash('#/verify-email?status=ok')?.view).toBe('verify');
    expect(parseAuthHash('#/somewhere-else')).toBeNull();
    expect(parseAuthHash('')).toBeNull();
  });
});

describe('LoginForm', () => {
  it('has labeled fields, posts credentials, surfaces errors via role=alert', async () => {
    const { fetchMock } = renderWithAuth(<LoginForm />, {
      ...SIGNED_OUT,
      '/sign-in/email': { status: 401, body: { message: 'Invalid email or password' } },
    });

    const email = screen.getByLabelText('Email');
    const password = screen.getByLabelText('Password');
    fireEvent.change(email, { target: { value: 'a@x.com' } });
    fireEvent.change(password, { target: { value: 'wrong-password-0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Invalid email or password');
    const call = fetchMock.mock.calls.find((c) => String(c[0]).includes('/sign-in/email'))!;
    expect(JSON.parse(String((call[1] as RequestInit).body))).toEqual({
      email: 'a@x.com',
      password: 'wrong-password-0',
    });
  });
});

describe('RegisterForm', () => {
  it('enforces the 10-char password policy client-side before posting', async () => {
    const { fetchMock } = renderWithAuth(<RegisterForm />, SIGNED_OUT);
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@x.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect((await screen.findByRole('alert')).textContent).toContain('at least 10 characters');
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes('/sign-up'))).toBe(false);
  });

  it('shows the neutral verification notice when the API returns one', async () => {
    renderWithAuth(<RegisterForm />, {
      ...SIGNED_OUT,
      '/sign-up/email': { status: 200, body: { status: true, message: 'Check your email to verify your account.' } },
    });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@x.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'long-enough-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }));

    expect((await screen.findByRole('status')).textContent).toContain('Check your email');
  });
});

describe('AuthScreen gate', () => {
  it('renders the login screen on #/login when signed out', async () => {
    window.location.hash = '#/login';
    renderWithAuth(<AuthScreen />, SIGNED_OUT);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('redirects signed-in users away from auth screens', async () => {
    window.location.hash = '#/login';
    renderWithAuth(<AuthScreen />, {
      '/get-session': { status: 200, body: { user: USER } },
      '/organization/list': { status: 200, body: [] },
    });
    await waitFor(() => expect(window.location.hash).toBe(''));
  });

  it('gates the protected #/account view behind the login form when signed out', async () => {
    window.location.hash = '#/account';
    renderWithAuth(<AuthScreen />, SIGNED_OUT);
    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeTruthy();
  });

  it('shows account details + sign out on #/account when signed in', async () => {
    window.location.hash = '#/account';
    renderWithAuth(<AuthScreen />, {
      '/get-session': { status: 200, body: { user: USER } },
      '/organization/list': { status: 200, body: [{ id: 'o1', name: 'Acme', slug: 'acme' }] },
    });
    expect(await screen.findByText('a@x.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeTruthy();
    expect(screen.getByText(/Organization: Acme/)).toBeTruthy();
  });
});

describe('AccountMenu', () => {
  it('offers Sign in when signed out and the account link when signed in', async () => {
    renderWithAuth(<AccountMenu />, SIGNED_OUT);
    expect(await screen.findByRole('link', { name: 'Sign in' })).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();

    renderWithAuth(<AccountMenu />, {
      '/get-session': { status: 200, body: { user: USER } },
      '/organization/list': { status: 200, body: [] },
    });
    expect(await screen.findByRole('link', { name: /Account: Alice/ })).toBeTruthy();
  });
});

describe('OrgSwitcher', () => {
  it('renders a labeled select for multi-org users and persists the switch', async () => {
    renderWithAuth(<OrgSwitcher />, {
      '/get-session': { status: 200, body: { user: USER } },
      '/organization/list': {
        status: 200,
        body: [
          { id: 'o1', name: 'Acme', slug: 'acme' },
          { id: 'o2', name: 'Side Deals', slug: 'side' },
        ],
      },
    });
    const select = (await screen.findByLabelText('Organization')) as HTMLSelectElement;
    expect(select.value).toBe('o1'); // first org auto-selected
    await act(async () => {
      fireEvent.change(select, { target: { value: 'o2' } });
    });
    expect(localStorage.getItem('rpe_org_id')).toBe('o2');
  });
});
