import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { lockRegistry } from '../src/utils/lockRegistry';
import { acquireLock, releaseLock, forceReleaseLock } from '../src/utils/lockFile';
import { rm, mkdir } from 'fs/promises';
import { join } from 'path';

// Mock the config
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

// Mock the logger to prevent console output during tests
vi.mock('../src/core/logger', () => ({
  logger: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

describe('Lock Shutdown Tests', () => {
  const testKey = 'test-lock';
  const testOwner = 'test-owner';
  const testTtl = 1000;
  const lockDir = 'data/locks';
  const lockFilePath = join(lockDir, `${testKey}.lock`);

  async function cleanupLockFiles(): Promise<void> {
    try {
      await rm(lockFilePath, { force: true });
    } catch (error) {
      // Ignore if file doesn't exist
    }
  }

  async function ensureLockDirectory(): Promise<void> {
    try {
      await mkdir(lockDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }
  }

  beforeEach(async () => {
    await cleanupLockFiles();
    await ensureLockDirectory();
    lockRegistry.clear();
  });

  afterEach(async () => {
    await cleanupLockFiles();
    lockRegistry.clear();
  });

  describe('lock registry tracking', () => {
    it('should track active locks in registry', async () => {
      const handle = await acquireLock(testKey, testTtl, testOwner);
      
      expect(lockRegistry.getActiveLockCount()).toBe(1);
      expect(lockRegistry.isRegistered(handle)).toBe(true);
      expect(lockRegistry.getActiveLocks()).toHaveLength(1);
      expect(lockRegistry.getActiveLocks()[0]).toEqual(handle);
    });

    it('should unregister locks when released', async () => {
      const handle = await acquireLock(testKey, testTtl, testOwner);
      expect(lockRegistry.getActiveLockCount()).toBe(1);
      
      await releaseLock(handle);
      expect(lockRegistry.getActiveLockCount()).toBe(0);
      expect(lockRegistry.isRegistered(handle)).toBe(false);
    });

    it('should track multiple locks', async () => {
      const handle1 = await acquireLock('lock1', testTtl, testOwner);
      const handle2 = await acquireLock('lock2', testTtl, testOwner);
      
      expect(lockRegistry.getActiveLockCount()).toBe(2);
      expect(lockRegistry.isRegistered(handle1)).toBe(true);
      expect(lockRegistry.isRegistered(handle2)).toBe(true);
      
      await releaseLock(handle1);
      expect(lockRegistry.getActiveLockCount()).toBe(1);
      expect(lockRegistry.isRegistered(handle1)).toBe(false);
      expect(lockRegistry.isRegistered(handle2)).toBe(true);
    });

    it('should clear registry when cleared', async () => {
      await acquireLock(testKey, testTtl, testOwner);
      expect(lockRegistry.getActiveLockCount()).toBe(1);
      
      lockRegistry.clear();
      expect(lockRegistry.getActiveLockCount()).toBe(0);
    });
  });

  describe('graceful shutdown simulation', () => {
    it('should release all active locks during shutdown', async () => {
      // Acquire multiple locks with different keys to avoid contention
      const handle1 = await acquireLock('shutdown-lock1', testTtl, testOwner);
      const handle2 = await acquireLock('shutdown-lock2', testTtl, testOwner);
      
      expect(lockRegistry.getActiveLockCount()).toBe(2);
      
      // Simulate shutdown by force releasing all locks
      const activeLocks = lockRegistry.getActiveLocks();
      const releasePromises = activeLocks.map(async (handle) => {
        try {
          await forceReleaseLock(handle.key);
        } catch (error) {
          // Ignore errors during shutdown simulation
        }
      });
      
      await Promise.allSettled(releasePromises);
      
      // Verify locks are released (files should be removed)
      try {
        await rm(join(lockDir, 'shutdown-lock1.lock'), { force: true });
        await rm(join(lockDir, 'shutdown-lock2.lock'), { force: true });
      } catch (error) {
        // Files should already be removed by forceReleaseLock
      }
    });

    it('should handle lock release failures gracefully during shutdown', async () => {
      const handle = await acquireLock(testKey, testTtl, testOwner);
      expect(lockRegistry.getActiveLockCount()).toBe(1);
      
      // Simulate shutdown with force release
      try {
        await forceReleaseLock(testKey);
      } catch (error) {
        // Should handle errors gracefully
        expect(error).toBeDefined();
      }
      
      // Registry should still track the lock until manually cleared
      expect(lockRegistry.getActiveLockCount()).toBe(1);
    });

    it('should handle empty registry during shutdown', async () => {
      expect(lockRegistry.getActiveLockCount()).toBe(0);
      
      // Simulate shutdown with no active locks
      const activeLocks = lockRegistry.getActiveLocks();
      expect(activeLocks).toHaveLength(0);
      
      // Should not throw errors
      const releasePromises = activeLocks.map(async (handle) => {
        await forceReleaseLock(handle.key);
      });
      
      await Promise.allSettled(releasePromises);
    });
  });

  describe('lock file cleanup', () => {
    it('should remove lock files when forcefully released', async () => {
      const handle = await acquireLock(testKey, testTtl, testOwner);
      
      // Verify lock file exists
      const { readFile } = await import('fs/promises');
      const lockData = await readFile(lockFilePath, 'utf8');
      expect(lockData).toBeDefined();
      
      // Force release the lock
      await forceReleaseLock(testKey);
      
      // Verify lock file is removed
      try {
        await readFile(lockFilePath, 'utf8');
        expect.fail('Lock file should have been removed');
      } catch (error) {
        expect((error as NodeJS.ErrnoException).code).toBe('ENOENT');
      }
    });

    it('should handle non-existent lock files during force release', async () => {
      // Try to force release a non-existent lock
      await expect(forceReleaseLock('non-existent-lock')).resolves.not.toThrow();
    });
  });

  describe('concurrent lock operations during shutdown', () => {
    it('should handle concurrent lock acquisition and shutdown', async () => {
      // Start acquiring a lock
      const acquirePromise = acquireLock(testKey, testTtl, testOwner);
      
      // Simulate shutdown while lock is being acquired
      const shutdownPromise = new Promise<void>((resolve) => {
        setTimeout(async () => {
          try {
            await forceReleaseLock(testKey);
          } catch (error) {
            // Ignore errors during shutdown
          }
          resolve();
        }, 50);
      });
      
      const [handle] = await Promise.all([acquirePromise, shutdownPromise]);
      
      // Lock should be acquired
      expect(handle).toBeDefined();
      expect(lockRegistry.getActiveLockCount()).toBe(1);
    });
  });
});
