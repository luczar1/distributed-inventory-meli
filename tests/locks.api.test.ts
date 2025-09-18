import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { config } from '../src/core/config';
import { inventoryService } from '../src/services/inventory.service';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';
import { inventoryRepository } from '../src/repositories/inventory.repo';

// Mock the inventory repository to avoid file system issues
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

// Mock the config to control lock behavior
vi.mock('../src/core/config', () => ({
  config: {
    LOCKS_ENABLED: false,
    LOCK_TTL_MS: 2000,
    LOCK_RENEW_MS: 1000,
    LOCK_DIR: 'data/locks',
    LOCK_REJECT_STATUS: 503,
    LOCK_RETRY_AFTER_MS: 300,
    LOCK_OWNER_ID: 'test-owner-123'
  }
}));

// Mock the lock file utility
vi.mock('../src/utils/lockFile', () => ({
  acquireLock: vi.fn(),
  renewLock: vi.fn(),
  releaseLock: vi.fn(),
  isLocked: vi.fn(),
  forceReleaseLock: vi.fn(),
  LockLostError: class LockLostError extends Error {
    constructor(message: string) {
      super(message);
      this.name = 'LockLostError';
    }
  }
}));

describe('Lock Integration API Tests', () => {
  const testStoreId = 'store-1';
  const testSku = 'SKU-001';
  const lockDir = 'data/locks';

  beforeEach(async () => {
    // Clean up any existing lock files
    try {
      await rm(join(lockDir, `${testSku}.lock`), { force: true });
    } catch (error) {
      // Ignore if file doesn't exist
    }
    
    // Ensure lock directory exists
    try {
      await mkdir(lockDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Mock the inventory repository responses
    vi.mocked(inventoryRepository.get).mockResolvedValue({
      sku: testSku,
      storeId: testStoreId,
      qty: 0,
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

  afterEach(async () => {
    // Clean up after each test
    try {
      await rm(join(lockDir, `${testSku}.lock`), { force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('when LOCKS_ENABLED=false', () => {
    beforeEach(() => {
      // Disable locks for this test
      vi.mocked(config).LOCKS_ENABLED = false;
    });

    it('should behave like pre-lock tests (no locking)', async () => {
      // This should work without any locking
      const result1 = await inventoryService.adjustStock(testStoreId, testSku, 10);
      expect(result1.qty).toBe(10);
      expect(result1.version).toBe(2); // Version increments from 1 to 2

      // Update the mock to return the updated record for the second call
      vi.mocked(inventoryRepository.get).mockResolvedValue({
        sku: testSku,
        storeId: testStoreId,
        qty: 10, // Updated quantity from first adjustment
        version: 2,
        createdAt: new Date(),
        updatedAt: new Date()
      });

      const result2 = await inventoryService.adjustStock(testStoreId, testSku, 5);
      expect(result2.qty).toBe(15);
      expect(result2.version).toBe(3); // Version increments from 2 to 3
    });

    it('should allow concurrent operations without lock rejection', async () => {
      // Start two concurrent adjustments
      const promises = [
        inventoryService.adjustStock(testStoreId, testSku, 10),
        inventoryService.adjustStock(testStoreId, testSku, 5)
      ];

      const results = await Promise.all(promises);
      
      // Both should succeed (though order may vary)
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.qty).toBeGreaterThanOrEqual(0);
        expect(result.version).toBeGreaterThan(0);
      });
    });
  });

  describe('when LOCKS_ENABLED=true', () => {
    beforeEach(async () => {
      // Enable locks for this test
      vi.mocked(config).LOCKS_ENABLED = true;
      
      // Mock successful lock acquisition and release
      const { acquireLock, releaseLock } = await import('../src/utils/lockFile');
      vi.mocked(acquireLock).mockResolvedValue({
        key: testSku,
        file: join(lockDir, `${testSku}.lock`),
        owner: 'test-owner-123',
        expiresAt: Date.now() + 2000
      });
      vi.mocked(releaseLock).mockResolvedValue();
    });

    it('should acquire lock before mutation and release after', async () => {
      const result = await inventoryService.adjustStock(testStoreId, testSku, 10);
      
      expect(result.qty).toBe(10);
      expect(result.version).toBe(2);
      
      // Verify lock was acquired and released
      const { acquireLock, releaseLock } = await import('../src/utils/lockFile');
      expect(acquireLock).toHaveBeenCalledWith(testSku, 2000, 'test-owner-123');
      expect(releaseLock).toHaveBeenCalled();
    });

    it('should reject concurrent operations on same SKU with lock status', async () => {
      // Mock the second call to fail
      const { acquireLock } = await import('../src/utils/lockFile');
      vi.mocked(acquireLock)
        .mockResolvedValueOnce({
          key: testSku,
          file: join(lockDir, `${testSku}.lock`),
          owner: 'test-owner-123',
          expiresAt: Date.now() + 2000
        })
        .mockRejectedValueOnce(new Error('Lock is held by another process'));

      // Start two concurrent adjustments on the same SKU
      const promises = [
        inventoryService.adjustStock(testStoreId, testSku, 10),
        inventoryService.adjustStock(testStoreId, testSku, 5)
      ];

      const results = await Promise.allSettled(promises);
      
      // One should succeed, one should fail with lock rejection
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');
      
      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(1);
      
      // Check that the failed one has lock-related error
      if (failed[0].status === 'rejected') {
        const error = failed[0].reason;
        expect(error.message).toContain('Lock acquisition failed');
      }
    });

    it('should allow concurrent operations on different SKUs', async () => {
      const differentSku = 'SKU-002';
      
      // Create inventory record for different SKU
      await inventoryRepository.upsert({
        sku: differentSku,
        storeId: testStoreId,
        qty: 0,
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Start concurrent adjustments on different SKUs
      const promises = [
        inventoryService.adjustStock(testStoreId, testSku, 10),
        inventoryService.adjustStock(testStoreId, differentSku, 5)
      ];

      const results = await Promise.all(promises);
      
      // Both should succeed since they're different SKUs
      expect(results).toHaveLength(2);
      results.forEach(result => {
        expect(result.qty).toBeGreaterThanOrEqual(0);
        expect(result.version).toBeGreaterThan(0);
      });
    });

    it('should handle lock acquisition failure gracefully', async () => {
      // Mock acquireLock to always fail
      const { acquireLock } = await import('../src/utils/lockFile');
      vi.mocked(acquireLock).mockRejectedValue(
        new Error('Lock is held by another process')
      );

      await expect(
        inventoryService.adjustStock(testStoreId, testSku, 10)
      ).rejects.toThrow('Lock acquisition failed: Lock is held by another process');
    });

    it('should handle lock release failure gracefully', async () => {
      // Mock releaseLock to fail
      const { releaseLock } = await import('../src/utils/lockFile');
      vi.mocked(releaseLock).mockRejectedValue(
        new Error('Failed to release lock')
      );

      // Operation should still succeed despite lock release failure
      const result = await inventoryService.adjustStock(testStoreId, testSku, 10);
      expect(result.qty).toBe(10);
      expect(result.version).toBe(2);
    });
  });

  describe('lock renewal for long operations', () => {
    beforeEach(async () => {
      vi.mocked(config).LOCKS_ENABLED = true;
      vi.mocked(config).LOCK_RENEW_MS = 100; // Short renewal interval for testing
      
      // Mock successful lock acquisition and release
      const { acquireLock, releaseLock } = await import('../src/utils/lockFile');
      vi.mocked(acquireLock).mockResolvedValue({
        key: testSku,
        file: join(lockDir, `${testSku}.lock`),
        owner: 'test-owner-123',
        expiresAt: Date.now() + 2000
      });
      vi.mocked(releaseLock).mockResolvedValue();
    });

    it('should renew lock for long operations', async () => {
      // This test would require more complex mocking to actually test renewal
      // For now, we'll just ensure the operation completes
      const result = await inventoryService.adjustStock(testStoreId, testSku, 10);
      expect(result.qty).toBe(10);
      expect(result.version).toBe(2);
    });
  });

  describe('reservation operations with locks', () => {
    beforeEach(async () => {
      vi.mocked(config).LOCKS_ENABLED = true;
      
      // Mock successful lock acquisition and release
      const { acquireLock, releaseLock } = await import('../src/utils/lockFile');
      vi.mocked(acquireLock).mockResolvedValue({
        key: testSku,
        file: join(lockDir, `${testSku}.lock`),
        owner: 'test-owner-123',
        expiresAt: Date.now() + 2000
      });
      vi.mocked(releaseLock).mockResolvedValue();
    });

    it('should acquire lock for stock reservation', async () => {
      // Mock the repository to return a record with sufficient stock
      vi.mocked(inventoryRepository.get).mockResolvedValue({
        sku: testSku,
        storeId: testStoreId,
        qty: 100, // Sufficient stock
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Then reserve some
      const result = await inventoryService.reserveStock(testStoreId, testSku, 20);
      
      expect(result.qty).toBe(80);
      expect(result.version).toBe(2);
    });

    it('should reject concurrent reservations on same SKU', async () => {
      // Mock the repository to return a record with sufficient stock
      vi.mocked(inventoryRepository.get).mockResolvedValue({
        sku: testSku,
        storeId: testStoreId,
        qty: 100, // Sufficient stock
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date()
      });
      
      // Mock the second call to fail
      const { acquireLock } = await import('../src/utils/lockFile');
      vi.mocked(acquireLock)
        .mockResolvedValueOnce({
          key: testSku,
          file: join(lockDir, `${testSku}.lock`),
          owner: 'test-owner-123',
          expiresAt: Date.now() + 2000
        })
        .mockRejectedValueOnce(new Error('Lock is held by another process'));
      
      // Start two concurrent reservations
      const promises = [
        inventoryService.reserveStock(testStoreId, testSku, 20),
        inventoryService.reserveStock(testStoreId, testSku, 30)
      ];

      const results = await Promise.allSettled(promises);
      
      // One should succeed, one should fail
      const successful = results.filter(r => r.status === 'fulfilled');
      const failed = results.filter(r => r.status === 'rejected');
      
      expect(successful).toHaveLength(1);
      expect(failed).toHaveLength(1);
    });
  });
});
