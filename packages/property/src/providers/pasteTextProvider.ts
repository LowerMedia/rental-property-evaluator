/**
 * E7 — paste-tier PropertyProvider (RPE-52)
 *
 * Wraps parseListingText() as the last tier of the resolver chain. Pure
 * and synchronous under the hood; only fires when the request actually
 * carries pasted text.
 */

import type { LookupRequest, PropertyLookup, PropertyProvider } from '../types';
import { parseListingText } from '../pasteText';

export function createPasteTextProvider(): PropertyProvider {
  return {
    id: 'paste',
    tier: 'paste',
    supports(request: LookupRequest): boolean {
      return (request.pastedText?.trim() ?? '') !== '';
    },
    async lookup(request: LookupRequest): Promise<PropertyLookup> {
      return parseListingText(request.pastedText ?? '');
    },
  };
}
