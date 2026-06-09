/**
 * E7 — proxy cost guardrails (RPE-45)
 *
 * In-memory TTL cache and per-IP rate limiting for the /property proxy.
 * Both are instance-local (per serverless instance / process) — good
 * enough as a cost guardrail in front of paid provider calls; they are
 * not a distributed quota system.
 *
 * Clocks are injectable so tests never sleep.
 */

import type { IncomingMessage } from 'node:http';
import { createHash } from 'node:crypto';

// ─── Address normalization ────────────────────────────────────────────────────

/**
 * Normalize an address into a stable cache key: case-insensitive,
 * punctuation-insensitive, whitespace-collapsed. "123 Main St, Austin"
 * and "123  main st austin" hit the same entry.
 */
export function normalizeAddressKey(address: string): string {
  return address
    .toLowerCase()
    .replace(/[.,#]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Short non-reversible key-scoping hash — cached data is only served back
 * to callers presenting the same provider API key. */
export function scopeKey(apiKey: string, address: string): string {
  const keyHash = createHash('sha256').update(apiKey).digest('hex').slice(0, 16);
  return `${keyHash}|${normalizeAddressKey(address)}`;
}

// ─── TTL cache ────────────────────────────────────────────────────────────────

interface CacheEntry<T> {
  expires: number;
  payload: T;
}

/**
 * Bounded TTL cache. ttlMs <= 0 disables caching entirely (every get is
 * a miss, sets are dropped). Eviction is oldest-insertion-first once
 * maxEntries is reached.
 */
export class TtlCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(
    private readonly ttlMs: number,
    private readonly maxEntries = 500,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): T | undefined {
    if (this.ttlMs <= 0) return undefined;
    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;
    if (this.now() > entry.expires) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.payload;
  }

  set(key: string, payload: T): void {
    if (this.ttlMs <= 0) return;
    // Refresh insertion order so eviction hits the stalest key
    this.entries.delete(key);
    if (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
    this.entries.set(key, { expires: this.now() + this.ttlMs, payload });
  }

  get size(): number {
    return this.entries.size;
  }
}

// ─── Rate limiter ─────────────────────────────────────────────────────────────

export interface RateDecision {
  allowed: boolean;
  /** Seconds until the caller may retry — present when denied. */
  retryAfterSec?: number;
}

interface Window {
  windowStart: number;
  count: number;
}

const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Fixed-window limiter with two tiers per key: requests/minute and a
 * daily cap. Expired windows are pruned lazily on access; a full prune
 * runs whenever the map grows past maxKeys to bound memory.
 */
export class RateLimiter {
  private readonly perMinute = new Map<string, Window>();
  private readonly perDay = new Map<string, Window>();

  constructor(
    private readonly rpm: number,
    private readonly dailyCap: number,
    private readonly now: () => number = Date.now,
    private readonly maxKeys = 10_000,
  ) {}

  check(key: string): RateDecision {
    const ts = this.now();

    const minute = this.bump(this.perMinute, key, ts, MINUTE_MS);
    if (minute.count > this.rpm) {
      return {
        allowed: false,
        retryAfterSec: Math.ceil((minute.windowStart + MINUTE_MS - ts) / 1000),
      };
    }

    const day = this.bump(this.perDay, key, ts, DAY_MS);
    if (day.count > this.dailyCap) {
      return {
        allowed: false,
        retryAfterSec: Math.ceil((day.windowStart + DAY_MS - ts) / 1000),
      };
    }

    return { allowed: true };
  }

  private bump(map: Map<string, Window>, key: string, ts: number, windowMs: number): Window {
    let win = map.get(key);
    if (win === undefined || ts - win.windowStart >= windowMs) {
      win = { windowStart: ts, count: 0 };
      if (map.size >= this.maxKeys) this.prune(map, ts, windowMs);
      map.set(key, win);
    }
    win.count += 1;
    return win;
  }

  /**
   * Drop expired windows; if nothing expired (a key-rotation flood keeps
   * every window live), evict oldest-inserted entries so memory stays
   * bounded. An evicted live key restarts its window on next sight —
   * acceptable: under such a flood the per-key identity is already noise.
   */
  private prune(map: Map<string, Window>, ts: number, windowMs: number): void {
    for (const [key, win] of map) {
      if (ts - win.windowStart >= windowMs) map.delete(key);
    }
    while (map.size >= this.maxKeys) {
      const oldest = map.keys().next().value;
      if (oldest === undefined) break;
      map.delete(oldest);
    }
  }
}

// ─── Client identity ──────────────────────────────────────────────────────────

/**
 * Best-effort client IP: first hop of X-Forwarded-For (set by the edge in
 * serverless deployments), falling back to the socket address.
 *
 * Trust boundary: XFF is client-spoofable when this server is exposed
 * directly (no edge proxy overwriting the header). The limiter therefore
 * hard-caps its key maps (see RateLimiter.prune) so spoofing can dilute
 * per-client fairness but cannot exhaust memory; deploy behind an edge
 * for the per-IP guarantee to hold.
 */
export function clientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  if (typeof first === 'string' && first.trim() !== '') {
    const hop = first.split(',')[0]?.trim();
    if (hop) return hop;
  }
  return req.socket?.remoteAddress ?? 'unknown';
}
