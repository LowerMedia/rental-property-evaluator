export {
  LOOKUP_FIELD_KEYS,
  TIER_ORDER,
  type LookupTier,
  type LookupConfidence,
  type LookupField,
  type LookupFieldKey,
  type PropertyLookup,
  type LookupRequest,
  type PropertyProvider,
  type ProviderAttempt,
  type ResolvedProperty,
  type ResolveOptions,
} from './types';

export { resolveProperty, hasPriceOrRent } from './resolveProperty';

export {
  parseListingUrl,
  type ListingHost,
  type ListingUrlResult,
  type ParsedListing,
} from './listingUrl';

export {
  createRentCastProxyProvider,
  ProviderError,
  type RentCastProxyOptions,
} from './providers/rentcastProxy';

export { parseListingText } from './pasteText';
export { createPasteTextProvider } from './providers/pasteTextProvider';
export { createScrapeProxyProvider, type ScrapeProxyOptions } from './providers/scrapeProxy';

export {
  mapLookupToDealInputs,
  applyLookupPatches,
  type DealInputPatch,
  type DealPatchTarget,
  type DealPatchValue,
  type MappedLookup,
  type ApplyResult,
} from './mapToDealInputs';
