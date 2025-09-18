import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { inventoryService } from '../src/services/inventory.service';
import { inventoryRepository } from '../src/repositories/inventory.repo';
import { eventLogRepository } from '../src/repositories/eventlog.repo';
import { idempotencyStore } from '../src/utils/idempotency';
import { mapLimit } from '../src/utils/mapLimit';
import { InventoryRecord } from '../src/core/types';

// Mock repositories
vi.mock('../src/repositories/inventory.repo');
vi.mock('../src/repositories/eventlog.repo');
vi.mock('../src/utils/idempotency');

// Mock perKeyMutex with proper serialization
const mockLocks = new Map<string, Promise<unknown>>();
vi.mock('../src/utils/perKeyMutex', () => ({
  perKeyMutex: {
    acquire: vi.fn(async (key: string, fn: () => Promise<unknown>) => {
      // Wait for any existing lock on this key
      const existingLock = mockLocks.get(key);
      if (existingLock) {
        await existingLock;
      }

      // Create new lock for this key
      const lockPromise = (async () => {
        // Add a small delay to simulate real serialization
        await new Promise(resolve => setTimeout(resolve, 1));
        return await fn();
      })();
      mockLocks.set(key, lockPromise);

      try {
        const result = await lockPromise;
        return result;
      } finally {
        // Clean up lock when done
        if (mockLocks.get(key) === lockPromise) {
          mockLocks.delete(key);
        }
      }
    }),
    clear: vi.fn(() => mockLocks.clear()),
  },
}));

describe('Concurrency Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    idempotencyStore.clear();
    mockLocks.clear();
    
    // Mock idempotency store to not cache results for concurrency tests
    vi.mocked(idempotencyStore.get).mockResolvedValue(null);
    vi.mocked(idempotencyStore.set).mockResolvedValue(undefined);
  });

  afterEach(() => {
    idempotencyStore.clear();
  });

  describe('Parallel Adjustments', () => {
    it('should handle 100 parallel adjustments with concurrency 16', async () => {
      const initialRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 1000,
        version: 1,
        updatedAt: new Date()
      };

      // Mock repository to simulate real behavior
      let currentRecord = { ...initialRecord };
      vi.mocked(inventoryRepository.get).mockImplementation(() => Promise.resolve({ ...currentRecord }));
      vi.mocked(inventoryRepository.upsert).mockImplementation((record) => {
        currentRecord = { ...record, updatedAt: new Date() };
        return Promise.resolve();
      });
      vi.mocked(eventLogRepository.append).mockResolvedValue();

      // Create 100 parallel adjustments (50 increases, 50 decreases)
      const operations = Array.from({ length: 100 }, (_, i) => ({
        delta: i < 50 ? 1 : -1, // First 50 increase by 1, last 50 decrease by 1
        id: `op-${i}`
      }));

      const results = await mapLimit(operations, 16, async (op) => {
        return await inventoryService.adjustStock(
          'STORE001',
          'SKU123',
          op.delta,
          undefined,
          `idem-${op.id}`
        );
      });

      // Verify all operations succeeded
      expect(results).toHaveLength(100);
      results.forEach(result => {
        expect(result).toHaveProperty('qty');
        expect(result).toHaveProperty('version');
        expect(typeof result.qty).toBe('number');
        expect(typeof result.version).toBe('number');
      });

      // Final quantity should be: 1000 + 50 - 50 = 1000
      expect(currentRecord.qty).toBe(1000);
      
      // Version should be incremented 100 times
      expect(currentRecord.version).toBe(101);
      
      // Verify no lost updates (versions strictly increasing)
      const versions = results.map(r => r.version);
      const sortedVersions = [...versions].sort((a, b) => a - b);
      expect(versions).toEqual(sortedVersions);
      
      // All versions should be unique and sequential
      for (let i = 0; i < versions.length; i++) {
        expect(versions[i]).toBe(i + 2); // Starting from version 2
      }
    });

    it('should handle 100 parallel reservations with concurrency 16', async () => {
      const initialRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 1000,
        version: 1,
        updatedAt: new Date()
      };

      // Mock repository to simulate real behavior
      let currentRecord = { ...initialRecord };
      vi.mocked(inventoryRepository.get).mockImplementation(() => Promise.resolve({ ...currentRecord }));
      vi.mocked(inventoryRepository.upsert).mockImplementation((record) => {
        currentRecord = { ...record, updatedAt: new Date() };
        return Promise.resolve();
      });
      vi.mocked(eventLogRepository.append).mockResolvedValue();

      // Create 100 parallel reservations (each reserves 1 unit)
      const operations = Array.from({ length: 100 }, (_, i) => ({
        quantity: 1,
        id: `reserve-${i}`
      }));

      const results = await mapLimit(operations, 16, async (op) => {
        return await inventoryService.reserveStock(
          'STORE001',
          'SKU123',
          op.quantity,
          undefined,
          `idem-reserve-${op.id}`
        );
      });

      // Verify all operations succeeded
      expect(results).toHaveLength(100);
      results.forEach(result => {
        expect(result).toHaveProperty('qty');
        expect(result).toHaveProperty('version');
        expect(typeof result.qty).toBe('number');
        expect(typeof result.version).toBe('number');
      });

      // Final quantity should be: 1000 - 100 = 900
      expect(currentRecord.qty).toBe(900);
      
      // Version should be incremented 100 times
      expect(currentRecord.version).toBe(101);
      
      // Verify no lost updates (versions strictly increasing)
      const versions = results.map(r => r.version);
      const sortedVersions = [...versions].sort((a, b) => a - b);
      expect(versions).toEqual(sortedVersions);
    });

    it('should handle mixed operations (adjustments + reservations) with concurrency 16', async () => {
      const initialRecord: InventoryRecord = {
        sku: 'SKU123',
        storeId: 'STORE001',
        qty: 1000,
        version: 1,
        updatedAt: new Date()
      };

      // Mock repository to simulate real behavior
      let currentRecord = { ...initialRecord };
      vi.mocked(inventoryRepository.get).mockImplementation(() => Promise.resolve({ ...currentRecord }));
      vi.mocked(inventoryRepository.upsert).mockImplementation((record) => {
        currentRecord = { ...record, updatedAt: new Date() };
        return Promise.resolve();
      });
      vi.mocked(eventLogRepository.append).mockResolvedValue();

      // Create 50 adjustments and 50 reservations
      const operations = Array.from({ length: 100 }, (_, i) => ({
        type: i < 50 ? 'adjust' : 'reserve',
        value: 1,
        id: `mixed-${i}`
      }));

      const results = await mapLimit(operations, 16, async (op) => {
        if (op.type === 'adjust') {
          return await inventoryService.adjustStock(
            'STORE001',
            'SKU123',
            op.value,
            undefined,
            `idem-adjust-${op.id}`
          );
        } else {
          return await inventoryService.reserveStock(
            'STORE001',
            'SKU123',
            op.value,
            undefined,
            `idem-reserve-${op.id}`
          );
        }
      });

      // Verify all operations succeeded
      expect(results).toHaveLength(100);
      results.forEach(result => {
        expect(result).toHaveProperty('qty');
        expect(result).toHaveProperty('version');
        expect(typeof result.qty).toBe('number');
        expect(typeof result.version).toBe('number');
      });

      // Final quantity should be: 1000 + 50 - 50 = 1000
      expect(currentRecord.qty).toBe(1000);
      
      // Version should be incremented 100 times
      expect(currentRecord.version).toBe(101);
      
      // Verify no lost updates (versions strictly increasing)
      const versions = results.map(r => r.version);
      const sortedVersions = [...versions].sort((a, b) => a - b);
      expect(versions).toEqual(sortedVersions);
    });
  });
});
