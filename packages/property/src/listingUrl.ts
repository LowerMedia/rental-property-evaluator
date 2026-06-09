/**
 * E7 — listing URL parser (RPE-47)
 *
 * Detects supported listing hosts (Zillow, Redfin, Realtor, Trulia,
 * Homes.com) and extracts a usable address slug and/or host-native
 * listing id from the URL path. Pure string parsing — never fetches the
 * page. The output feeds the geocoder/resolver so listings are resolved
 * via the licensed API tier instead of scraped.
 *
 * Anything that is not a supported listing URL — a plain address, an
 * unsupported host, or garbage — falls back to
 * { kind: 'address', address: <input> } so the caller can treat the raw
 * input as a freeform address.
 */

export type ListingHost = 'zillow' | 'redfin' | 'realtor' | 'trulia' | 'homes';

export interface ParsedListing {
  host: ListingHost;
  /** Best-effort de-slugged address ("123 Main St Austin TX 78701"). */
  address: string | null;
  /** Host-native listing id (zpid, Redfin home id, MLS-ish id) when present. */
  listingId: string | null;
}

export type ListingUrlResult =
  | { kind: 'listing'; listing: ParsedListing }
  | { kind: 'address'; address: string };

const HOST_PATTERNS: ReadonlyArray<readonly [ListingHost, RegExp]> = [
  ['zillow', /(^|\.)zillow\.com$/],
  ['redfin', /(^|\.)redfin\.com$/],
  ['realtor', /(^|\.)realtor\.com$/],
  ['trulia', /(^|\.)trulia\.com$/],
  ['homes', /(^|\.)homes\.com$/],
];

/** Turn a URL slug into address-ish text: separators → spaces, collapsed. */
function deslug(slug: string): string {
  return slug.replace(/[-_+]/g, ' ').replace(/\s+/g, ' ').trim();
}

function nonEmpty(value: string | undefined | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/** Path segments, decoded, empty ones dropped. */
function segments(url: URL): string[] {
  return url.pathname
    .split('/')
    .map((s) => {
      try {
        return decodeURIComponent(s).trim();
      } catch {
        return s.trim();
      }
    })
    .filter((s) => s !== '');
}

// ─── Per-host extractors ──────────────────────────────────────────────────────
// Each returns null when the path doesn't match the host's detail-page shape.

/** zillow.com/homedetails/123-Main-St-Austin-TX-78701/29381742_zpid/
 *  (the address slug is optional — some shared links carry only the zpid) */
function parseZillow(url: URL): Omit<ParsedListing, 'host'> | null {
  const segs = segments(url);
  const i = segs.indexOf('homedetails');
  if (i === -1) return null;
  const slug = segs[i + 1];
  const slugIsId = slug !== undefined && /_zpid$/.test(slug);
  const idSeg = slugIsId ? slug : segs[i + 2];
  const id = idSeg?.match(/^(\d+)_zpid$/)?.[1] ?? null;
  const address = slug !== undefined && !slugIsId ? nonEmpty(deslug(slug)) : null;
  if (address === null && id === null) return null;
  return { address, listingId: id };
}

/** redfin.com/TX/Austin/123-Main-St-78701/home/12345 */
function parseRedfin(url: URL): Omit<ParsedListing, 'host'> | null {
  const segs = segments(url);
  const homeIdx = segs.indexOf('home');
  const id = homeIdx !== -1 ? (nonEmpty(segs[homeIdx + 1]?.match(/^\d+$/)?.[0]) ?? null) : null;
  // Detail paths look like <STATE>/<City>/<street-slug>/home/<id>
  const [state, citySeg, streetSeg] = segs;
  if (state !== undefined && citySeg !== undefined && streetSeg !== undefined && /^[A-Z]{2}$/.test(state)) {
    const city = deslug(citySeg);
    // The street slug usually ends with the ZIP — lift it to the end of
    // the assembled address ("123 Main St Austin TX 78701")
    const streetRaw = deslug(streetSeg);
    const zipMatch = streetRaw.match(/^(.*?)\s+(\d{5})$/);
    const street = zipMatch?.[1] ?? streetRaw;
    const zip = zipMatch?.[2] !== undefined ? ` ${zipMatch[2]}` : '';
    return { address: `${street} ${city} ${state}${zip}`.trim(), listingId: id };
  }
  if (id !== null) return { address: null, listingId: id };
  return null;
}

/** realtor.com/realestateandhomes-detail/123-Main-St_Austin_TX_78701_M1234-56789 */
function parseRealtor(url: URL): Omit<ParsedListing, 'host'> | null {
  const segs = segments(url);
  const i = segs.indexOf('realestateandhomes-detail');
  const detailSlug = i === -1 ? undefined : segs[i + 1];
  if (detailSlug === undefined) return null;
  const parts = detailSlug.split('_');
  const last = parts[parts.length - 1];
  const hasId = /^M[\d-]+$/i.test(last ?? '');
  const id = hasId ? (last ?? null) : null;
  const addressParts = hasId ? parts.slice(0, -1) : parts;
  const address = nonEmpty(addressParts.map(deslug).join(' '));
  if (address === null && id === null) return null;
  return { address, listingId: id };
}

/** trulia.com/p/tx/austin/123-main-st-austin-tx-78701--2089382929
 *  trulia.com/home/123-main-st-austin-tx-78701-2089382929 */
function parseTrulia(url: URL): Omit<ParsedListing, 'host'> | null {
  const segs = segments(url);
  if (segs[0] !== 'p' && segs[0] !== 'home') return null;
  const slug = segs[segs.length - 1];
  if (slug === undefined || slug === 'p' || slug === 'home') return null;
  const doubleDash = slug.match(/^(.*?)--(\d+)$/);
  if (doubleDash?.[1] !== undefined && doubleDash[2] !== undefined) {
    return { address: nonEmpty(deslug(doubleDash[1])), listingId: doubleDash[2] };
  }
  const trailingId = slug.match(/^(.*?)-(\d{7,})$/);
  if (trailingId?.[1] !== undefined && trailingId[2] !== undefined) {
    return { address: nonEmpty(deslug(trailingId[1])), listingId: trailingId[2] };
  }
  return { address: nonEmpty(deslug(slug)), listingId: null };
}

/** homes.com/property/123-main-st-austin-tx-78701/id-400-1234567/ */
function parseHomes(url: URL): Omit<ParsedListing, 'host'> | null {
  const segs = segments(url);
  const i = segs.indexOf('property');
  const propertySlug = i === -1 ? undefined : segs[i + 1];
  if (propertySlug === undefined) return null;
  const address = nonEmpty(deslug(propertySlug));
  const idSeg = segs[i + 2];
  const id = idSeg?.match(/^id-([\w-]+)$/i)?.[1] ?? null;
  if (address === null && id === null) return null;
  return { address, listingId: id };
}

const EXTRACTORS: Record<ListingHost, (url: URL) => Omit<ParsedListing, 'host'> | null> = {
  zillow: parseZillow,
  redfin: parseRedfin,
  realtor: parseRealtor,
  trulia: parseTrulia,
  homes: parseHomes,
};

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Parse user input that may be a listing URL. Tolerates a missing scheme
 * ("zillow.com/homedetails/…"). Everything that doesn't yield a usable
 * listing falls back to the freeform-address result.
 */
export function parseListingUrl(input: string): ListingUrlResult {
  const fallback: ListingUrlResult = { kind: 'address', address: input.trim() };
  const trimmed = input.trim();
  if (trimmed === '') return fallback;

  // Only attempt URL parsing on URL-looking input — a plain street
  // address must never be mangled by the URL constructor.
  const looksLikeUrl = /^https?:\/\//i.test(trimmed) || /^[\w.-]+\.[a-z]{2,}\//i.test(trimmed);
  if (!looksLikeUrl) return fallback;

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
  } catch {
    return fallback;
  }

  const hostname = url.hostname.toLowerCase();
  const match = HOST_PATTERNS.find(([, pattern]) => pattern.test(hostname));
  if (match === undefined) return fallback;

  const extracted = EXTRACTORS[match[0]](url);
  if (extracted === null) return fallback;
  return { kind: 'listing', listing: { host: match[0], ...extracted } };
}
