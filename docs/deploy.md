# Deploy runbook — DigitalOcean App Platform (RPE-98)

Production replaces the legacy CRA/Express beta on App Platform at
<https://rentalpropertyevaluator.com>, updating in place (new app built
alongside, domain moved at cutover). Cloudflare fronts the domain's DNS.

## Architecture

| Component | Source | Runs as |
|---|---|---|
| `web` | `apps/web` static build (`pnpm --filter @rpe/web build`) | App Platform static site, SPA catchall |
| `api` | [apps/api/Dockerfile](../apps/api/Dockerfile) (context = repo root) | App Platform service on port 3001 |
| `db` | Drizzle migrations in `packages/db/migrations` (applied by the api at first connect) | Managed Postgres 16 (prod) / dev DB (staging) |

One origin serves both: ingress routes `/v1` **and the legacy unprefixed
SPA paths** (`/health /evaluate /property /region /geocode /scrape`) to
`api`; everything else falls through to `web`. Cookie-session auth
requires this same-origin layout — do not split SPA and API across
hostnames.

Specs: [.do/app.yaml](../.do/app.yaml) (prod, tracks `main`) and
[.do/app.staging.yaml](../.do/app.staging.yaml) (staging, tracks `develop`).

### Multi-domain (RPE-98)

`rentalpropertyevaluator.com` is PRIMARY; `rpe.lowprop.com` and
`rpe.goldfinchproperties.com` are ALIASes on the same app. Intended
behavior:

- **Sessions are per-origin** — logging in on one domain does not log you
  in on the others. All three are listed in `RPE_AUTH_TRUSTED_ORIGINS`.
- **Canonical/OG tags point at the primary** on all three (single static
  build, `VITE_APP_ORIGIN`) — aliases never compete as duplicate content.
- **Auth emails** (verification/reset links) use `RPE_AUTH_BASE_URL`, i.e.
  the primary domain, regardless of which alias the user registered on.
- **AdSense** is approved for the primary; add the alias sites in AdSense
  or accept no-fill there.

## 1. One-time prerequisites (account side)

1. `brew install doctl && doctl auth init` (API token with write scope
   from cloud.digitalocean.com → API → Tokens).
2. Authorize the DigitalOcean GitHub app for
   `LowerMedia/rental-property-evaluator` (console → Apps → Create App →
   GitHub — one-time OAuth grant).
3. Resend: create account → verify the `rentalpropertyevaluator.com`
   sending domain (DKIM/SPF records go in Cloudflare DNS) → mint an API
   key for `RESEND_API_KEY`.
4. HUD SAFMR token (free): <https://www.huduser.gov/portal/dataset/fmr-api.html>.
5. Generate the auth secret: `openssl rand -base64 32`.

## 2. Provision production

```bash
# a) managed Postgres cluster (name must match cluster_name in the spec)
doctl databases create rpe-pg --engine pg --version 16 \
  --size db-s-1vcpu-1gb --region nyc1 --num-nodes 1

# b) first create — comment out the `domains:` block in .do/app.yaml
#    (the legacy app still owns the primary domain), then:
doctl apps create --spec .do/app.yaml

# c) set the three secrets (console → app → Settings → api → Environment
#    Variables, or doctl). BETTER_AUTH_SECRET, RESEND_API_KEY, HUD_TOKEN.

# d) round-trip the encrypted values back into the committed spec:
doctl apps spec get <APP_ID> > /tmp/live.yaml
#    copy the EV[1:...] secret values into .do/app.yaml — encrypted values
#    are sealed to the app and safe to commit; future `doctl apps update`
#    calls then preserve them.
```

Region note: keep `region` in the spec aligned with the legacy app's
region (check `doctl apps list`) and the PG cluster's region.

## 3. Provision staging

```bash
doctl apps create --spec .do/app.staging.yaml
# set BETTER_AUTH_SECRET + HUD_TOKEN secrets (fresh values, not prod's)
```

The default `<app>.ondigitalocean.app` URL is the stable staging
hostname (`${APP_URL}` feeds the auth/CORS env). Email verification is
off on staging (sandbox mailer) — see the comment in the spec to
exercise real email.

## 4. Environment matrix

| Key | Prod | Staging | Notes |
|---|---|---|---|
| `DATABASE_URL` | `${db.DATABASE_URL}` | same | platform-injected bindable |
| `RPE_API_KEYS_SOURCE` | `db` | `db` | DB-backed keys (RPE-83) |
| `RPE_AUTH_BASE_URL` | primary origin | `${APP_URL}` | better-auth base + email links |
| `RPE_AUTH_TRUSTED_ORIGINS` | all three origins | `${APP_URL}` | comma-separated |
| `RPE_CORS_ORIGINS` | all three origins | `${APP_URL}` | belt-and-suspenders; same-origin in practice |
| `RPE_REQUIRE_EMAIL_VERIFICATION` | `true` | `false` | staging uses sandbox mailer |
| `RPE_MAIL_PROVIDER` / `RPE_MAIL_FROM` | `resend` / `noreply@rentalpropertyevaluator.com` | unset | sender domain must be verified in Resend |
| `BETTER_AUTH_SECRET` | secret | secret | `openssl rand -base64 32`, never reuse across envs |
| `RESEND_API_KEY` | secret | unset | |
| `HUD_TOKEN` | secret | secret | `/region` rent estimates (rent=null without it) |
| `RPE_MIGRATIONS_DIR` | baked into image (`/app/migrations`) | same | set in the Dockerfile |
| `VITE_API_URL` | `""` (relative, same-origin) | `""` | build-time, static site |
| `VITE_AUTH_ENABLED` | `true` | `true` | build-time |
| `VITE_ADS_ENABLED` | `false` until ads flip | `false` | build-time |

## 5. Spec-as-code workflow

The committed specs are the source of truth. Change → commit → apply:

```bash
doctl apps update <APP_ID> --spec .do/app.yaml
```

`update --spec` **replaces** the live spec: any env var not present in
the file is removed. That's why secret entries stay in the spec with
their encrypted `EV[...]` values after the §2d round-trip.

## 6. DNS & Cloudflare

All records live in Cloudflare for `rentalpropertyevaluator.com`; the
alias hostnames live in the `lowprop.com` and `goldfinchproperties.com`
zones (wherever their DNS is hosted).

| Record | Zone | Target |
|---|---|---|
| `rentalpropertyevaluator.com` (apex, CNAME-flattened) | rentalpropertyevaluator.com | `<rpe-prod>.ondigitalocean.app` |
| `rpe.lowprop.com` CNAME | lowprop.com | `<rpe-prod>.ondigitalocean.app` |
| `rpe.goldfinchproperties.com` CNAME | goldfinchproperties.com | `<rpe-prod>.ondigitalocean.app` |
| `staging.rentalpropertyevaluator.com` CNAME (optional) | rentalpropertyevaluator.com | `<rpe-staging>.ondigitalocean.app` |

Certificate issuance: App Platform issues Let's Encrypt certs per
domain and needs to observe the DNS pointing at it. With the Cloudflare
proxy (orange cloud) on, set SSL mode **Full (strict)**; if issuance
stalls, temporarily grey-cloud the record until the cert appears in the
app's Domains tab, then re-enable the proxy. Zones not behind a proxy
(plain DNS) need no special handling.

## 7. Cutover (production)

Pre-flight: staging smoke (§8) green; gate green on `main`.

1. Deploy `rpe-prod` (no domains yet) and run the §8 smoke against the
   default `https://<rpe-prod>.ondigitalocean.app` URL.
2. Mint/import API keys (§9) so existing consumers keep working.
3. Remove `rentalpropertyevaluator.com` from the **legacy** app
   (console → legacy app → Settings → Domains). Do not destroy the app.
4. Uncomment `domains:` in `.do/app.yaml`, `doctl apps update` — the
   primary + both aliases attach to `rpe-prod`.
5. Point DNS (§6). Wait for cert issuance on all three hostnames.
6. Run §8 smoke against all three live domains.
7. **Rollback**: re-add the domain to the legacy app and revert the DNS
   target — the legacy app keeps running untouched until sign-off.
8. Sign-off (a few quiet days): archive/destroy the legacy app.

## 8. Smoke checklist

```bash
BASE=https://rentalpropertyevaluator.com   # or the default URL / an alias

curl -s $BASE/v1/health | jq .             # status ok, version, GIT_SHA
curl -s -o /dev/null -w "%{http_code}\n" $BASE/          # 200 SPA
curl -s "$BASE/region?zip=52240" | jq .                   # legacy path → api
curl -s -X POST $BASE/v1/evaluate -H 'content-type: application/json' \
  -d '{"inputs":{}}' -o /dev/null -w "%{http_code}\n"     # 401 without key
# NOTE: the 401 requires ≥1 key minted (§9) — with zero keys configured
# the /v1 surface is open by design (RPE-75), so mint before asserting.
# authenticated evaluate + reports + deals CRUD: use the curl bodies from
# docs/api-quickstart.md with  -H "X-API-Key: $KEY"
```

Browser (per domain at cutover; full pass on primary):

- register → receive verification email (prod) → verify → login; cookie
  session survives reload (`/v1/auth/get-session` 200).
- create + list deals; pull a PDF report (`X-Report-Cache` header flips
  hit/miss); rate-limit headers present on `/v1/*`.
- **legacy migration**: in devtools on the OLD site (pre-cutover) confirm
  `localStorage.changeableRPE` exists, or seed it:
  `localStorage.setItem('changeableRPE', JSON.stringify({PurchasePrice:"200000",PercentDown:"25",InterestRate:"4.5",LoanTerm:"30",MonthlyRent:"2000",Taxes:"2400",Insurance:"1200",HOA:"0",OtherExpense:"1200",CapExPct:"5",MaintPct:"5",ManagementPct:"10",VacancyPct:"5"}))`
  — after cutover, reload and confirm the "Imported (legacy)" scenario
  appears and the old key is gone.

## 9. API keys (DB-backed)

Run the CLI locally against the managed DB (add your IP under the
cluster's **Trusted Sources** first; connection string from the DO
console):

```bash
DATABASE_URL='postgres://…' pnpm --filter @rpe/api exec \
  tsx scripts/manage-keys-db.ts mint --name "<consumer>" --org <orgId>
# import previously issued env/file keys (idempotent):
DATABASE_URL='postgres://…' pnpm --filter @rpe/api exec \
  tsx scripts/manage-keys-db.ts import
```

## 10. Post-cutover

- Uptime monitor on `https://rentalpropertyevaluator.com/v1/health`
  (UptimeRobot or DO monitoring + alert policy).
- Confirm the PG cluster's automated backups/PITR are active; do one
  restore drill to a throwaway cluster.
- **Ads flip**: create the results ad unit in AdSense, set
  `VITE_ADS_ENABLED=true` + `VITE_ADSENSE_SLOT_RESULTS` in the spec,
  apply (rebuild). Add the alias sites in AdSense.
- **Analytics**: the old site ran GTM (`GTM-WDL6RJC`) + a dead UA tag;
  the new SPA ships none. Decide GA4/GTM (separate ticket).
- Point the WP block embed at `https://rentalpropertyevaluator.com`.
- Atlassian/ops hygiene: close RPE-82 as superseded by RPE-98.

## Costs (ballpark, monthly)

| Item | $ |
|---|---|
| api service (apps-s-1vcpu-0.5gb) | 5 |
| web static site | 0 (free tier ×3) |
| managed PG `rpe-pg` (1 vCPU/1 GB) | 15 |
| staging app (service + dev PG) | 5 + 7 |
| **Total** | **~32 with staging, ~20 without** |

Staging can be torn down between releases (`doctl apps delete`) — the
spec recreates it in minutes.
