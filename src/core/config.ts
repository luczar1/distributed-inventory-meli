import { ResilienceConfig } from './config.types';
import { 
  parsePositiveInt, 
  parseNonNegativeInt, 
  parseNonNegativeFloat 
} from './config.utils';
import { randomUUID } from 'crypto';

export const config: ResilienceConfig = Object.freeze({
  // Concurrency limits
  CONCURRENCY_API: parsePositiveInt('CONCURRENCY_API', 16),
  CONCURRENCY_SYNC: parsePositiveInt('CONCURRENCY_SYNC', 4),
  
  // Rate limiting
  RATE_LIMIT_RPS: parsePositiveInt('RATE_LIMIT_RPS', 100),
  RATE_LIMIT_BURST: parsePositiveInt('RATE_LIMIT_BURST', 200),
  
  // Circuit breaker
  BREAKER_THRESHOLD: parseNonNegativeFloat('BREAKER_THRESHOLD', 0.5),
  BREAKER_COOLDOWN_MS: parsePositiveInt('BREAKER_COOLDOWN_MS', 30000),
  
  // Retry configuration
  RETRY_BASE_MS: parsePositiveInt('RETRY_BASE_MS', 1000),
  RETRY_TIMES: parseNonNegativeInt('RETRY_TIMES', 3),
  
  // Snapshot configuration
  SNAPSHOT_EVERY_N_EVENTS: parsePositiveInt('SNAPSHOT_EVERY_N_EVENTS', 100),
  
  // Load shedding
  LOAD_SHED_QUEUE_MAX: parsePositiveInt('LOAD_SHED_QUEUE_MAX', 1000),
  
  // Idempotency
  IDEMP_TTL_MS: parsePositiveInt('IDEMP_TTL_MS', 300000),
  
  // Sync worker
  SYNC_INTERVAL_MS: parsePositiveInt('SYNC_INTERVAL_MS', 15000),
  
  // Logging
  LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  
  // Lock configuration
  LOCKS_ENABLED: process.env.LOCKS_ENABLED === 'true',
  LOCK_TTL_MS: parsePositiveInt('LOCK_TTL_MS', 2000),
  LOCK_RENEW_MS: parsePositiveInt('LOCK_RENEW_MS', 1000),
  LOCK_DIR: process.env.LOCK_DIR || 'data/locks',
  LOCK_REJECT_STATUS: parsePositiveInt('LOCK_REJECT_STATUS', 503),
  LOCK_RETRY_AFTER_MS: parsePositiveInt('LOCK_RETRY_AFTER_MS', 300),
  LOCK_OWNER_ID: `${process.pid}-${randomUUID()}`,
});

export function getConfigValue<K extends keyof ResilienceConfig>(key: K): ResilienceConfig[K] {
  return config[key];
}

function validateConcurrencyLimits(errors: string[]): void {
  if (config.CONCURRENCY_API <= 0) {
    errors.push('CONCURRENCY_API must be positive');
  }
  
  if (config.CONCURRENCY_SYNC <= 0) {
    errors.push('CONCURRENCY_SYNC must be positive');
  }
}

function validateRateLimiting(errors: string[]): void {
  if (config.RATE_LIMIT_RPS <= 0) {
    errors.push('RATE_LIMIT_RPS must be positive');
  }
  
  if (config.RATE_LIMIT_BURST <= 0) {
    errors.push('RATE_LIMIT_BURST must be positive');
  }
  
  if (config.RATE_LIMIT_BURST < config.RATE_LIMIT_RPS) {
    errors.push('RATE_LIMIT_BURST must be >= RATE_LIMIT_RPS');
  }
}

function validateCircuitBreaker(errors: string[]): void {
  if (config.BREAKER_THRESHOLD < 0 || config.BREAKER_THRESHOLD > 1) {
    errors.push('BREAKER_THRESHOLD must be between 0 and 1');
  }
  
  if (config.BREAKER_COOLDOWN_MS <= 0) {
    errors.push('BREAKER_COOLDOWN_MS must be positive');
  }
}

function validateRetryConfig(errors: string[]): void {
  if (config.RETRY_BASE_MS <= 0) {
    errors.push('RETRY_BASE_MS must be positive');
  }
  
  if (config.RETRY_TIMES < 0) {
    errors.push('RETRY_TIMES must be non-negative');
  }
}

function validateOtherConfig(errors: string[]): void {
  if (config.SNAPSHOT_EVERY_N_EVENTS <= 0) {
    errors.push('SNAPSHOT_EVERY_N_EVENTS must be positive');
  }
  
  if (config.LOAD_SHED_QUEUE_MAX <= 0) {
    errors.push('LOAD_SHED_QUEUE_MAX must be positive');
  }
  
  if (config.IDEMP_TTL_MS <= 0) {
    errors.push('IDEMP_TTL_MS must be positive');
  }
  
  if (config.SYNC_INTERVAL_MS <= 0) {
    errors.push('SYNC_INTERVAL_MS must be positive');
  }
  
  const validLogLevels = ['debug', 'info', 'warn', 'error'];
  if (!validLogLevels.includes(config.LOG_LEVEL)) {
    errors.push(`LOG_LEVEL must be one of: ${validLogLevels.join(', ')}`);
  }
}

export function validateConfig(): boolean {
  const errors: string[] = [];
  
  validateConcurrencyLimits(errors);
  validateRateLimiting(errors);
  validateCircuitBreaker(errors);
  validateRetryConfig(errors);
  validateOtherConfig(errors);
  
  if (errors.length > 0) {
    console.error('Configuration validation failed:');
    errors.forEach(error => console.error(`  - ${error}`));
    return false;
  }
  
  return true;
}

export function getConfigSummary(): Record<string, unknown> {
  return {
    concurrency: {
      api: config.CONCURRENCY_API,
      sync: config.CONCURRENCY_SYNC,
    },
    rateLimit: {
      rps: config.RATE_LIMIT_RPS,
      burst: config.RATE_LIMIT_BURST,
    },
    circuitBreaker: {
      threshold: config.BREAKER_THRESHOLD,
      cooldownMs: config.BREAKER_COOLDOWN_MS,
    },
    retry: {
      baseMs: config.RETRY_BASE_MS,
      times: config.RETRY_TIMES,
    },
    events: {
      snapshotEvery: config.SNAPSHOT_EVERY_N_EVENTS,
    },
    loadShedding: {
      queueMax: config.LOAD_SHED_QUEUE_MAX,
    },
    idempotency: {
      ttlMs: config.IDEMP_TTL_MS,
    },
    sync: {
      intervalMs: config.SYNC_INTERVAL_MS,
    },
    logging: {
      level: config.LOG_LEVEL,
    },
  };
}
