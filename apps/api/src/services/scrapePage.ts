/**
 * E7 — listing-page fetch + text extraction (RPE-51)
 *
 * Server-side, best-effort, ToS-caveated — only ever invoked behind the
 * RPE_SCRAPE_ENABLED flag (OFF by default; enabling in production is a
 * product/legal call, see the route).
 *
 * SSRF containment lives in the route (host allowlist); this service
 * additionally enforces https and bounds size/time so a hostile or
 * misbehaving page cannot wedge the proxy.
 */

const SCRAPE_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB

/** The only hosts this service will ever fetch — SSRF containment. */
const ALLOWED_LISTING_HOSTS = [
  /(^|\.)zillow\.com$/,
  /(^|\.)redfin\.com$/,
  /(^|\.)realtor\.com$/,
  /(^|\.)trulia\.com$/,
  /(^|\.)homes\.com$/,
];

/** True only for https URLs on a supported listing host. */
export function isAllowedListingUrl(url: URL): boolean {
  const hostname = url.hostname.toLowerCase();
  return url.protocol === 'https:' && ALLOWED_LISTING_HOSTS.some((p) => p.test(hostname));
}

/** Strip a fetched HTML document down to whitespace-collapsed text. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#0?36;/g, '$')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch a listing page and return its text content, or null on any
 * failure (timeout, HTTP error, non-https). Never throws.
 */
export async function fetchListingPageText(url: string): Promise<string | null> {
  try {
    const parsed = new URL(url);
    if (!isAllowedListingUrl(parsed)) return null;
    const res = await fetch(parsed.toString(), {
      signal: AbortSignal.timeout(SCRAPE_TIMEOUT_MS),
      headers: { Accept: 'text/html' },
      redirect: 'follow',
    });
    // Redirects are followed — re-validate the FINAL url so an
    // allowlisted page can never bounce this fetch to an internal or
    // third-party address (SSRF via redirect)
    if (res.url !== '' && !isAllowedListingUrl(new URL(res.url))) {
      console.error('Scrape fetch redirected off-allowlist; dropping. Final host:', new URL(res.url).hostname);
      return null;
    }
    if (!res.ok) {
      console.error(`Scrape fetch HTTP ${res.status} for host:`, parsed.hostname);
      return null;
    }
    const html = await res.text();
    return htmlToText(html.slice(0, MAX_HTML_BYTES));
  } catch (err) {
    console.error('Scrape fetch failed:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
