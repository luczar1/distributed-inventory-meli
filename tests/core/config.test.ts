import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { config, getConfigValue, validateConfig, getConfigSummary } from '../../src/core/config';

describe('Resilience Configuration', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    // Clear all environment variables for clean testing
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('CONCURRENCY_') || 
          key.startsWith('RATE_LIMIT_') || 
          key.startsWith('BREAKER_') || 
          key.startsWith('RETRY_') || 
          key.startsWith('SNAPSHOT_') || 
          key.startsWith('LOAD_SHED_') || 
          key.startsWith('IDEMP_')) {
        delete process.env[key];
      }
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('Default Values', () => {
    it('should have sane defaults for all configuration values', () => {
      expect(config.CONCURRENCY_API).toBe(16);
      expect(config.CONCURRENCY_SYNC).toBe(4);
      expect(config.RATE_LIMIT_RPS).toBe(100.0);
      expect(config.RATE_LIMIT_BURST).toBe(200);
      expect(config.BREAKER_THRESHOLD).toBe(0.5);
      expect(config.BREAKER_COOLDOWN_MS).toBe(30000);
      expect(config.RETRY_BASE_MS).toBe(1000);
      expect(config.RETRY_TIMES).toBe(3);
      expect(config.SNAPSHOT_EVERY_N_EVENTS).toBe(100);
      expect(config.LOAD_SHED_QUEUE_MAX).toBe(1000);
      expect(config.IDEMP_TTL_MS).toBe(300000);
    });

    it('should have positive values for all positive-required settings', () => {
      expect(config.CONCURRENCY_API).toBeGreaterThan(0);
      expect(config.CONCURRENCY_SYNC).toBeGreaterThan(0);
      expect(config.RATE_LIMIT_RPS).toBeGreaterThan(0);
      expect(config.RATE_LIMIT_BURST).toBeGreaterThan(0);
      expect(config.BREAKER_COOLDOWN_MS).toBeGreaterThan(0);
      expect(config.RETRY_BASE_MS).toBeGreaterThan(0);
      expect(config.SNAPSHOT_EVERY_N_EVENTS).toBeGreaterThan(0);
      expect(config.LOAD_SHED_QUEUE_MAX).toBeGreaterThan(0);
      expect(config.IDEMP_TTL_MS).toBeGreaterThan(0);
    });

    it('should have non-negative values for non-negative settings', () => {
      expect(config.BREAKER_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(config.RETRY_TIMES).toBeGreaterThanOrEqual(0);
    });

    it('should have threshold between 0 and 1', () => {
      expect(config.BREAKER_THRESHOLD).toBeGreaterThanOrEqual(0);
      expect(config.BREAKER_THRESHOLD).toBeLessThanOrEqual(1);
    });
  });

  describe('Configuration Access', () => {
    it('should allow accessing config values by key', () => {
      expect(getConfigValue('CONCURRENCY_API')).toBe(16);
      expect(getConfigValue('RATE_LIMIT_RPS')).toBe(100.0);
      expect(getConfigValue('BREAKER_THRESHOLD')).toBe(0.5);
      expect(getConfigValue('RETRY_TIMES')).toBe(3);
    });

    it('should return correct types for all config values', () => {
      expect(typeof getConfigValue('CONCURRENCY_API')).toBe('number');
      expect(typeof getConfigValue('CONCURRENCY_SYNC')).toBe('number');
      expect(typeof getConfigValue('RATE_LIMIT_RPS')).toBe('number');
      expect(typeof getConfigValue('RATE_LIMIT_BURST')).toBe('number');
      expect(typeof getConfigValue('BREAKER_THRESHOLD')).toBe('number');
      expect(typeof getConfigValue('BREAKER_COOLDOWN_MS')).toBe('number');
      expect(typeof getConfigValue('RETRY_BASE_MS')).toBe('number');
      expect(typeof getConfigValue('RETRY_TIMES')).toBe('number');
      expect(typeof getConfigValue('SNAPSHOT_EVERY_N_EVENTS')).toBe('number');
      expect(typeof getConfigValue('LOAD_SHED_QUEUE_MAX')).toBe('number');
      expect(typeof getConfigValue('IDEMP_TTL_MS')).toBe('number');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate default configuration as valid', () => {
      expect(validateConfig()).toBe(true);
    });
  });

  describe('Configuration Summary', () => {
    it('should provide a structured summary of all configuration values', () => {
      const summary = getConfigSummary();
      
      expect(summary).toHaveProperty('concurrency');
      expect(summary).toHaveProperty('rateLimit');
      expect(summary).toHaveProperty('circuitBreaker');
      expect(summary).toHaveProperty('retry');
      expect(summary).toHaveProperty('events');
      expect(summary).toHaveProperty('loadShedding');
      expect(summary).toHaveProperty('idempotency');
      
      expect(summary.concurrency).toEqual({
        api: 16,
        sync: 4,
      });
      
      expect(summary.rateLimit).toEqual({
        rps: 100.0,
        burst: 200,
      });
      
      expect(summary.circuitBreaker).toEqual({
        threshold: 0.5,
        cooldownMs: 30000,
      });
      
      expect(summary.retry).toEqual({
        baseMs: 1000,
        times: 3,
      });
      
      expect(summary.events).toEqual({
        snapshotEvery: 100,
      });
      
      expect(summary.loadShedding).toEqual({
        queueMax: 1000,
      });
      
      expect(summary.idempotency).toEqual({
        ttlMs: 300000,
      });
    });
  });

  describe('Configuration Immutability', () => {
    it('should have frozen configuration object', () => {
      expect(Object.isFrozen(config)).toBe(true);
    });

    it('should prevent modification of configuration values', () => {
      expect(() => {
        (config as any).CONCURRENCY_API = 999;
      }).toThrow();
      
      expect(() => {
        (config as any).RATE_LIMIT_RPS = 999.0;
      }).toThrow();
    });
  });

  describe('Environment Variable Parsing', () => {
    it('should handle undefined environment variables gracefully', () => {
      // Clear all environment variables
      Object.keys(process.env).forEach(key => {
        if (key.startsWith('CONCURRENCY_') || 
            key.startsWith('RATE_LIMIT_') || 
            key.startsWith('BREAKER_') || 
            key.startsWith('RETRY_') || 
            key.startsWith('SNAPSHOT_') || 
            key.startsWith('LOAD_SHED_') || 
            key.startsWith('IDEMP_')) {
          delete process.env[key];
        }
      });

      // Should use all defaults (config is already loaded with defaults)
      expect(config.CONCURRENCY_API).toBe(16);
      expect(config.CONCURRENCY_SYNC).toBe(4);
      expect(config.RATE_LIMIT_RPS).toBe(100.0);
      expect(config.RATE_LIMIT_BURST).toBe(200);
      expect(config.BREAKER_THRESHOLD).toBe(0.5);
      expect(config.BREAKER_COOLDOWN_MS).toBe(30000);
      expect(config.RETRY_BASE_MS).toBe(1000);
      expect(config.RETRY_TIMES).toBe(3);
      expect(config.SNAPSHOT_EVERY_N_EVENTS).toBe(100);
      expect(config.LOAD_SHED_QUEUE_MAX).toBe(1000);
      expect(config.IDEMP_TTL_MS).toBe(300000);
    });
  });

  describe('Configuration Structure', () => {
    it('should have all required configuration properties', () => {
      expect(config).toHaveProperty('CONCURRENCY_API');
      expect(config).toHaveProperty('CONCURRENCY_SYNC');
      expect(config).toHaveProperty('RATE_LIMIT_RPS');
      expect(config).toHaveProperty('RATE_LIMIT_BURST');
      expect(config).toHaveProperty('BREAKER_THRESHOLD');
      expect(config).toHaveProperty('BREAKER_COOLDOWN_MS');
      expect(config).toHaveProperty('RETRY_BASE_MS');
      expect(config).toHaveProperty('RETRY_TIMES');
      expect(config).toHaveProperty('SNAPSHOT_EVERY_N_EVENTS');
      expect(config).toHaveProperty('LOAD_SHED_QUEUE_MAX');
      expect(config).toHaveProperty('IDEMP_TTL_MS');
    });

    it('should have reasonable default values for production use', () => {
      // Concurrency should be reasonable for API and sync operations
      expect(config.CONCURRENCY_API).toBeGreaterThanOrEqual(4);
      expect(config.CONCURRENCY_API).toBeLessThanOrEqual(64);
      expect(config.CONCURRENCY_SYNC).toBeGreaterThanOrEqual(1);
      expect(config.CONCURRENCY_SYNC).toBeLessThanOrEqual(16);
      
      // Rate limiting should be reasonable
      expect(config.RATE_LIMIT_RPS).toBeGreaterThanOrEqual(10);
      expect(config.RATE_LIMIT_RPS).toBeLessThanOrEqual(1000);
      expect(config.RATE_LIMIT_BURST).toBeGreaterThanOrEqual(50);
      expect(config.RATE_LIMIT_BURST).toBeLessThanOrEqual(5000);
      
      // Circuit breaker should be reasonable
      expect(config.BREAKER_THRESHOLD).toBeGreaterThanOrEqual(0.1);
      expect(config.BREAKER_THRESHOLD).toBeLessThanOrEqual(0.9);
      expect(config.BREAKER_COOLDOWN_MS).toBeGreaterThanOrEqual(5000);
      expect(config.BREAKER_COOLDOWN_MS).toBeLessThanOrEqual(300000);
      
      // Retry policy should be reasonable
      expect(config.RETRY_BASE_MS).toBeGreaterThanOrEqual(100);
      expect(config.RETRY_BASE_MS).toBeLessThanOrEqual(10000);
      expect(config.RETRY_TIMES).toBeGreaterThanOrEqual(0);
      expect(config.RETRY_TIMES).toBeLessThanOrEqual(10);
      
      // Event processing should be reasonable
      expect(config.SNAPSHOT_EVERY_N_EVENTS).toBeGreaterThanOrEqual(10);
      expect(config.SNAPSHOT_EVERY_N_EVENTS).toBeLessThanOrEqual(1000);
      
      // Load shedding should be reasonable
      expect(config.LOAD_SHED_QUEUE_MAX).toBeGreaterThanOrEqual(100);
      expect(config.LOAD_SHED_QUEUE_MAX).toBeLessThanOrEqual(10000);
      
      // Idempotency TTL should be reasonable
      expect(config.IDEMP_TTL_MS).toBeGreaterThanOrEqual(60000); // At least 1 minute
      expect(config.IDEMP_TTL_MS).toBeLessThanOrEqual(3600000); // At most 1 hour
    });
  });
});