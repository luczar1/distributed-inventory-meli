// Per-key async mutex for serializing functions by key
export class PerKeyMutex {
  private locks = new Map<string, Promise<unknown>>();

  async acquire<T>(key: string, fn: () => Promise<T>): Promise<T> {
    // Wait for any existing lock on this key
    const existingLock = this.locks.get(key);
    if (existingLock) {
      await existingLock;
    }

    // Create new lock for this key
    const lockPromise = this.executeWithLock(key, fn);
    this.locks.set(key, lockPromise);

    try {
      const result = await lockPromise;
      return result;
    } finally {
      // Clean up lock when done
      if (this.locks.get(key) === lockPromise) {
        this.locks.delete(key);
      }
    }
  }

  private async executeWithLock<T>(_key: string, fn: () => Promise<T>): Promise<T> {
    return await fn();
  }

  // Get current lock status for debugging
  getLockStatus(): Record<string, boolean> {
    const status: Record<string, boolean> = {};
    for (const [key] of this.locks.entries()) {
      status[key] = true; // Lock exists
    }
    return status;
  }

  // Clear all locks (for testing)
  clear(): void {
    this.locks.clear();
  }
}

// Global instance
export const perKeyMutex = new PerKeyMutex();
