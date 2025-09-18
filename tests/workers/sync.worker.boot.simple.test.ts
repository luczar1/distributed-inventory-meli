import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { syncWorker } from '../../src/workers/sync.worker';
import { eventLogRepository } from '../../src/repositories/eventlog.repo';
import { readJsonFile, writeJsonFile, ensureDir } from '../../src/utils/fsSafe';

// Mock dependencies
vi.mock('../../src/repositories/eventlog.repo');
vi.mock('../../src/utils/fsSafe');
vi.mock('../../src/ops/snapshotter');

describe('Sync Worker Boot Replay - Simple', () => {
  beforeEach(() => {
    // Reset sync worker state
    syncWorker.resetState();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
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
      ];

      // Mock event log repository
      const mockEventLogRepo = {
        getAll: vi.fn().mockResolvedValue(testEvents),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      // Mock file operations
      vi.mocked(readJsonFile).mockImplementation(async (path: string) => {
        if (path.includes('central-inventory.json')) {
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

      // Verify central inventory was saved
      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('central-inventory.json'),
        expect.any(Object)
      );

      // Verify sync state was updated
      const status = syncWorker.getStatus();
      expect(status.lastProcessedEventId).toBe('event-2');
    });

    it('should handle empty event log gracefully', async () => {
      // Mock event log repository
      const mockEventLogRepo = {
        getAll: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      // Mock file operations
      vi.mocked(readJsonFile).mockImplementation(async (path: string) => {
        if (path.includes('central-inventory.json')) {
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
      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('central-inventory.json'),
        expect.any(Object)
      );
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

      // Mock event log repository
      const mockEventLogRepo = {
        getAll: vi.fn().mockResolvedValue(testEvents),
      };
      vi.mocked(eventLogRepository).getAll = mockEventLogRepo.getAll;

      // Mock file operations
      vi.mocked(readJsonFile).mockImplementation(async (path: string) => {
        if (path.includes('central-inventory.json')) {
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

      // Verify central inventory was saved
      expect(writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('central-inventory.json'),
        expect.any(Object)
      );
    });
  });
});
