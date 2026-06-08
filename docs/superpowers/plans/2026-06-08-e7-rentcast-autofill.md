# E7 — RentCast Autofill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add address-based property autofill to the evaluator using the RentCast API, with user-supplied API keys stored in localStorage.

**Architecture:** A new `packages/rentcast` workspace package wraps the RentCast HTTP API. `apps/api` gains a `POST /property` proxy route that forwards requests (with the user's key) to RentCast. `packages/ui` gains a persistent `AutofillBar` above the inputs form, an `AutofillPreviewPopover` diff UI, a `ConnectorSettingsModal` (opened from a Settings button in the header), and a `useAutofill` hook orchestrating all state.

**Tech Stack:** TypeScript, Vitest (`vi.mock`/`vi.fn`), Node.js `fetch`, React 18 hooks, Tailwind CSS, `localStorage`.

**Git strategy:** Four task branches (`RPE-43a`, `RPE-43b`, `RPE-43c`, `RPE-43d`), each cut from `v1.3.0`. Gate before every commit: `pnpm lint && pnpm typecheck && pnpm test`. Cherry-pick each branch onto `v1.3.0` after Copilot review; merge into `develop`; delete branch.

---

## File Map

```
packages/rentcast/                      ← NEW workspace package
  package.json
  tsconfig.json
  src/
    types.ts                            ← PropertyData, RentCastError, RentCastErrorCode
    client.ts                           ← fetchPropertyData(address, apiKey)
    index.ts                            ← re-exports
  tests/
    client.test.ts

apps/api/
  package.json                          ← MODIFIED: add @rpe/rentcast dep
  vite.config.ts                        ← MODIFIED: noExternal += @rpe/rentcast
  src/
    routes/
      property.ts                       ← NEW: POST /property handler
    index.ts                            ← MODIFIED: wire /property route
  tests/
    property.test.ts                    ← NEW

packages/ui/src/
  state/
    connectorStorage.ts                 ← NEW: localStorage get/set/clear for API key
  hooks/
    useAutofill.ts                      ← NEW: idle→loading→preview→idle state machine
  components/
    ConnectorSettingsModal.tsx          ← NEW: modal with RentCast key entry
    AutofillBar.tsx                     ← NEW: persistent address input above Acquisition
    AutofillPreviewPopover.tsx          ← NEW: diff table with Apply/Cancel
  components/inputs/
    DealInputsForm.tsx                  ← MODIFIED: add AutofillBar above Acquisition
  Evaluator.tsx                         ← MODIFIED: Settings button, apiKey state, pass to form

packages/ui/tests/
  connectorStorage.test.ts              ← NEW
  useAutofill.test.ts                   ← NEW
```

---

## Task 1 — `packages/rentcast` workspace package (RPE-43a)

**Branch:** `RPE-43a` (cut from `v1.3.0`)

**Files:**
- Create: `packages/rentcast/package.json`
- Create: `packages/rentcast/tsconfig.json`
- Create: `packages/rentcast/src/types.ts`
- Create: `packages/rentcast/src/client.ts`
- Create: `packages/rentcast/src/index.ts`
- Create: `packages/rentcast/tests/client.test.ts`

---

- [ ] **Step 1.1 — Cut branch**

```bash
git checkout v1.3.0
git checkout -b RPE-43a
```

---

- [ ] **Step 1.2 — Create package scaffolding**

`packages/rentcast/package.json`:
```json
{
  "name": "@rpe/rentcast",
  "version": "1.3.0",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "typescript": "catalog:"
  }
}
```

`packages/rentcast/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "declarationMap": true,
    "noEmit": false,
    "lib": ["ES2022", "DOM"]
  },
  "include": ["src"],
  "exclude": ["tests", "dist"]
}
```

> **Note:** `"lib": ["ES2022", "DOM"]` is required because `fetch` is typed via the DOM lib. The base `tsconfig.base.json` only includes `ES2022`.

---

- [ ] **Step 1.3 — Write `src/types.ts`**

`packages/rentcast/src/types.ts`:
```ts
/** Codes that identify why a RentCast request failed. */
export type RentCastErrorCode = 'not_found' | 'bad_key' | 'rate_limit' | 'unknown';

/** Thrown by fetchPropertyData on any RentCast API error. */
export class RentCastError extends Error {
  constructor(
    public readonly code: RentCastErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RentCastError';
  }
}

/**
 * Property data returned after a successful autofill lookup.
 * Fields sourced from /properties are null when RentCast returns no record.
 */
export interface PropertyData {
  /** AVM mid-point estimate from /avm/value */
  purchasePrice: number;
  /** Monthly rent estimate from /avm/rent/long-term */
  grossRent: number;
  /** Square footage from /properties — null if not found */
  sqft: number | null;
  /** Unit count from /properties — null if not found */
  units: number | null;
  /** Annual property taxes from /properties — null if not found */
  annualTaxes: number | null;
}
```

---

- [ ] **Step 1.4 — Write failing tests**

`packages/rentcast/tests/client.test.ts`:
```ts
/**
 * RPE-43a: fetchPropertyData unit tests
 *
 * All RentCast HTTP calls are mocked via vi.mock on globalThis.fetch.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchPropertyData } from '../src/client';
import { RentCastError } from '../src/types';

// ─── Mock helpers ─────────────────────────────────────────────────────────────

function mockOk(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

function mockFail(status: number): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ message: `HTTP ${status}` }),
  } as unknown as Response;
}

// RentCast response shapes
// Verify field names against https://developers.rentcast.io/reference before shipping.
const AVM_VALUE_RESPONSE   = { price: 342_000, priceRangeLow: 315_000, priceRangeHigh: 369_000 };
const AVM_RENT_RESPONSE    = { rent: 2_150, rentRangeLow: 1_950, rentRangeHigh: 2_350 };
const PROPERTIES_RESPONSE  = [
  {
    squareFootage: 1_480,
    units: 1,
    // propertyTaxes is a record keyed by tax year: { "2023": { total: 4210 } }
    // If the field name or shape differs in the live API, adjust here + in client.ts
    propertyTaxes: { '2023': { total: 4_210 } },
  },
];

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('fetchPropertyData', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('happy path', () => {
    it('returns all five fields when all three calls succeed', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockOk(AVM_VALUE_RESPONSE))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockOk(PROPERTIES_RESPONSE));

      const result = await fetchPropertyData('123 Main St, Austin TX', 'rc_test_key');

      expect(result.purchasePrice).toBe(342_000);
      expect(result.grossRent).toBe(2_150);
      expect(result.sqft).toBe(1_480);
      expect(result.units).toBe(1);
      expect(result.annualTaxes).toBe(4_210);
    });

    it('makes all three RentCast calls in parallel', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValue(mockOk(AVM_VALUE_RESPONSE));

      // Override later calls to return appropriate shapes
      fetchSpy
        .mockResolvedValueOnce(mockOk(AVM_VALUE_RESPONSE))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockOk(PROPERTIES_RESPONSE));

      await fetchPropertyData('123 Main St', 'key');
      expect(fetchSpy).toHaveBeenCalledTimes(3);
    });
  });

  describe('partial success', () => {
    it('returns null sqft/units/annualTaxes when /properties returns 404', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockOk(AVM_VALUE_RESPONSE))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockFail(404));

      const result = await fetchPropertyData('123 Main St', 'key');

      expect(result.purchasePrice).toBe(342_000);
      expect(result.grossRent).toBe(2_150);
      expect(result.sqft).toBeNull();
      expect(result.units).toBeNull();
      expect(result.annualTaxes).toBeNull();
    });

    it('returns null for nullable fields when properties response is empty array', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockOk(AVM_VALUE_RESPONSE))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockOk([]));

      const result = await fetchPropertyData('123 Main St', 'key');

      expect(result.sqft).toBeNull();
      expect(result.units).toBeNull();
      expect(result.annualTaxes).toBeNull();
    });
  });

  describe('error handling', () => {
    it('throws RentCastError bad_key on 401', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFail(401));

      await expect(fetchPropertyData('123 Main St', 'bad')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'bad_key',
      );
    });

    it('throws RentCastError bad_key on 403', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFail(403));

      await expect(fetchPropertyData('123 Main St', 'bad')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'bad_key',
      );
    });

    it('throws RentCastError not_found on 404 from AVM call', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(mockFail(404))
        .mockResolvedValueOnce(mockOk(AVM_RENT_RESPONSE))
        .mockResolvedValueOnce(mockOk(PROPERTIES_RESPONSE));

      await expect(fetchPropertyData('unknown address', 'key')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'not_found',
      );
    });

    it('throws RentCastError rate_limit on 429', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockFail(429));

      await expect(fetchPropertyData('123 Main St', 'key')).rejects.toSatisfy(
        (e: unknown) => e instanceof RentCastError && e.code === 'rate_limit',
      );
    });
  });
});
```

---

- [ ] **Step 1.5 — Run tests, verify they fail**

```bash
source ~/.nvm/nvm.sh && nvm use 20 --silent
pnpm test packages/rentcast
```

Expected: **FAIL** — `Cannot find module '../src/client'`

---

- [ ] **Step 1.6 — Implement `src/client.ts`**

`packages/rentcast/src/client.ts`:
```ts
import { RentCastError, type PropertyData, type RentCastErrorCode } from './types';

const BASE = 'https://api.rentcast.io/v1';

function statusToCode(status: number): RentCastErrorCode {
  if (status === 401 || status === 403) return 'bad_key';
  if (status === 404) return 'not_found';
  if (status === 429) return 'rate_limit';
  return 'unknown';
}

async function rcGet(path: string, apiKey: string): Promise<unknown> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new RentCastError(statusToCode(res.status), `RentCast ${res.status}: ${path}`);
  }
  return res.json() as Promise<unknown>;
}

/**
 * Fetch property data from RentCast for the given address.
 *
 * Makes three API calls in parallel:
 *   /avm/value            → purchasePrice
 *   /avm/rent/long-term   → grossRent
 *   /properties           → sqft, units, annualTaxes (best-effort; null on 404)
 *
 * Throws RentCastError if either AVM call fails.
 * /properties failure is soft — nullable fields return null.
 *
 * FIELD NAME VERIFICATION: Before shipping, confirm these field names against
 * https://developers.rentcast.io/reference by running a live API call:
 *   curl -H "X-Api-Key: $KEY" 'https://api.rentcast.io/v1/properties?address=123+Main+St&limit=1'
 */
export async function fetchPropertyData(
  address: string,
  apiKey: string,
): Promise<PropertyData> {
  const encoded = encodeURIComponent(address);

  const [avm, rent, props] = await Promise.allSettled([
    rcGet(`/avm/value?address=${encoded}`, apiKey),
    rcGet(`/avm/rent/long-term?address=${encoded}`, apiKey),
    rcGet(`/properties?address=${encoded}&limit=1`, apiKey),
  ]);

  // AVM failures are fatal
  if (avm.status === 'rejected') throw avm.reason as RentCastError;
  if (rent.status === 'rejected') throw rent.reason as RentCastError;

  const avmData  = avm.value  as { price: number };
  const rentData = rent.value as { rent: number };

  let sqft: number | null        = null;
  let units: number | null       = null;
  let annualTaxes: number | null = null;

  if (props.status === 'fulfilled') {
    // /properties returns an array; we requested limit=1
    const list = props.value as Array<{
      squareFootage?: number;
      units?: number;
      // propertyTaxes is keyed by tax year: { "2023": { total: number } }
      propertyTaxes?: Record<string, { total: number }>;
    }>;
    const p = list[0];
    if (p) {
      sqft  = typeof p.squareFootage === 'number' ? p.squareFootage : null;
      units = typeof p.units         === 'number' ? p.units         : null;
      if (p.propertyTaxes) {
        const years     = Object.keys(p.propertyTaxes).sort().reverse();
        const latestYear = years[0];
        const latestTax  = latestYear ? p.propertyTaxes[latestYear] : undefined;
        annualTaxes      = latestTax?.total ?? null;
      }
    }
  }

  return { purchasePrice: avmData.price, grossRent: rentData.rent, sqft, units, annualTaxes };
}
```

---

- [ ] **Step 1.7 — Implement `src/index.ts`**

`packages/rentcast/src/index.ts`:
```ts
export { fetchPropertyData } from './client';
export { RentCastError } from './types';
export type { PropertyData, RentCastErrorCode } from './types';
```

---

- [ ] **Step 1.8 — Run tests, verify they pass**

```bash
pnpm test packages/rentcast
```

Expected: **PASS** — 9 tests.

---

- [ ] **Step 1.9 — Run gate**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

All must pass before committing.

---

- [ ] **Step 1.10 — Commit**

```bash
git add packages/rentcast/
git commit -m "RPE-43a: feat(rentcast): typed RentCast HTTP client with PropertyData + tests"
```

---

## Task 2 — `apps/api` `/property` route (RPE-43b)

**Branch:** `RPE-43b` (cut from `v1.3.0`)

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/api/vite.config.ts`
- Create: `apps/api/src/routes/property.ts`
- Modify: `apps/api/src/index.ts`
- Create: `apps/api/tests/property.test.ts`

---

- [ ] **Step 2.1 — Cut branch**

```bash
git checkout v1.3.0
git checkout -b RPE-43b
```

---

- [ ] **Step 2.2 — Add `@rpe/rentcast` dependency**

`apps/api/package.json` — add to `"dependencies"`:
```json
{
  "name": "@rpe/api",
  "version": "1.3.0",
  "private": true,
  "type": "module",
  "description": "Thin HTTP evaluation API wrapping @rpe/engine (RPE-40)",
  "scripts": {
    "build": "vite build",
    "start": "node dist/index.js",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@rpe/engine": "workspace:*",
    "@rpe/rentcast": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "typescript": "catalog:",
    "vite": "catalog:"
  }
}
```

Then install:
```bash
pnpm install
```

---

- [ ] **Step 2.3 — Add `@rpe/rentcast` to Vite noExternal**

`apps/api/vite.config.ts` — update `ssr.noExternal`:
```ts
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    ssr: 'src/index.ts',
    outDir: 'dist',
    target: 'node20',
    rollupOptions: {
      output: {
        format: 'esm',
        entryFileNames: 'index.js',
      },
    },
    sourcemap: true,
  },
  ssr: {
    noExternal: ['@rpe/engine', '@rpe/rentcast'],
  },
  resolve: {
    conditions: ['import', 'default'],
  },
});
```

---

- [ ] **Step 2.4 — Write the failing test**

`apps/api/tests/property.test.ts`:
```ts
/**
 * RPE-43b: POST /property integration tests
 *
 * Uses vi.mock to stub fetchPropertyData so no real HTTP calls are made.
 * Server lifecycle mirrors apps/api/tests/server.test.ts.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/index';

// Mock the rentcast client before importing createApp (hoisted by vitest)
vi.mock('@rpe/rentcast', () => ({
  fetchPropertyData: vi.fn(),
  RentCastError: class RentCastError extends Error {
    constructor(public code: string, message: string) { super(message); this.name = 'RentCastError'; }
  },
}));

import { fetchPropertyData, RentCastError } from '@rpe/rentcast';
const mockFetch = vi.mocked(fetchPropertyData);

const VALID_BODY = { address: '123 Main St, Austin TX 78701', apiKey: 'rc_test_key' };

const MOCK_DATA = {
  purchasePrice: 342_000,
  grossRent: 2_150,
  sqft: 1_480,
  units: 1,
  annualTaxes: 4_210,
};

describe('POST /property', () => {
  let server: Server;
  let base: string;

  beforeAll(
    () =>
      new Promise<void>((resolve, reject) => {
        server = createApp();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
          server.off('error', reject);
          const addr = server.address() as { port: number };
          base = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      }),
  );

  afterAll(
    () => new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    }),
  );

  beforeEach(() => { vi.resetAllMocks(); });

  // ── Happy path ──────────────────────────────────────────────────────────────

  it('returns 200 with PropertyData on success', async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);

    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    const body = await res.json() as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body['data']).toEqual(MOCK_DATA);
  });

  it('calls fetchPropertyData with the address and apiKey from the request', async () => {
    mockFetch.mockResolvedValue(MOCK_DATA);

    await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });

    expect(mockFetch).toHaveBeenCalledWith(VALID_BODY.address, VALID_BODY.apiKey);
  });

  // ── Validation ──────────────────────────────────────────────────────────────

  it('returns 400 when address is missing', async () => {
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ apiKey: 'key' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 400 when apiKey is missing', async () => {
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address: '123 Main St' }),
    });
    expect(res.status).toBe(400);
  });

  it('returns 405 for non-POST methods', async () => {
    const res = await fetch(`${base}/property`);
    expect(res.status).toBe(405);
  });

  // ── RentCast error mapping ──────────────────────────────────────────────────

  it('returns 401 when fetchPropertyData throws bad_key', async () => {
    mockFetch.mockRejectedValue(new RentCastError('bad_key', 'bad key'));
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 when fetchPropertyData throws not_found', async () => {
    mockFetch.mockRejectedValue(new RentCastError('not_found', 'not found'));
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(404);
  });

  it('returns 402 when fetchPropertyData throws rate_limit', async () => {
    mockFetch.mockRejectedValue(new RentCastError('rate_limit', 'rate limit'));
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(VALID_BODY),
    });
    expect(res.status).toBe(402);
  });

  // ── Security ────────────────────────────────────────────────────────────────

  it('apiKey value does not appear in response body on error', async () => {
    mockFetch.mockRejectedValue(new RentCastError('bad_key', 'bad key'));
    const res = await fetch(`${base}/property`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...VALID_BODY, apiKey: 'SECRET_KEY_VALUE' }),
    });
    const text = await res.text();
    expect(text).not.toContain('SECRET_KEY_VALUE');
  });
});
```

---

- [ ] **Step 2.5 — Run tests, verify they fail**

```bash
pnpm test apps/api
```

Expected: **FAIL** — `POST /property` routes return 404 (route not registered yet).

---

- [ ] **Step 2.6 — Create `apps/api/src/routes/property.ts`**

```ts
/**
 * POST /property — RentCast proxy route (RPE-43b)
 *
 * Receives { address: string, apiKey: string }, calls fetchPropertyData,
 * and returns { data: PropertyData }.
 *
 * The apiKey is forwarded to RentCast and never written to any log output.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { fetchPropertyData, RentCastError } from '@rpe/rentcast';

// Imported from the parent module — passed in to avoid circular imports.
type JsonFn = (res: ServerResponse, status: number, body: unknown) => void;
type ReadBodyFn = (req: IncomingMessage) => Promise<string>;

export async function handleProperty(
  req: IncomingMessage,
  res: ServerResponse,
  json: JsonFn,
  readBody: ReadBodyFn,
): Promise<void> {
  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed — use POST' });
    return;
  }

  let body: string;
  try {
    body = await readBody(req);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to read request body';
    const status = msg === 'Payload too large' ? 413 : 400;
    json(res, status, { error: msg });
    return;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    json(res, 400, { error: 'Invalid JSON' });
    return;
  }

  const obj = parsed as Record<string, unknown>;
  if (typeof obj['address'] !== 'string' || obj['address'].trim() === '') {
    json(res, 400, { error: 'address is required and must be a non-empty string' });
    return;
  }
  if (typeof obj['apiKey'] !== 'string' || obj['apiKey'].trim() === '') {
    json(res, 400, { error: 'apiKey is required and must be a non-empty string' });
    return;
  }

  const address = obj['address'].trim();
  const apiKey  = obj['apiKey'].trim();

  try {
    const data = await fetchPropertyData(address, apiKey);
    json(res, 200, { data });
  } catch (err) {
    if (err instanceof RentCastError) {
      // Map RentCast error codes to HTTP status codes.
      // Never include apiKey in error response or logs.
      const statusMap: Record<string, number> = {
        bad_key:    401,
        not_found:  404,
        rate_limit: 402,
        unknown:    502,
      };
      const status = statusMap[err.code] ?? 502;
      json(res, status, { error: err.message });
      return;
    }
    // Log address only — never apiKey
    console.error('Property lookup error for address:', address, err instanceof Error ? err.stack : String(err));
    json(res, 500, { error: 'Internal server error' });
  }
}
```

---

- [ ] **Step 2.7 — Wire `/property` route in `apps/api/src/index.ts`**

In `index.ts`, add the import at the top (after existing imports):
```ts
import { handleProperty } from './routes/property';
```

In the `createServer` callback, add the new route after the `/evaluate` route. Find this block:
```ts
    const asyncHandler =
      url === '/evaluate' || url === '/evaluate/'
        ? () => handleEvaluate(req, res)
        : () => {
            json(res, 404, { error: `Unknown endpoint: ${url}` });
            return Promise.resolve();
          };
```

Replace it with:
```ts
    const asyncHandler =
      url === '/evaluate' || url === '/evaluate/'
        ? () => handleEvaluate(req, res)
        : url === '/property' || url === '/property/'
        ? () => handleProperty(req, res, json, readBody)
        : () => {
            json(res, 404, { error: `Unknown endpoint: ${url}` });
            return Promise.resolve();
          };
```

Also update the startup log to document the new endpoint. Find:
```ts
    console.log('  POST /evaluate');
```
Add after it:
```ts
    console.log('  POST /property');
```

---

- [ ] **Step 2.8 — Run tests, verify they pass**

```bash
pnpm test apps/api
```

Expected: **PASS** — all existing tests plus new `/property` tests pass.

---

- [ ] **Step 2.9 — Run gate**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

---

- [ ] **Step 2.10 — Commit**

```bash
git add apps/api/package.json apps/api/vite.config.ts apps/api/src/routes/property.ts apps/api/src/index.ts apps/api/tests/property.test.ts
git commit -m "RPE-43b: feat(api): POST /property RentCast proxy endpoint + tests"
```

---

## Task 3 — Connector storage + Settings modal (RPE-43c)

**Branch:** `RPE-43c` (cut from `v1.3.0`)

**Files:**
- Create: `packages/ui/src/state/connectorStorage.ts`
- Create: `packages/ui/src/components/ConnectorSettingsModal.tsx`
- Modify: `packages/ui/src/Evaluator.tsx`
- Create: `packages/ui/tests/connectorStorage.test.ts`

---

- [ ] **Step 3.1 — Cut branch**

```bash
git checkout v1.3.0
git checkout -b RPE-43c
```

---

- [ ] **Step 3.2 — Write failing `connectorStorage` tests**

`packages/ui/tests/connectorStorage.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { getRentCastKey, setRentCastKey, clearRentCastKey } from '../src/state/connectorStorage';

// jsdom provides localStorage in the vitest environment
describe('connectorStorage', () => {
  beforeEach(() => localStorage.clear());

  it('getRentCastKey returns null when nothing is stored', () => {
    expect(getRentCastKey()).toBeNull();
  });

  it('setRentCastKey + getRentCastKey roundtrip', () => {
    setRentCastKey('rc_live_abc123');
    expect(getRentCastKey()).toBe('rc_live_abc123');
  });

  it('clearRentCastKey makes getRentCastKey return null', () => {
    setRentCastKey('rc_live_abc123');
    clearRentCastKey();
    expect(getRentCastKey()).toBeNull();
  });

  it('setRentCastKey overwrites an existing key', () => {
    setRentCastKey('old_key');
    setRentCastKey('new_key');
    expect(getRentCastKey()).toBe('new_key');
  });
});
```

---

- [ ] **Step 3.3 — Run storage tests, verify they fail**

```bash
pnpm test packages/ui -- --reporter=verbose 2>&1 | grep connectorStorage
```

Expected: **FAIL** — `Cannot find module '../src/state/connectorStorage'`

---

- [ ] **Step 3.4 — Implement `connectorStorage.ts`**

`packages/ui/src/state/connectorStorage.ts`:
```ts
/**
 * Persists the user's RentCast API key in localStorage.
 *
 * Key: 'rpe:connectors:rentcast'
 *
 * The key belongs to the user — it is never sent anywhere except the
 * POST /property proxy call where the user explicitly triggers autofill.
 */

const STORAGE_KEY = 'rpe:connectors:rentcast';

export function getRentCastKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private browsing, SSR, etc.)
    return null;
  }
}

export function setRentCastKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Silently ignore — storage quota exceeded or unavailable
  }
}

export function clearRentCastKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently ignore
  }
}
```

---

- [ ] **Step 3.5 — Run storage tests, verify they pass**

```bash
pnpm test packages/ui -- --reporter=verbose 2>&1 | grep -A5 connectorStorage
```

Expected: **PASS** — 4 tests.

---

- [ ] **Step 3.6 — Create `ConnectorSettingsModal.tsx`**

`packages/ui/src/components/ConnectorSettingsModal.tsx`:
```tsx
import { useState } from 'react';
import { getRentCastKey, setRentCastKey, clearRentCastKey } from '../state/connectorStorage';

interface ConnectorSettingsModalProps {
  onClose: () => void;
}

/**
 * Settings modal — Data Connectors section.
 *
 * Opened by the ⚙ Settings button in the Evaluator header.
 * Manages the RentCast API key (read/write/clear to localStorage).
 * Designed to grow: additional settings (dark mode, etc.) slot in below.
 */
export function ConnectorSettingsModal({ onClose }: ConnectorSettingsModalProps) {
  const [storedKey, setStoredKey] = useState<string | null>(() => getRentCastKey());
  const [inputValue, setInputValue]   = useState('');
  const [isEditing, setIsEditing]     = useState(storedKey === null);

  const handleSave = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) return;
    setRentCastKey(trimmed);
    setStoredKey(trimmed);
    setInputValue('');
    setIsEditing(false);
  };

  const handleRemove = () => {
    clearRentCastKey();
    setStoredKey(null);
    setInputValue('');
    setIsEditing(true);
  };

  const handleChange = () => {
    setInputValue('');
    setIsEditing(true);
  };

  // Mask key: show last 4 chars, mask the rest
  const maskedKey = storedKey
    ? `rc_live_${'•'.repeat(Math.max(0, storedKey.length - 12))}${storedKey.slice(-4)}`
    : null;

  return (
    /* Backdrop */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-base shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-sm font-semibold text-hi">Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-lo hover:text-hi transition-colors"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Section label */}
          <p className="text-xs uppercase tracking-widest text-lo">Data Connectors</p>

          {/* RentCast row */}
          <div className="rounded border border-border bg-raised p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-hi">RentCast</span>
                {storedKey && (
                  <span className="rounded-full bg-green-900/50 px-2 py-0.5 text-xs text-green-400">
                    ● Connected
                  </span>
                )}
              </div>
              {storedKey && !isEditing && (
                <button
                  type="button"
                  onClick={handleRemove}
                  className="text-xs text-red-400 hover:text-red-300 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
                  placeholder="rc_live_…"
                  className="
                    flex-1 rounded border border-border bg-base px-3 py-1.5
                    text-xs text-hi placeholder:text-lo
                    focus:border-accent focus:outline-none
                  "
                  autoFocus
                  aria-label="RentCast API key"
                />
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!inputValue.trim()}
                  className="
                    rounded border border-accent px-3 py-1.5 text-xs text-accent
                    hover:bg-accent hover:text-base transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed
                  "
                >
                  Save
                </button>
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <code className="flex-1 rounded border border-border bg-base px-3 py-1.5 text-xs text-lo font-mono">
                  {maskedKey}
                </code>
                <button
                  type="button"
                  onClick={handleChange}
                  className="
                    rounded border border-border px-3 py-1.5 text-xs text-mid
                    hover:border-accent hover:text-accent transition-colors
                  "
                >
                  Change
                </button>
              </div>
            )}

            <p className="text-xs text-lo">
              Free tier: 50 req/mo ·{' '}
              <a
                href="https://app.rentcast.io"
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:underline"
              >
                Get a key at app.rentcast.io ↗
              </a>
            </p>
          </div>

          {/* Future connectors placeholder */}
          <div className="rounded border border-dashed border-border px-4 py-3">
            <p className="text-xs text-lo">+ Add another connector <span className="opacity-50">(coming soon)</span></p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="
              rounded border border-border px-4 py-1.5 text-xs text-mid
              hover:border-accent hover:text-accent transition-colors
            "
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

- [ ] **Step 3.7 — Add Settings button + modal state to `Evaluator.tsx`**

In `packages/ui/src/Evaluator.tsx`:

**Add import** (after existing imports, before the first `const`):
```ts
import { ConnectorSettingsModal } from './components/ConnectorSettingsModal';
import { getRentCastKey } from './state/connectorStorage';
```

**Add state** inside the `Evaluator` component body (after the existing `useState` calls):
```ts
const [showSettings, setShowSettings]   = useState(false);
const [apiKey, setApiKey]               = useState<string | null>(() => getRentCastKey());

// Refresh apiKey after the modal closes (user may have saved or removed)
const handleCloseSettings = useCallback(() => {
  setShowSettings(false);
  setApiKey(getRentCastKey());
}, []);
```

**Add Settings button** to the header `<div className="no-print flex items-center gap-2">`. Add it as the first child (before `UiModeToggle`):
```tsx
<button
  type="button"
  onClick={() => setShowSettings(true)}
  className="
    rounded border border-border px-3 py-1.5
    text-xs text-mid uppercase tracking-widest
    hover:border-accent hover:text-accent
    transition-colors
  "
  aria-label="Open settings"
  title="Settings"
>
  ⚙
</button>
```

**Add modal** at the bottom of the Evaluator JSX return, just before the closing `</div>`:
```tsx
{showSettings && <ConnectorSettingsModal onClose={handleCloseSettings} />}
```

**Pass `apiKey` down to `DealInputsForm`** (will be used in Task 4). Update the `DealInputsForm` usage:
```tsx
<DealInputsForm
  state={activeInputs}
  dispatch={dispatchToActive}
  proFormaMode={proFormaMode}
  uiMode={uiMode}
  apiKey={apiKey}
/>
```

> Note: `DealInputsForm` doesn't accept `apiKey` yet — that prop will be added in Task 4. TypeScript will error here until Task 4 is complete. To keep the gate green for this task's commit, add `apiKey` to `DealInputsFormProps` as `apiKey?: string | null` in a temporary edit to `DealInputsForm.tsx`, with no usage — Task 4 will complete the implementation. See Step 3.8.

---

- [ ] **Step 3.8 — Add `apiKey` prop stub to `DealInputsForm.tsx`**

In `packages/ui/src/components/inputs/DealInputsForm.tsx`, update `DealInputsFormProps`:
```ts
export interface DealInputsFormProps {
  state: DealInputs;
  dispatch: Dispatch<DealAction>;
  proFormaMode?: boolean;
  uiMode?: UiMode;
  /** RentCast API key from connectorStorage. Passed to AutofillBar (wired in RPE-43d). */
  apiKey?: string | null;
}
```

And update the destructure:
```ts
export function DealInputsForm({
  state,
  dispatch,
  proFormaMode = false,
  uiMode = 'complex',
  apiKey: _apiKey,  // unused until RPE-43d
}: DealInputsFormProps) {
```

---

- [ ] **Step 3.9 — Run gate**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

All must pass.

---

- [ ] **Step 3.10 — Commit**

```bash
git add packages/ui/src/state/connectorStorage.ts \
        packages/ui/src/components/ConnectorSettingsModal.tsx \
        packages/ui/src/components/inputs/DealInputsForm.tsx \
        packages/ui/src/Evaluator.tsx \
        packages/ui/tests/connectorStorage.test.ts
git commit -m "RPE-43c: feat(ui): connector storage, Settings modal, apiKey state in Evaluator"
```

---

## Task 4 — AutofillBar + preview popover + useAutofill hook (RPE-43d)

**Branch:** `RPE-43d` (cut from `v1.3.0`, but cherry-pick RPE-43c commits first so DealInputsFormProps has apiKey)

> **Prerequisite:** RPE-43c must be cherry-picked onto `v1.3.0` before cutting this branch, otherwise `DealInputsFormProps.apiKey` won't exist.

```bash
git checkout v1.3.0
# cherry-pick RPE-43c commit(s) here (see git log for SHA)
git checkout -b RPE-43d
```

**Files:**
- Create: `packages/ui/src/hooks/useAutofill.ts`
- Create: `packages/ui/src/components/AutofillBar.tsx`
- Create: `packages/ui/src/components/AutofillPreviewPopover.tsx`
- Modify: `packages/ui/src/components/inputs/DealInputsForm.tsx`
- Create: `packages/ui/tests/useAutofill.test.ts`

---

- [ ] **Step 4.1 — Write failing `useAutofill` tests**

`packages/ui/tests/useAutofill.test.ts`:
```ts
/**
 * RPE-43d: useAutofill hook tests
 *
 * Mocks fetch (the POST /property call) at globalThis level.
 * Uses @testing-library/react's renderHook.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAutofill } from '../src/hooks/useAutofill';

// ─── Mock fetch ──────────────────────────────────────────────────────────────

const MOCK_DATA = {
  purchasePrice: 342_000,
  grossRent: 2_150,
  sqft: 1_480,
  units: 1,
  annualTaxes: 4_210,
};

function mockFetchOk(data: unknown) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
  } as unknown as Response);
}

function mockFetchError(status: number, error: string) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error }),
  } as unknown as Response);
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useAutofill', () => {
  // Minimal dispatch spy
  const dispatch = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    dispatch.mockClear();
  });

  it('starts in idle state', () => {
    const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
    expect(result.current.status).toBe('idle');
    expect(result.current.previewData).toBeNull();
    expect(result.current.errorMessage).toBeNull();
  });

  it('transitions idle → loading → preview on successful trigger', async () => {
    mockFetchOk(MOCK_DATA);
    const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));

    await act(async () => { result.current.trigger('123 Main St'); });

    expect(result.current.status).toBe('preview');
    expect(result.current.previewData).toEqual(MOCK_DATA);
  });

  it('transitions to error on 401 (bad_key)', async () => {
    mockFetchError(401, 'Invalid API key');
    const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));

    await act(async () => { result.current.trigger('123 Main St'); });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(/api key/i);
  });

  it('transitions to error on 404 (not_found)', async () => {
    mockFetchError(404, 'Property not found');
    const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));

    await act(async () => { result.current.trigger('unknown address'); });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(/not found/i);
  });

  it('transitions to error on 402 (rate_limit)', async () => {
    mockFetchError(402, 'Rate limit exceeded');
    const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));

    await act(async () => { result.current.trigger('123 Main St'); });

    expect(result.current.status).toBe('error');
    expect(result.current.errorMessage).toMatch(/rate limit/i);
  });

  describe('apply()', () => {
    it('dispatches SET_NUMBER for purchasePrice', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NUMBER', field: 'purchasePrice', value: 342_000 });
    });

    it('dispatches SET_NUMBER for grossRent', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NUMBER', field: 'grossRent', value: 2_150 });
    });

    it('dispatches SET_EXPENSE_FIXED for taxes when annualTaxes is non-null', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).toHaveBeenCalledWith({
        type: 'SET_EXPENSE_FIXED',
        field: 'taxes',
        amount: 4_210,
        period: 'annual',
      });
    });

    it('dispatches SET_NUMBER for sqft when non-null', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).toHaveBeenCalledWith({ type: 'SET_NUMBER', field: 'sqft', value: 1_480 });
    });

    it('skips sqft dispatch when sqft is null', async () => {
      mockFetchOk({ ...MOCK_DATA, sqft: null });
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ field: 'sqft' }),
      );
    });

    it('skips taxes dispatch when annualTaxes is null', async () => {
      mockFetchOk({ ...MOCK_DATA, annualTaxes: null });
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ field: 'taxes' }),
      );
    });

    it('returns to idle after apply()', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { result.current.trigger('123 Main St'); });
      act(() => { result.current.apply(); });
      expect(result.current.status).toBe('idle');
    });
  });

  describe('dismiss()', () => {
    it('returns to idle from preview state', async () => {
      mockFetchOk(MOCK_DATA);
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { result.current.trigger('123 Main St'); });
      act(() => { result.current.dismiss(); });
      expect(result.current.status).toBe('idle');
      expect(result.current.previewData).toBeNull();
    });

    it('returns to idle from error state', async () => {
      mockFetchError(404, 'not found');
      const { result } = renderHook(() => useAutofill({ dispatch, apiKey: 'key', apiUrl: 'http://localhost:3001' }));
      await act(async () => { result.current.trigger('x'); });
      act(() => { result.current.dismiss(); });
      expect(result.current.status).toBe('idle');
    });
  });
});
```

---

- [ ] **Step 4.2 — Check `@testing-library/react` is available**

```bash
grep "@testing-library/react" packages/ui/package.json
```

If not present, add it:
```bash
pnpm add -D @testing-library/react --filter @rpe/ui
```

---

- [ ] **Step 4.3 — Run tests, verify they fail**

```bash
pnpm test packages/ui -- --reporter=verbose 2>&1 | grep useAutofill
```

Expected: **FAIL** — `Cannot find module '../src/hooks/useAutofill'`

---

- [ ] **Step 4.4 — Implement `useAutofill.ts`**

`packages/ui/src/hooks/useAutofill.ts`:
```ts
import { useState, useCallback } from 'react';
import type { Dispatch } from 'react';
import type { DealAction } from '../state/dealReducer';

interface PropertyData {
  purchasePrice: number;
  grossRent: number;
  sqft: number | null;
  units: number | null;
  annualTaxes: number | null;
}

type AutofillStatus = 'idle' | 'loading' | 'preview' | 'error';

interface UseAutofillOptions {
  dispatch: Dispatch<DealAction>;
  apiKey: string | null;
  /** Base URL of apps/api, e.g. 'http://localhost:3001'. Defaults to VITE_API_URL or http://localhost:3001 */
  apiUrl?: string;
}

export interface UseAutofillReturn {
  status: AutofillStatus;
  previewData: PropertyData | null;
  errorMessage: string | null;
  trigger: (address: string) => void;
  apply: () => void;
  dismiss: () => void;
}

function httpStatusToMessage(status: number): string {
  if (status === 401) return 'Invalid API key — update it in ⚙ Settings.';
  if (status === 404) return 'Property not found. Check the address and try again.';
  if (status === 402) return 'Rate limit reached (50 req/mo on the free tier).';
  return 'Lookup failed. Please try again.';
}

export function useAutofill({
  dispatch,
  apiKey,
  apiUrl,
}: UseAutofillOptions): UseAutofillReturn {
  const [status, setStatus]           = useState<AutofillStatus>('idle');
  const [previewData, setPreviewData] = useState<PropertyData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedApiUrl =
    apiUrl ??
    (typeof import.meta !== 'undefined' && import.meta.env?.['VITE_API_URL']) ??
    'http://localhost:3001';

  const trigger = useCallback(
    async (address: string) => {
      if (!apiKey || !address.trim()) return;

      setStatus('loading');
      setErrorMessage(null);

      try {
        const res = await fetch(`${resolvedApiUrl}/property`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: address.trim(), apiKey }),
        });

        if (!res.ok) {
          setStatus('error');
          setErrorMessage(httpStatusToMessage(res.status));
          return;
        }

        const body = (await res.json()) as { data: PropertyData };
        setPreviewData(body.data);
        setStatus('preview');
      } catch {
        setStatus('error');
        setErrorMessage('Network error — check that apps/api is running.');
      }
    },
    [apiKey, resolvedApiUrl],
  );

  const apply = useCallback(() => {
    if (!previewData) return;

    dispatch({ type: 'SET_NUMBER', field: 'purchasePrice', value: previewData.purchasePrice });
    dispatch({ type: 'SET_NUMBER', field: 'grossRent', value: previewData.grossRent });

    if (previewData.sqft !== null) {
      dispatch({ type: 'SET_NUMBER', field: 'sqft', value: previewData.sqft });
    }
    if (previewData.units !== null) {
      dispatch({ type: 'SET_NUMBER', field: 'units', value: previewData.units });
    }
    if (previewData.annualTaxes !== null) {
      dispatch({ type: 'SET_EXPENSE_FIXED', field: 'taxes', amount: previewData.annualTaxes, period: 'annual' });
    }

    setPreviewData(null);
    setStatus('idle');
  }, [dispatch, previewData]);

  const dismiss = useCallback(() => {
    setPreviewData(null);
    setErrorMessage(null);
    setStatus('idle');
  }, []);

  return { status, previewData, errorMessage, trigger, apply, dismiss };
}
```

---

- [ ] **Step 4.5 — Run `useAutofill` tests, verify they pass**

```bash
pnpm test packages/ui -- --reporter=verbose 2>&1 | grep -A20 "useAutofill"
```

Expected: **PASS** — all useAutofill tests green.

---

- [ ] **Step 4.6 — Create `AutofillPreviewPopover.tsx`**

`packages/ui/src/components/AutofillPreviewPopover.tsx`:
```tsx
import { useEffect } from 'react';
import { fmtCurrency } from '../utils/format';

interface PropertyData {
  purchasePrice: number;
  grossRent: number;
  sqft: number | null;
  units: number | null;
  annualTaxes: number | null;
}

interface AutofillPreviewPopoverProps {
  data: PropertyData;
  onApply: () => void;
  onDismiss: () => void;
}

interface DiffRow {
  label: string;
  value: string;
}

/**
 * Shows a diff of fields that will change when autofill is applied.
 * Null fields are omitted. Dismiss on Escape or Cancel; apply on Apply.
 */
export function AutofillPreviewPopover({ data, onApply, onDismiss }: AutofillPreviewPopoverProps) {
  // Dismiss on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onDismiss]);

  const rows: DiffRow[] = [
    { label: 'Purchase Price',    value: fmtCurrency(data.purchasePrice) },
    { label: 'Gross Rent (mo)',   value: fmtCurrency(data.grossRent) },
    ...(data.annualTaxes !== null
      ? [{ label: 'Property Taxes (yr)', value: fmtCurrency(data.annualTaxes) }]
      : []),
    ...(data.sqft !== null
      ? [{ label: 'Square Footage', value: `${data.sqft.toLocaleString()} sqft` }]
      : []),
    ...(data.units !== null
      ? [{ label: 'Units', value: String(data.units) }]
      : []),
  ];

  return (
    <div
      className="rounded border border-accent/50 bg-raised shadow-lg overflow-hidden"
      role="dialog"
      aria-label="Autofill preview"
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-accent/10 px-4 py-2 border-b border-border">
        <span className="text-xs font-medium text-accent">⚡ RentCast found this property</span>
      </div>

      {/* Diff rows */}
      <div>
        {rows.map((row, i) => (
          <div
            key={row.label}
            className={`grid grid-cols-[1fr_auto_auto] gap-3 items-center px-4 py-2 text-xs ${
              i % 2 === 1 ? 'bg-base' : ''
            }`}
          >
            <span className="text-mid">{row.label}</span>
            <span className="text-lo line-through">—</span>
            <span className="text-green-400 font-medium">{row.value}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 border-t border-border px-4 py-2">
        <button
          type="button"
          onClick={onDismiss}
          className="
            rounded border border-border px-3 py-1 text-xs text-mid
            hover:border-accent hover:text-accent transition-colors
          "
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onApply}
          className="
            rounded bg-accent px-3 py-1 text-xs font-medium text-base
            hover:opacity-90 transition-opacity
          "
        >
          Apply →
        </button>
      </div>
    </div>
  );
}
```

> `fmtCurrency` is exported from `packages/ui/src/utils/format.ts` — confirmed present in the codebase.

---

---

- [ ] **Step 4.8 — Create `AutofillBar.tsx`**

`packages/ui/src/components/AutofillBar.tsx`:
```tsx
import { useState } from 'react';
import { useAutofill } from '../hooks/useAutofill';
import { AutofillPreviewPopover } from './AutofillPreviewPopover';
import type { Dispatch } from 'react';
import type { DealAction } from '../state/dealReducer';

interface AutofillBarProps {
  dispatch: Dispatch<DealAction>;
  apiKey: string | null;
}

/**
 * Persistent address input bar rendered above the Acquisition section.
 * Wraps useAutofill — handles all four states: idle, loading, error, preview.
 *
 * When apiKey is null (user hasn't connected RentCast), shows a prompt
 * directing them to ⚙ Settings instead of the input.
 */
export function AutofillBar({ dispatch, apiKey }: AutofillBarProps) {
  const [address, setAddress] = useState('');
  const { status, previewData, errorMessage, trigger, apply, dismiss } = useAutofill({ dispatch, apiKey });

  if (!apiKey) {
    return (
      <div className="px-5 py-3 border-b border-border bg-raised/50">
        <p className="text-xs text-lo italic">
          Connect RentCast in{' '}
          <span className="text-mid not-italic">⚙ Settings</span>{' '}
          to enable address autofill.
        </p>
      </div>
    );
  }

  const handleTrigger = () => {
    if (address.trim()) trigger(address);
  };

  return (
    <div className="px-5 py-3 border-b border-border space-y-2">
      {/* Label */}
      <p className="text-xs uppercase tracking-widest text-lo">⚡ Autofill from address</p>

      {/* Input row */}
      <div className="flex gap-2">
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleTrigger(); }}
          placeholder="123 Main St, Austin TX 78701"
          disabled={status === 'loading' || status === 'preview'}
          className="
            flex-1 rounded border border-border bg-base px-3 py-1.5
            text-xs text-hi placeholder:text-lo
            focus:border-accent focus:outline-none
            disabled:opacity-50
          "
          aria-label="Property address for autofill"
        />
        <button
          type="button"
          onClick={handleTrigger}
          disabled={status === 'loading' || status === 'preview' || !address.trim()}
          className="
            rounded border border-border px-3 py-1.5 text-xs text-mid uppercase tracking-widest
            hover:border-accent hover:text-accent transition-colors
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          aria-label={status === 'loading' ? 'Looking up property…' : 'Autofill from address'}
        >
          {status === 'loading' ? '…' : 'Fill'}
        </button>
      </div>

      {/* Error message */}
      {status === 'error' && errorMessage && (
        <p className="text-xs text-red-400" role="alert">{errorMessage}</p>
      )}

      {/* Preview popover */}
      {status === 'preview' && previewData && (
        <AutofillPreviewPopover
          data={previewData}
          onApply={() => { apply(); setAddress(''); }}
          onDismiss={dismiss}
        />
      )}
    </div>
  );
}
```

---

- [ ] **Step 4.9 — Wire `AutofillBar` into `DealInputsForm.tsx`**

In `packages/ui/src/components/inputs/DealInputsForm.tsx`:

**Add import** at the top:
```ts
import { AutofillBar } from '../AutofillBar';
```

**Update props destructure** — replace the stub `apiKey: _apiKey` with:
```ts
export function DealInputsForm({
  state,
  dispatch,
  proFormaMode = false,
  uiMode = 'complex',
  apiKey = null,
}: DealInputsFormProps) {
```

**Add `AutofillBar`** as the first child of the returned `<div>`, before the Acquisition `InputSection`:
```tsx
return (
  <div>
    {/* ── Autofill bar (always shown, adapts when apiKey is null) ──────── */}
    <AutofillBar dispatch={dispatch} apiKey={apiKey} />

    {/* ── Acquisition ──────────────────────────────────────────────────── */}
    <InputSection title="Acquisition">
      {/* ... existing content unchanged ... */}
    </InputSection>
    {/* ... rest of form unchanged ... */}
  </div>
);
```

---

- [ ] **Step 4.10 — Run full gate**

```bash
pnpm lint && pnpm typecheck && pnpm test
```

All must pass. Test count should increase by the new useAutofill tests (~15).

---

- [ ] **Step 4.11 — Commit**

```bash
git add packages/ui/src/hooks/useAutofill.ts \
        packages/ui/src/components/AutofillBar.tsx \
        packages/ui/src/components/AutofillPreviewPopover.tsx \
        packages/ui/src/components/inputs/DealInputsForm.tsx \
        packages/ui/tests/useAutofill.test.ts
git commit -m "RPE-43d: feat(ui): AutofillBar, AutofillPreviewPopover, useAutofill hook"
```

---

## Cherry-pick order onto `v1.3.0`

Each task branch goes through the standard workflow (PR → Copilot review → cherry-pick) independently. The ordering constraint is:

1. **RPE-43a** — no dependencies, cherry-pick first
2. **RPE-43b** — depends on `@rpe/rentcast` being on `v1.3.0` (cherry-pick RPE-43a first)
3. **RPE-43c** — no dependency on RPE-43a/b (pure UI)
4. **RPE-43d** — depends on RPE-43c's `DealInputsFormProps.apiKey` stub being on `v1.3.0`

RPE-43a and RPE-43c can be opened as PRs in parallel (max 2 open at a time — matches the repo limit).
