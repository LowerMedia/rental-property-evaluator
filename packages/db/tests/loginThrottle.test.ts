/**
 * RPE-91: LoginThrottle unit tests — threshold, progressive escalation,
 * window expiry, success reset, dual-key (account + IP) behavior.
 */

import { describe, it, expect } from 'vitest';
import { LoginThrottle } from '../src/loginThrottle';

const MIN = 60 * 1000;

function throttleAt(start = 0) {
  let now = start;
  const t = new LoginThrottle(() => now);
  return { t, tick: (ms: number) => (now += ms) };
}

describe('LoginThrottle', () => {
  it('allows up to 4 failures, locks on the 5th for 1 minute', () => {
    const { t, tick } = throttleAt();
    for (let i = 0; i < 4; i++) {
      t.onFailure('a@x.com', '1.1.1.1');
      expect(t.check('a@x.com', '1.1.1.1').allowed).toBe(true);
    }
    t.onFailure('a@x.com', '1.1.1.1'); // 5th
    const denied = t.check('a@x.com', '1.1.1.1');
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSec).toBe(60);

    tick(MIN + 1);
    expect(t.check('a@x.com', '1.1.1.1').allowed).toBe(true);
  });

  it('escalates: each failure past the threshold doubles the lockout, capped at 1h', () => {
    const { t, tick } = throttleAt();
    for (let i = 0; i < 5; i++) t.onFailure('a@x.com', '1.1.1.1');
    tick(MIN + 1); // first lockout expires
    t.onFailure('a@x.com', '1.1.1.1'); // 6th in window → 2 min
    expect(t.check('a@x.com', '1.1.1.1').retryAfterSec).toBe(120);

    // hammer it — lockout caps at one hour
    for (let i = 0; i < 20; i++) t.onFailure('a@x.com', '1.1.1.1');
    expect(t.check('a@x.com', '1.1.1.1').retryAfterSec).toBeLessThanOrEqual(3600);
  });

  it('locks the account from any IP, and the IP for any account', () => {
    const { t } = throttleAt();
    for (let i = 0; i < 5; i++) t.onFailure('victim@x.com', '9.9.9.9');
    // account locked even from a fresh IP
    expect(t.check('victim@x.com', '2.2.2.2').allowed).toBe(false);
    // IP locked even for a fresh account
    expect(t.check('other@x.com', '9.9.9.9').allowed).toBe(false);
    // unrelated pair unaffected
    expect(t.check('other@x.com', '2.2.2.2').allowed).toBe(true);
  });

  it('success clears both keys; the window expires stale counts', () => {
    const { t, tick } = throttleAt();
    for (let i = 0; i < 4; i++) t.onFailure('a@x.com', '1.1.1.1');
    t.onSuccess('a@x.com', '1.1.1.1');
    for (let i = 0; i < 4; i++) t.onFailure('a@x.com', '1.1.1.1');
    expect(t.check('a@x.com', '1.1.1.1').allowed).toBe(true); // counter restarted

    tick(15 * MIN + 1); // window expiry
    t.onFailure('a@x.com', '1.1.1.1');
    expect(t.check('a@x.com', '1.1.1.1').allowed).toBe(true); // fresh window, count=1
  });

  it('is case-insensitive on the account key', () => {
    const { t } = throttleAt();
    for (let i = 0; i < 5; i++) t.onFailure('User@X.com', '1.1.1.1');
    expect(t.check('user@x.com', '3.3.3.3').allowed).toBe(false);
  });
});
