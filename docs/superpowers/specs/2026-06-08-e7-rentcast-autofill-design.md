# E7 — RentCast Autofill Design

**Date:** 2026-06-08  
**Jira:** RPE-43  
**Status:** Approved — ready for implementation planning

---

## Overview

E7 adds address-based autofill to the deal evaluator. Users who have a RentCast API key can type a property address into a persistent bar at the top of the inputs form. The app calls RentCast, shows a preview diff of what will change, and populates the form on confirmation. The RentCast key is user-supplied and stored in `localStorage` — no server-side secret required.

---

## Decisions Made

| # | Decision |
|---|---|
| Data source | RentCast.io |
| Key ownership | User-supplied (free tier: 50 req/mo at app.rentcast.io) |
| Fields autofilled | 5 fields: `purchasePrice`, `grossRent`, `expenses.taxes`, `sqft`, `units` |
| Backend | `apps/api` expanded with `POST /property` proxy endpoint |
| Client package | New `packages/rentcast` workspace package (pure TS, browser + Node compatible) |
| Autofill trigger | Persistent bar at top of inputs form (above Acquisition section) |
| Confirmation UX | Preview popover with diff (old → new) and Apply / Cancel |
| Connector settings | ⚙ Settings button in Evaluator header → `ConnectorSettingsModal` |
| V1 scope | Address string input only; listing-URL parsing (Zillow/Redfin) deferred |

---

## Architecture

### New package: `packages/rentcast`

Pure TypeScript RentCast HTTP client. No React, no Node-specific APIs — only `fetch`. Callable from both `apps/api` (server) and browser if needed later.

```
packages/rentcast/
  package.json          name: @rpe/rentcast
  tsconfig.json
  src/
    types.ts            PropertyData, RentCastError, RentCastErrorCode
    client.ts           fetchPropertyData(address, apiKey) → Promise<PropertyData>
    index.ts            re-exports
  tests/
    client.test.ts
```

**`PropertyData`:**
```ts
interface PropertyData {
  purchasePrice: number;       // AVM mid-point from /avm/value
  grossRent: number;           // monthly estimate from /avm/rent/long-term
  sqft: number | null;         // from /properties — null if not returned
  units: number | null;        // from /properties — null if not returned
  annualTaxes: number | null;  // from /properties — null if not returned
}
```

**`RentCastError`:**
```ts
type RentCastErrorCode = 'not_found' | 'bad_key' | 'rate_limit' | 'unknown';

class RentCastError extends Error {
  constructor(public readonly code: RentCastErrorCode, message: string) { … }
}
```

**`fetchPropertyData`** makes three RentCast calls in parallel via `Promise.all`:

| RentCast endpoint | Used for |
|---|---|
| `GET /avm/value?address=…` | `purchasePrice` |
| `GET /avm/rent/long-term?address=…` | `grossRent` |
| `GET /properties?address=…&limit=1` | `sqft`, `units`, `annualTaxes` |

Partial success is allowed: if `/properties` returns 404, `sqft`/`units`/`annualTaxes` are `null` and no error is thrown. Only AVM failures (purchasePrice / grossRent) throw `RentCastError`.

---

### `apps/api` — new `/property` route

**Endpoint:** `POST /property`

Request:
```json
{ "address": "123 Main St, Austin TX 78701", "apiKey": "rc_live_…" }
```

Response 200:
```json
{ "data": { "purchasePrice": 340000, "grossRent": 2100, "sqft": 1450, "units": 1, "annualTaxes": 4080 } }
```

Error codes:

| HTTP | Condition |
|---|---|
| 400 | Missing `address` or `apiKey` |
| 401 | RentCast `bad_key` |
| 402 | RentCast `rate_limit` |
| 404 | RentCast `not_found` |
| 500 | Unexpected error |

**Security:** `apiKey` is validated for presence and forwarded to RentCast. It is never written to `console.log`, error output, or any log. Error logs include only `address` and the `RentCastErrorCode`.

**Implementation:** follows the existing `handleEvaluate` pattern in `apps/api/src/index.ts` — `readBody` → validate → call `fetchPropertyData` → `json(res, 200, { data })`. Extracted to `apps/api/src/routes/property.ts`, imported in `index.ts`.

CORS: existing `CORS_HEADERS` (`Access-Control-Allow-Origin: *`) already covers this endpoint — no changes needed.

---

### `packages/ui` — new state + components + hook

#### `src/state/connectorStorage.ts`

```ts
const KEY = 'rpe:connectors:rentcast';
export function getRentCastKey(): string | null
export function setRentCastKey(key: string): void
export function clearRentCastKey(): void
```

localStorage only. No React context — the modal reads/writes directly, the hook reads on mount.

#### `hooks/useAutofill.ts`

State machine:

```
idle → loading → preview → idle   (apply() or dismiss())
                          → error  (RentCastError thrown)
error → idle              (dismiss())
```

Interface:
```ts
interface UseAutofillReturn {
  status: 'idle' | 'loading' | 'preview' | 'error';
  previewData: PropertyData | null;
  errorMessage: string | null;
  trigger: (address: string) => void;
  apply: () => void;
  dismiss: () => void;
}
```

`apply()` dispatches the following actions to `dealReducer`:
- `SET_NUMBER` for `purchasePrice`, `grossRent`, `sqft` (if non-null), `units` (if non-null)
- `SET_EXPENSE_FIXED` for `taxes` with `{ amount: annualTaxes, period: 'annual' }` (if non-null)

Null fields are skipped — no reducer action dispatched.

#### `components/AutofillBar.tsx`

Persistent row rendered **above the Acquisition `InputSection`** in `DealInputsForm`. Shown in both simple and complex mode (autofill is useful regardless of UiMode).

States:
- **idle** — address input + "Fill" button
- **loading** — input disabled, spinner in place of button
- **error** — inline error message below input (e.g. "Property not found. Check the address." / "Invalid API key — update it in Settings." / "Rate limit reached (50 req/mo).")
- **preview** — `AutofillPreviewPopover` overlays the bar

Props: `{ dispatch, apiKey: string | null }`. If `apiKey` is null, the bar shows a "Connect RentCast in ⚙ Settings to enable autofill" hint instead of the input.

#### `components/AutofillPreviewPopover.tsx`

Shown when `status === 'preview'`. Displays a diff table:

```
Field              Before    After
──────────────────────────────────
Purchase Price     $0        $342,000
Gross Rent (mo)   $0        $2,150
Property Taxes    $0/yr     $4,210/yr
Square Footage    —         1,480 sqft
Units             —         1
```

Null fields (where RentCast returned nothing) are omitted entirely. Apply / Cancel buttons. Dismiss on Escape or clicking outside.

#### `components/ConnectorSettingsModal.tsx`

Triggered by a new ⚙ Settings button in the Evaluator header (right of `ModeToggle`).

Two visual states for the RentCast row:

**Not connected:**
- Label + text input for key + "Save" button
- Link: "Get a free key at app.rentcast.io ↗"

**Connected:**
- Masked display: `rc_live_••••••••••••3f2a` (last 4 chars visible)
- "Change" button (clears mask, shows input)
- "Remove" link (calls `clearRentCastKey()`)
- "Free tier: 50 req/mo" note + link to app.rentcast.io

A placeholder row ("+ Add another connector — coming soon") signals extensibility without building it.

---

## Data Flow (end-to-end)

```
User types address → AutofillBar input
  → "Fill" clicked → useAutofill.trigger(address)
    → status: loading
    → POST apps/api/property { address, apiKey }
      → apps/api: validate → packages/rentcast.fetchPropertyData(address, apiKey)
        → RentCast: GET /avm/value, /avm/rent/long-term, /properties (parallel)
        ← PropertyData
      ← 200 { data: PropertyData }
    → status: preview, previewData set
    → AutofillPreviewPopover shown
  → User clicks Apply → useAutofill.apply()
    → dealReducer: SET_NUMBER + SET_EXPENSE_FIXED actions dispatched
    → status: idle
    → form fields updated, results recalculate
```

---

## Testing

### `packages/rentcast/tests/client.test.ts`
- Happy path: all 3 calls succeed → correct `PropertyData`
- Partial success: `/properties` 404 → `sqft/units/annualTaxes` null, no throw
- 401 from any call → `RentCastError { code: 'bad_key' }`
- 404 from AVM calls → `RentCastError { code: 'not_found' }`
- 429 → `RentCastError { code: 'rate_limit' }`
- All three calls are made in parallel (verified via fetch mock call order)

### `apps/api` `/property` route tests
- Missing `address` → 400
- Missing `apiKey` → 400
- `bad_key` → 401
- `not_found` → 404
- `rate_limit` → 402
- Happy path → 200 with correct `data` shape
- `apiKey` absent from all console output

### `packages/ui` unit tests
- `connectorStorage`: get/set/clear roundtrip; returns null when unset
- `useAutofill`: idle → loading → preview transitions; apply() dispatches correct actions; dismiss() returns to idle; `bad_key` → error state with correct message; null fields skipped by apply()
- `AutofillBar`: shows hint when `apiKey` is null; shows spinner during loading; shows error message on error state
- `AutofillPreviewPopover`: renders only non-null fields; Apply calls `apply()`; Cancel calls `dismiss()`; Escape key calls `dismiss()`

No E2E tests for autofill — live RentCast API calls make E2E flaky. Unit-level fetch mocks provide full coverage.

---

## Scope Boundaries

| In scope (E7) | Out of scope (deferred) |
|---|---|
| RentCast address lookup | Listing-URL parsing (Zillow, Redfin, Realtor.com) |
| Core 4 fields + units | HOA data (unreliable from RentCast) |
| User-supplied key | Server-side shared key / tiered access |
| ConnectorSettingsModal | Other settings (dark mode → RPE-69) |
| `packages/rentcast` client | Additional data providers |

---

## Jira Stories (to be broken out from RPE-43)

| Story | Title |
|---|---|
| RPE-43a | `packages/rentcast` — typed RentCast client + tests |
| RPE-43b | `apps/api` — `/property` proxy endpoint + tests |
| RPE-43c | `packages/ui` — `connectorStorage` + `ConnectorSettingsModal` |
| RPE-43d | `packages/ui` — `AutofillBar` + `AutofillPreviewPopover` + `useAutofill` |
