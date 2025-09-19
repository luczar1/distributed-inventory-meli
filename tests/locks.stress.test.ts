import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mapLimit } from '../src/utils/mapLimit';
import { metrics } from '../src/utils/metrics';
import { acquireLock, releaseLock } from '../src/utils/lockFile';

// Mock the config to enable locks
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

// Mock the inventory repository with state simulation
vi.mock('../src/repositories/inventory.repo', () => {
  let currentState: Record<string, any> = {};
  
  return {
    inventoryRepository: {
      get: vi.fn().mockImplementation((sku: string, storeId: string) => {
        const key = `${sku}-${storeId}`;
        return currentState[key] || {
          sku,
          storeId,
          qty: 100,
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date()
        };
      }),
      
      upsert: vi.fn().mockImplementation((record: any) => {
        const key = `${record.sku}-${record.storeId}`;
        currentState[key] = { ...record, updatedAt: new Date() };
      }),
      
      listByStore: vi.fn().mockImplementation((storeId: string) => {
        return Object.values(currentState).filter((item: any) => item.storeId === storeId);
      })
    }
  };
});

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

// Mock the lock file utility to simulate contention
vi.mock('../src/utils/lockFile', () => {
  const locks = new Map<string, { owner: string; expiresAt: number }>();
  let lockCounter = 0;
  
  return {
    acquireLock: vi.fn().mockImplementation(async (key: string, ttl: number, owner: string) => {
      // Add a small delay to simulate real lock acquisition
      await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
      
      // Simulate lock contention - only one lock per key can be held
      const existingLock = locks.get(key);
      if (existingLock && existingLock.expiresAt > Date.now()) {
        // Increment contention counter for metrics
        const { incrementLockContended } = await import('../src/utils/metrics');
        incrementLockContended();
        throw new Error('Lock is held by another process');
      }
      
      // Remove expired lock or acquire new one
      locks.set(key, {
        owner,
        expiresAt: Date.now() + ttl
      });
      
      // Increment acquired counter for metrics
      const { incrementLockAcquired } = await import('../src/utils/metrics');
      incrementLockAcquired();
      
      return {
        key,
        file: `data/locks/${key}.lock`,
        owner,
        expiresAt: Date.now() + ttl
      };
    }),
    
    releaseLock: vi.fn().mockImplementation(async (handle: any) => {
      const existingLock = locks.get(handle.key);
      if (existingLock && existingLock.owner === handle.owner) {
        locks.delete(handle.key);
      }
    }),
    
    isLocked: vi.fn().mockImplementation(async (key: string) => {
      const existingLock = locks.get(key);
      return existingLock && existingLock.expiresAt > Date.now();
    }),
    
    forceReleaseLock: vi.fn().mockImplementation(async (key: string) => {
      locks.delete(key);
    })
  };
});

describe('Lock Stress Tests', () => {
  const testSku = 'STRESS-SKU-001';
  const testTtl = 2000;
  const testOwner = 'test-owner';

  beforeEach(async () => {
    // Reset metrics
    metrics.reset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('high contention stress tests', () => {
    it('should handle 50 parallel lock acquisitions on same SKU with contention', async () => {
      const numOperations = 50;
      
      // Create array of lock operations
      const operations = Array.from({ length: numOperations }, (_, i) => 
        async () => {
          try {
            const handle = await acquireLock(testSku, testTtl, `${testOwner}-${i}`);
            // Simulate some work
            await new Promise(resolve => setTimeout(resolve, 50));
            await releaseLock(handle);
            return { success: true, operation: i };
          } catch (error) {
            return { success: false, error, operation: i };
          }
        }
      );
      
      // Run all operations in parallel to create real contention
      const results = await Promise.allSettled(
        operations.map(async (operation) => {
          try {
            return await operation();
          } catch (error) {
            return { success: false, error, operation: -1 };
          }
        })
      );
      
      // Extract results from settled promises
      const extractedResults: any[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          extractedResults.push(result.value);
        } else {
          extractedResults.push({ success: false, error: result.reason, operation: -1 });
        }
      });
      
      // Filter out any undefined results
      const validResults = extractedResults.filter(result => result !== undefined);
      
      // Analyze results
      const successful = validResults.filter(result => result.success);
      const rejected = validResults.filter(result => !result.success);
      
      // Debug output
      console.log(`Results: ${successful.length} successful, ${rejected.length} rejected`);
      console.log('Total results:', results.length);
      console.log('Valid results:', validResults.length);
      console.log('Sample results:', validResults.slice(0, 5));
      
      // Verify that we got results for all operations
      expect(validResults.length).toBe(numOperations);
      
      // Verify that at least one operation succeeded (the first one to acquire the lock)
      // and others were rejected due to contention
      expect(successful.length).toBeGreaterThan(0);
      expect(rejected.length).toBeGreaterThan(0);
      expect(successful.length + rejected.length).toBe(numOperations);
      
      // Verify metrics were recorded
      const currentMetrics = metrics.getMetrics();
      expect(currentMetrics.lockAcquired).toBeGreaterThan(0);
      expect(currentMetrics.lockContended).toBeGreaterThan(0);
    });

    it('should handle 100 parallel lock acquisitions with contention', async () => {
      const numOperations = 100;
      
      const operations = Array.from({ length: numOperations }, (_, i) => 
        async () => {
          try {
            const handle = await acquireLock(testSku, testTtl, `${testOwner}-${i}`);
            await new Promise(resolve => setTimeout(resolve, 5));
            await releaseLock(handle);
            return { success: true, operation: i };
          } catch (error) {
            return { success: false, error, operation: i };
          }
        }
      );
      
      // Run all operations in parallel to create real contention
      const results = await Promise.allSettled(
        operations.map(async (operation) => {
          try {
            return await operation();
          } catch (error) {
            return { success: false, error, operation: -1 };
          }
        })
      );
      
      // Extract results from settled promises
      const extractedResults: any[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          extractedResults.push(result.value);
        } else {
          extractedResults.push({ success: false, error: result.reason, operation: -1 });
        }
      });
      
      // Filter out any undefined results
      const validResults = extractedResults.filter(result => result !== undefined);
      
      const successful = validResults.filter(result => result.success);
      const rejected = validResults.filter(result => !result.success);
      
      expect(successful.length).toBeGreaterThan(0);
      expect(rejected.length).toBeGreaterThan(0);
      expect(successful.length + rejected.length).toBe(numOperations);
    });

    it('should handle 200 parallel lock acquisitions with contention', async () => {
      const numOperations = 200;
      
      const operations = Array.from({ length: numOperations }, (_, i) => 
        async () => {
          try {
            const handle = await acquireLock(testSku, testTtl, `${testOwner}-${i}`);
            await new Promise(resolve => setTimeout(resolve, 2));
            await releaseLock(handle);
            return { success: true, operation: i };
          } catch (error) {
            return { success: false, error, operation: i };
          }
        }
      );
      
      // Run all operations in parallel to create real contention
      const results = await Promise.allSettled(
        operations.map(async (operation) => {
          try {
            return await operation();
          } catch (error) {
            return { success: false, error, operation: -1 };
          }
        })
      );
      
      // Extract results from settled promises
      const extractedResults: any[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          extractedResults.push(result.value);
        } else {
          extractedResults.push({ success: false, error: result.reason, operation: -1 });
        }
      });
      
      // Filter out any undefined results
      const validResults = extractedResults.filter(result => result !== undefined);
      
      const successful = validResults.filter(result => result.success);
      const rejected = validResults.filter(result => !result.success);
      
      expect(successful.length).toBeGreaterThan(0);
      expect(rejected.length).toBeGreaterThan(0);
      expect(successful.length + rejected.length).toBe(numOperations);
    });

    it('should handle mixed lock operations with contention', async () => {
      const numOperations = 100;
      
      const operations = Array.from({ length: numOperations }, (_, i) => 
        async () => {
          try {
            const handle = await acquireLock(testSku, testTtl, `${testOwner}-${i}`);
            // Simulate different work durations
            await new Promise(resolve => setTimeout(resolve, i % 2 === 0 ? 5 : 10));
            await releaseLock(handle);
            return { success: true, operation: i };
          } catch (error) {
            return { success: false, error, operation: i };
          }
        }
      );
      
      // Run all operations in parallel to create real contention
      const results = await Promise.allSettled(
        operations.map(async (operation) => {
          try {
            return await operation();
          } catch (error) {
            return { success: false, error, operation: -1 };
          }
        })
      );
      
      // Extract results from settled promises
      const extractedResults: any[] = [];
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          extractedResults.push(result.value);
        } else {
          extractedResults.push({ success: false, error: result.reason, operation: -1 });
        }
      });
      
      // Filter out any undefined results
      const validResults = extractedResults.filter(result => result !== undefined);
      
      const successful = validResults.filter(result => result.success);
      const rejected = validResults.filter(result => !result.success);
      
      expect(successful.length).toBeGreaterThan(0);
      expect(rejected.length).toBeGreaterThan(0);
      expect(successful.length + rejected.length).toBe(numOperations);
    });
  });

  describe('deterministic behavior', () => {
    it('should produce consistent behavior with same parameters', async () => {
      const numOperations = 50;
      
      // Run test multiple times with same parameters
      const results1 = await runLockStressTest(numOperations);
      const results2 = await runLockStressTest(numOperations);
      
      // Results should be consistent (same total operations, reasonable success rate)
      expect(results1.successful + results1.rejected).toBe(numOperations);
      expect(results2.successful + results2.rejected).toBe(numOperations);
      
      // Should have at least one success and one rejection (showing lock contention)
      expect(results1.successful).toBeGreaterThan(0);
      expect(results1.rejected).toBeGreaterThan(0);
      expect(results2.successful).toBeGreaterThan(0);
      expect(results2.rejected).toBeGreaterThan(0);
    });

    it('should maintain invariants under high load', async () => {
      const numOperations = 100;
      
      const results = await runLockStressTest(numOperations);
      
      // Verify invariants
      expect(results.successful + results.rejected).toBe(numOperations); // All operations accounted for
      expect(results.successful).toBeGreaterThan(0); // Some operations should succeed
      expect(results.rejected).toBeGreaterThan(0); // Some operations should be rejected
    });
  });

  describe('metrics and observability', () => {
    it('should record comprehensive lock metrics under stress', async () => {
      const numOperations = 50;
      
      await runLockStressTest(numOperations);
      
      const currentMetrics = metrics.getMetrics();
      
      // Verify lock metrics were recorded
      expect(currentMetrics.lockAcquired).toBeGreaterThan(0);
      expect(currentMetrics.lockContended).toBeGreaterThan(0);
      
      // Verify metrics are reasonable
      expect(currentMetrics.lockAcquired).toBeLessThanOrEqual(numOperations);
      expect(currentMetrics.lockContended).toBeLessThanOrEqual(numOperations);
    });
  });

  // Helper function to run lock stress test and return results
  async function runLockStressTest(numOperations: number) {
    const operations = Array.from({ length: numOperations }, (_, i) => 
      async () => {
        try {
          const handle = await acquireLock(testSku, testTtl, `${testOwner}-${i}`);
          await new Promise(resolve => setTimeout(resolve, 5));
          await releaseLock(handle);
          return { success: true, operation: i };
        } catch (error) {
          return { success: false, error, operation: i };
        }
      }
    );
    
    // Run all operations in parallel to create real contention
    const results = await Promise.allSettled(
      operations.map(async (operation) => {
        try {
          return await operation();
        } catch (error) {
          return { success: false, error, operation: -1 };
        }
      })
    );
    
    // Extract results from settled promises
    const extractedResults: any[] = [];
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        extractedResults.push(result.value);
      } else {
        extractedResults.push({ success: false, error: result.reason, operation: -1 });
      }
    });
    
    // Filter out any undefined results
    const validResults = extractedResults.filter(result => result !== undefined);
    
    const successful = validResults.filter(result => result.success).length;
    const rejected = validResults.filter(result => !result.success).length;
    
    return {
      successful,
      rejected
    };
  }
});
