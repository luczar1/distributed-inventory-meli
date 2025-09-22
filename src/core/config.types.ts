export interface ResilienceConfig {
  // Concurrency limits
  CONCURRENCY_API: number;
  CONCURRENCY_SYNC: number;
  
  // Rate limiting
  RATE_LIMIT_RPS: number;
  RATE_LIMIT_BURST: number;
  
  // Circuit breaker
  BREAKER_THRESHOLD: number;
  BREAKER_COOLDOWN_MS: number;
  
  // Retry configuration
  RETRY_BASE_MS: number;
  RETRY_TIMES: number;
  RETRY_JITTER_MS: number;
  
  // Snapshot configuration
  SNAPSHOT_EVERY_N_EVENTS: number;
  
  // Load shedding
  LOAD_SHED_QUEUE_MAX: number;
  
  // Idempotency
  IDEMP_TTL_MS: number;
  
  // Sync worker
  SYNC_INTERVAL_MS: number;
  
  // Logging
  LOG_LEVEL: string;
  
  // Lock configuration
  LOCKS_ENABLED: boolean;
  LOCK_TTL_MS: number;
  LOCK_RENEW_MS: number;
  LOCK_DIR: string;
  LOCK_REJECT_STATUS: number;
  LOCK_RETRY_AFTER_MS: number;
  LOCK_OWNER_ID: string;
}
