import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Bulkhead } from '../../src/utils/bulkhead';

describe('Bulkhead Isolation', () => {
  let apiBulkhead: Bulkhead;
  let syncBulkhead: Bulkhead;
  let mockApiOperation: ReturnType<typeof vi.fn>;
  let mockSyncOperation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Create separate bulkheads for API and sync operations
    apiBulkhead = new Bulkhead({ 
      name: 'api-test',
      limit: 2,
      queueSize: 10 
    });
    syncBulkhead = new Bulkhead({ 
      name: 'sync-test',
      limit: 1,
      queueSize: 5 
    });
    
    mockApiOperation = vi.fn();
    mockSyncOperation = vi.fn();
  });

  describe('API Bulkhead Saturation', () => {
    it('should not block sync operations when API bulkhead is saturated', async () => {
      let resolveApiOperations: (() => void)[] = [];
      const apiPromises: Promise<void>[] = [];
      
      // Create long-running API operations that will saturate the API bulkhead
      for (let i = 0; i < 3; i++) {
        const promise = new Promise<void>(resolve => {
          resolveApiOperations.push(resolve);
        });
        apiPromises.push(apiBulkhead.run(() => promise));
      }
      
      // Wait a bit to ensure API operations are queued
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify API bulkhead is saturated
      const apiStats = apiBulkhead.getStats();
      expect(apiStats.active).toBe(2);
      expect(apiStats.queued).toBe(1);
      
      // Sync operation should still be able to run
      mockSyncOperation.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      const syncStartTime = Date.now();
      await syncBulkhead.run(mockSyncOperation);
      const syncEndTime = Date.now();
      
      // Sync operation should complete quickly (not blocked by API bulkhead)
      expect(syncEndTime - syncStartTime).toBeLessThan(200);
      expect(mockSyncOperation).toHaveBeenCalledTimes(1);
      
      // Clean up API operations
      resolveApiOperations.forEach(resolve => resolve());
      await Promise.all(apiPromises);
    });

    it('should allow API operations to continue after sync operations complete', async () => {
      // Start a sync operation
      let resolveSync: () => void;
      const syncPromise = new Promise<void>(resolve => {
        resolveSync = resolve;
      });
      
      mockSyncOperation.mockImplementation(() => syncPromise);
      
      const syncBulkheadPromise = syncBulkhead.run(mockSyncOperation);
      
      // Start API operations
      mockApiOperation.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 50))
      );
      
      const apiPromises = [
        apiBulkhead.run(mockApiOperation),
        apiBulkhead.run(mockApiOperation),
      ];
      
      // API operations should complete even while sync is running
      await Promise.all(apiPromises);
      expect(mockApiOperation).toHaveBeenCalledTimes(2);
      
      // Complete sync operation
      resolveSync!();
      await syncBulkheadPromise;
    });
  });

  describe('Sync Bulkhead Saturation', () => {
    it('should not block API operations when sync bulkhead is saturated', async () => {
      // Saturate sync bulkhead with a long-running operation
      let resolveSync: () => void;
      const syncPromise = new Promise<void>(resolve => {
        resolveSync = resolve;
      });
      
      mockSyncOperation.mockImplementation(() => syncPromise);
      
      const syncBulkheadPromise = syncBulkhead.run(mockSyncOperation);
      
      // Wait a bit to ensure sync operation is running
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Verify sync bulkhead is saturated
      const syncStats = syncBulkhead.getStats();
      expect(syncStats.active).toBe(1);
      
      // API operations should still be able to run
      mockApiOperation.mockImplementation(() => 
        new Promise(resolve => setTimeout(resolve, 100))
      );
      
      const apiStartTime = Date.now();
      const apiPromises = [
        apiBulkhead.run(mockApiOperation),
        apiBulkhead.run(mockApiOperation),
      ];
      await Promise.all(apiPromises);
      const apiEndTime = Date.now();
      
      // API operations should complete quickly (not blocked by sync bulkhead)
      expect(apiEndTime - apiStartTime).toBeLessThan(200);
      expect(mockApiOperation).toHaveBeenCalledTimes(2);
      
      // Clean up sync operation
      resolveSync!();
      await syncBulkheadPromise;
    });
  });

  describe('Concurrent Load Test', () => {
    it('should handle mixed API and sync operations without interference', async () => {
      const apiResults: number[] = [];
      const syncResults: number[] = [];
      
      // Create operations that track their execution
      mockApiOperation.mockImplementation((id: number) => {
        return new Promise(resolve => {
          setTimeout(() => {
            apiResults.push(id);
            resolve(id);
          }, Math.random() * 100); // Random delay 0-100ms
        });
      });
      
      mockSyncOperation.mockImplementation((id: number) => {
        return new Promise(resolve => {
          setTimeout(() => {
            syncResults.push(id);
            resolve(id);
          }, Math.random() * 100); // Random delay 0-100ms
        });
      });
      
      // Start many API operations (will be queued due to limit of 2)
      const apiPromises = [];
      for (let i = 0; i < 10; i++) {
        apiPromises.push(apiBulkhead.run(() => mockApiOperation(i)));
      }
      
      // Start sync operations (will be queued due to limit of 1)
      const syncPromises = [];
      for (let i = 0; i < 5; i++) {
        syncPromises.push(syncBulkhead.run(() => mockSyncOperation(i)));
      }
      
      // Wait for all operations to complete
      await Promise.all([...apiPromises, ...syncPromises]);
      
      // Verify all operations completed
      expect(apiResults).toHaveLength(10);
      expect(syncResults).toHaveLength(5);
      
      // Verify no interference between bulkheads
      const finalApiStats = apiBulkhead.getStats();
      const finalSyncStats = syncBulkhead.getStats();
      
      expect(finalApiStats.active).toBe(0);
      expect(finalApiStats.queued).toBe(0);
      expect(finalSyncStats.active).toBe(0);
      expect(finalSyncStats.queued).toBe(0);
    });

    it('should maintain proper concurrency limits under high load', async () => {
      const activeOperations: { api: number; sync: number }[] = [];
      
      // Track active operations
      const trackMetrics = () => {
        activeOperations.push({
          api: apiBulkhead.getStats().active,
          sync: syncBulkhead.getStats().active,
        });
      };
      
      mockApiOperation.mockImplementation(() => 
        new Promise(resolve => {
          trackMetrics();
          setTimeout(resolve, 200);
        })
      );
      
      mockSyncOperation.mockImplementation(() => 
        new Promise(resolve => {
          trackMetrics();
          setTimeout(resolve, 200);
        })
      );
      
      // Start operations
      const apiPromises = [];
      for (let i = 0; i < 5; i++) {
        apiPromises.push(apiBulkhead.run(mockApiOperation));
      }
      
      const syncPromises = [];
      for (let i = 0; i < 3; i++) {
        syncPromises.push(syncBulkhead.run(mockSyncOperation));
      }
      
      await Promise.all([...apiPromises, ...syncPromises]);
      
      // Verify concurrency limits were respected
      const maxApiActive = Math.max(...activeOperations.map(m => m.api));
      const maxSyncActive = Math.max(...activeOperations.map(m => m.sync));
      
      expect(maxApiActive).toBeLessThanOrEqual(2); // API bulkhead limit
      expect(maxSyncActive).toBeLessThanOrEqual(1); // Sync bulkhead limit
    });
  });

  describe('Error Isolation', () => {
    it('should isolate errors between bulkheads', async () => {
      // API operation fails
      mockApiOperation.mockRejectedValue(new Error('API operation failed'));
      
      // Sync operation succeeds
      mockSyncOperation.mockResolvedValue('sync success');
      
      // API failure should not affect sync operation
      await expect(apiBulkhead.run(mockApiOperation)).rejects.toThrow('API operation failed');
      
      const syncResult = await syncBulkhead.run(mockSyncOperation);
      expect(syncResult).toBe('sync success');
    });

    it('should continue processing after errors in one bulkhead', async () => {
      // First API operation fails, second succeeds
      mockApiOperation
        .mockRejectedValueOnce(new Error('First API operation failed'))
        .mockResolvedValueOnce('Second API operation succeeded');
      
      // Sync operation succeeds
      mockSyncOperation.mockResolvedValue('sync success');
      
      // Start all operations
      const apiPromise1 = apiBulkhead.run(mockApiOperation);
      const apiPromise2 = apiBulkhead.run(mockApiOperation);
      const syncPromise = syncBulkhead.run(mockSyncOperation);
      
      // First API operation should fail
      await expect(apiPromise1).rejects.toThrow('First API operation failed');
      
      // Other operations should still succeed
      const apiResult2 = await apiPromise2;
      const syncResult = await syncPromise;
      
      expect(apiResult2).toBe('Second API operation succeeded');
      expect(syncResult).toBe('sync success');
    });
  });
});
