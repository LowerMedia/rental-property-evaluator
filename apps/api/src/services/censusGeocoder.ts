/**
 * E7 — US Census geocoder client (RPE-46)
 *
 * Geocodes freeform address input via the free, keyless US Census Bureau
 * geocoding service (geocoding.geo.census.gov). Returns ALL candidate
 * matches so ambiguous input becomes a disambiguation list for the UI,
 * never a silent guess.
 *
 * Provider choice: the ticket allows Mapbox/Google; Census is keyless,
 * free, and US-only — which matches the product. The GeocodeCandidate
 * shape is provider-agnostic so a paid geocoder can replace this client
 * without touching the route or consumers.
 *
 * Returns null on any failure so callers degrade gracefully (the address
 * is still usable as a raw lookup key).
 */

export interface GeocodeCandidate {
  /** Canonical one-line address as matched ("123 MAIN ST, AUSTIN, TX, 78701"). */
  formatted: string;
  lat: number;
  lng: number;
  /** County name when available ("Travis"). */
  county: string | null;
  stateCode: string | null;
  zip: string | null;
}

interface CensusAddressMatch {
  matchedAddress?: unknown;
  coordinates?: { x?: unknown; y?: unknown };
  addressComponents?: { state?: unknown; zip?: unknown };
  geographies?: { Counties?: Array<{ BASENAME?: unknown }> };
}

interface CensusResponse {
  result?: { addressMatches?: CensusAddressMatch[] };
}

const CENSUS_TIMEOUT_MS = 10_000;

const ENDPOINT =
  'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

/**
 * Geocode a freeform address. Resolves to a candidate list (possibly
 * empty — no match) or null on transport/shape failure.
 */
export async function geocodeAddress(query: string): Promise<GeocodeCandidate[] | null> {
  try {
    const params = new URLSearchParams({
      address: query,
      benchmark: 'Public_AR_Current',
      vintage: 'Current_Current',
      layers: 'Counties',
      format: 'json',
    });
    const res = await fetch(`${ENDPOINT}?${params.toString()}`, {
      signal: AbortSignal.timeout(CENSUS_TIMEOUT_MS),
    });
    if (!res.ok) {
      console.error(`Census geocoder HTTP ${res.status} for query:`, query);
      return null;
    }
    const data = (await res.json()) as CensusResponse;
    const matches = data.result?.addressMatches;
    if (!Array.isArray(matches)) return null;
    return matches
      .map(toCandidate)
      .filter((c): c is GeocodeCandidate => c !== null);
  } catch (err) {
    console.error(
      'Census geocoder failed for query:',
      query,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

function toCandidate(match: CensusAddressMatch): GeocodeCandidate | null {
  const formatted = typeof match.matchedAddress === 'string' ? match.matchedAddress : null;
  const lng = match.coordinates?.x;
  const lat = match.coordinates?.y;
  if (formatted === null || typeof lat !== 'number' || typeof lng !== 'number') {
    return null;
  }
  const county = match.geographies?.Counties?.[0]?.BASENAME;
  const state = match.addressComponents?.state;
  const zip = match.addressComponents?.zip;
  return {
    formatted,
    lat,
    lng,
    county: typeof county === 'string' && county !== '' ? county : null,
    stateCode: typeof state === 'string' && state !== '' ? state : null,
    zip: typeof zip === 'string' && zip !== '' ? zip : null,
  };
}
