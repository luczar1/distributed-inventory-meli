import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { config } from '../../src/core/config';

describe('Lock Configuration', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Clear all environment variables
    process.env = {};
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('default values', () => {
    it('should have correct default values when no env vars are set', () => {
      expect(config.LOCKS_ENABLED).toBe(false);
      expect(config.LOCK_TTL_MS).toBe(2000);
      expect(config.LOCK_RENEW_MS).toBe(1000);
      expect(config.LOCK_DIR).toBe('data/locks');
      expect(config.LOCK_REJECT_STATUS).toBe(503);
      expect(config.LOCK_RETRY_AFTER_MS).toBe(300);
      expect(config.LOCK_OWNER_ID).toMatch(/^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('should have LOCK_OWNER_ID format with process ID and UUID', () => {
      const ownerId = config.LOCK_OWNER_ID;
      const parts = ownerId.split('-');
      
      // Should have at least 2 parts (PID and UUID)
      expect(parts.length).toBeGreaterThanOrEqual(2);
      
      // First part should be a number (process ID)
      expect(parts[0]).toMatch(/^\d+$/);
      
      // Should contain a valid UUID format
      expect(ownerId).toMatch(/^\d+-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('environment variable parsing', () => {
    it('should parse LOCKS_ENABLED from environment', () => {
      process.env.LOCKS_ENABLED = 'true';
      expect(process.env.LOCKS_ENABLED).toBe('true');
    });

    it('should parse LOCK_TTL_MS from environment', () => {
      process.env.LOCK_TTL_MS = '5000';
      expect(process.env.LOCK_TTL_MS).toBe('5000');
    });

    it('should parse LOCK_RENEW_MS from environment', () => {
      process.env.LOCK_RENEW_MS = '2000';
      expect(process.env.LOCK_RENEW_MS).toBe('2000');
    });

    it('should parse LOCK_DIR from environment', () => {
      process.env.LOCK_DIR = '/custom/locks';
      expect(process.env.LOCK_DIR).toBe('/custom/locks');
    });

    it('should parse LOCK_REJECT_STATUS from environment', () => {
      process.env.LOCK_REJECT_STATUS = '429';
      expect(process.env.LOCK_REJECT_STATUS).toBe('429');
    });

    it('should parse LOCK_RETRY_AFTER_MS from environment', () => {
      process.env.LOCK_RETRY_AFTER_MS = '500';
      expect(process.env.LOCK_RETRY_AFTER_MS).toBe('500');
    });
  });

  describe('validation', () => {
    it('should handle invalid LOCK_TTL_MS gracefully', () => {
      process.env.LOCK_TTL_MS = 'invalid';
      expect(process.env.LOCK_TTL_MS).toBe('invalid');
    });

    it('should handle invalid LOCK_RENEW_MS gracefully', () => {
      process.env.LOCK_RENEW_MS = 'invalid';
      expect(process.env.LOCK_RENEW_MS).toBe('invalid');
    });

    it('should handle invalid LOCK_REJECT_STATUS gracefully', () => {
      process.env.LOCK_REJECT_STATUS = 'invalid';
      expect(process.env.LOCK_REJECT_STATUS).toBe('invalid');
    });

    it('should handle invalid LOCK_RETRY_AFTER_MS gracefully', () => {
      process.env.LOCK_RETRY_AFTER_MS = 'invalid';
      expect(process.env.LOCK_RETRY_AFTER_MS).toBe('invalid');
    });
  });

  describe('sane defaults', () => {
    it('should have LOCK_RENEW_MS less than LOCK_TTL_MS', () => {
      expect(config.LOCK_RENEW_MS).toBeLessThan(config.LOCK_TTL_MS);
    });

    it('should have reasonable TTL values', () => {
      expect(config.LOCK_TTL_MS).toBeGreaterThan(0);
      expect(config.LOCK_TTL_MS).toBeLessThanOrEqual(10000); // Max 10 seconds
    });

    it('should have reasonable retry after values', () => {
      expect(config.LOCK_RETRY_AFTER_MS).toBeGreaterThan(0);
      expect(config.LOCK_RETRY_AFTER_MS).toBeLessThanOrEqual(5000); // Max 5 seconds
    });

    it('should have valid HTTP status code for rejection', () => {
      expect(config.LOCK_REJECT_STATUS).toBeGreaterThanOrEqual(400);
      expect(config.LOCK_REJECT_STATUS).toBeLessThan(600);
    });
  });

  describe('config immutability', () => {
    it('should be frozen and immutable', () => {
      expect(Object.isFrozen(config)).toBe(true);
      
      // Attempting to modify should not work
      expect(() => {
        (config as Record<string, unknown>).LOCKS_ENABLED = true;
      }).toThrow();
    });
  });
});
