# Features: Simple/Complex mode (E8) + Location-based assumptions (E9)

Added 2026-05-21. Both target v1.1. Tagged groups: `modes` (E8), `location-defaults` (E9).

## E8 — Simple / Complex mode switch (Epic RPE-55, label `modes`)
- **Complex** = everything today (full form + all metrics). **Simple** = bare-min inputs (price, rent, %down, rate, taxes) + reduced KPIs (cash flow, cap, CoC, 1% rule); hidden inputs filled from a documented **baseline-assumptions** set feeding the same engine.
- No engine changes — engine always gets a full DealInputs; mode only filters what the UI shows/collects.
- Mode toggle never loses values; assumed results badged "based on assumptions".
- Stories: RPE-57 state+tiering config · RPE-58 baseline-assumptions module (integration seam for E9) · RPE-59 simple input form · RPE-60 simple results · RPE-61 toggle UI + badges · RPE-62 tests (incl. simple↔complex engine parity).

## E9 — Location-based assumption defaults (Epic RPE-56, label `location-defaults`)
- Enter a location (city/ZIP/metro) → assumptions pre-filled from area averages (tax rate, insurance, vacancy, rent ratios, expense %, appreciation, rent growth). Feeds the E8 baseline module; user override always wins; source/region badge shown.
- **Research-gated:** RPE-63 **SPIKE** (issue type Task, label `spike`) scopes data sources/granularity/cadence/licensing before the data layer. Relates to RPE-65 and to autofill epic RPE-43 (shared providers).
- Stories: RPE-63 SPIKE · RPE-64 location input + region resolution (reuse geocoding RPE-46) · RPE-65 data layer behind proxy, fallback region→metro→state→national (blocked by spike) · RPE-66 wire into baseline-assumptions (labeled both `modes`+`location-defaults`) · RPE-67 tests.

## Cross-feature dependency
E8 RPE-58 (baseline module) is the seam; E9 RPE-66 plugs location averages into it. Build E8 baseline module before E9 wiring. E9 data work waits on the RPE-63 spike.

## Suggested order
E8: RPE-57 → RPE-58 → RPE-59/60 → RPE-61 → RPE-62.
E9: RPE-63 (spike, do early) → RPE-64 → RPE-65 → RPE-66 → RPE-67.
