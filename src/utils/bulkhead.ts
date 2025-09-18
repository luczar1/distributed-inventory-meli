import { logger } from '../core/logger';

export interface BulkheadOptions {
  name: string;
  limit: number;
  queueSize?: number;
}

export interface BulkheadStats {
  name: string;
  active: number;
  queued: number;
  completed: number;
  rejected: number;
  limit: number;
  queueSize: number;
}

export class Bulkhead {
  private active = 0;
  private queued = 0;
  private completed = 0;
  private rejected = 0;
  private queue: Array<() => void> = [];

  constructor(private options: BulkheadOptions) {
    logger.info({ 
      name: options.name, 
      limit: options.limit,
      queueSize: options.queueSize || 0 
    }, 'Bulkhead created');
  }

  /**
   * Execute a function through the bulkhead
   */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const execute = async () => {
        this.active++;
        
        try {
          const result = await fn();
          this.completed++;
          resolve(result);
        } catch (error) {
          this.completed++;
          reject(error);
        } finally {
          this.active--;
          this.processQueue();
        }
      };

      if (this.active < this.options.limit) {
        // Can execute immediately
        execute();
      } else if (this.queue.length < (this.options.queueSize || 0)) {
        // Can queue the request
        this.queued++;
        this.queue.push(execute);
        logger.debug({ 
          name: this.options.name,
          queued: this.queued,
          active: this.active 
        }, 'Request queued in bulkhead');
      } else {
        // Reject the request
        this.rejected++;
        logger.warn({ 
          name: this.options.name,
          rejected: this.rejected,
          active: this.active,
          queued: this.queued 
        }, 'Request rejected by bulkhead');
        reject(new Error(`Bulkhead ${this.options.name} is at capacity`));
      }
    });
  }

  /**
   * Process queued requests when capacity becomes available
   */
  private processQueue(): void {
    if (this.queue.length === 0 || this.active >= this.options.limit) {
      return;
    }

    const next = this.queue.shift();
    if (next) {
      this.queued--;
      next();
    }
  }

  /**
   * Get current bulkhead statistics
   */
  getStats(): BulkheadStats {
    return {
      name: this.options.name,
      active: this.active,
      queued: this.queued,
      completed: this.completed,
      rejected: this.rejected,
      limit: this.options.limit,
      queueSize: this.options.queueSize || 0,
    };
  }

  /**
   * Check if bulkhead can accept new requests
   */
  canAccept(): boolean {
    return this.active < this.options.limit || 
           this.queue.length < (this.options.queueSize || 0);
  }

  /**
   * Get current utilization percentage
   */
  getUtilization(): number {
    return (this.active / this.options.limit) * 100;
  }

  /**
   * Reset bulkhead statistics
   */
  reset(): void {
    this.active = 0;
    this.queued = 0;
    this.completed = 0;
    this.rejected = 0;
    this.queue = [];
    
    logger.info({ name: this.options.name }, 'Bulkhead reset');
  }

  /**
   * Drain the queue (reject all queued requests)
   */
  drain(): void {
    const queuedCount = this.queue.length;
    this.queue = [];
    this.queued = 0;
    this.rejected += queuedCount;
    
    logger.info({ 
      name: this.options.name,
      drained: queuedCount 
    }, 'Bulkhead queue drained');
  }
}

// Pre-configured bulkheads for different resource types
export const apiBulkhead = new Bulkhead({
  name: 'api',
  limit: 16, // Allow 16 concurrent API operations
  queueSize: 100, // Queue up to 100 requests
});

export const syncBulkhead = new Bulkhead({
  name: 'sync',
  limit: 4, // Allow 4 concurrent sync operations
  queueSize: 50, // Queue up to 50 sync requests
});

export const fileSystemBulkhead = new Bulkhead({
  name: 'filesystem',
  limit: 8, // Allow 8 concurrent file operations
  queueSize: 200, // Queue up to 200 file operations
});

// Bulkhead metrics
export function getBulkheadMetrics() {
  return {
    api: apiBulkhead.getStats(),
    sync: syncBulkhead.getStats(),
    filesystem: fileSystemBulkhead.getStats(),
  };
}
