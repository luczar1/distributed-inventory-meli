import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RateLimiter } from '../../src/middleware/rateLimiter';

describe('RateLimiter', () => {
  let rateLimiter: RateLimiter;

  beforeEach(() => {
    rateLimiter = new RateLimiter({
      name: 'test',
      rps: 2, // 2 requests per second
      burst: 5, // 5 token burst
    });
  });

  describe('Token Bucket', () => {
    it('should allow requests within rate limit', () => {
      const identifier = 'test-user';
      
      // Should allow first 5 requests (burst)
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.isAllowed(identifier)).toBe(true);
      }
    });

    it('should reject requests when bucket is empty', () => {
      const identifier = 'test-user';
      
      // Exhaust the bucket
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed(identifier);
      }
      
      // Next request should be rejected
      expect(rateLimiter.isAllowed(identifier)).toBe(false);
    });

    it('should refill tokens over time', async () => {
      const identifier = 'test-user';
      
      // Exhaust the bucket
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed(identifier);
      }
      
      // Wait for refill (1 second for 2 RPS)
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should allow requests again
      expect(rateLimiter.isAllowed(identifier)).toBe(true);
    });

    it('should handle multiple identifiers independently', () => {
      const user1 = 'user1';
      const user2 = 'user2';
      
      // Exhaust user1's bucket
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed(user1);
      }
      
      // user2 should still have full bucket
      expect(rateLimiter.isAllowed(user2)).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track request statistics', () => {
      const identifier = 'test-user';
      
      // Make some requests
      rateLimiter.isAllowed(identifier);
      rateLimiter.isAllowed(identifier);
      rateLimiter.isAllowed(identifier);
      
      const stats = rateLimiter.getStats();
      expect(stats.requests).toBe(3);
      expect(stats.rejected).toBe(0);
    });

    it('should track rejected requests', () => {
      const identifier = 'test-user';
      
      // Exhaust the bucket
      for (let i = 0; i < 5; i++) {
        rateLimiter.isAllowed(identifier);
      }
      
      // Try one more (should be rejected)
      rateLimiter.isAllowed(identifier);
      
      const stats = rateLimiter.getStats();
      expect(stats.requests).toBe(5);
      expect(stats.rejected).toBe(1);
    });

    it('should reset statistics', () => {
      const identifier = 'test-user';
      
      // Make some requests
      rateLimiter.isAllowed(identifier);
      rateLimiter.isAllowed(identifier);
      
      rateLimiter.reset();
      
      const stats = rateLimiter.getStats();
      expect(stats.requests).toBe(0);
      expect(stats.rejected).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle burst size correctly', () => {
      const identifier = 'test-user';
      
      // Should allow exactly burst size requests
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.isAllowed(identifier)).toBe(true);
      }
      
      // Next should be rejected
      expect(rateLimiter.isAllowed(identifier)).toBe(false);
    });

    it('should not exceed burst size even with time refill', async () => {
      const identifier = 'test-user';
      
      // Wait for full refill
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Should still only allow burst size
      for (let i = 0; i < 5; i++) {
        expect(rateLimiter.isAllowed(identifier)).toBe(true);
      }
      
      expect(rateLimiter.isAllowed(identifier)).toBe(false);
    });
  });
});
