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
    const value = localStorage.getItem(STORAGE_KEY);
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed !== '' ? trimmed : null;
  } catch {
    // localStorage unavailable (private browsing, SSR, etc.)
    return null;
  }
}

export function setRentCastKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) return;
  try {
    localStorage.setItem(STORAGE_KEY, trimmed);
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
