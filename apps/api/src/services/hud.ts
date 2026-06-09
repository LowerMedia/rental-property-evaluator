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

interface HudApiResponse {
  data?: {
    state?: unknown;
    county?: unknown;
    town?: unknown;
    basicdata?: Array<{
      Efficiency?: number | null;
      One_Bedroom?: number | null;
      Two_Bedroom?: number | null;
      Three_Bedroom?: number | null;
      Four_Bedroom?: number | null;
    }>;
  };
}

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
    });

    if (!res.ok) return null;

    const body = (await res.json()) as HudApiResponse;
    const data = body.data;
    if (!data) return null;

    const stateCode = typeof data.state === 'string' ? data.state.toUpperCase() : '';
    const town = typeof data.town === 'string' ? data.town : '';
    const county = typeof data.county === 'string' ? data.county : '';

    const row = data.basicdata?.[0];
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
  } catch {
    return null;
  }
}
