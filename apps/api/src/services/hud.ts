/**
 * HUD SAFMR (Small Area Fair Market Rents) API client.
 *
 * Fetches ZIP-level rent estimates from HUD's free public API.
 * Requires env var HUD_TOKEN (free at https://www.huduser.gov/portal/dataset/fmr-api.html).
 *
 * Returns null on any error so callers degrade gracefully.
 */

export interface HudSafmrResult {
  stateCode: string;
  town: string;
  county: string;
  rent: {
    studio: number | null;
    oneBed: number | null;
    twoBed: number | null;
    threeBed: number | null;
    fourBed: number | null;
  };
}

interface HudRentRow {
  Efficiency?: number | null;
  One_Bedroom?: number | null;
  Two_Bedroom?: number | null;
  Three_Bedroom?: number | null;
  Four_Bedroom?: number | null;
}

interface HudApiResponse {
  data?: {
    state?: unknown;
    county?: unknown;
    town?: unknown;
    /** Array of ZIP rows in SAFMR metros; a single object for metro-wide FMR areas. */
    basicdata?: HudRentRow | HudRentRow[];
  };
}

/** Abort the HUD request if it takes longer than this — a hung upstream must not block /region. */
const HUD_TIMEOUT_MS = 10_000;

/**
 * Fetch HUD SAFMR data for a ZIP5 code.
 *
 * @param zip       5-digit US ZIP code.
 * @param hudToken  Bearer token for the HUD API.
 * @returns         Resolved rent data + state code, or null on failure.
 */
export async function fetchHudSafmr(
  zip: string,
  hudToken: string,
): Promise<HudSafmrResult | null> {
  try {
    const url = `https://www.huduser.gov/hudapi/public/fmr/data/${encodeURIComponent(zip)}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${hudToken}` },
      signal: AbortSignal.timeout(HUD_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.error(`hud: SAFMR fetch for ${zip} returned HTTP ${res.status}`);
      return null;
    }

    const body = (await res.json()) as HudApiResponse;
    const data = body.data;
    if (!data) return null;

    const stateCode = typeof data.state === 'string' ? data.state.toUpperCase() : '';
    const town = typeof data.town === 'string' ? data.town : '';
    const county = typeof data.county === 'string' ? data.county : '';

    // basicdata is an array of ZIP rows in SAFMR metros but a single object
    // for metro-wide FMR areas — accept both shapes
    const row = Array.isArray(data.basicdata) ? data.basicdata[0] : data.basicdata;
    return {
      stateCode,
      town,
      county,
      rent: {
        studio: typeof row?.Efficiency === 'number' ? row.Efficiency : null,
        oneBed: typeof row?.One_Bedroom === 'number' ? row.One_Bedroom : null,
        twoBed: typeof row?.Two_Bedroom === 'number' ? row.Two_Bedroom : null,
        threeBed: typeof row?.Three_Bedroom === 'number' ? row.Three_Bedroom : null,
        fourBed: typeof row?.Four_Bedroom === 'number' ? row.Four_Bedroom : null,
      },
    };
  } catch (err) {
    // Timeout, network failure, or non-JSON body — log with context so HUD
    // outages are diagnosable, then degrade gracefully (contract: null on failure)
    console.error(
      `hud: SAFMR fetch for ${zip} failed:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}
