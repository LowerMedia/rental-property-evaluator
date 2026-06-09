/**
 * E7 — paste-listing-text parser (RPE-52)
 *
 * Parses listing text the user copied from any site into a partial
 * PropertyLookup via labeled-number heuristics. Zero keys, zero cost,
 * zero ToS exposure — the double fallback when the licensed API and the
 * (flagged) scrape tier produce nothing.
 *
 * Heuristics, not extraction: everything is tagged source 'paste' at
 * 'low' confidence except explicitly labeled dollar amounts ('medium'),
 * and the whole result is meant to flow through the same review panel
 * as every other lookup.
 */

import type { LookupConfidence, LookupField, PropertyLookup } from './types';

const SOURCE = 'paste';

function field(value: number, confidence: LookupConfidence): LookupField {
  return { value, source: SOURCE, confidence };
}

/** "342,000" / "342000" / "1.2M" / "950k" → number (null when unparseable). */
function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[,$\s]/g, '').toLowerCase();
  const m = cleaned.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (!m || m[1] === undefined) return null;
  const base = Number(m[1]);
  if (!Number.isFinite(base)) return null;
  const mult = m[2] === 'm' ? 1_000_000 : m[2] === 'k' ? 1_000 : 1;
  return base * mult;
}

const AMOUNT = String.raw`\$?\s*([\d,]+(?:\.\d+)?\s*[kKmM]?)`;

/** First capture of the first pattern that matches — patterns are tried in order. */
function firstMatch(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const m = text.match(pattern);
    if (m?.[1] !== undefined) {
      const value = parseAmount(m[1]);
      if (value !== null && value > 0) return value;
    }
  }
  return null;
}

/**
 * Parse pasted listing text into a partial PropertyLookup.
 *
 * Fields it hunts for: list price, monthly rent, annual taxes, beds,
 * baths, sqft, year built. Anything it can't find is simply absent —
 * the resolver and review panel handle partial results.
 */
export function parseListingText(text: string): PropertyLookup {
  const lookup: PropertyLookup = {};
  if (text.trim() === '') return lookup;

  // Normalize whitespace; keep newlines as plain spaces — labels and
  // values frequently end up on separate lines when copied
  const t = text.replace(/\s+/g, ' ');

  // ── Price ─────────────────────────────────────────────────────────────
  // Labeled price ("List price: $342,000", "asking $342K") is medium
  // confidence; a bare leading "$342,000" (how Zillow/Redfin copies open)
  // is low.
  const labeledPrice = firstMatch(t, [
    new RegExp(String.raw`(?:list(?:ed)?\s*(?:price|at)|asking(?:\s*price)?|price[d]?(?:\s*at)?)\s*[:\-]?\s*${AMOUNT}`, 'i'),
    new RegExp(String.raw`${AMOUNT}\s*(?:list\s*price|asking)`, 'i'),
  ]);
  const barePrice = labeledPrice === null
    ? firstMatch(t, [new RegExp(String.raw`\$\s*([\d,]{6,}(?:\.\d+)?|[\d.]+\s*[mM]|\d{3,}\s*[kK])`)])
    : null;
  const price = labeledPrice ?? barePrice;
  if (price !== null && price >= 10_000) {
    lookup.purchasePrice = field(price, labeledPrice !== null ? 'medium' : 'low');
  }

  // ── Rent ──────────────────────────────────────────────────────────────
  const rent = firstMatch(t, [
    new RegExp(String.raw`(?:rent(?:\s*estimate|\s*zestimate)?|estimated\s*rent)\s*[:\-]?\s*${AMOUNT}(?:\s*/\s*mo|\s*per\s*month|\s*monthly)?`, 'i'),
    new RegExp(String.raw`${AMOUNT}\s*(?:/\s*mo\b|per\s*month)`, 'i'),
  ]);
  if (rent !== null && rent >= 100 && rent <= 50_000) {
    lookup.grossRent = field(rent, 'medium');
  }

  // ── Annual taxes ──────────────────────────────────────────────────────
  const taxes = firstMatch(t, [
    new RegExp(String.raw`(?:annual\s*tax(?:es)?|property\s*tax(?:es)?|tax(?:es)?)\s*(?:amount|bill)?\s*(?:\(\d{4}\))?\s*[:\-]?\s*${AMOUNT}(?:\s*/\s*yr|\s*per\s*year|\s*annually)?`, 'i'),
  ]);
  if (taxes !== null && taxes >= 50 && taxes <= 500_000) {
    lookup.annualTaxes = field(taxes, 'medium');
  }

  // ── Beds / baths ──────────────────────────────────────────────────────
  const beds = t.match(/(\d{1,2})\s*(?:bds?|beds?|bedrooms?)\b/i);
  if (beds?.[1] !== undefined) {
    const n = Number(beds[1]);
    if (n >= 1 && n <= 20) lookup.bedrooms = field(n, 'low');
  }
  const baths = t.match(/(\d{1,2}(?:\.\d)?)\s*(?:ba(?:ths?)?|bathrooms?)\b/i);
  if (baths?.[1] !== undefined) {
    const n = Number(baths[1]);
    if (n >= 0.5 && n <= 20) lookup.bathrooms = field(n, 'low');
  }

  // ── Sqft ──────────────────────────────────────────────────────────────
  const sqft = t.match(/([\d,]{3,6})\s*(?:sq\.?\s*ft\.?|sqft|square\s*feet)\b/i);
  if (sqft?.[1] !== undefined) {
    const n = parseAmount(sqft[1]);
    if (n !== null && n >= 100 && n <= 100_000) lookup.sqft = field(n, 'low');
  }

  // ── Year built ────────────────────────────────────────────────────────
  const year = t.match(/(?:built\s*(?:in)?|year\s*built)\s*[:-]?\s*(\d{4})\b/i);
  if (year?.[1] !== undefined) {
    const n = Number(year[1]);
    if (n >= 1700 && n <= 2100) lookup.yearBuilt = field(n, 'low');
  }

  return lookup;
}
