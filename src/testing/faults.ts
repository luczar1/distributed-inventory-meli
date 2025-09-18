import { logger } from '../core/logger';

/**
 * Fault injection configuration
 */
interface FaultConfig {
  fsErrorRate: number; // 0.0 to 1.0
  fsDelayMs: number; // milliseconds
  networkErrorRate: number; // 0.0 to 1.0
  networkDelayMs: number; // milliseconds
  enabled: boolean;
}

/**
 * Fault injection state
 */
class FaultInjector {
  private config: FaultConfig = {
    fsErrorRate: 0.0,
    fsDelayMs: 0,
    networkErrorRate: 0.0,
    networkDelayMs: 0,
    enabled: false,
  };

  private fsErrorCount = 0;
  private fsSuccessCount = 0;
  private networkErrorCount = 0;
  private networkSuccessCount = 0;

  /**
   * Configure fault injection
   */
  configure(config: Partial<FaultConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info({ config: this.config }, 'Fault injection configured');
  }

  /**
   * Enable fault injection
   */
  enable(): void {
    this.config.enabled = true;
    logger.info('Fault injection enabled');
  }

  /**
   * Disable fault injection
   */
  disable(): void {
    this.config.enabled = false;
    logger.info('Fault injection disabled');
  }

  /**
   * Reset fault injection counters
   */
  reset(): void {
    this.fsErrorCount = 0;
    this.fsSuccessCount = 0;
    this.networkErrorCount = 0;
    this.networkSuccessCount = 0;
    logger.info('Fault injection counters reset');
  }

  /**
   * Get current statistics
   */
  getStats() {
    return {
      config: this.config,
      fs: {
        errors: this.fsErrorCount,
        successes: this.fsSuccessCount,
        errorRate: this.fsErrorCount / (this.fsErrorCount + this.fsSuccessCount) || 0,
      },
      network: {
        errors: this.networkErrorCount,
        successes: this.networkSuccessCount,
        errorRate: this.networkErrorCount / (this.networkErrorCount + this.networkSuccessCount) || 0,
      },
    };
  }

  /**
   * Inject file system fault
   */
  async injectFsFault<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return operation();
    }

    // Add delay if configured
    if (this.config.fsDelayMs > 0) {
      await this.delay(this.config.fsDelayMs);
    }

    // Check if we should inject an error
    if (Math.random() < this.config.fsErrorRate) {
      this.fsErrorCount++;
      const error = new Error('Fault injection: File system error');
      (error as any).code = 'EPERM';
      logger.warn({ error }, 'Fault injection: File system error');
      throw error;
    }

    try {
      const result = await operation();
      this.fsSuccessCount++;
      return result;
    } catch (error) {
      this.fsErrorCount++;
      throw error;
    }
  }

  /**
   * Inject network fault
   */
  async injectNetworkFault<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.config.enabled) {
      return operation();
    }

    // Add delay if configured
    if (this.config.networkDelayMs > 0) {
      await this.delay(this.config.networkDelayMs);
    }

    // Check if we should inject an error
    if (Math.random() < this.config.networkErrorRate) {
      this.networkErrorCount++;
      const error = new Error('Fault injection: Network error');
      (error as any).code = 'ECONNREFUSED';
      logger.warn({ error }, 'Fault injection: Network error');
      throw error;
    }

    try {
      const result = await operation();
      this.networkSuccessCount++;
      return result;
    } catch (error) {
      this.networkErrorCount++;
      throw error;
    }
  }

  /**
   * Inject random delay
   */
  async injectDelay(maxMs: number): Promise<void> {
    if (!this.config.enabled) {
      return;
    }

    const delayMs = Math.random() * maxMs;
    await this.delay(delayMs);
  }

  /**
   * Helper to create delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create a fault-injected version of a function
   */
  wrapFsFunction<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return (async (...args: any[]) => {
      return this.injectFsFault(() => fn(...args));
    }) as T;
  }

  /**
   * Create a fault-injected version of a network function
   */
  wrapNetworkFunction<T extends (...args: any[]) => Promise<any>>(fn: T): T {
    return (async (...args: any[]) => {
      return this.injectNetworkFault(() => fn(...args));
    }) as T;
  }
}

// Global fault injector instance
export const faultInjector = new FaultInjector();

/**
 * Helper to enable fault injection for testing
 */
export function enableFaultInjection(config: Partial<FaultConfig> = {}): void {
  faultInjector.configure({
    fsErrorRate: 0.1,
    fsDelayMs: 100,
    networkErrorRate: 0.05,
    networkDelayMs: 50,
    enabled: true,
    ...config,
  });
}

/**
 * Helper to disable fault injection
 */
export function disableFaultInjection(): void {
  faultInjector.disable();
}

/**
 * Helper to reset fault injection state
 */
export function resetFaultInjection(): void {
  faultInjector.reset();
}

/**
 * Get fault injection statistics
 */
export function getFaultStats() {
  return faultInjector.getStats();
}
