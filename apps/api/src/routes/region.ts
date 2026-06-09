/**
 * GET /region?zip=XXXXX
 *
 * Returns regional assumption defaults for the given US ZIP5 code.
 *
 * Response (200):
 *   {
 *     zip:              string,   // input ZIP5
 *     stateCode:        string,   // 2-letter US state code ('' if unresolved)
 *     label:            string,   // human-readable e.g. 'Austin, TX (78701)' when HUD
 *                                 // resolves a town/county, 'TX · 78701' otherwise
 *     propertyTaxRate:  number,   // 0–1 effective rate
 *     insuranceRate:    number,   // 0–1 annual premium as % of purchase price
 *     vacancyRate:      number,   // 0–1
 *     appreciationRate: number,   // 0–1 annualised
 *     rentGrowthRate:   number,   // 0–1 annualised
 *     rent: {                     // HUD SAFMR ZIP-level rent (null when unavailable)
 *       studio:    number | null,
 *       oneBed:    number | null,
 *       twoBed:    number | null,
 *       threeBed:  number | null,
 *       fourBed:   number | null,
 *     } | null,
 *     resolvedLevel: 'state' | 'national',  // granularity of the *rates* above —
 *                                 // rent (when present) is always ZIP-level from HUD SAFMR
 *     sourceLabel:   string,
 *   }
 *
 * Error responses:
 *   400 { error: string }  — missing or invalid zip parameter
 *   500 { error: string }  — internal error
 *
 * HUD SAFMR API:
 *   Requires env var HUD_TOKEN (free at https://www.huduser.gov/portal/dataset/fmr-api.html).
 *   If HUD_TOKEN is absent, rent data is omitted (static-only response).
 *   Endpoint used: GET https://www.huduser.gov/hudapi/public/fmr/data/{zip}
 *   Returns state code, county, town, and Small Area FMR by bedroom count.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';
import { resolveRegionalRates } from '@rpe/region-defaults';
import { fetchHudSafmr } from '../services/hud.js';
import type { HudSafmrResult } from '../services/hud.js';

// ─── Route handler ────────────────────────────────────────────────────────────

export async function handleRegion(
  req: IncomingMessage,
  res: ServerResponse,
  json: (res: ServerResponse, status: number, body: unknown) => void,
): Promise<void> {
  if (req.method !== 'GET') {
    json(res, 405, { error: 'Method not allowed — use GET' });
    return;
  }

  // Parse the zip query parameter
  const urlStr = req.url ?? '';
  const queryStart = urlStr.indexOf('?');
  const queryString = queryStart >= 0 ? urlStr.slice(queryStart + 1) : '';
  const params = new URLSearchParams(queryString);
  const zip = (params.get('zip') ?? '').trim();

  if (!/^\d{5}$/.test(zip)) {
    json(res, 400, { error: 'zip must be a 5-digit US ZIP code' });
    return;
  }

  try {
    const hudToken = process.env['HUD_TOKEN'] ?? '';

    // Call HUD SAFMR if token is configured
    let stateCode = '';
    let label = '';
    let rent: HudSafmrResult['rent'] | null = null;

    if (hudToken) {
      try {
        const hudResult = await fetchHudSafmr(zip, hudToken);
        if (hudResult) {
          stateCode = hudResult.stateCode;
          // Build a human-readable label
          const location = hudResult.town || hudResult.county;
          label = stateCode
            ? (location ? `${location}, ${stateCode} (${zip})` : `${stateCode} · ${zip}`)
            : zip;
          rent = hudResult.rent;
        }
      } catch (hudErr) {
        // HUD call failed — degrade to static defaults with empty stateCode
        console.error(
          '/region: HUD SAFMR fetch failed, falling back to national defaults:',
          hudErr instanceof Error ? hudErr.message : String(hudErr),
        );
      }
    }

    // If HUD call failed or token absent, try to derive state from ZIP prefix
    // This is a best-effort fallback — not all ZIP3 prefixes map to a unique state.
    // For now, leave stateCode empty and serve national defaults.

    const rates = resolveRegionalRates(stateCode);

    json(res, 200, {
      zip,
      stateCode,
      label: label || (stateCode ? `${stateCode} · ${zip}` : zip),
      propertyTaxRate: rates.propertyTaxRate,
      insuranceRate: rates.insuranceRate,
      vacancyRate: rates.vacancyRate,
      appreciationRate: rates.appreciationRate,
      rentGrowthRate: rates.rentGrowthRate,
      rent,
      resolvedLevel: rates.resolvedLevel,
      sourceLabel: rates.sourceLabel,
    });
  } catch (err) {
    console.error(
      '/region handler error:',
      err instanceof Error ? err.stack : String(err),
    );
    json(res, 500, { error: 'Internal server error' });
  }
}
