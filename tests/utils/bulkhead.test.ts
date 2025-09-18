import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Bulkhead } from '../../src/utils/bulkhead';

describe('Bulkhead', () => {
  let bulkhead: Bulkhead;
  let mockOperation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    bulkhead = new Bulkhead({ 
      name: 'test',
      limit: 2, // Allow max 2 concurrent operations
      queueSize: 10 // Allow queuing
    });
    mockOperation = vi.fn();
  });

  describe('Concurrency Control', () => {
    it('should allow operations up to the limit', async () => {
      mockOperation.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      const promises = [
        bulkhead.run(mockOperation),
        bulkhead.run(mockOperation),
      ];
      
      await Promise.all(promises);
      
      expect(mockOperation).toHaveBeenCalledTimes(2);
    });

    it('should queue operations when limit is exceeded', async () => {
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>(resolve => {
        resolveFirst = resolve;
      });
      
      mockOperation
        .mockImplementationOnce(() => firstPromise)
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 100)))
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      // Start 3 operations (exceeds limit of 2)
      const promise1 = bulkhead.run(mockOperation);
      const promise2 = bulkhead.run(mockOperation);
      const promise3 = bulkhead.run(mockOperation);
      
      // First two should start immediately
      expect(mockOperation).toHaveBeenCalledTimes(2);
      
      // Resolve the first operation
      resolveFirst!();
      await promise1;
      
      // Third operation should now start
      await new Promise(resolve => setTimeout(resolve, 50));
      expect(mockOperation).toHaveBeenCalledTimes(3);
      
      // Wait for all to complete
      await Promise.all([promise2, promise3]);
    });

    it('should execute operations in order when queued', async () => {
      const executionOrder: number[] = [];
      
      mockOperation.mockImplementation((index: number) => {
        executionOrder.push(index);
        return new Promise(resolve => setTimeout(resolve, 10));
      });
      
      // Start operations that will be queued
      const promises = [
        bulkhead.run(() => mockOperation(1)),
        bulkhead.run(() => mockOperation(2)),
        bulkhead.run(() => mockOperation(3)),
        bulkhead.run(() => mockOperation(4)),
      ];
      
      await Promise.all(promises);
      
      // First two should execute immediately, others in order
      expect(executionOrder).toEqual([1, 2, 3, 4]);
    });
  });

  describe('Error Handling', () => {
    it('should propagate operation errors', async () => {
      const error = new Error('Operation failed');
      mockOperation.mockRejectedValue(error);
      
      await expect(bulkhead.run(mockOperation)).rejects.toThrow('Operation failed');
    });

    it('should continue processing queued operations after error', async () => {
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>((resolve, reject) => {
        resolveFirst = () => reject(new Error('First operation failed'));
      });
      
      mockOperation
        .mockImplementationOnce(() => firstPromise)
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 100)))
        .mockImplementationOnce(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      const promise1 = bulkhead.run(mockOperation);
      const promise2 = bulkhead.run(mockOperation);
      const promise3 = bulkhead.run(mockOperation);
      
      // First operation fails
      resolveFirst!();
      await expect(promise1).rejects.toThrow('First operation failed');
      
      // Other operations should still complete
      await Promise.all([promise2, promise3]);
      expect(mockOperation).toHaveBeenCalledTimes(3);
    });
  });

  describe('Metrics', () => {
    it('should track active operations', async () => {
      let resolveOperation: () => void;
      const operationPromise = new Promise<void>(resolve => {
        resolveOperation = resolve;
      });
      
      mockOperation.mockImplementation(() => operationPromise);
      
      const promise = bulkhead.run(mockOperation);
      
      // Check metrics while operation is running
      const stats = bulkhead.getStats();
      expect(stats.active).toBe(1);
      expect(stats.queued).toBe(0);
      
      resolveOperation!();
      await promise;
      
      // Check metrics after operation completes
      const finalStats = bulkhead.getStats();
      expect(finalStats.active).toBe(0);
    });

    it('should track queued operations', async () => {
      let resolveFirst: () => void;
      const firstPromise = new Promise<void>(resolve => {
        resolveFirst = resolve;
      });
      
      mockOperation
        .mockImplementationOnce(() => firstPromise)
        .mockImplementation(() => new Promise(resolve => setTimeout(resolve, 100)));
      
      const promise1 = bulkhead.run(mockOperation);
      const promise2 = bulkhead.run(mockOperation);
      const promise3 = bulkhead.run(mockOperation);
      
      // Check metrics while operations are queued
      const stats = bulkhead.getStats();
      expect(stats.active).toBe(2); // First two operations are active
      expect(stats.queued).toBe(1); // Third operation is queued
      
      resolveFirst!();
      await promise1;
      
      // Check metrics after first operation completes
      const updatedStats = bulkhead.getStats();
      expect(updatedStats.active).toBe(2); // Second and third operations are now active
      expect(updatedStats.queued).toBe(0);
      
      await Promise.all([promise2, promise3]);
    });

    it('should track total operations', async () => {
      mockOperation.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 50))
      );
      
      await bulkhead.run(mockOperation);
      await bulkhead.run(mockOperation);
      
      const stats = bulkhead.getStats();
      expect(stats.completed).toBe(2);
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle multiple operations concurrently up to limit', async () => {
      const startTimes: number[] = [];
      const endTimes: number[] = [];
      
      mockOperation.mockImplementation((index: number) => {
        startTimes[index] = Date.now();
        return new Promise(resolve => 
          setTimeout(() => {
            endTimes[index] = Date.now();
            resolve(index);
          }, 100)
        );
      });
      
      const promises = [
        bulkhead.run(() => mockOperation(0)),
        bulkhead.run(() => mockOperation(1)),
      ];
      
      await Promise.all(promises);
      
      // Both operations should start at roughly the same time
      expect(Math.abs(startTimes[0] - startTimes[1])).toBeLessThan(50);
      
      // Both operations should complete
      expect(endTimes[0]).toBeDefined();
      expect(endTimes[1]).toBeDefined();
    });

    it('should serialize operations when limit is exceeded', async () => {
      const startTimes: number[] = [];
      const endTimes: number[] = [];
      
      mockOperation.mockImplementation((index: number) => {
        startTimes[index] = Date.now();
        return new Promise(resolve => 
          setTimeout(() => {
            endTimes[index] = Date.now();
            resolve(index);
          }, 100)
        );
      });
      
      const promises = [
        bulkhead.run(() => mockOperation(0)),
        bulkhead.run(() => mockOperation(1)),
        bulkhead.run(() => mockOperation(2)),
        bulkhead.run(() => mockOperation(3)),
      ];
      
      await Promise.all(promises);
      
      // First two should start together
      expect(Math.abs(startTimes[0] - startTimes[1])).toBeLessThan(50);
      
      // Third and fourth should start after first two complete
      // Allow for some timing variance
      expect(startTimes[2]).toBeGreaterThanOrEqual(endTimes[0] - 10);
      expect(startTimes[2]).toBeGreaterThanOrEqual(endTimes[1] - 10);
      expect(startTimes[3]).toBeGreaterThanOrEqual(endTimes[0] - 10);
      expect(startTimes[3]).toBeGreaterThanOrEqual(endTimes[1] - 10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero limit', async () => {
      const zeroLimitBulkhead = new Bulkhead({ 
        name: 'zero-limit',
        limit: 0 
      });
      
      mockOperation.mockResolvedValue('success');
      
      await expect(zeroLimitBulkhead.run(mockOperation)).rejects.toThrow('Bulkhead zero-limit is at capacity');
    });

    it('should handle operations that throw synchronously', async () => {
      const error = new Error('Synchronous error');
      mockOperation.mockImplementation(() => {
        throw error;
      });
      
      await expect(bulkhead.run(mockOperation)).rejects.toThrow('Synchronous error');
    });

    it('should handle operations that return non-promises', async () => {
      mockOperation.mockReturnValue('immediate result');
      
      const result = await bulkhead.run(mockOperation);
      
      expect(result).toBe('immediate result');
      expect(mockOperation).toHaveBeenCalledTimes(1);
    });
  });
});
