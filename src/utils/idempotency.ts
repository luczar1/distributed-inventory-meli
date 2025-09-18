import { createHash } from 'crypto';

// In-memory idempotency key storage with TTL
interface IdempotencyEntry<T = unknown> {
  result: T;
  timestamp: number;
  ttl: number;
  status: 'pending' | 'completed' | 'failed';
  resultHash?: string;
  createdAt: number;
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

  /**
   * Compute hash for payload to detect semantic equality
   */
  private computeHash(payload: unknown): string {
    // Handle null, undefined, and non-objects
    if (payload === null) {
      return createHash('sha256').update('null').digest('hex');
    }

    if (payload === undefined) {
      return createHash('sha256').update('undefined').digest('hex');
    }

    if (typeof payload !== 'object') {
      return createHash('sha256').update(JSON.stringify(payload)).digest('hex');
    }

    const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
    return createHash('sha256').update(payloadStr).digest('hex');
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

  async set<T>(key: string, result: T, ttl?: number, status: 'pending' | 'completed' | 'failed' = 'completed'): Promise<void> {
    this.store.set(key, {
      result,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl,
      status,
      createdAt: Date.now(),
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

  /**
   * Check idempotency with payload hash for conflict detection
   */
  async checkIdempotency<T>(key: string, payload: unknown): Promise<{
    isIdempotent: boolean;
    result?: T;
    conflict?: boolean;
  }> {
    const entry = this.store.get(key);
    if (!entry) {
      return { isIdempotent: false };
    }

    // Check if expired
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return { isIdempotent: false };
    }

    // Compute hash for current payload
    const currentHash = this.computeHash(payload);
    const storedHash = entry.resultHash || this.computeHash(entry.result);

    // If hashes match, it's idempotent
    if (currentHash === storedHash) {
      return {
        isIdempotent: true,
        result: entry.result as T,
      };
    }

    // If hashes don't match, it's a conflict
    return {
      isIdempotent: false,
      conflict: true,
    };
  }

  /**
   * Set idempotency entry with payload hash
   */
  async setIdempotent<T>(key: string, result: T, payload: unknown, ttl?: number, status: 'pending' | 'completed' | 'failed' = 'completed'): Promise<void> {
    const payloadHash = this.computeHash(payload);
    this.store.set(key, {
      result,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTtl,
      status,
      resultHash: payloadHash,
      createdAt: Date.now(),
    });
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
  getStats(): { 
    total: number; 
    expired: number; 
    pending: number; 
    completed: number; 
    failed: number;
  } {
    const now = Date.now();
    let expired = 0;
    let pending = 0;
    let completed = 0;
    let failed = 0;
    
    for (const entry of this.store.values()) {
      if (now - entry.timestamp > entry.ttl) {
        expired++;
      } else {
        switch (entry.status) {
          case 'pending':
            pending++;
            break;
          case 'completed':
            completed++;
            break;
          case 'failed':
            failed++;
            break;
        }
      }
    }

    return {
      total: this.store.size,
      expired,
      pending,
      completed,
      failed,
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
