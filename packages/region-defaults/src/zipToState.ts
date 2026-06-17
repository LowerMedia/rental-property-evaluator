/**
 * ZIP3-prefix → US state derivation (RPE-113).
 *
 * The first three digits of a US ZIP (the SCF — Sectional Center Facility)
 * map to a state via contiguous ranges. This is the static, no-I/O fallback
 * the /region endpoint uses to resolve a state when HUD SAFMR is unavailable
 * (no HUD_TOKEN, an uncovered ZIP, or a HUD outage), so location always
 * resolves to state-level defaults instead of hanging on "pending".
 *
 * Coverage: the 50 states + DC + PR. Gaps (military APO/FPO bands such as
 * 090-098 AE and 962-966 AP, and unassigned prefixes) fall through to '' →
 * national defaults. DC/PR have no STATE_RATES entry and resolve to national
 * rates, but still yield a non-empty stateCode so the UI resolves the chip.
 *
 * Source: standard USPS ZIP3 → state assignment (stable public data).
 */

/** Inclusive [lowPrefix, highPrefix, stateCode] ranges, ascending by prefix. */
const ZIP3_RANGES: ReadonlyArray<readonly [number, number, string]> = [
  [5, 5, 'NY'], // 005 Holtsville
  [6, 9, 'PR'], // 006-009 Puerto Rico / USVI (territory → national rates)
  [10, 27, 'MA'],
  [28, 29, 'RI'],
  [30, 38, 'NH'],
  [39, 49, 'ME'],
  [50, 59, 'VT'],
  [60, 69, 'CT'],
  [70, 89, 'NJ'],
  [100, 149, 'NY'],
  [150, 196, 'PA'],
  [197, 199, 'DE'],
  [200, 205, 'DC'], // territory → national rates
  [206, 219, 'MD'],
  [220, 246, 'VA'],
  [247, 268, 'WV'],
  [270, 289, 'NC'],
  [290, 299, 'SC'],
  [300, 319, 'GA'],
  [320, 349, 'FL'],
  [350, 369, 'AL'],
  [370, 385, 'TN'],
  [386, 397, 'MS'],
  [398, 399, 'GA'],
  [400, 427, 'KY'],
  [430, 459, 'OH'],
  [460, 479, 'IN'],
  [480, 499, 'MI'],
  [500, 528, 'IA'],
  [530, 549, 'WI'],
  [550, 567, 'MN'],
  [570, 577, 'SD'],
  [580, 588, 'ND'],
  [590, 599, 'MT'],
  [600, 629, 'IL'],
  [630, 658, 'MO'],
  [660, 679, 'KS'],
  [680, 693, 'NE'],
  [700, 714, 'LA'],
  [716, 729, 'AR'],
  [730, 749, 'OK'],
  [750, 799, 'TX'],
  [800, 816, 'CO'],
  [820, 831, 'WY'],
  [832, 838, 'ID'],
  [840, 847, 'UT'],
  [850, 865, 'AZ'],
  [870, 884, 'NM'],
  [885, 885, 'TX'], // El Paso special
  [889, 898, 'NV'],
  [900, 961, 'CA'],
  [967, 968, 'HI'],
  [970, 979, 'OR'],
  [980, 994, 'WA'],
  [995, 999, 'AK'],
];

/**
 * Resolve the 2-letter US state code for a ZIP from its 3-digit prefix.
 *
 * @param zip  A ZIP string; only the leading 3 digits are used (ZIP+4 ok).
 * @returns    2-letter code (e.g. 'IA'), or '' if the prefix maps to no
 *             state (military band, unassigned, or malformed input).
 */
export function stateForZip(zip: string): string {
  const match = /^\s*(\d{3})/.exec(zip);
  if (!match) return '';
  const prefix = Number(match[1]);
  for (const [lo, hi, state] of ZIP3_RANGES) {
    if (prefix >= lo && prefix <= hi) return state;
  }
  return '';
}
