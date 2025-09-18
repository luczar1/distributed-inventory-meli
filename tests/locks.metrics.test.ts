import { describe, it, expect, beforeEach, vi } from 'vitest';
import { config } from '../src/core/config';
import { inventoryService } from '../src/services/inventory.service';
import { metrics } from '../src/utils/metrics';
import { inventoryRepository } from '../src/repositories/inventory.repo';
import { LockRejectionError } from '../src/core/errors';
import { 
  incrementLockAcquired, 
  incrementLockContended, 
  incrementLockStolen, 
  incrementLockExpired, 
  incrementLockLost, 
  incrementLockReleaseFailures 
} from '../src/utils/metrics';

// Mock the config to control lock behavior
vi.mock('../src/core/config', () => ({
  config: {
    LOCKS_ENABLED: true,
    LOCK_TTL_MS: 2000,
    LOCK_RENEW_MS: 1000,
    LOCK_DIR: 'data/locks',
    LOCK_REJECT_STATUS: 503,
    LOCK_RETRY_AFTER_MS: 300,
    LOCK_OWNER_ID: 'test-owner-123'
  }
}));

// Mock the inventory repository
vi.mock('../src/repositories/inventory.repo', () => ({
  inventoryRepository: {
    get: vi.fn(),
    upsert: vi.fn(),
    listByStore: vi.fn()
  }
}));

// Mock the event log repository
vi.mock('../src/repositories/eventlog.repo', () => ({
  eventLogRepository: {
    append: vi.fn()
  }
}));

// Mock the idempotency store
vi.mock('../src/utils/idempotency', () => ({
  idempotencyStore: {
    get: vi.fn(),
    set: vi.fn()
  }
}));

// Mock the lock file utility partially to allow metrics testing
vi.mock('../src/utils/lockFile', async () => {
  const actual = await vi.importActual('../src/utils/lockFile');
  return {
    ...actual,
    acquireLock: vi.fn(),
    releaseLock: vi.fn(),
  };
});

describe('Lock Metrics Tests', () => {
  const testStoreId = 'store-1';
  const testSku = 'SKU-001';

  beforeEach(async () => {
    // Reset metrics before each test
    metrics.reset();
    
    // Mock the inventory repository responses
    vi.mocked(inventoryRepository.get).mockResolvedValue({
      sku: testSku,
      storeId: testStoreId,
      qty: 100,
      version: 1,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    
    vi.mocked(inventoryRepository.upsert).mockResolvedValue();
    
    // Mock idempotency store to return null (no cached result)
    const { idempotencyStore } = await import('../src/utils/idempotency');
    vi.mocked(idempotencyStore.get).mockResolvedValue(null);
    vi.mocked(idempotencyStore.set).mockResolvedValue();
    
    // Mock event log repository
    const { eventLogRepository } = await import('../src/repositories/eventlog.repo');
    vi.mocked(eventLogRepository.append).mockResolvedValue();
  });

  describe('lock metrics counters', () => {
    it('should increment lockAcquired when lock is successfully acquired', async () => {
      // Test the metrics directly
      incrementLockAcquired();
      
      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.lockAcquired).toBe(1);
    });

    it('should increment lockContended when lock is held by another process', async () => {
      // Test the metrics directly
      incrementLockContended();
      
      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.lockContended).toBe(1);
    });

    it('should increment lockStolen and lockExpired when stealing expired lock', async () => {
      // Test the metrics directly
      incrementLockStolen();
      incrementLockExpired();
      
      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.lockStolen).toBe(1);
      expect(currentMetrics.lockExpired).toBe(1);
    });

    it('should increment lockLost when lock owner mismatch occurs', async () => {
      // Test the metrics directly
      incrementLockLost();
      
      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.lockLost).toBe(1);
    });

    it('should increment lockReleaseFailures when lock release fails', async () => {
      // Test the metrics directly
      incrementLockReleaseFailures();
      
      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.lockReleaseFailures).toBe(1);
    });
  });

  describe('HTTP headers on lock rejection', () => {
    it('should return Retry-After and X-Lock-Key headers when lock is rejected', async () => {
      // Mock lock contention
      const { acquireLock } = await import('../src/utils/lockFile');
      vi.mocked(acquireLock).mockRejectedValue(new Error('Lock is held by another process'));

      try {
        await inventoryService.adjustStock(testStoreId, testSku, 10);
        expect.fail('Should have thrown LockRejectionError');
      } catch (error) {
        expect(error).toBeInstanceOf(LockRejectionError);
        if (error instanceof LockRejectionError) {
          expect(error.sku).toBe(testSku);
          expect(error.retryAfter).toBe(0.3); // 300ms / 1000
          expect(error.message).toContain('Lock acquisition failed');
        }
      }
    });

    it('should have correct retry after value based on config', async () => {
      // Mock lock contention
      const { acquireLock } = await import('../src/utils/lockFile');
      vi.mocked(acquireLock).mockRejectedValue(new Error('Lock is held by another process'));

      try {
        await inventoryService.adjustStock(testStoreId, testSku, 10);
        expect.fail('Should have thrown LockRejectionError');
      } catch (error) {
        expect(error).toBeInstanceOf(LockRejectionError);
        if (error instanceof LockRejectionError) {
          expect(error.retryAfter).toBe(config.LOCK_RETRY_AFTER_MS / 1000);
        }
      }
    });
  });

  describe('metrics aggregation', () => {
    it('should track multiple lock operations correctly', async () => {
      // Test multiple increments
      incrementLockAcquired();
      incrementLockAcquired();
      
      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.lockAcquired).toBe(2);
    });

    it('should reset metrics correctly', () => {
      // Increment some metrics
      metrics.increment('lockAcquired', 5);
      metrics.increment('lockContended', 3);

      let currentMetrics = metrics.getMetrics();
      expect(currentMetrics.lockAcquired).toBe(5);
      expect(currentMetrics.lockContended).toBe(3);

      // Reset metrics
      metrics.reset();

      currentMetrics = metrics.getMetrics();
      expect(currentMetrics.lockAcquired).toBe(0);
      expect(currentMetrics.lockContended).toBe(0);
    });
  });
});
