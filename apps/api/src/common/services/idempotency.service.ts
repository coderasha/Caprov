import { Injectable } from '@nestjs/common';

/**
 * Idempotency key storage - prevents duplicate processing of the same request
 * Keys are mapped to their response, so retried requests return the same result
 */
@Injectable()
export class IdempotencyService {
  private cache = new Map<string, { timestamp: number; response: any }>();
  private readonly MAX_AGE = 24 * 60 * 60 * 1000; // 24 hours
  private readonly MAX_KEYS = 10000; // Prevent unbounded memory growth
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Clean up expired keys every 1 hour
    this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 60 * 1000);
  }

  /**
   * Store response for an idempotency key
   */
  set(key: string, response: any): void {
    // Evict oldest entries if cache is too large
    if (this.cache.size >= this.MAX_KEYS) {
      const oldestKey = Array.from(this.cache.entries()).sort(
        ([, a], [, b]) => a.timestamp - b.timestamp,
      )[0]?.[0];
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      timestamp: Date.now(),
      response,
    });
  }

  /**
   * Retrieve response for an idempotency key
   * Returns undefined if not found or expired
   */
  get(key: string): any | undefined {
    const entry = this.cache.get(key);
    if (!entry) {
      return undefined;
    }

    const age = Date.now() - entry.timestamp;
    if (age > this.MAX_AGE) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.response;
  }

  /**
   * Check if a key exists
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.MAX_AGE) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Destroy cleanup interval on termination
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Clear all cached responses (useful for testing)
   */
  clear(): void {
    this.cache.clear();
  }
}
