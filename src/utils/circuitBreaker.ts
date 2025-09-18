import { logger } from '../core/logger';
import { config } from '../core/config';

export type CircuitBreakerState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  name: string;
  failureThreshold: number;
  cooldownMs: number;
  timeoutMs?: number;
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  lastFailureTime?: number;
  lastSuccessTime?: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = 'closed';
  private failures = 0;
  private successes = 0;
  private lastFailureTime?: number;
  private lastSuccessTime?: number;
  private halfOpenProbe?: Promise<unknown>;

  constructor(private options: CircuitBreakerOptions) {
    logger.info({ 
      name: options.name, 
      failureThreshold: options.failureThreshold,
      cooldownMs: options.cooldownMs 
    }, 'Circuit breaker created');
  }

  /**
   * Check if circuit breaker is open
   */
  isOpen(): boolean {
    return this.state === 'open';
  }

  /**
   * Execute a function through the circuit breaker
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (this.shouldAttemptReset()) {
        this.state = 'half-open';
        logger.info({ name: this.options.name }, 'Circuit breaker transitioning to half-open');
      } else {
        throw new Error(`Circuit breaker ${this.options.name} is open`);
      }
    }

    if (this.state === 'half-open') {
      if (this.halfOpenProbe) {
        // Wait for existing probe to complete
        await this.halfOpenProbe;
        // After waiting, check if we're still in half-open state
        if (this.state !== 'half-open') {
          // State changed while waiting, retry the execution
          return this.execute(fn);
        }
      }
      // Set the probe promise to track this execution
      this.halfOpenProbe = this.executeWithTimeout(fn);
    }

    try {
      const result = this.state === 'half-open' 
        ? await this.halfOpenProbe!
        : await this.executeWithTimeout(fn);
      
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    } finally {
      if (this.state === 'half-open') {
        this.halfOpenProbe = undefined;
      }
    }
  }

  /**
   * Execute function with optional timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>): Promise<T> {
    if (!this.options.timeoutMs) {
      return await fn();
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Circuit breaker ${this.options.name} timeout`));
      }, this.options.timeoutMs);

      fn()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();
    
    if (this.state === 'half-open') {
      this.state = 'closed';
      this.failures = 0;
      logger.info({ 
        name: this.options.name,
        successes: this.successes 
      }, 'Circuit breaker closed after successful probe');
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      this.state = 'open';
      logger.warn({ 
        name: this.options.name,
        failures: this.failures 
      }, 'Circuit breaker opened after failed probe');
    } else if (this.failures >= this.options.failureThreshold) {
      this.state = 'open';
      logger.warn({ 
        name: this.options.name,
        failures: this.failures,
        threshold: this.options.failureThreshold 
      }, 'Circuit breaker opened due to failure threshold');
    }
  }

  /**
   * Check if circuit breaker should attempt reset
   */
  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) {
      return false;
    }

    const timeSinceLastFailure = Date.now() - this.lastFailureTime;
    return timeSinceLastFailure >= this.options.cooldownMs;
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  /**
   * Reset circuit breaker to closed state
   */
  reset(): void {
    this.state = 'closed';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = undefined;
    this.lastSuccessTime = undefined;
    this.halfOpenProbe = undefined;
    
    logger.info({ name: this.options.name }, 'Circuit breaker reset');
  }

  /**
   * Check if circuit breaker is available for requests
   */
  isAvailable(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      return this.shouldAttemptReset();
    }

    if (this.state === 'half-open') {
      return !this.halfOpenProbe;
    }

    return false;
  }
}

// Pre-configured circuit breakers
export const fileSystemBreaker = new CircuitBreaker({
  name: 'filesystem',
  failureThreshold: config.BREAKER_THRESHOLD,
  cooldownMs: config.BREAKER_COOLDOWN_MS,
  timeoutMs: 5000, // 5 second timeout for file operations
});

export const syncWorkerBreaker = new CircuitBreaker({
  name: 'sync-worker',
  failureThreshold: config.BREAKER_THRESHOLD,
  cooldownMs: config.BREAKER_COOLDOWN_MS,
  timeoutMs: 30000, // 30 second timeout for sync operations
});

export const apiBreaker = new CircuitBreaker({
  name: 'api',
  failureThreshold: config.BREAKER_THRESHOLD,
  cooldownMs: config.BREAKER_COOLDOWN_MS,
  timeoutMs: 10000, // 10 second timeout for API operations
});

// Circuit breaker metrics
export function getCircuitBreakerMetrics() {
  return {
    filesystem: fileSystemBreaker.getStats(),
    syncWorker: syncWorkerBreaker.getStats(),
    api: apiBreaker.getStats(),
  };
}
