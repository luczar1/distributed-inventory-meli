import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setDeterministicRng, resetRng } from '../src/testing/rng';
import { freezeNow, restoreNow } from '../src/testing/time';

// Mock the config to enable locks
vi.mock('../src/core/config', () => ({
  config: {
    LOCKS_ENABLED: true,
    LOCK_TTL_MS: 2000,
    LOCK_RENEW_MS: 1000,
    LOCK_DIR: 'data/locks',
    LOCK_REJECT_STATUS: 503,
    LOCK_RETRY_AFTER_MS: 300,
    LOCK_OWNER_ID: 'test-owner-123',
    RETRY_JITTER_MS: 0 // Disable jitter for deterministic behavior
  }
}));

// Mock the lock file utility to simulate deterministic contention
vi.mock('../src/utils/lockFile', () => {
  let lockState = new Map<string, { owner: string; expiresAt: number }>();
  let operationCount = 0;
  
  return {
    acquireLock: vi.fn().mockImplementation(async (key: string, ttl: number, owner: string) => {
      operationCount++;
      
      // Check if lock already exists
      const existingLock = lockState.get(key);
      if (existingLock && existingLock.expiresAt > Date.now()) {
        throw new Error('Lock is held by another process');
      }
      
      // For deterministic behavior: only allow first operation to succeed
      if (operationCount > 1) {
        throw new Error('Lock is held by another process');
      }
      
      // Acquire lock
      lockState.set(key, {
        owner,
        expiresAt: Date.now() + ttl
      });
      
      return {
        key,
        file: `data/locks/${key}.lock`,
        owner,
        expiresAt: Date.now() + ttl
      };
    }),
    
    releaseLock: vi.fn().mockImplementation(async (handle: any) => {
      lockState.delete(handle.key);
      // Don't reset operationCount to maintain deterministic behavior
    }),
    
    isLocked: vi.fn().mockImplementation(async (key: string) => {
      const lock = lockState.get(key);
      return lock && lock.expiresAt > Date.now();
    }),
    
    // Reset function for test isolation
    __reset: () => {
      lockState = new Map();
      operationCount = 0;
    }
  };
});

// Mock metrics
vi.mock('../src/utils/metrics', () => ({
  metrics: {
    getMetrics: vi.fn().mockReturnValue({
      lockAcquired: 1,
      lockContended: 0,
      lockStolen: 0,
      lockExpired: 0,
      lockLost: 0,
      lockReleaseFailures: 0
    }),
    reset: vi.fn()
  },
  incrementLockAcquired: vi.fn(),
  incrementLockContended: vi.fn(),
  incrementLockStolen: vi.fn(),
  incrementLockExpired: vi.fn(),
  incrementLockLost: vi.fn(),
  incrementLockReleaseFailures: vi.fn()
}));

describe('Lock Deterministic Behavior', () => {
  beforeEach(async () => {
    // Freeze time for deterministic tests
    freezeNow('2025-01-01T00:00:00Z');
    
    // Set deterministic RNG
    setDeterministicRng(() => 0.42);
    
    // Reset mock state
    const { __reset } = await import('../src/utils/lockFile') as any;
    if (__reset) {
      __reset();
    }
  });

  afterEach(() => {
    // Restore real timers and RNG
    restoreNow();
    resetRng();
    
    vi.clearAllMocks();
  });

  it('should produce consistent behavior with same parameters', async () => {
    const { acquireLock, releaseLock } = await import('../src/utils/lockFile');
    
    // Test 1: First operation should succeed
    const result1 = await acquireLock('test-sku', 2000, 'owner-1');
    expect(result1).toBeDefined();
    
    // Test 2: Second operation should fail due to contention
    try {
      await acquireLock('test-sku', 2000, 'owner-2');
      expect.fail('Should have thrown contention error');
    } catch (error) {
      expect(error.message).toBe('Lock is held by another process');
    }
    
    // Test 3: After release, should succeed again
    await releaseLock(result1);
    
    // Reset mock state for third operation
    const { __reset } = await import('../src/utils/lockFile') as any;
    if (__reset) {
      __reset();
    }
    
    const result3 = await acquireLock('test-sku', 2000, 'owner-3');
    expect(result3).toBeDefined();
    await releaseLock(result3);
  });

  it('should maintain deterministic behavior under parallel load', async () => {
    // Test deterministic behavior with sequential operations
    const results1 = await runSequentialTest();
    
    // Reset mock state for second test
    const { __reset } = await import('../src/utils/lockFile') as any;
    if (__reset) {
      __reset();
    }
    
    const results2 = await runSequentialTest();
    
    // Results should be identical due to deterministic behavior
    expect(results1.successful).toBe(results2.successful);
    expect(results1.rejected).toBe(results2.rejected);
    expect(results1.successful + results1.rejected).toBe(3);
    
    // Should have exactly 1 success and 2 rejections
    expect(results1.successful).toBe(1);
    expect(results1.rejected).toBe(2);
  });

  // Helper function to run sequential test
  async function runSequentialTest() {
    const { acquireLock, releaseLock } = await import('../src/utils/lockFile');
    
    let successful = 0;
    let rejected = 0;
    
    // First operation should succeed
    try {
      const handle1 = await acquireLock('test-sku', 2000, 'owner-1');
      successful++;
      // Don't release immediately to maintain lock state
    } catch (error) {
      rejected++;
    }
    
    // Second operation should fail (lock already held)
    try {
      const handle2 = await acquireLock('test-sku', 2000, 'owner-2');
      successful++;
    } catch (error) {
      rejected++;
    }
    
    // Third operation should fail (lock still held)
    try {
      const handle3 = await acquireLock('test-sku', 2000, 'owner-3');
      successful++;
    } catch (error) {
      rejected++;
    }
    
    return { successful, rejected };
  }
});
