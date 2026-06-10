/**
 * E7 — supporting context: comps & history (RPE-49)
 *
 * Fetches and normalizes read-only supporting data for a deal: rent
 * comps, sale comps, tax history, and price history. Everything here is
 * best-effort — each upstream piece that fails or is missing yields an
 * empty array; the call as a whole throws only when ALL THREE upstream
 * requests fail (nothing useful to show).
 *
 * This data is surfaced next to the deal as context and used to judge
 * confidence — it is never auto-applied to inputs.
 *
 * FIELD NAME VERIFICATION: comparables/history field names follow
 * https://developers.rentcast.io/reference — verify against a live call
 * before relying on them in production.
 */

import { RentCastError } from './types';
import { rcGet } from './http';

const COMP_COUNT = 5;

export interface CompRecord {
  address: string | null;
  /** Sale price for sale comps; monthly rent for rent comps. */
  price: number;
  distanceMiles: number | null;
  sqft: number | null;
  bedrooms: number | null;
}

export interface TaxYearRecord {
  year: number;
  total: number;
}

export interface PriceEventRecord {
  /** ISO-ish date string as provided by the API. */
  date: string;
  event: string | null;
  price: number;
}

export interface PropertyContext {
  rentComps: CompRecord[];
  saleComps: CompRecord[];
  taxHistory: TaxYearRecord[];
  priceHistory: PriceEventRecord[];
}

// ─── Normalizers (defensive against shape drift) ──────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

/** AVM responses carry `comparables: [{ formattedAddress, price, distance, squareFootage, bedrooms }]`. */
function extractComps(avmResponse: unknown): CompRecord[] {
  const root = asRecord(avmResponse);
  const comparables = root?.['comparables'];
  if (!Array.isArray(comparables)) return [];
  const comps: CompRecord[] = [];
  for (const raw of comparables) {
    const c = asRecord(raw);
    if (c === null) continue;
    const price = num(c['price']);
    if (price === null || price <= 0) continue;
    comps.push({
      address: str(c['formattedAddress']) ?? str(c['addressLine1']),
      price,
      distanceMiles: num(c['distance']),
      sqft: num(c['squareFootage']),
      bedrooms: num(c['bedrooms']),
    });
  }
  return comps;
}

/** /properties propertyTaxes: { "2023": { total: 4210 }, ... } → sorted oldest→newest. */
function extractTaxHistory(propertiesResponse: unknown): TaxYearRecord[] {
  const first = Array.isArray(propertiesResponse) ? asRecord(propertiesResponse[0]) : null;
  const taxes = asRecord(first?.['propertyTaxes']);
  if (taxes === null) return [];
  const records: TaxYearRecord[] = [];
  for (const [yearKey, entry] of Object.entries(taxes)) {
    const year = Number(yearKey);
    const total = num(asRecord(entry)?.['total']);
    if (Number.isInteger(year) && total !== null) records.push({ year, total });
  }
  return records.sort((a, b) => a.year - b.year);
}

/** /properties history: { "2021-06-01": { event: 'Sale', price: 300000 }, ... } → sorted by date. */
function extractPriceHistory(propertiesResponse: unknown): PriceEventRecord[] {
  const first = Array.isArray(propertiesResponse) ? asRecord(propertiesResponse[0]) : null;
  const history = asRecord(first?.['history']);
  if (history === null) return [];
  const events: PriceEventRecord[] = [];
  for (const [date, entry] of Object.entries(history)) {
    const e = asRecord(entry);
    const price = num(e?.['price']);
    if (price === null) continue;
    events.push({ date, event: str(e?.['event']), price });
  }
  return events.sort((a, b) => a.date.localeCompare(b.date));
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Fetch comps + history for an address. Partial results are normal;
 * throws (first failure's RentCastError) only when all three upstream
 * calls fail.
 */
export async function fetchPropertyContext(
  address: string,
  apiKey: string,
): Promise<PropertyContext> {
  const encoded = encodeURIComponent(address);

  const [value, rent, props] = await Promise.allSettled([
    rcGet(`/avm/value?address=${encoded}&compCount=${COMP_COUNT}`, apiKey),
    rcGet(`/avm/rent/long-term?address=${encoded}&compCount=${COMP_COUNT}`, apiKey),
    rcGet(`/properties?address=${encoded}&limit=1`, apiKey),
  ]);

  if (value.status === 'rejected' && rent.status === 'rejected' && props.status === 'rejected') {
    const reason = value.reason;
    throw reason instanceof RentCastError
      ? reason
      : new RentCastError('unknown', 'RentCast context fetch failed');
  }

  return {
    saleComps: value.status === 'fulfilled' ? extractComps(value.value) : [],
    rentComps: rent.status === 'fulfilled' ? extractComps(rent.value) : [],
    taxHistory: props.status === 'fulfilled' ? extractTaxHistory(props.value) : [],
    priceHistory: props.status === 'fulfilled' ? extractPriceHistory(props.value) : [],
  };
}
