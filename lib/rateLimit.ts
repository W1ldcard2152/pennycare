import { NextRequest } from 'next/server';

interface RateLimitEntry {
  timestamps: number[];
}

export class RateLimiter {
  private store = new Map<string, RateLimitEntry>();
  private windowMs: number;
  private maxRequests: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;

    // Sweep expired entries every 60 seconds (avoid in test environments)
    if (typeof globalThis !== 'undefined' && !process.env.VITEST) {
      this.cleanupTimer = setInterval(() => this.cleanup(), 60_000);
      // Don't block process exit
      if (this.cleanupTimer?.unref) this.cleanupTimer.unref();
    }
  }

  /**
   * Check if a request is allowed and record the attempt.
   * Returns whether the request is allowed, remaining attempts, and retry delay.
   */
  check(key: string): { allowed: boolean; remaining: number; retryAfterMs?: number } {
    const now = Date.now();
    const entry = this.store.get(key) || { timestamps: [] };

    // Remove timestamps outside the current window
    entry.timestamps = entry.timestamps.filter(t => t > now - this.windowMs);

    if (entry.timestamps.length >= this.maxRequests) {
      const oldestInWindow = entry.timestamps[0];
      const retryAfterMs = oldestInWindow + this.windowMs - now;
      this.store.set(key, entry);
      return { allowed: false, remaining: 0, retryAfterMs };
    }

    entry.timestamps.push(now);
    this.store.set(key, entry);
    return { allowed: true, remaining: this.maxRequests - entry.timestamps.length };
  }

  /**
   * Record a failed attempt without checking (for account lockout tracking).
   */
  recordFailure(key: string): void {
    const now = Date.now();
    const entry = this.store.get(key) || { timestamps: [] };
    entry.timestamps = entry.timestamps.filter(t => t > now - this.windowMs);
    entry.timestamps.push(now);
    this.store.set(key, entry);
  }

  /**
   * Check if a key is currently locked without recording an attempt.
   */
  isLocked(key: string): { locked: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const entry = this.store.get(key);
    if (!entry) return { locked: false };

    const active = entry.timestamps.filter(t => t > now - this.windowMs);
    if (active.length >= this.maxRequests) {
      const retryAfterMs = active[0] + this.windowMs - now;
      return { locked: true, retryAfterMs };
    }
    return { locked: false };
  }

  /**
   * Reset a key (e.g., on successful login to clear lockout).
   */
  reset(key: string): void {
    this.store.delete(key);
  }

  /**
   * Remove all entries with no active timestamps.
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      entry.timestamps = entry.timestamps.filter(t => t > now - this.windowMs);
      if (entry.timestamps.length === 0) {
        this.store.delete(key);
      }
    }
  }

  /** Visible for testing */
  get size(): number {
    return this.store.size;
  }
}

// ── Pre-configured instances ─────────────────────────

/** 10 login attempts per 15 minutes per IP */
export const loginLimiter = new RateLimiter(15 * 60 * 1000, 10);

/** 3 registrations per hour per IP */
export const registerLimiter = new RateLimiter(60 * 60 * 1000, 3);

/** 5 failed password attempts per 30 minutes per email (account lockout) */
export const accountLockout = new RateLimiter(30 * 60 * 1000, 5);

// ── Helpers ──────────────────────────────────────────

export function getClientIp(request: NextRequest): string {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}
