/** Codes that identify why a RentCast request failed. */
export type RentCastErrorCode = 'not_found' | 'bad_key' | 'rate_limit' | 'unknown';

/** Thrown by fetchPropertyData on any RentCast API error. */
export class RentCastError extends Error {
  constructor(
    public readonly code: RentCastErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'RentCastError';
  }
}

/**
 * Property data returned after a successful autofill lookup.
 * Fields sourced from /properties are null when RentCast returns no record.
 */
export interface PropertyData {
  /** AVM mid-point estimate from /avm/value */
  purchasePrice: number;
  /** Monthly rent estimate from /avm/rent/long-term */
  grossRent: number;
  /** Square footage from /properties — null if not found */
  sqft: number | null;
  /** Unit count from /properties — null if not found */
  units: number | null;
  /** Annual property taxes from /properties — null if not found */
  annualTaxes: number | null;
  /** Bedroom count from /properties — null if not found (RPE-48) */
  bedrooms: number | null;
  /** Bathroom count from /properties — null if not found (RPE-48) */
  bathrooms: number | null;
  /** Year built from /properties — null if not found (RPE-48) */
  yearBuilt: number | null;
}
