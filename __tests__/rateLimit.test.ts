import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '@/lib/rateLimit';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(60_000, 3); // 3 requests per 60 seconds
  });

  it('allows requests within the limit', () => {
    const r1 = limiter.check('user-1');
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);

    const r2 = limiter.check('user-1');
    expect(r2.allowed).toBe(true);
    expect(r2.remaining).toBe(1);

    const r3 = limiter.check('user-1');
    expect(r3.allowed).toBe(true);
    expect(r3.remaining).toBe(0);
  });

  it('blocks requests over the limit', () => {
    limiter.check('user-1');
    limiter.check('user-1');
    limiter.check('user-1');

    const r4 = limiter.check('user-1');
    expect(r4.allowed).toBe(false);
    expect(r4.remaining).toBe(0);
    expect(r4.retryAfterMs).toBeGreaterThan(0);
    expect(r4.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it('tracks keys independently', () => {
    limiter.check('user-1');
    limiter.check('user-1');
    limiter.check('user-1');

    const r = limiter.check('user-2');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('allows requests after the window expires', () => {
    vi.useFakeTimers();

    limiter.check('user-1');
    limiter.check('user-1');
    limiter.check('user-1');

    expect(limiter.check('user-1').allowed).toBe(false);

    // Advance past the window
    vi.advanceTimersByTime(61_000);

    const r = limiter.check('user-1');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);

    vi.useRealTimers();
  });

  it('reset() clears a key', () => {
    limiter.check('user-1');
    limiter.check('user-1');
    limiter.check('user-1');
    expect(limiter.check('user-1').allowed).toBe(false);

    limiter.reset('user-1');

    const r = limiter.check('user-1');
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(2);
  });

  it('recordFailure() increments without returning result', () => {
    limiter.recordFailure('user-1');
    limiter.recordFailure('user-1');
    limiter.recordFailure('user-1');

    const lockStatus = limiter.isLocked('user-1');
    expect(lockStatus.locked).toBe(true);
  });

  it('isLocked() does not increment the counter', () => {
    limiter.recordFailure('user-1');
    limiter.recordFailure('user-1');

    // Not locked yet (2 of 3)
    expect(limiter.isLocked('user-1').locked).toBe(false);

    // Calling isLocked multiple times should not change the count
    limiter.isLocked('user-1');
    limiter.isLocked('user-1');
    limiter.isLocked('user-1');

    expect(limiter.isLocked('user-1').locked).toBe(false);
  });

  it('isLocked() returns retryAfterMs when locked', () => {
    limiter.recordFailure('user-1');
    limiter.recordFailure('user-1');
    limiter.recordFailure('user-1');

    const status = limiter.isLocked('user-1');
    expect(status.locked).toBe(true);
    expect(status.retryAfterMs).toBeGreaterThan(0);
  });

  it('returns locked=false for unknown keys', () => {
    expect(limiter.isLocked('unknown').locked).toBe(false);
  });

  it('size reflects tracked keys', () => {
    expect(limiter.size).toBe(0);
    limiter.check('a');
    limiter.check('b');
    expect(limiter.size).toBe(2);
    limiter.reset('a');
    expect(limiter.size).toBe(1);
  });
});
