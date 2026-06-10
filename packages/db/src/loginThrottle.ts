/**
 * E11 — login brute-force throttle (RPE-91)
 *
 * Per-account AND per-IP failed-attempt tracking with progressive
 * lockout, enforced inside better-auth via before/after hooks on the
 * sign-in path (the hook layer sees the parsed body, so the account key
 * is the submitted email — no request-stream games in the dispatcher).
 *
 * Policy (fixed-window failures → escalating lockout):
 *   - 5 failures within 15 min → 1 min lockout
 *   - each further failure doubles the lockout, capped at 1 h
 *   - any successful sign-in clears both keys
 *
 * In-memory, like the RPE-76 limiters — a shared store is required
 * before horizontal scaling. Maps are hard-capped so spoofed keys can't
 * exhaust memory (same defense as RateLimiter.prune).
 */

export interface ThrottlePolicy {
  windowMs: number;
  threshold: number;
  baseLockoutMs: number;
  maxLockoutMs: number;
}

/** RPE-91 sign-in default: 5 failures/15 min → 1 min, doubling to 1 h. */
const DEFAULT_POLICY: ThrottlePolicy = {
  windowMs: 15 * 60 * 1000,
  threshold: 5,
  baseLockoutMs: 60 * 1000,
  maxLockoutMs: 60 * 60 * 1000,
};

const MAX_KEYS = 10_000;

interface FailureState {
  windowStart: number;
  failures: number;
  lockedUntil: number;
}

export interface ThrottleDecision {
  allowed: boolean;
  retryAfterSec?: number;
}

export class LoginThrottle {
  private readonly states = new Map<string, FailureState>();
  private readonly policy: ThrottlePolicy;

  constructor(
    private readonly now: () => number = Date.now,
    policy: Partial<ThrottlePolicy> = {},
  ) {
    this.policy = { ...DEFAULT_POLICY, ...policy };
  }

  /** Check both identity keys — deny if either is locked out. */
  check(email: string, ip: string): ThrottleDecision {
    for (const key of this.keys(email, ip)) {
      const state = this.states.get(key);
      if (state !== undefined && state.lockedUntil > this.now()) {
        return {
          allowed: false,
          retryAfterSec: Math.ceil((state.lockedUntil - this.now()) / 1000),
        };
      }
    }
    return { allowed: true };
  }

  /** Record a failed attempt against both keys; escalate past the threshold. */
  onFailure(email: string, ip: string): void {
    const ts = this.now();
    for (const key of this.keys(email, ip)) {
      let state = this.states.get(key);
      if (state === undefined || ts - state.windowStart >= this.policy.windowMs) {
        if (this.states.size >= MAX_KEYS) this.prune(ts);
        state = { windowStart: ts, failures: 0, lockedUntil: 0 };
        this.states.set(key, state);
      }
      state.failures += 1;
      if (state.failures >= this.policy.threshold) {
        // Progressive: base lockout at the threshold, doubling per extra failure
        const escalations = state.failures - this.policy.threshold;
        state.lockedUntil =
          ts + Math.min(this.policy.baseLockoutMs * 2 ** escalations, this.policy.maxLockoutMs);
      }
    }
  }

  /** Successful sign-in clears both keys. */
  onSuccess(email: string, ip: string): void {
    for (const key of this.keys(email, ip)) this.states.delete(key);
  }

  private keys(email: string, ip: string): [string, string] {
    return [`acct:${email.toLowerCase()}`, `ip:${ip}`];
  }

  private prune(ts: number): void {
    for (const [key, state] of this.states) {
      if (ts - state.windowStart >= this.policy.windowMs && state.lockedUntil <= ts) this.states.delete(key);
    }
    while (this.states.size >= MAX_KEYS) {
      const oldest = this.states.keys().next().value;
      if (oldest === undefined) break;
      this.states.delete(oldest);
    }
  }
}
