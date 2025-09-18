import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { promises as fs } from 'fs';
import { join } from 'path';
import { syncWorker } from '../../src/workers/sync.worker';
import { eventLogRepository } from '../../src/repositories/eventlog.repo';
import { inventoryRepository } from '../../src/repositories/inventory.repo';
import { readJsonFile, writeJsonFile, ensureDir } from '../../src/utils/fsSafe';

// Mock dependencies
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/repositories/inventory.repo');
vi.mock('../../src/utils/fsSafe');
vi.mock('../../src/ops/snapshotter');

describe('Sync Worker Boot Replay', () => {
  const dataDir = 'data';
  const centralInventoryPath = join(dataDir, 'central-inventory.json');
  const eventLogPath = join(dataDir, 'event-log.json');
  const storeInventoryPath = join(dataDir, 'store-inventory.json');

  beforeEach(async () => {
    // Clean up test data
    try {
      await fs.unlink(centralInventoryPath);
    } catch {}
    try {
      await fs.unlink(eventLogPath);
    } catch {}
    try {
      await fs.unlink(storeInventoryPath);
    } catch {}
    
    // Reset sync worker state
    syncWorker.resetState();
  });

  afterEach(async () => {
    // Clean up test data
    try {
      await fs.unlink(centralInventoryPath);
    } catch {}
    try {
      await fs.unlink(eventLogPath);
    } catch {}
    try {
      await fs.unlink(storeInventoryPath);
    } catch {}
  });

  describe('Boot Replay', () => {
    it('should replay events on boot and bring state to consistency', async () => {
      // Create test events
      const testEvents = [
        {
          id: 'event-1',
          type: 'stock_adjusted',
          payload: {
            sku: 'SKU123',
            storeId: 'STORE001',
            delta: 50,
            previousQty: 100,
            newQty: 150,
            previousVersion: 1,
            newVersion: 2,
          },
          ts: Date.now() - 1000,
          sequence: 1,
        },
        {
          id: 'event-2',
          type: 'stock_reserved',
          payload: {
            sku: 'SKU123',
            storeId: 'STORE001',
            reservedQty: 20,
            previousQty: 150,
            newQty: 130,
            previousVersion: 2,
            newVersion: 3,
          },
          ts: Date.now() - 500,
          sequence: 2,
        },
        {
          id: 'event-3',
          type: 'stock_adjusted',
          payload: {
            sku: 'SKU456',
            storeId: 'STORE002',
            delta: 25,
            previousQty: 0,
            newQty: 25,
            previousVersion: 0,
            newVersion: 1,
          },
          ts: Date.now(),
          sequence: 3,
        },
      ];

      // Create event log file
      await ensureDir(dataDir);
      await writeJsonFile(eventLogPath, {
        events: testEvents,
        lastId: 'event-3',
        lastSequence: 3,
      });

      // Create initial store inventory
      await writeJsonFile(storeInventoryPath, {
        'SKU123': {
          'STORE001': {
            sku: 'SKU123',
            storeId: 'STORE001',
            qty: 100,
            version: 1,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        },
      });

      // Mock event log repository
      const mockEventLogRepo = {
        getAll: vi.fn().mockResolvedValue(testEvents),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      // Mock inventory repository
      const mockInventoryRepo = {
        get: vi.fn().mockImplementation((sku: string, storeId: string) => {
          if (sku === 'SKU123' && storeId === 'STORE001') {
            return Promise.resolve({
              sku: 'SKU123',
              storeId: 'STORE001',
              qty: 100,
              version: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          if (sku === 'SKU456' && storeId === 'STORE002') {
            return Promise.resolve({
              sku: 'SKU456',
              storeId: 'STORE002',
              qty: 0,
              version: 0,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
          }
          throw new Error('Record not found');
        }),
        upsert: vi.fn(),
      };
      vi.mocked(inventoryRepository).get = mockInventoryRepo.get;
      vi.mocked(inventoryRepository).upsert = mockInventoryRepo.upsert;

      // Mock file operations
      vi.mocked(readJsonFile).mockImplementation(async (path: string) => {
        if (path === centralInventoryPath) {
          return {}; // Empty central inventory
        }
        throw new Error('File not found');
      });

      vi.mocked(writeJsonFile).mockResolvedValue(undefined);
      vi.mocked(ensureDir).mockResolvedValue(undefined);

      // Run replay
      await syncWorker.replayOnBoot();

      // Verify that events were processed
      expect(mockEventLogRepo.getAll).toHaveBeenCalled();

      // Verify central inventory was updated
      expect(writeJsonFile).toHaveBeenCalledWith(
        centralInventoryPath,
        expect.objectContaining({
          'SKU123': expect.objectContaining({
            'STORE001': expect.objectContaining({
              qty: 130, // 100 + 50 - 20
            }),
          }),
          'SKU456': expect.objectContaining({
            'STORE002': expect.objectContaining({
              qty: 25, // 0 + 25
            }),
          }),
        })
      );

      // Verify sync state was updated
      const status = syncWorker.getStatus();
      expect(status.lastProcessedEventId).toBe('event-3');
    });

    it('should handle empty event log gracefully', async () => {
      // Create empty event log
      await ensureDir(dataDir);
      await writeJsonFile(eventLogPath, {
        events: [],
        lastId: undefined,
        lastSequence: 0,
      });

      // Mock event log repository
      const mockEventLogRepo = {
        getAll: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      // Mock file operations
      vi.mocked(readJsonFile).mockImplementation(async (path: string) => {
        if (path === centralInventoryPath) {
          return {}; // Empty central inventory
        }
        throw new Error('File not found');
      });

      vi.mocked(writeJsonFile).mockResolvedValue(undefined);
      vi.mocked(ensureDir).mockResolvedValue(undefined);

      // Run replay
      await syncWorker.replayOnBoot();

      // Verify that events were processed
      expect(mockEventLogRepo.getAll).toHaveBeenCalled();

      // Verify central inventory was saved (even if empty)
      expect(writeJsonFile).toHaveBeenCalledWith(centralInventoryPath, {});
    });

    it('should handle replay errors gracefully', async () => {
      // Mock event log repository to throw error
      const mockEventLogRepo = {
        getAll: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      // Run replay and expect it to throw
      await expect(syncWorker.replayOnBoot()).rejects.toThrow('Database connection failed');
    });
  });

  describe('Event Ordering', () => {
    it('should process events in sequence order', async () => {
      // Create events with out-of-order timestamps but correct sequence
      const testEvents = [
        {
          id: 'event-3',
          type: 'stock_adjusted',
          payload: { sku: 'SKU123', storeId: 'STORE001', delta: 30, previousQty: 100, newQty: 130, previousVersion: 1, newVersion: 2 },
          ts: Date.now(), // Latest timestamp
          sequence: 3,
        },
        {
          id: 'event-1',
          type: 'stock_adjusted',
          payload: { sku: 'SKU123', storeId: 'STORE001', delta: 10, previousQty: 100, newQty: 110, previousVersion: 1, newVersion: 2 },
          ts: Date.now() - 2000, // Oldest timestamp
          sequence: 1,
        },
        {
          id: 'event-2',
          type: 'stock_adjusted',
          payload: { sku: 'SKU123', storeId: 'STORE001', delta: 20, previousQty: 110, newQty: 130, previousVersion: 2, newVersion: 3 },
          ts: Date.now() - 1000, // Middle timestamp
          sequence: 2,
        },
      ];

      // Create event log file
      await ensureDir(dataDir);
      await writeJsonFile(eventLogPath, {
        events: testEvents,
        lastId: 'event-3',
        lastSequence: 3,
      });

      // Mock event log repository
      const mockEventLogRepo = {
        getAll: vi.fn().mockResolvedValue(testEvents),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      // Mock file operations
      vi.mocked(readJsonFile).mockImplementation(async (path: string) => {
        if (path === centralInventoryPath) {
          return {}; // Empty central inventory
        }
        throw new Error('File not found');
      });

      vi.mocked(writeJsonFile).mockResolvedValue(undefined);
      vi.mocked(ensureDir).mockResolvedValue(undefined);

      // Run replay
      await syncWorker.replayOnBoot();

      // Verify that events were processed in sequence order
      expect(mockEventLogRepo.getAll).toHaveBeenCalled();

      // The final state should reflect all events applied in sequence order
      // Final qty should be 100 + 10 + 20 + 30 = 160
      expect(writeJsonFile).toHaveBeenCalledWith(
        centralInventoryPath,
        expect.objectContaining({
          'SKU123': expect.objectContaining({
            'STORE001': expect.objectContaining({
              qty: 160,
            }),
          }),
        })
      );
    });
  });
});
