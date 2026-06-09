/**
 * Persists the user's RentCast API key in localStorage.
 *
 * Key: 'rpe:connectors:rentcast'
 *
 * The key belongs to the user — it is never sent anywhere except the
 * POST /property proxy call where the user explicitly triggers autofill.
 */

const STORAGE_KEY = 'rpe:connectors:rentcast';

export function getRentCastKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private browsing, SSR, etc.)
    return null;
  }
}

export function setRentCastKey(key: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Silently ignore — storage quota exceeded or unavailable
  }
}

export function clearRentCastKey(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Silently ignore
  }
}
