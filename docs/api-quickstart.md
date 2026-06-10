# RPE Public API — Quickstart

Base URL: your deployment's origin; all public endpoints live under `/v1`.
Interactive reference: `GET /v1/docs` · machine spec: `GET /v1/openapi.json`.

## 1. Get a key

Keys are minted by the operator (no self-serve in Phase 1):

```bash
node apps/api/scripts/manage-keys.mjs mint --label your-name --file keys.json
# → prints the ONE-TIME secret (rpe_live_…). Store it now; only its hash is kept.
# Run the API with RPE_API_KEYS_FILE=keys.json (or paste the array into RPE_API_KEYS).
```

Send the key as `Authorization: Bearer <key>` or `X-API-Key: <key>`.
Every response carries `X-RateLimit-Limit/-Remaining/-Reset` and `X-Request-Id`
(quote the request id when reporting an issue).

## 2. Evaluate a deal

```bash
curl -s http://localhost:3001/v1/evaluate \
  -H "Authorization: Bearer $RPE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{
    "inputs": {
      "purchasePrice": 300000, "percentDown": 20, "interestRate": 7,
      "loanTermYears": 30, "closingCosts": 6000, "rollClosingCostsIntoLoan": false,
      "grossRent": 2200, "vacancyPct": 5,
      "expenses": {
        "taxes":     { "amount": 4800, "period": "annual" },
        "insurance": { "amount": 1800, "period": "annual" }
      }
    }
  }'
```

Add `"opts": { "mode": "proforma" }` plus `holdYears`/growth inputs for the
multi-year projection.

## 3. Reports — json, csv, pdf

Format precedence: `?format=` query > `format` in the body > `Accept` header > json.

```bash
# Canonical JSON report
curl -s http://localhost:3001/v1/reports \
  -H "Authorization: Bearer $RPE_KEY" -H 'Content-Type: application/json' \
  -d @deal.json

# CSV download
curl -s -OJ "http://localhost:3001/v1/reports?format=csv" \
  -H "Authorization: Bearer $RPE_KEY" -H 'Content-Type: application/json' \
  -d @deal.json

# PDF download (Accept-negotiated)
curl -s -OJ http://localhost:3001/v1/reports \
  -H "Authorization: Bearer $RPE_KEY" -H 'Accept: application/pdf' \
  -H 'Content-Type: application/json' -d @deal.json
```

(`deal.json` = the same `{ "inputs": … }` body as above. `-OJ` saves the
attachment under its `rpe-YYYY-MM-DD.{csv,pdf}` filename.)

## 4. Errors

Errors return the standard envelope with consistent statuses
(400/401/406/413/429/500):

```json
{ "error": { "code": "rate_limited", "message": "…", "requestId": "…" } }
```

429 responses include `Retry-After` (seconds). Limits are per key
(`RPE_V1_RPM`, default 120/min; `RPE_V1_DAILY_CAP`, default 10000/day).
