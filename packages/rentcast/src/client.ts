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

function ensureRentCastError(reason: unknown): RentCastError {
  if (reason instanceof RentCastError) return reason;
  const msg = reason instanceof Error ? reason.message : String(reason);
  return new RentCastError('unknown', `Network error: ${msg}`);
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
  if (avm.status === 'rejected') throw ensureRentCastError(avm.reason);
  if (rent.status === 'rejected') throw ensureRentCastError(rent.reason);

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
        const years      = Object.keys(p.propertyTaxes).sort().reverse();
        const latestYear = years[0];
        const latestTax  = latestYear ? p.propertyTaxes[latestYear] : undefined;
        annualTaxes      = latestTax?.total ?? null;
      }
    }
  }

  return { purchasePrice: avmData.price, grossRent: rentData.rent, sqft, units, annualTaxes };
}
