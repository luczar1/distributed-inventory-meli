/**
 * Centralized Resilience Configuration
 * 
 * Environment-driven configuration with typed defaults for resilience features:
 * - Concurrency control
 * - Rate limiting
 * - Circuit breakers
 * - Retry policies
 * - Load shedding
 * - Idempotency TTL
 */

export interface ResilienceConfig {
  // Concurrency Control
  readonly CONCURRENCY_API: number;
  readonly CONCURRENCY_SYNC: number;
  
  // Rate Limiting
  readonly RATE_LIMIT_RPS: number;
  readonly RATE_LIMIT_BURST: number;
  
  // Circuit Breaker
  readonly BREAKER_THRESHOLD: number;
  readonly BREAKER_COOLDOWN_MS: number;
  
  // Retry Policy
  readonly RETRY_BASE_MS: number;
  readonly RETRY_TIMES: number;
  
  // Event Processing
  readonly SNAPSHOT_EVERY_N_EVENTS: number;
  
  // Load Shedding
  readonly LOAD_SHED_QUEUE_MAX: number;
  
  // Idempotency
  readonly IDEMP_TTL_MS: number;
}

/**
 * Parse environment variable with type conversion and validation
 */
function parseEnvVar<T>(
  key: string,
  defaultValue: T,
  parser: (value: string) => T,
  validator?: (value: T) => boolean
): T {
  const envValue = process.env[key];
  
  if (envValue === undefined) {
    return defaultValue;
  }
  
  try {
    const parsed = parser(envValue);
    
    if (validator && !validator(parsed)) {
      console.warn(`Invalid value for ${key}: ${envValue}. Using default: ${defaultValue}`);
      return defaultValue;
    }
    
    return parsed;
  } catch (error) {
    console.warn(`Failed to parse ${key}: ${envValue}. Using default: ${defaultValue}`);
    return defaultValue;
  }
}

/**
 * Parse integer with validation
 */
function parseIntWithValidation(
  key: string,
  defaultValue: number,
  min: number = 0,
  max: number = Number.MAX_SAFE_INTEGER
): number {
  return parseEnvVar(
    key,
    defaultValue,
    (value) => parseInt(value, 10),
    (value) => value >= min && value <= max && Number.isInteger(value)
  );
}

/**
 * Parse positive integer
 */
function parsePositiveInt(key: string, defaultValue: number): number {
  return parseIntWithValidation(key, defaultValue, 1);
}

/**
 * Parse non-negative integer
 */
function parseNonNegativeInt(key: string, defaultValue: number): number {
  return parseIntWithValidation(key, defaultValue, 0);
}

/**
 * Parse positive float
 */
function parsePositiveFloat(key: string, defaultValue: number): number {
  return parseEnvVar(
    key,
    defaultValue,
    (value) => parseFloat(value),
    (value) => value > 0 && Number.isFinite(value)
  );
}

/**
 * Parse non-negative float
 */
function parseNonNegativeFloat(key: string, defaultValue: number): number {
  return parseEnvVar(
    key,
    defaultValue,
    (value) => parseFloat(value),
    (value) => value >= 0 && Number.isFinite(value)
  );
}

/**
 * Resilience configuration with environment-driven settings
 */
export const config: ResilienceConfig = Object.freeze({
  // Concurrency Control
  CONCURRENCY_API: parsePositiveInt('CONCURRENCY_API', 16),
  CONCURRENCY_SYNC: parsePositiveInt('CONCURRENCY_SYNC', 4),
  
  // Rate Limiting (requests per second)
  RATE_LIMIT_RPS: parsePositiveFloat('RATE_LIMIT_RPS', 100.0),
  RATE_LIMIT_BURST: parsePositiveInt('RATE_LIMIT_BURST', 200),
  
  // Circuit Breaker (failure threshold percentage)
  BREAKER_THRESHOLD: parseNonNegativeFloat('BREAKER_THRESHOLD', 0.5), // 50%
  BREAKER_COOLDOWN_MS: parsePositiveInt('BREAKER_COOLDOWN_MS', 30000), // 30 seconds
  
  // Retry Policy
  RETRY_BASE_MS: parsePositiveInt('RETRY_BASE_MS', 1000), // 1 second
  RETRY_TIMES: parseNonNegativeInt('RETRY_TIMES', 3),
  
  // Event Processing
  SNAPSHOT_EVERY_N_EVENTS: parsePositiveInt('SNAPSHOT_EVERY_N_EVENTS', 100),
  
  // Load Shedding
  LOAD_SHED_QUEUE_MAX: parsePositiveInt('LOAD_SHED_QUEUE_MAX', 1000),
  
  // Idempotency TTL (time to live in milliseconds)
  IDEMP_TTL_MS: parsePositiveInt('IDEMP_TTL_MS', 300000), // 5 minutes
});

/**
 * Get configuration value by key
 */
export function getConfigValue<K extends keyof ResilienceConfig>(key: K): ResilienceConfig[K] {
  return config[key];
}

/**
 * Check if configuration is valid
 */
export function validateConfig(): boolean {
  const issues: string[] = [];
  
  // Validate concurrency settings
  if (config.CONCURRENCY_API <= 0) {
    issues.push('CONCURRENCY_API must be positive');
  }
  
  if (config.CONCURRENCY_SYNC <= 0) {
    issues.push('CONCURRENCY_SYNC must be positive');
  }
  
  // Validate rate limiting
  if (config.RATE_LIMIT_RPS <= 0) {
    issues.push('RATE_LIMIT_RPS must be positive');
  }
  
  if (config.RATE_LIMIT_BURST <= 0) {
    issues.push('RATE_LIMIT_BURST must be positive');
  }
  
  // Validate circuit breaker
  if (config.BREAKER_THRESHOLD < 0 || config.BREAKER_THRESHOLD > 1) {
    issues.push('BREAKER_THRESHOLD must be between 0 and 1');
  }
  
  if (config.BREAKER_COOLDOWN_MS <= 0) {
    issues.push('BREAKER_COOLDOWN_MS must be positive');
  }
  
  // Validate retry policy
  if (config.RETRY_BASE_MS <= 0) {
    issues.push('RETRY_BASE_MS must be positive');
  }
  
  if (config.RETRY_TIMES < 0) {
    issues.push('RETRY_TIMES must be non-negative');
  }
  
  // Validate event processing
  if (config.SNAPSHOT_EVERY_N_EVENTS <= 0) {
    issues.push('SNAPSHOT_EVERY_N_EVENTS must be positive');
  }
  
  // Validate load shedding
  if (config.LOAD_SHED_QUEUE_MAX <= 0) {
    issues.push('LOAD_SHED_QUEUE_MAX must be positive');
  }
  
  // Validate idempotency
  if (config.IDEMP_TTL_MS <= 0) {
    issues.push('IDEMP_TTL_MS must be positive');
  }
  
  if (issues.length > 0) {
    console.error('Configuration validation failed:', issues);
    return false;
  }
  
  return true;
}

/**
 * Get configuration summary for logging
 */
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
  };
}
