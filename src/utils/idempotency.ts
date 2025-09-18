// In-memory idempotency key storage with TTL
interface IdempotencyEntry<T = unknown> {
  result: T;
  timestamp: number;
  ttl: number;
}

export class IdempotencyStore {
  private store = new Map<string, IdempotencyEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor(private defaultTtl = 300000) { // 5 minutes default
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return null;
    }

    return entry.result as T;
  }

  async set<T>(key: string, result: T, ttl?: number): Promise<void> {
    this.store.set(key, {
      result,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl,
    });
  }

  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key);
    if (!entry) {
      return false;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return false;
    }

    return true;
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.store.delete(key);
      }
    }
  }

  // Get stats for monitoring
  getStats(): { total: number; expired: number } {
    const now = Date.now();
    let expired = 0;
    
    for (const entry of this.store.values()) {
      if (now - entry.timestamp > entry.ttl) {
        expired++;
      }
    }

    return {
      total: this.store.size,
      expired,
    };
  }

  // Clear all entries (for testing)
  clear(): void {
    this.store.clear();
  }

  // Cleanup interval
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Global instance
export const idempotencyStore = new IdempotencyStore();
