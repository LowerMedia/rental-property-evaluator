/**
 * Persists the user's RentCast API key in localStorage.
 *
 * Key: 'rpe:connectors:rentcast'
 *
 * The key is read on Evaluator mount, on Settings modal close, and when the
 * user triggers an autofill lookup. It is never transmitted to any server
 * except the user's own API calls to RentCast.
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
