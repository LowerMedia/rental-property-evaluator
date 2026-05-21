# Feature: Address / listing-URL autofill (Epic E7 — RPE-43)

Added 2026-05-21, after E0/E1/E2 shipped (engine + SPA done through RPE-23).

## Goal
Paste a street address or a listing URL (Zillow/Redfin/Realtor/Trulia/Homes.com) → auto-populate as many `DealInputs` as possible, each with **source + confidence**, fully overridable in the existing controlled-input form.

## Decisions (locked with Pete)
- **Tiered sourcing, degrade gracefully:** (1) licensed property-data APIs primary → (2) best-effort scrape fallback → (3) paste-text double fallback.
- **Primary provider: RentCast** (property record + tax + AVM value + rent estimate + comps in one usage-based API; ~$0.05–0.10/call, free tier ~50/mo). ATTOM/Estated are richer but enterprise-priced; provider interface is swappable. Geocoding via Mapbox/Google.
- **Backend in scope:** serverless proxy holds keys, handles CORS, normalizes, caches, cost-guards. Reuses the planned E6 calc-API surface.
- **Scope v1:** core deal inputs **+ comps & history**.
- **Scrape tier risk:** scraping Zillow/Redfin violates their ToS and is anti-bot-fragile → feature-flagged OFF by default, labeled `needs-legal-review`, product/legal call to enable. URL is normally parsed only to extract address/listing-id, then resolved via the licensed API (not scraped).
- **Never silently overwrite** a user-edited field; everything routes through a review/override panel.

## Architecture
- New `@rpe/property` package (engine-style, no React): `PropertyLookup` type (partial DealInputs, each field `{value, source, confidence}`), `PropertyProvider` interface, `resolveProperty()` tiered orchestrator.
- Mapping layer → `DealInputs` with explicit periods (taxes annual, HOA monthly), rent estimate → grossRent *suggestion*, confidence tiers + "needs review" flags.
- Target release: **v1.1** (post-1.0).

## Tickets (lowermedia.atlassian.net, project RPE)
- **RPE-43** — Epic: E7 Address/listing-URL autofill
- RPE-44 — Provider abstraction + PropertyLookup types + tiered resolver
- RPE-45 — Serverless proxy (keys, CORS, normalization, caching, cost guardrails)
- RPE-46 — Address normalization + geocoding
- RPE-47 — Listing URL parser (host → address/listing-id, no fetch)
- RPE-48 — RentCast primary integration (property + tax + AVM + rent estimate)
- RPE-49 — Comps & history (rent/sale comps, tax/price history)
- RPE-50 — Provider → DealInputs mapping + confidence model
- RPE-51 — Scrape fallback (gated, feature-flagged, ToS-caveated; `needs-legal-review`)
- RPE-52 — Paste-listing-text parser (client-side double fallback)
- RPE-53 — Import UI (paste bar + review/override panel, source/confidence badges)
- RPE-54 — Tests (URL parsing, mapping, fallback chain, provider mocks, e2e import)

## Suggested build order
RPE-44 (foundation) → RPE-45 (proxy) → RPE-46/47 (resolve input) → RPE-48 (primary data) → RPE-50 (mapping) → RPE-53 (UI) → RPE-49 (comps) → RPE-52 (paste fallback) → RPE-51 (scrape, last/gated) → RPE-54 (tests alongside).
