import { RentCastError, type PropertyData } from './types';
import { rcGet } from './http';

function ensureRentCastError(reason: unknown): RentCastError {
  if (reason instanceof RentCastError) return reason;
  const msg = reason instanceof Error ? reason.message : String(reason);
  return new RentCastError('unknown', `RentCast fetch failed: ${msg}`);
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
 * /properties 404 is soft — nullable fields return null.
 * Any other /properties error (401, 429, 5xx) is treated as fatal.
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

  const extractNumber = (data: unknown, field: string, label: string): number => {
    if (data == null || typeof data !== 'object' || typeof (data as Record<string, unknown>)[field] !== 'number') {
      throw new RentCastError('unknown', `RentCast: unexpected ${label} shape (${field} missing)`);
    }
    return (data as Record<string, unknown>)[field] as number;
  };

  const purchasePrice = extractNumber(avm.value, 'price', 'AVM value');
  const grossRent     = extractNumber(rent.value, 'rent',  'AVM rent');

  let sqft: number | null        = null;
  let units: number | null       = null;
  let annualTaxes: number | null = null;
  let bedrooms: number | null    = null;
  let bathrooms: number | null   = null;
  let yearBuilt: number | null   = null;

  // /properties 404 is soft (property not in database); other failures are fatal
  if (props.status === 'rejected') {
    const err = ensureRentCastError(props.reason);
    if (err.code !== 'not_found') throw err;
    // 404 → fall through with nulls
  } else {
    // /properties returns an array; we requested limit=1
    if (!Array.isArray(props.value)) {
      throw new RentCastError('unknown', 'RentCast: unexpected /properties response shape');
    }
    const list = props.value as Array<{
      squareFootage?: number;
      units?: number;
      bedrooms?: number;
      bathrooms?: number;
      yearBuilt?: number;
      // propertyTaxes is keyed by tax year: { "2023": { total: number } }
      propertyTaxes?: Record<string, { total: number }>;
    }>;
    const p = list[0];
    if (p) {
      sqft      = typeof p.squareFootage === 'number' ? p.squareFootage : null;
      units     = typeof p.units         === 'number' ? p.units         : null;
      bedrooms  = typeof p.bedrooms      === 'number' ? p.bedrooms      : null;
      bathrooms = typeof p.bathrooms     === 'number' ? p.bathrooms     : null;
      yearBuilt = typeof p.yearBuilt     === 'number' ? p.yearBuilt     : null;
      if (p.propertyTaxes) {
        const years      = Object.keys(p.propertyTaxes).sort().reverse();
        const latestYear = years[0];
        const latestTax  = latestYear ? p.propertyTaxes[latestYear] : undefined;
        annualTaxes      = latestTax && typeof latestTax.total === 'number' ? latestTax.total : null;
      }
    }
  }

  return { purchasePrice, grossRent, sqft, units, annualTaxes, bedrooms, bathrooms, yearBuilt };
}
